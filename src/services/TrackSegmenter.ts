/**
 * RaceBuddy - Track Segmentation Engine
 *
 * Automatically detects corners, straights, braking zones, and
 * acceleration zones from telemetry data using curvature analysis
 * and velocity extrema detection.
 */

import {
    SpatialTelemetryPoint,
    LapTelemetry,
    TrackSegment,
    DrivingEvent,
    AnalysisConfig,
    DEFAULT_ANALYSIS_CONFIG,
} from '../types/analysis';
import {
    gaussianSmooth,
    findExtrema,
    derivativeNonUniform,
    zeroPhaseFilter,
    generateId,
} from '../utils/SignalProcessing';

export class TrackSegmenter {
    private config: AnalysisConfig;

    constructor(config: Partial<AnalysisConfig> = {}) {
        this.config = { ...DEFAULT_ANALYSIS_CONFIG, ...config };
    }

    /**
     * Segment a lap into corners and straights based on curvature analysis.
     */
    segmentTrack(lap: LapTelemetry): TrackSegment[] {
        const points = lap.points;
        if (points.length < 20) return [];

        // Extract and further smooth curvature for segmentation
        const curvature = zeroPhaseFilter(
            points.map(p => Math.abs(p.curvature)),
            11,
        );
        const distances = points.map(p => p.distance);
        // Use hysteresis to prevent rapid corner/straight toggling on noisy data.
        const cornerEnterThreshold = this.config.cornerCurvatureThreshold * 1.12;
        const cornerExitThreshold = this.config.cornerCurvatureThreshold * 0.88;

        const isCorner: boolean[] = new Array(curvature.length);
        let inCorner = curvature[0] > cornerEnterThreshold;

        for (let i = 0; i < curvature.length; i++) {
            const c = curvature[i];
            if (inCorner) {
                if (c < cornerExitThreshold) inCorner = false;
            } else if (c > cornerEnterThreshold) {
                inCorner = true;
            }
            isCorner[i] = inCorner;
        }

        // Merge into contiguous segments
        const rawSegments: Array<{ type: 'straight' | 'corner'; startIdx: number; endIdx: number }> = [];
        let currentType: 'straight' | 'corner' = isCorner[0] ? 'corner' : 'straight';
        let segStart = 0;

        for (let i = 1; i < isCorner.length; i++) {
            const pointType: 'straight' | 'corner' = isCorner[i] ? 'corner' : 'straight';
            if (pointType !== currentType) {
                rawSegments.push({ type: currentType, startIdx: segStart, endIdx: i - 1 });
                currentType = pointType;
                segStart = i;
            }
        }
        rawSegments.push({ type: currentType, startIdx: segStart, endIdx: points.length - 1 });

        // Merge short segments into their neighbors
        const mergedSegments = this.mergeShortSegments(rawSegments, distances);

        // Build TrackSegment objects
        let cornerNumber = 0;
        const segments: TrackSegment[] = mergedSegments.map((seg, index) => {
            if (seg.type === 'corner') cornerNumber++;

            const segPoints = points.slice(seg.startIdx, seg.endIdx + 1);
            const avgCurvature = segPoints.reduce((s, p) => s + Math.abs(p.curvature), 0) / segPoints.length;

            // Determine corner direction from signed curvature
            const avgSignedCurvature = segPoints.reduce((s, p) => s + p.curvature, 0) / segPoints.length;

            return {
                id: generateId(),
                segmentIndex: index,
                type: seg.type,
                startDistance: distances[seg.startIdx],
                endDistance: distances[seg.endIdx],
                cornerNumber: seg.type === 'corner' ? cornerNumber : undefined,
                cornerDirection: seg.type === 'corner' ? Math.sign(avgSignedCurvature) : undefined,
                avgCurvature,
            };
        });

        return segments;
    }

    /**
     * Detect braking and acceleration events from velocity profile.
     */
    detectDrivingEvents(
        lap: LapTelemetry,
        segments: TrackSegment[],
    ): DrivingEvent[] {
        const points = lap.points;
        if (points.length < 20) return [];

        const speeds = points.map(p => p.smoothedSpeed);
        const distances = points.map(p => p.distance);

        // Find velocity extrema (peaks = end-of-straight / brake points, troughs = apex / accel points)
        const speedProminenceThreshold = 5; // km/h
        const extrema = findExtrema(speeds, speedProminenceThreshold);

        const events: DrivingEvent[] = [];

        // Process consecutive max→min (braking) and min→max (acceleration) pairs
        for (let i = 0; i < extrema.length - 1; i++) {
            const current = extrema[i];
            const next = extrema[i + 1];

            if (current.type === 'maximum' && next.type === 'minimum') {
                // Braking event: speed drops from peak to trough
                const startPoint = points[current.index];
                const endPoint = points[next.index];
                const duration = endPoint.elapsedTime - startPoint.elapsedTime;

                if (duration > 0.1) {
                    // Check if deceleration exceeds threshold
                    const avgDecel = Math.abs(
                        (endPoint.smoothedSpeed - startPoint.smoothedSpeed) / 3.6 / duration / 9.81,
                    );

                    if (avgDecel >= this.config.brakingThreshold) {
                        // Find peak braking G in this range
                        const subRange = points.slice(current.index, next.index + 1);
                        const peakG = Math.max(...subRange.map(p => Math.abs(p.smoothedGForceY)));

                        // Find which segment this event belongs to
                        const midDistance = (startPoint.distance + endPoint.distance) / 2;
                        const segment = this.findSegmentAtDistance(segments, midDistance);

                        events.push({
                            id: generateId(),
                            type: 'braking',
                            startDistance: startPoint.distance,
                            endDistance: endPoint.distance,
                            bestLapTime: startPoint.elapsedTime,
                            idealLapTime: startPoint.elapsedTime, // Will be updated during comparison
                            speedAtStart: startPoint.smoothedSpeed,
                            speedAtEnd: endPoint.smoothedSpeed,
                            peakGForce: peakG,
                            duration,
                            segmentId: segment?.id || '',
                        });
                    }
                }
            } else if (current.type === 'minimum' && next.type === 'maximum') {
                // Acceleration event: speed rises from trough to peak
                const startPoint = points[current.index];
                const endPoint = points[next.index];
                const duration = endPoint.elapsedTime - startPoint.elapsedTime;

                if (duration > 0.1) {
                    const avgAccel = Math.abs(
                        (endPoint.smoothedSpeed - startPoint.smoothedSpeed) / 3.6 / duration / 9.81,
                    );

                    if (avgAccel >= this.config.accelerationThreshold) {
                        const subRange = points.slice(current.index, next.index + 1);
                        const peakG = Math.max(...subRange.map(p => Math.abs(p.smoothedGForceY)));

                        const midDistance = (startPoint.distance + endPoint.distance) / 2;
                        const segment = this.findSegmentAtDistance(segments, midDistance);

                        events.push({
                            id: generateId(),
                            type: 'acceleration',
                            startDistance: startPoint.distance,
                            endDistance: endPoint.distance,
                            bestLapTime: startPoint.elapsedTime,
                            idealLapTime: startPoint.elapsedTime,
                            speedAtStart: startPoint.smoothedSpeed,
                            speedAtEnd: endPoint.smoothedSpeed,
                            peakGForce: peakG,
                            duration,
                            segmentId: segment?.id || '',
                        });
                    }
                }
            }
        }

        return events;
    }

    /**
     * Find which segment contains a given distance.
     */
    private findSegmentAtDistance(segments: TrackSegment[], distance: number): TrackSegment | null {
        return segments.find(
            s => distance >= s.startDistance && distance <= s.endDistance,
        ) || null;
    }

    /**
     * Merge segments shorter than the minimum into adjacent segments.
     */
    private mergeShortSegments(
        rawSegments: Array<{ type: 'straight' | 'corner'; startIdx: number; endIdx: number }>,
        distances: number[],
    ): Array<{ type: 'straight' | 'corner'; startIdx: number; endIdx: number }> {
        if (rawSegments.length === 0) return rawSegments;

        const result: typeof rawSegments = [rawSegments[0]];

        for (let i = 1; i < rawSegments.length; i++) {
            const current = rawSegments[i];
            const prev = result[result.length - 1];
            const segLength = distances[current.endIdx] - distances[current.startIdx];

            if (segLength < this.config.minSegmentLength) {
                // Merge into previous segment
                prev.endIdx = current.endIdx;
            } else {
                result.push({ ...current });
            }
        }

        return result;
    }
}
