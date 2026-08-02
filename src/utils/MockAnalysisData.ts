/**
 * RaceBuddy - Demo Data Generator
 *
 * Generates realistic mock telemetry data and analysis results
 * for development and demonstration of the Catalyst-style UI.
 */

import {
    LapTelemetry,
    SpatialTelemetryPoint,
    TrackSegment,
    Opportunity,
    LapAnalysisResult,
    IdealLapResult,
    DeltaTimePoint,
    DrivingEvent,
    AnalysisSummary,
    SpeedDistancePoint,
    GForceDistancePoint,
    TimeDistancePoint,
} from '../types/analysis';
import { generateId } from './SignalProcessing';

/**
 * Generate a complete mock LapAnalysisResult for UI development.
 * Simulates a ~2.5km track with 6 corners.
 */
export function generateMockAnalysis(): LapAnalysisResult {
    const trackLength = 2500; // meters

    // Generate segments (alternating straights and corners)
    const segments = generateMockSegments(trackLength);

    // Generate best lap
    const bestLap = generateMockLap('best-lap', 1, 78500, trackLength); // 1:18.500
    const idealLap = generateMockLap('ideal-lap', -1, 76800, trackLength); // 1:16.800

    // Generate delta time curve
    const deltaTimeCurve = generateMockDeltaCurve(trackLength);

    // Generate opportunities
    const opportunities = generateMockOpportunities(segments);

    // Generate driving events
    const drivingEvents = generateMockDrivingEvents(segments);

    const idealLapResult: IdealLapResult = {
        idealLap,
        segmentSources: segments.map((seg, i) => ({
            segmentId: seg.id,
            segmentIndex: i,
            sourceLapId: `lap-${(i % 3) + 1}`,
            sourceLapNumber: (i % 3) + 1,
            timeInSegment: 5000 + Math.random() * 8000,
            bestLapTimeInSegment: 5200 + Math.random() * 8000,
            timeDelta: -(100 + Math.random() * 400),
        })),
        idealLapTime: 76800,
        bestLapTime: 78500,
        timeSaved: 1700,
    };

    const summary: AnalysisSummary = {
        bestLapTime: 78500,
        idealLapTime: 76800,
        totalTimeDelta: 1700,
        totalOpportunities: opportunities.length,
        biggestOpportunityIndex: 0,
        avgSpeedBest: 115,
        avgSpeedIdeal: 118,
        maxSpeedBest: 195,
        maxSpeedIdeal: 198,
        maxBrakingGBest: 1.2,
        maxBrakingGIdeal: 1.35,
        maxLateralGBest: 1.4,
        maxLateralGIdeal: 1.5,
        dataQualityScore: 0.98,
        analysisConfidence: 0.98,
    };

    return {
        sessionId: 'demo-session',
        segments,
        idealLap: idealLapResult,
        bestLap,
        drivingEvents,
        opportunities,
        deltaTimeCurve,
        summary,
    };
}

function generateMockSegments(trackLength: number): TrackSegment[] {
    const segments: TrackSegment[] = [];
    const cornerPositions = [
        { start: 0, end: 200, type: 'straight' as const },
        { start: 200, end: 380, type: 'corner' as const, corner: 1 },
        { start: 380, end: 650, type: 'straight' as const },
        { start: 650, end: 850, type: 'corner' as const, corner: 2 },
        { start: 850, end: 1100, type: 'straight' as const },
        { start: 1100, end: 1350, type: 'corner' as const, corner: 3 },
        { start: 1350, end: 1600, type: 'straight' as const },
        { start: 1600, end: 1800, type: 'corner' as const, corner: 4 },
        { start: 1800, end: 1950, type: 'straight' as const },
        { start: 1950, end: 2150, type: 'corner' as const, corner: 5 },
        { start: 2150, end: 2350, type: 'straight' as const },
        { start: 2350, end: 2500, type: 'corner' as const, corner: 6 },
    ];

    cornerPositions.forEach((pos, i) => {
        segments.push({
            id: generateId(),
            segmentIndex: i,
            type: pos.type,
            startDistance: pos.start,
            endDistance: pos.end,
            cornerNumber: 'corner' in pos ? pos.corner : undefined,
            cornerDirection: 'corner' in pos ? (i % 2 === 0 ? 1 : -1) : undefined,
            avgCurvature: pos.type === 'corner' ? 0.01 + Math.random() * 0.02 : 0.001,
        });
    });

    return segments;
}

function generateMockLap(
    id: string,
    lapNumber: number,
    lapTimeMs: number,
    trackLength: number,
): LapTelemetry {
    const numPoints = Math.floor(trackLength / 1); // 1m resolution
    const points: SpatialTelemetryPoint[] = [];
    const lapTimeSec = lapTimeMs / 1000;

    // Speed profile: fast on straights, slow through corners
    const cornerZones = [
        { center: 290, width: 90, minSpeed: 55 },
        { center: 750, width: 100, minSpeed: 63 },
        { center: 1225, width: 125, minSpeed: 48 },
        { center: 1700, width: 100, minSpeed: 72 },
        { center: 2050, width: 100, minSpeed: 58 },
        { center: 2425, width: 75, minSpeed: 85 },
    ];

    const baseTopSpeed = lapNumber === -1 ? 198 : 195; // ideal lap slightly faster

    for (let i = 0; i < numPoints; i++) {
        const distance = i;
        const progress = distance / trackLength;

        // Base speed (high)
        let speed = baseTopSpeed;

        // Apply corner slow-downs
        for (const corner of cornerZones) {
            const distFromCenter = Math.abs(distance - corner.center);
            if (distFromCenter < corner.width * 1.5) {
                const factor = Math.exp(-(distFromCenter * distFromCenter) / (2 * (corner.width * 0.4) ** 2));
                speed = speed - (speed - corner.minSpeed) * factor;
            }
        }

        // Add small variation for realism
        speed += (Math.random() - 0.5) * 2;
        speed = Math.max(30, speed);

        // Compute elapsed time from speed
        const elapsedTime = progress * lapTimeSec;

        // G-forces based on speed profile
        const speedKmhToMs = speed / 3.6;
        const curvature = cornerZones.reduce((maxC, corner) => {
            const distFromCenter = Math.abs(distance - corner.center);
            if (distFromCenter < corner.width) {
                return Math.max(maxC, 0.02 * Math.exp(-(distFromCenter ** 2) / (2 * (corner.width * 0.5) ** 2)));
            }
            return maxC;
        }, 0.0005);

        const lateralG = speedKmhToMs * speedKmhToMs * curvature / 9.81;

        // Longitudinal G from speed changes
        let longG = 0;
        if (i > 0) {
            const prevSpeed = points[i - 1].smoothedSpeed;
            const dv = (speed - prevSpeed) / 3.6;
            const dt = 1 / speedKmhToMs; // time to cover 1m
            longG = dv / dt / 9.81;
        }

        // Base lat/lon (simulated track near a racing circuit)
        const angle = progress * 2 * Math.PI;
        const baseLat = 45.618 + Math.cos(angle) * 0.005;
        const baseLon = 9.281 + Math.sin(angle) * 0.008;

        points.push({
            timestamp: Date.now() - lapTimeMs + elapsedTime * 1000,
            speed,
            gforceX: lateralG * (Math.random() > 0.5 ? 1 : -1),
            gforceY: longG,
            gforceZ: 1.0 + (Math.random() - 0.5) * 0.05,
            location: {
                latitude: baseLat,
                longitude: baseLon,
                altitude: 200 + Math.sin(progress * 4 * Math.PI) * 10,
                accuracy: 2 + Math.random() * 2,
                speed: speed / 3.6,
                heading: (progress * 360) % 360,
                timestamp: Date.now() - lapTimeMs + elapsedTime * 1000,
            },
            distance,
            elapsedTime,
            curvature,
            smoothedSpeed: speed,
            smoothedGForceX: lateralG * (Math.random() > 0.5 ? 1 : -1),
            smoothedGForceY: longG,
        });
    }

    return {
        lapId: id,
        lapNumber,
        lapTime: lapTimeMs,
        isValid: true,
        points,
        totalDistance: trackLength,
    };
}

function generateMockDeltaCurve(trackLength: number): DeltaTimePoint[] {
    const points: DeltaTimePoint[] = [];
    let cumulativeDelta = 0;

    for (let d = 0; d < trackLength; d += 5) {
        // Delta grows through corners, stays flat on straights
        const cornerInfluence = [290, 750, 1225, 1700, 2050, 2425].reduce((sum, center) => {
            const dist = Math.abs(d - center);
            if (dist < 100) {
                return sum + 0.003 * Math.exp(-(dist ** 2) / (2 * 40 ** 2));
            }
            return sum;
        }, 0);

        cumulativeDelta += cornerInfluence;
        points.push({ distance: d, delta: cumulativeDelta });
    }

    return points;
}

function generateMockOpportunities(segments: TrackSegment[]): Opportunity[] {
    const corners = segments.filter(s => s.type === 'corner');

    return corners.map((seg, i) => {
        const timeDelta = 0.15 + Math.random() * 0.45;
        const cornerNum = seg.cornerNumber || i + 1;

        // Generate approach + corner speed profiles
        const profileLength = Math.floor((seg.endDistance - seg.startDistance + 100) / 2);
        const bestProfile: SpeedDistancePoint[] = [];
        const optProfile: SpeedDistancePoint[] = [];
        const bestAccelProfile: GForceDistancePoint[] = [];
        const optAccelProfile: GForceDistancePoint[] = [];
        const bestTimeProfile: TimeDistancePoint[] = [];
        const optTimeProfile: TimeDistancePoint[] = [];

        const baseSpeed = 120 + Math.random() * 60;
        const minSpeedBest = 50 + Math.random() * 30;
        const minSpeedOpt = minSpeedBest + 2 + Math.random() * 5;

        for (let j = 0; j < profileLength; j++) {
            const d = seg.startDistance - 50 + j * 2;
            const progress = j / profileLength;
            const cornerProgress = Math.sin(progress * Math.PI);

            const bestSpeed = baseSpeed - (baseSpeed - minSpeedBest) * cornerProgress;
            const optSpeed = baseSpeed - (baseSpeed - minSpeedOpt) * cornerProgress * 0.95;

            bestProfile.push({ distance: d, speed: bestSpeed });
            optProfile.push({ distance: d, speed: optSpeed });

            const bestG = -1.5 * Math.sin(progress * Math.PI * 2) * (progress < 0.5 ? 1 : -0.7);
            const optG = -1.7 * Math.sin(progress * Math.PI * 2) * (progress < 0.5 ? 1 : -0.7);
            bestAccelProfile.push({ distance: d, gForce: bestG });
            optAccelProfile.push({ distance: d, gForce: optG });

            bestTimeProfile.push({ distance: d, time: progress * 3 });
            optTimeProfile.push({ distance: d, time: progress * 3 * (1 - timeDelta / 3) });
        }

        const brakingG = 0.8 + Math.random() * 0.5;
        const apexTypes: Array<'early' | 'late' | 'on_target'> = ['early', 'late', 'on_target'];

        return {
            id: generateId(),
            number: i + 1,
            segment: seg,
            totalTimeDelta: timeDelta,
            overview: {
                description: `YOU ACHIEVED YOUR FASTEST TIME WHEN YOU BRAKED:\nLATER: ${(1 + Math.random() * 4).toFixed(0)} M.    HARDER: ${(40 + Math.random() * 20).toFixed(0)}%    LONGER: ${(timeDelta * 0.6).toFixed(2)} S`,
                timeDelta,
                advice: i % 2 === 0
                    ? 'Focus on braking point and intensity for this corner.'
                    : 'TURN IN EARLIER, APEX EARLIER AND STAY TRACK LEFT LONGER.',
            },
            braking: {
                distanceDelta: 1 + Math.random() * 5,
                intensityDelta: 40 + Math.random() * 20,
                timeDelta: timeDelta * 0.4,
                bestLapBrakingG: brakingG,
                optimalBrakingG: brakingG + 0.1 + Math.random() * 0.15,
                bestLapBrakingSpeed: baseSpeed - 5 + Math.random() * 10,
                optimalBrakingSpeed: baseSpeed + Math.random() * 10,
                bestLapProfile: bestProfile,
                optimalProfile: optProfile,
            },
            apex: {
                apexType: apexTypes[i % 3],
                turnEntryType: apexTypes[(i + 1) % 3],
                apexDistanceDelta: -5 + Math.random() * 10,
                bestLapApexSpeed: minSpeedBest,
                optimalApexSpeed: minSpeedOpt,
                bestLapApexG: 1.0 + Math.random() * 0.5,
                optimalApexG: 1.1 + Math.random() * 0.5,
                timeDelta: timeDelta * 0.3,
                advice: apexTypes[i % 3] === 'early'
                    ? 'TURN IN EARLIER, APEX EARLIER AND STAY TRACK LEFT LONGER.'
                    : 'LATER APEX. CARRY MORE SPEED THROUGH EXIT.',
                bestLapAccelProfile: bestAccelProfile,
                optimalAccelProfile: optAccelProfile,
                bestLapSpeedProfile: bestProfile,
                optimalSpeedProfile: optProfile,
            },
            speed: {
                bestLapMaxSpeed: baseSpeed,
                optimalMaxSpeed: baseSpeed + 3 + Math.random() * 5,
                bestLapMinSpeed: minSpeedBest,
                optimalMinSpeed: minSpeedOpt,
                timeDelta: timeDelta * 0.3,
                bestLapProfile: bestProfile,
                optimalProfile: optProfile,
                bestLapTimeProfile: bestTimeProfile,
                optimalTimeProfile: optTimeProfile,
            },
        };
    });
}

function generateMockDrivingEvents(segments: TrackSegment[]): DrivingEvent[] {
    const events: DrivingEvent[] = [];
    const corners = segments.filter(s => s.type === 'corner');

    for (const corner of corners) {
        // Braking event before corner
        events.push({
            id: generateId(),
            type: 'braking',
            startDistance: corner.startDistance - 80,
            endDistance: corner.startDistance + 20,
            bestLapTime: 0,
            idealLapTime: 0,
            speedAtStart: 150 + Math.random() * 40,
            speedAtEnd: 60 + Math.random() * 30,
            peakGForce: 0.8 + Math.random() * 0.6,
            duration: 1.5 + Math.random() * 1,
            segmentId: corner.id,
        });

        // Acceleration event after corner
        events.push({
            id: generateId(),
            type: 'acceleration',
            startDistance: corner.endDistance - 30,
            endDistance: corner.endDistance + 100,
            bestLapTime: 0,
            idealLapTime: 0,
            speedAtStart: 60 + Math.random() * 30,
            speedAtEnd: 140 + Math.random() * 40,
            peakGForce: 0.4 + Math.random() * 0.3,
            duration: 2 + Math.random() * 2,
            segmentId: corner.id,
        });
    }

    return events;
}
