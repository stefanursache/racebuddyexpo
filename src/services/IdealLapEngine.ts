/**
 * RaceBuddy - Ideal Lap Construction Engine
 *
 * Constructs an "Ideal Lap" by selecting the fastest segment from
 * any recorded lap at each point around the track, then smoothing
 * transitions to maintain physical plausibility.
 *
 * The algorithm:
 * 1. Spatially resample all laps to a common distance grid
 * 2. Segment the track into corners and straights
 * 3. For each segment, select the lap with the lowest elapsed time
 * 4. Stitch segments together with transition smoothing
 * 5. Validate physical plausibility (G-force limits, continuity)
 */

import {
    SpatialTelemetryPoint,
    LapTelemetry,
    TrackSegment,
    IdealLapResult,
    SegmentSource,
    AnalysisConfig,
    DEFAULT_ANALYSIS_CONFIG,
} from '../types/analysis';
import {
    resampleByDistance,
    gaussianSmooth,
    zeroPhaseFilter,
    clamp,
    lerp,
    generateId,
} from '../utils/SignalProcessing';
import { getSegmentPointsOptimized, getSegmentPointsBatch } from '../utils/SegmentUtils';
import { TrackSegmenter } from './TrackSegmenter';

export class IdealLapEngine {
    private config: AnalysisConfig;
    private segmenter: TrackSegmenter;
    private cachedResampledLaps: Map<string, SpatialTelemetryPoint[]> = new Map();
    private lastResampledBest: SpatialTelemetryPoint[] | null = null;

    constructor(config: Partial<AnalysisConfig> = {}) {
        this.config = { ...DEFAULT_ANALYSIS_CONFIG, ...config };
        this.segmenter = new TrackSegmenter(this.config);
    }

    /**
     * Get the last cached resampled points for a lap ID.
     * Used by LapAnalyzer to avoid double-resampling.
     */
    getCachedResampledLap(lapId: string): SpatialTelemetryPoint[] | null {
        return this.cachedResampledLaps.get(lapId) || null;
    }

    /**
     * Get the last cached resampled best lap points.
     * Used by LapAnalyzer to avoid double-resampling.
     */
    getCachedResampledBestLap(): SpatialTelemetryPoint[] | null {
        return this.lastResampledBest;
    }

    /**
     * Construct the ideal lap from multiple recorded laps.
     *
     * @param laps - All valid laps from the session (already preprocessed)
     * @param bestLap - The best actual lap
     * @returns IdealLapResult with the ideal lap and segment attribution
     */
    constructIdealLap(laps: LapTelemetry[], bestLap: LapTelemetry): IdealLapResult {
        if (laps.length === 0) {
            throw new Error('Need at least one lap to construct an ideal lap');
        }

        // Step 1: Resample all laps to common distance grid
        const resolution = this.config.spatialResolution;
        const resampledLaps = laps.map(lap => ({
            ...lap,
            points: resampleByDistance(lap.points, resolution),
        }));

        // Cache resampled laps for later use (e.g., by LapAnalyzer)
        resampledLaps.forEach(lap => {
            this.cachedResampledLaps.set(lap.lapId, lap.points);
        });

        const resampledBest = {
            ...bestLap,
            points: resampleByDistance(bestLap.points, resolution),
        };

        // Cache the best lap
        this.lastResampledBest = resampledBest.points;

        // Step 2: Determine the common distance range (use best lap as reference)
        const maxDistance = resampledBest.points[resampledBest.points.length - 1].distance;

        // Trim all laps to common distance
        const trimmedLaps = resampledLaps.map(lap => ({
            ...lap,
            points: lap.points.filter(p => p.distance <= maxDistance),
        }));

        // Step 3: Segment the track using the best lap's telemetry
        const segments = this.segmenter.segmentTrack(resampledBest);

        if (segments.length === 0) {
            // Fallback: treat entire lap as one segment
            segments.push({
                id: generateId(),
                segmentIndex: 0,
                type: 'straight',
                startDistance: 0,
                endDistance: maxDistance,
                avgCurvature: 0,
            });
        }

        // Step 4: For each segment, find the fastest lap
        const segmentSources: SegmentSource[] = [];
        const idealPoints: SpatialTelemetryPoint[] = [];

        for (const segment of segments) {
            const { bestSourceLap, bestSourceIdx, bestTime, segPoints } =
                this.findFastestLapForSegment(trimmedLaps, segment);

            const bestLapSegTime = this.getSegmentTime(resampledBest, segment);

            segmentSources.push({
                segmentId: segment.id,
                segmentIndex: segment.segmentIndex,
                sourceLapId: bestSourceLap.lapId,
                sourceLapNumber: bestSourceLap.lapNumber,
                timeInSegment: bestTime * 1000,
                bestLapTimeInSegment: bestLapSegTime * 1000,
                timeDelta: (bestTime - bestLapSegTime) * 1000,
            });

            idealPoints.push(...segPoints);
        }

        // Step 5: Smooth transitions between segments
        const smoothedPoints = this.smoothTransitions(idealPoints, segments);

        // Step 6: Recompute elapsed time to be consistent
        const finalPoints = this.recomputeElapsedTime(smoothedPoints);

        // Step 7: Validate physical plausibility
        const validatedPoints = this.validatePhysicalPlausibility(finalPoints);

        // Compute ideal lap time
        const idealLapTime = validatedPoints.length > 0
            ? validatedPoints[validatedPoints.length - 1].elapsedTime * 1000
            : bestLap.lapTime;

        const idealLap: LapTelemetry = {
            lapId: `ideal-${generateId()}`,
            lapNumber: -1, // Special marker for ideal lap
            lapTime: idealLapTime,
            isValid: true,
            points: validatedPoints,
            totalDistance: maxDistance,
        };

        return {
            idealLap,
            segmentSources,
            idealLapTime,
            bestLapTime: bestLap.lapTime,
            timeSaved: bestLap.lapTime - idealLapTime,
        };
    }

    /**
     * Find the lap that was fastest through a given segment.
     */
    private findFastestLapForSegment(
        laps: LapTelemetry[],
        segment: TrackSegment,
    ): {
        bestSourceLap: LapTelemetry;
        bestSourceIdx: number;
        bestTime: number;
        segPoints: SpatialTelemetryPoint[];
    } {
        let bestTime = Infinity;
        let bestIdx = 0;
        let bestPoints: SpatialTelemetryPoint[] = [];

        for (let i = 0; i < laps.length; i++) {
            const lap = laps[i];
            const segPoints = getSegmentPointsOptimized(lap.points, segment);

            if (segPoints.length < 2) continue;

            const segTime = segPoints[segPoints.length - 1].elapsedTime - segPoints[0].elapsedTime;

            if (segTime < bestTime && segTime > 0) {
                bestTime = segTime;
                bestIdx = i;
                bestPoints = segPoints;
            }
        }

        return {
            bestSourceLap: laps[bestIdx],
            bestSourceIdx: bestIdx,
            bestTime,
            segPoints: bestPoints,
        };
    }

    /**
     * Get the elapsed time for the best lap through a segment.
     */
    private getSegmentTime(lap: LapTelemetry, segment: TrackSegment): number {
        const segPoints = getSegmentPointsOptimized(lap.points, segment);

        if (segPoints.length < 2) return 0;
        return segPoints[segPoints.length - 1].elapsedTime - segPoints[0].elapsedTime;
    }

    /**
     * Smooth transitions at segment boundaries to avoid discontinuities
     * in speed and G-forces.
     */
    private smoothTransitions(
        points: SpatialTelemetryPoint[],
        segments: TrackSegment[],
    ): SpatialTelemetryPoint[] {
        if (points.length < 5 || segments.length < 2) return points;

        const result = points.map(p => ({ ...p }));
        const transitionLen = this.config.transitionSmoothingLength;

        // Find segment boundaries
        for (let s = 1; s < segments.length; s++) {
            const boundaryDist = segments[s].startDistance;

            // Find points within the transition zone
            for (let i = 0; i < result.length; i++) {
                const d = result[i].distance;
                const distFromBoundary = Math.abs(d - boundaryDist);

                if (distFromBoundary < transitionLen) {
                    // Blend factor: 1 at boundary, 0 at edges
                    const blendFactor = 1 - distFromBoundary / transitionLen;

                    // Apply cosine smoothing
                    const smoothFactor = 0.5 * (1 - Math.cos(Math.PI * (1 - blendFactor)));

                    // Blend speed with neighbors
                    const windowSize = Math.min(5, Math.floor(result.length / 4));
                    let avgSpeed = 0;
                    let count = 0;

                    for (let j = Math.max(0, i - windowSize); j <= Math.min(result.length - 1, i + windowSize); j++) {
                        avgSpeed += result[j].smoothedSpeed;
                        count++;
                    }
                    avgSpeed /= count;

                    result[i].smoothedSpeed = lerp(
                        result[i].smoothedSpeed,
                        avgSpeed,
                        smoothFactor * 0.3, // Gentle blending
                    );
                }
            }
        }

        return result;
    }

    /**
     * Recompute elapsed time from speed and distance for consistency.
     * Uses the trapezoidal rule: dt = dx / v_avg.
     */
    private recomputeElapsedTime(points: SpatialTelemetryPoint[]): SpatialTelemetryPoint[] {
        if (points.length < 2) return points;

        const result = points.map(p => ({ ...p }));
        result[0].elapsedTime = 0;

        for (let i = 1; i < result.length; i++) {
            const dx = result[i].distance - result[i - 1].distance;
            const avgSpeedMs = (result[i].smoothedSpeed + result[i - 1].smoothedSpeed) / 2 / 3.6;

            if (avgSpeedMs > 0.1) {
                result[i].elapsedTime = result[i - 1].elapsedTime + dx / avgSpeedMs;
            } else {
                // Very low speed — use original time delta or a minimum
                result[i].elapsedTime = result[i - 1].elapsedTime + 0.1;
            }
        }

        return result;
    }

    /**
     * Validate that the ideal lap doesn't violate physical limits.
     * Clamps G-forces and ensures speed is non-negative.
     */
    private validatePhysicalPlausibility(
        points: SpatialTelemetryPoint[],
    ): SpatialTelemetryPoint[] {
        return points.map(p => ({
            ...p,
            smoothedSpeed: Math.max(0, p.smoothedSpeed),
            smoothedGForceX: clamp(
                p.smoothedGForceX,
                -this.config.maxPlausibleLateralG,
                this.config.maxPlausibleLateralG,
            ),
            smoothedGForceY: clamp(
                p.smoothedGForceY,
                -this.config.maxPlausibleLongitudinalG,
                this.config.maxPlausibleLongitudinalG,
            ),
        }));
    }
}
