/**
 * RaceBuddy - Telemetry Preprocessor
 *
 * Converts raw TelemetryData[] into enriched SpatialTelemetryPoint[]
 * with cumulative distance, curvature, and smoothed channels.
 * Also handles lap segmentation from continuous session data.
 */

import { TelemetryData, LapTime } from '../types';
import {
    SpatialTelemetryPoint,
    LapTelemetry,
    AnalysisConfig,
    DEFAULT_ANALYSIS_CONFIG,
} from '../types/analysis';
import {
    gaussianSmooth,
    lowPassFilter,
    computeCurvature,
    computeCumulativeDistance,
    rejectOutliers,
    zeroPhaseFilter,
    generateId,
} from '../utils/SignalProcessing';
import { LocationService } from './LocationService';

export class TelemetryPreprocessor {
    private config: AnalysisConfig;

    constructor(config: Partial<AnalysisConfig> = {}) {
        this.config = { ...DEFAULT_ANALYSIS_CONFIG, ...config };
    }

    /**
     * Convert raw telemetry data for a single lap into a fully enriched
     * SpatialTelemetryPoint array.
     */
    processLap(
        rawData: TelemetryData[],
        lapInfo: LapTime,
    ): LapTelemetry {
        if (rawData.length < 10) {
            throw new Error('Insufficient telemetry data for lap processing (need ≥ 10 points)');
        }

        // Step 1: Reject GPS outliers
        const latitudes = rejectOutliers(rawData.map(d => d.location.latitude));
        const longitudes = rejectOutliers(rawData.map(d => d.location.longitude));

        // Step 2: Compute cumulative distance
        const locations = rawData.map((d, i) => ({
            ...d.location,
            latitude: latitudes[i],
            longitude: longitudes[i],
        }));
        const distances = computeCumulativeDistance(locations);

        // Step 3: Compute curvature
        const rawCurvature = computeCurvature(locations);
        const smoothedCurvature = zeroPhaseFilter(rawCurvature, this.config.gForceSmoothingWindow);

        // Step 4: Smooth speed and G-force channels
        const rawSpeeds = rawData.map(d => d.speed);
        const smoothedSpeeds = zeroPhaseFilter(
            rejectOutliers(rawSpeeds, 4.0),
            this.config.speedSmoothingWindow,
        );

        const rawGx = rawData.map(d => d.gforceX);
        const rawGy = rawData.map(d => d.gforceY);
        const smoothedGx = zeroPhaseFilter(
            rejectOutliers(rawGx, 3.5),
            this.config.gForceSmoothingWindow,
        );
        const smoothedGy = zeroPhaseFilter(
            rejectOutliers(rawGy, 3.5),
            this.config.gForceSmoothingWindow,
        );

        // Step 5: Compute elapsed time
        const startTimestamp = rawData[0].timestamp;

        // Step 6: Assemble enriched points
        const points: SpatialTelemetryPoint[] = rawData.map((d, i) => ({
            ...d,
            location: locations[i],
            distance: distances[i],
            elapsedTime: (d.timestamp - startTimestamp) / 1000,
            curvature: smoothedCurvature[i],
            smoothedSpeed: smoothedSpeeds[i],
            smoothedGForceX: smoothedGx[i],
            smoothedGForceY: smoothedGy[i],
        }));

        const totalDistance = distances[distances.length - 1];

        return {
            lapId: lapInfo.id,
            lapNumber: lapInfo.lapNumber,
            lapTime: lapInfo.duration,
            isValid: lapInfo.isValid,
            points,
            totalDistance,
        };
    }

    /**
     * Extract individual laps from a continuous session telemetry stream
     * using the LapTime timestamps.
     */
    extractLaps(
        sessionData: TelemetryData[],
        lapTimes: LapTime[],
    ): LapTelemetry[] {
        const laps: LapTelemetry[] = [];

        for (const lap of lapTimes) {
            if (!lap.isValid) continue;

            const lapStartMs = lap.startTime.getTime();
            const lapEndMs = lap.endTime.getTime();

            // Extract telemetry points within this lap's time window
            const lapData = sessionData.filter(
                d => d.timestamp >= lapStartMs && d.timestamp <= lapEndMs,
            );

            if (lapData.length >= 10) {
                try {
                    laps.push(this.processLap(lapData, lap));
                } catch (err) {
                    console.warn(`Skipping lap ${lap.lapNumber}: ${err}`);
                }
            }
        }

        return laps;
    }

    /**
     * Validate telemetry data quality and return a score (0-1).
     */
    assessDataQuality(data: TelemetryData[]): {
        overallScore: number;
        gpsQuality: number;
        sampleRateHz: number;
        gapCount: number;
        outlierPercent: number;
    } {
        if (data.length < 2) {
            return { overallScore: 0, gpsQuality: 0, sampleRateHz: 0, gapCount: 0, outlierPercent: 0 };
        }

        // Sample rate
        const totalDuration = (data[data.length - 1].timestamp - data[0].timestamp) / 1000;
        const sampleRateHz = data.length / totalDuration;

        // GPS accuracy
        const accuracies = data
            .map(d => d.location.accuracy || 10)
            .filter(a => a > 0);
        const avgAccuracy = accuracies.reduce((s, a) => s + a, 0) / accuracies.length;
        const gpsQuality = Math.max(0, 1 - avgAccuracy / 20); // 0m=perfect, 20m+=0

        // Gaps (>500ms between samples at 20Hz)
        let gapCount = 0;
        const expectedInterval = 1000 / 20; // 50ms
        for (let i = 1; i < data.length; i++) {
            const dt = data[i].timestamp - data[i - 1].timestamp;
            if (dt > expectedInterval * 5) gapCount++;
        }

        // Outlier percentage in speed channel
        const speeds = data.map(d => d.speed);
        const sorted = [...speeds].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const deviations = speeds.map(s => Math.abs(s - median));
        const sortedDev = [...deviations].sort((a, b) => a - b);
        const mad = sortedDev[Math.floor(sortedDev.length / 2)] * 1.4826;
        const outlierCount = mad > 0
            ? speeds.filter(s => Math.abs(s - median) / mad > 3).length
            : 0;
        const outlierPercent = outlierCount / speeds.length;

        const overallScore = Math.max(0, Math.min(1,
            gpsQuality * 0.4 +
            Math.min(1, sampleRateHz / 20) * 0.3 +
            Math.max(0, 1 - gapCount / 10) * 0.2 +
            Math.max(0, 1 - outlierPercent * 10) * 0.1,
        ));

        return { overallScore, gpsQuality, sampleRateHz, gapCount, outlierPercent };
    }
}
