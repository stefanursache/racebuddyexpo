/**
 * RaceBuddy - Lap Comparison & Opportunity Analysis Engine
 *
 * Compares Best Lap vs Ideal Lap across every performance dimension
 * and produces Garmin Catalyst–style "Opportunity" reports for each corner.
 *
 * This is the master orchestrator that ties together:
 * - TelemetryPreprocessor (data cleaning)
 * - TrackSegmenter (corner/straight detection)
 * - IdealLapEngine (ideal lap construction)
 * - DrivingEvent detection (braking/acceleration zones)
 */

import { TelemetryData, LapTime, RacingSession } from '../types';
import {
    SpatialTelemetryPoint,
    LapTelemetry,
    TrackSegment,
    DrivingEvent,
    IdealLapResult,
    Opportunity,
    OpportunityBraking,
    OpportunityApex,
    OpportunitySpeed,
    OpportunityOverview,
    DeltaTimePoint,
    SpeedDistancePoint,
    GForceDistancePoint,
    TimeDistancePoint,
    LapAnalysisResult,
    AnalysisSummary,
    AnalysisConfig,
    DEFAULT_ANALYSIS_CONFIG,
} from '../types/analysis';
import { TelemetryPreprocessor } from './TelemetryPreprocessor';
import { TrackSegmenter } from './TrackSegmenter';
import { IdealLapEngine } from './IdealLapEngine';
import { resampleByDistance, findExtrema, generateId } from '../utils/SignalProcessing';
import { getSegmentPointsOptimized } from '../utils/SegmentUtils';

export class LapAnalyzer {
    private config: AnalysisConfig;
    private preprocessor: TelemetryPreprocessor;
    private segmenter: TrackSegmenter;
    private idealEngine: IdealLapEngine;

    constructor(config: Partial<AnalysisConfig> = {}) {
        this.config = { ...DEFAULT_ANALYSIS_CONFIG, ...config };
        this.preprocessor = new TelemetryPreprocessor(this.config);
        this.segmenter = new TrackSegmenter(this.config);
        this.idealEngine = new IdealLapEngine(this.config);
    }

    /**
     * Full analysis pipeline: from raw session data to opportunity reports.
     */
    analyzeSession(session: RacingSession): LapAnalysisResult {
        // 1. Extract and preprocess all valid laps
        const laps = this.preprocessor.extractLaps(session.telemetryData, session.lapTimes);
        const dataQuality = this.preprocessor.assessDataQuality(session.telemetryData);

        if (laps.length === 0) {
            throw new Error('No valid laps found in session');
        }

        // 2. Identify the best lap
        const bestLap = this.findBestLap(laps);

        // 3. Segment the track
        const segments = this.segmenter.segmentTrack(bestLap);

        // 4. Construct ideal lap
        const idealLapResult = this.idealEngine.constructIdealLap(laps, bestLap);

        // 5. Detect driving events on the best lap
        const drivingEvents = this.segmenter.detectDrivingEvents(bestLap, segments);

        // 6. Compute delta time curve
        const deltaTimeCurve = this.computeDeltaTimeCurve(bestLap, idealLapResult.idealLap);

        // 7. Generate opportunity analysis for each corner
        const opportunities = this.generateOpportunities(
            bestLap,
            idealLapResult,
            segments,
            drivingEvents,
            deltaTimeCurve,
        );

        // 8. Summary statistics
        const summary = this.computeSummary(bestLap, idealLapResult, opportunities, dataQuality.overallScore);

        return {
            sessionId: session.id,
            segments,
            idealLap: idealLapResult,
            bestLap,
            drivingEvents,
            opportunities,
            deltaTimeCurve,
            summary,
        };
    }

    /**
     * Analyze two specific laps (e.g., from different sessions).
     */
    analyzeLaps(
        processedLaps: LapTelemetry[],
        bestLap: LapTelemetry,
    ): LapAnalysisResult {
        const segments = this.segmenter.segmentTrack(bestLap);
        const idealLapResult = this.idealEngine.constructIdealLap(processedLaps, bestLap);
        const drivingEvents = this.segmenter.detectDrivingEvents(bestLap, segments);
        const deltaTimeCurve = this.computeDeltaTimeCurve(bestLap, idealLapResult.idealLap);
        const opportunities = this.generateOpportunities(
            bestLap, idealLapResult, segments, drivingEvents, deltaTimeCurve,
        );
        const proxyQuality = Math.max(0.5, Math.min(1, 0.6 + processedLaps.length * 0.1));
        const summary = this.computeSummary(bestLap, idealLapResult, opportunities, proxyQuality);

        return {
            sessionId: 'manual-analysis',
            segments,
            idealLap: idealLapResult,
            bestLap,
            drivingEvents,
            opportunities,
            deltaTimeCurve,
            summary,
        };
    }

    // ─── Delta Time Curve ────────────────────────────────────────────────

    /**
     * Compute the cumulative delta time between best lap and ideal lap
     * at each point around the track.
     *
     * Positive delta = ideal is faster (time to be gained).
     * 
     * OPTIMIZATION: Uses cached resampled data from IdealLapEngine
     * to avoid double-resampling the same laps.
     */
    private computeDeltaTimeCurve(
        bestLap: LapTelemetry,
        idealLap: LapTelemetry,
    ): DeltaTimePoint[] {
        const resolution = this.config.spatialResolution;

        // Try to use cached resampled data first to avoid double resampling
        let bestResampled = this.idealEngine.getCachedResampledLap(bestLap.lapId);
        let idealResampled = this.idealEngine.getCachedResampledBestLap();

        // Fall back to resampling if cache miss (e.g., for ideal lap itself)
        if (!bestResampled) {
            bestResampled = resampleByDistance(bestLap.points, resolution);
        }
        if (!idealResampled) {
            idealResampled = resampleByDistance(idealLap.points, resolution);
        }

        const minLength = Math.min(bestResampled.length, idealResampled.length);
        const deltaPoints: DeltaTimePoint[] = [];

        for (let i = 0; i < minLength; i++) {
            const bestTime = bestResampled[i].elapsedTime;
            const idealTime = idealResampled[i].elapsedTime;

            deltaPoints.push({
                distance: bestResampled[i].distance,
                delta: bestTime - idealTime, // positive = ideal is faster
            });
        }

        return deltaPoints;
    }

    // ─── Opportunity Generation ──────────────────────────────────────────

    /**
     * Generate Garmin Catalyst–style opportunity reports for each corner.
     */
    private generateOpportunities(
        bestLap: LapTelemetry,
        idealResult: IdealLapResult,
        segments: TrackSegment[],
        drivingEvents: DrivingEvent[],
        deltaTimeCurve: DeltaTimePoint[],
    ): Opportunity[] {
        const idealLap = idealResult.idealLap;
        const opportunities: Opportunity[] = [];

        // Only generate opportunities for corners (where time is usually gained/lost)
        const cornerSegments = segments.filter(s => s.type === 'corner');

        let opportunityNumber = 0;

        for (const segment of cornerSegments) {
            // Calculate time delta for this segment
            const segmentDeltas = deltaTimeCurve.filter(
                d => d.distance >= segment.startDistance && d.distance <= segment.endDistance,
            );

            if (segmentDeltas.length < 2) continue;

            const segStartDelta = segmentDeltas[0].delta;
            const segEndDelta = segmentDeltas[segmentDeltas.length - 1].delta;
            const totalTimeDelta = segEndDelta - segStartDelta;

            // Only report if there's meaningful time to gain (> 0.05s)
            if (totalTimeDelta <= 0.05) continue;

            opportunityNumber++;

            // Extract sub-profiles for this segment
            const bestSegPoints = this.getSegmentPoints(bestLap, segment);
            const idealSegPoints = this.getSegmentPoints(idealLap, segment);

            // Include approach zone (braking zone before corner)
            // Create a virtual segment for approach analysis
            const approachStart = Math.max(0, segment.startDistance - 100);
            const approachEnd = segment.endDistance + 50;
            const approachSegment: TrackSegment = {
                ...segment,
                startDistance: approachStart,
                endDistance: approachEnd,
            };
            const bestApproachPoints = getSegmentPointsOptimized(bestLap.points, approachSegment);
            const idealApproachPoints = getSegmentPointsOptimized(idealLap.points, approachSegment);

            // Find associated braking event
            const brakingEvent = drivingEvents.find(
                e => e.type === 'braking' && e.endDistance >= segment.startDistance - 50
                    && e.startDistance <= segment.startDistance + 50,
            );

            const braking = this.analyzeBraking(
                bestApproachPoints, idealApproachPoints, brakingEvent, segment,
            );
            const apex = this.analyzeApex(bestSegPoints, idealSegPoints, segment);
            const speed = this.analyzeSpeed(bestApproachPoints, idealApproachPoints, segment);

            // Generate overview
            const overview = this.generateOverview(braking, apex, speed, totalTimeDelta);

            opportunities.push({
                id: generateId(),
                number: opportunityNumber,
                segment,
                totalTimeDelta,
                overview,
                braking,
                apex,
                speed,
            });
        }

        // Sort by time delta (biggest opportunity first)
        opportunities.sort((a, b) => b.totalTimeDelta - a.totalTimeDelta);

        // Re-number after sorting
        opportunities.forEach((opp, i) => { opp.number = i + 1; });

        return opportunities;
    }

    // ─── Braking Analysis ────────────────────────────────────────────────

    private analyzeBraking(
        bestPoints: SpatialTelemetryPoint[],
        idealPoints: SpatialTelemetryPoint[],
        brakingEvent: DrivingEvent | undefined,
        segment: TrackSegment,
    ): OpportunityBraking {
        // Find braking initiation point (where deceleration begins)
        const bestBrakeStart = this.findBrakingInitiation(bestPoints);
        const idealBrakeStart = this.findBrakingInitiation(idealPoints);

        const distanceDelta = idealBrakeStart
            ? (idealBrakeStart.distance - (bestBrakeStart?.distance || segment.startDistance))
            : 0;

        // Find peak braking G
        const bestBrakingG = Math.max(
            ...bestPoints.map(p => Math.abs(p.smoothedGForceY)).filter(g => !isNaN(g)),
            0,
        );
        const idealBrakingG = Math.max(
            ...idealPoints.map(p => Math.abs(p.smoothedGForceY)).filter(g => !isNaN(g)),
            0,
        );

        const intensityDelta = idealBrakingG > 0 && bestBrakingG > 0
            ? ((idealBrakingG - bestBrakingG) / bestBrakingG) * 100
            : 0;

        // Speed at braking point
        const bestBrakingSpeed = bestBrakeStart?.smoothedSpeed || 0;
        const idealBrakingSpeed = idealBrakeStart?.smoothedSpeed || 0;

        // Time delta from braking improvement
        const timeDelta = brakingEvent
            ? (brakingEvent.duration * Math.abs(distanceDelta) / Math.max(1, brakingEvent.endDistance - brakingEvent.startDistance))
            : Math.abs(distanceDelta) / Math.max(1, (bestBrakingSpeed + idealBrakingSpeed) / 2 / 3.6);

        // Build profiles for charts
        const bestLapProfile: SpeedDistancePoint[] = bestPoints.map(p => ({
            distance: p.distance,
            speed: p.smoothedSpeed,
        }));
        const optimalProfile: SpeedDistancePoint[] = idealPoints.map(p => ({
            distance: p.distance,
            speed: p.smoothedSpeed,
        }));

        return {
            distanceDelta,
            intensityDelta,
            timeDelta,
            bestLapBrakingG: bestBrakingG,
            optimalBrakingG: idealBrakingG,
            bestLapBrakingSpeed: bestBrakingSpeed,
            optimalBrakingSpeed: idealBrakingSpeed,
            bestLapProfile,
            optimalProfile,
        };
    }

    private findBrakingInitiation(
        points: SpatialTelemetryPoint[],
    ): SpatialTelemetryPoint | null {
        // Find where longitudinal G drops below braking threshold
        for (let i = 0; i < points.length; i++) {
            if (points[i].smoothedGForceY < -this.config.brakingThreshold) {
                return points[i];
            }
        }
        return null;
    }

    // ─── Apex Analysis ───────────────────────────────────────────────────

    private analyzeApex(
        bestPoints: SpatialTelemetryPoint[],
        idealPoints: SpatialTelemetryPoint[],
        segment: TrackSegment,
    ): OpportunityApex {
        // Find apex (minimum speed point) in each profile
        const bestApex = this.findApex(bestPoints);
        const idealApex = this.findApex(idealPoints);

        const segCenter = (segment.startDistance + segment.endDistance) / 2;

        // Classify apex timing
        const bestApexPos = bestApex?.distance || segCenter;
        const idealApexPos = idealApex?.distance || segCenter;
        const apexDistanceDelta = bestApexPos - idealApexPos;

        let apexType: 'early' | 'late' | 'on_target' = 'on_target';
        if (apexDistanceDelta > 3) apexType = 'late';
        else if (apexDistanceDelta < -3) apexType = 'early';

        // Classify turn entry
        const segThird = (segment.endDistance - segment.startDistance) / 3;
        const entryPoint = segment.startDistance + segThird;
        let turnEntryType: 'early' | 'late' | 'on_target' = 'on_target';
        if (bestApexPos < entryPoint - 5) turnEntryType = 'early';
        else if (bestApexPos > entryPoint + segThird + 5) turnEntryType = 'late';

        // Apex speeds and G
        const bestApexSpeed = bestApex?.smoothedSpeed || 0;
        const idealApexSpeed = idealApex?.smoothedSpeed || 0;
        const bestApexG = bestApex ? Math.abs(bestApex.smoothedGForceX) : 0;
        const idealApexG = idealApex ? Math.abs(idealApex.smoothedGForceX) : 0;

        // Time delta
        const timeDelta = bestApexSpeed > 0 && idealApexSpeed > 0
            ? (segment.endDistance - segment.startDistance) *
            (1 / (idealApexSpeed / 3.6) - 1 / (bestApexSpeed / 3.6))
            : 0;

        // Generate advice
        let advice = '';
        if (apexType === 'early') {
            advice = 'TURN IN EARLIER, APEX EARLIER AND STAY TRACK LEFT LONGER.';
        } else if (apexType === 'late') {
            advice = 'LATER APEX. CARRY MORE SPEED THROUGH EXIT.';
        } else {
            advice = 'APEX TIMING IS GOOD. FOCUS ON ENTRY SPEED.';
        }

        // Build chart profiles
        const bestLapAccelProfile: GForceDistancePoint[] = bestPoints.map(p => ({
            distance: p.distance,
            gForce: p.smoothedGForceY,
        }));
        const optimalAccelProfile: GForceDistancePoint[] = idealPoints.map(p => ({
            distance: p.distance,
            gForce: p.smoothedGForceY,
        }));
        const bestLapSpeedProfile: SpeedDistancePoint[] = bestPoints.map(p => ({
            distance: p.distance,
            speed: p.smoothedSpeed,
        }));
        const optimalSpeedProfile: SpeedDistancePoint[] = idealPoints.map(p => ({
            distance: p.distance,
            speed: p.smoothedSpeed,
        }));

        return {
            apexType,
            turnEntryType,
            apexDistanceDelta,
            bestLapApexSpeed: bestApexSpeed,
            optimalApexSpeed: idealApexSpeed,
            bestLapApexG: bestApexG,
            optimalApexG: idealApexG,
            timeDelta,
            advice,
            bestLapAccelProfile,
            optimalAccelProfile,
            bestLapSpeedProfile,
            optimalSpeedProfile,
        };
    }

    private findApex(points: SpatialTelemetryPoint[]): SpatialTelemetryPoint | null {
        if (points.length === 0) return null;

        let minSpeed = Infinity;
        let apexPoint: SpatialTelemetryPoint | null = null;

        for (const p of points) {
            if (p.smoothedSpeed < minSpeed) {
                minSpeed = p.smoothedSpeed;
                apexPoint = p;
            }
        }

        return apexPoint;
    }

    // ─── Speed Analysis ──────────────────────────────────────────────────

    private analyzeSpeed(
        bestPoints: SpatialTelemetryPoint[],
        idealPoints: SpatialTelemetryPoint[],
        segment: TrackSegment,
    ): OpportunitySpeed {
        const bestSpeeds = bestPoints.map(p => p.smoothedSpeed);
        const idealSpeeds = idealPoints.map(p => p.smoothedSpeed);

        const bestMax = Math.max(...bestSpeeds, 0);
        const idealMax = Math.max(...idealSpeeds, 0);
        const bestMin = Math.min(...bestSpeeds, 999);
        const idealMin = Math.min(...idealSpeeds, 999);

        // Time delta from speed difference
        const segLength = segment.endDistance - segment.startDistance;
        const bestAvg = bestSpeeds.reduce((s, v) => s + v, 0) / bestSpeeds.length;
        const idealAvg = idealSpeeds.reduce((s, v) => s + v, 0) / idealSpeeds.length;

        const timeDelta = bestAvg > 0 && idealAvg > 0
            ? segLength * (1 / (idealAvg / 3.6) - 1 / (bestAvg / 3.6))
            : 0;

        const bestLapProfile: SpeedDistancePoint[] = bestPoints.map(p => ({
            distance: p.distance,
            speed: p.smoothedSpeed,
        }));
        const optimalProfile: SpeedDistancePoint[] = idealPoints.map(p => ({
            distance: p.distance,
            speed: p.smoothedSpeed,
        }));

        const bestLapTimeProfile: TimeDistancePoint[] = bestPoints.map(p => ({
            distance: p.distance,
            time: p.elapsedTime,
        }));
        const optimalTimeProfile: TimeDistancePoint[] = idealPoints.map(p => ({
            distance: p.distance,
            time: p.elapsedTime,
        }));

        return {
            bestLapMaxSpeed: bestMax,
            optimalMaxSpeed: idealMax,
            bestLapMinSpeed: bestMin === 999 ? 0 : bestMin,
            optimalMinSpeed: idealMin === 999 ? 0 : idealMin,
            timeDelta,
            bestLapProfile,
            optimalProfile,
            bestLapTimeProfile,
            optimalTimeProfile,
        };
    }

    // ─── Overview Generation ─────────────────────────────────────────────

    private generateOverview(
        braking: OpportunityBraking,
        apex: OpportunityApex,
        speed: OpportunitySpeed,
        totalDelta: number,
    ): OpportunityOverview {
        const parts: string[] = [];

        if (Math.abs(braking.distanceDelta) > 2) {
            const direction = braking.distanceDelta > 0 ? 'LATER' : 'EARLIER';
            parts.push(`BRAKE ${Math.abs(braking.distanceDelta).toFixed(0)} M. ${direction}`);
        }

        if (Math.abs(braking.intensityDelta) > 5) {
            const intensity = braking.intensityDelta > 0 ? 'HARDER' : 'SOFTER';
            parts.push(`${intensity}: ${Math.abs(braking.intensityDelta).toFixed(0)}%`);
        }

        if (Math.abs(braking.timeDelta) > 0.05) {
            parts.push(`LONGER: ${Math.abs(braking.timeDelta).toFixed(2)} S`);
        }

        const description = `YOU ACHIEVED YOUR FASTEST TIME WHEN YOU BRAKED:\n${parts.join('    ')}`;

        // Determine primary advice
        let advice = '';
        const brakingContribution = Math.abs(braking.timeDelta);
        const apexContribution = Math.abs(apex.timeDelta);
        const speedContribution = Math.abs(speed.timeDelta);

        if (brakingContribution >= apexContribution && brakingContribution >= speedContribution) {
            advice = 'Focus on braking point and intensity for this corner.';
        } else if (apexContribution >= speedContribution) {
            advice = apex.advice;
        } else {
            advice = 'Carry more speed through this section.';
        }

        return {
            description,
            timeDelta: totalDelta,
            advice,
        };
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    private findBestLap(laps: LapTelemetry[]): LapTelemetry {
        return laps.reduce((best, lap) =>
            lap.lapTime < best.lapTime ? lap : best,
        );
    }

    private getSegmentPoints(
        lap: LapTelemetry,
        segment: TrackSegment,
    ): SpatialTelemetryPoint[] {
        return getSegmentPointsOptimized(lap.points, segment);
    }

    private computeSummary(
        bestLap: LapTelemetry,
        idealResult: IdealLapResult,
        opportunities: Opportunity[],
        dataQualityScore: number = 0.75,
    ): AnalysisSummary {
        const idealLap = idealResult.idealLap;

        const bestSpeeds = bestLap.points.map(p => p.smoothedSpeed);
        const idealSpeeds = idealLap.points.map(p => p.smoothedSpeed);

        const avgSpeedBest = bestSpeeds.reduce((s, v) => s + v, 0) / bestSpeeds.length;
        const avgSpeedIdeal = idealSpeeds.reduce((s, v) => s + v, 0) / idealSpeeds.length;

        const biggestIdx = opportunities.length > 0
            ? opportunities.reduce((maxI, opp, i, arr) =>
                opp.totalTimeDelta > arr[maxI].totalTimeDelta ? i : maxI, 0)
            : 0;

        const analysisConfidence = Math.max(0, Math.min(1, dataQualityScore));

        return {
            bestLapTime: bestLap.lapTime,
            idealLapTime: idealResult.idealLapTime,
            totalTimeDelta: idealResult.timeSaved,
            totalOpportunities: opportunities.length,
            biggestOpportunityIndex: biggestIdx,
            avgSpeedBest,
            avgSpeedIdeal,
            maxSpeedBest: Math.max(...bestSpeeds, 0),
            maxSpeedIdeal: Math.max(...idealSpeeds, 0),
            maxBrakingGBest: Math.max(...bestLap.points.map(p => Math.abs(p.smoothedGForceY)), 0),
            maxBrakingGIdeal: Math.max(...idealLap.points.map(p => Math.abs(p.smoothedGForceY)), 0),
            maxLateralGBest: Math.max(...bestLap.points.map(p => Math.abs(p.smoothedGForceX)), 0),
            maxLateralGIdeal: Math.max(...idealLap.points.map(p => Math.abs(p.smoothedGForceX)), 0),
            dataQualityScore,
            analysisConfidence,
        };
    }
}
