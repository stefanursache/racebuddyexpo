/**
 * RaceBuddy - Signal Processing Utilities
 *
 * Provides smoothing, filtering, resampling, and derivative operations
 * for noisy telemetry data. All operations preserve dynamic driving
 * characteristics while removing sensor noise.
 */

import { Location } from '../types';
import {
    SpatialTelemetryPoint,
    AnalysisConfig,
    DEFAULT_ANALYSIS_CONFIG,
} from '../types/analysis';
import { LocationService } from '../services/LocationService';

// ─── Kernel Caching for Gaussian Smoothing ──────────────────────────

/**
 * Cache for pre-computed Gaussian kernels to avoid recalculation.
 * Kernels are expensive to compute and the same ones are used repeatedly.
 */
const gaussianKernelCache = new Map<number, number[]>();

function getGaussianKernel(windowSize: number): number[] {
    const cached = gaussianKernelCache.get(windowSize);
    if (cached) return cached;

    const halfWindow = Math.floor(windowSize / 2);
    const sigma = halfWindow / 2.5;
    const kernel: number[] = [];
    let kernelSum = 0;

    for (let i = -halfWindow; i <= halfWindow; i++) {
        const weight = Math.exp(-(i * i) / (2 * sigma * sigma));
        kernel.push(weight);
        kernelSum += weight;
    }

    // Normalize in-place
    for (let i = 0; i < kernel.length; i++) {
        kernel[i] /= kernelSum;
    }

    // Cache for future use
    gaussianKernelCache.set(windowSize, kernel);
    return kernel;
}

/**
 * Applies a Gaussian-weighted moving average to an array of numbers.
 * This preserves sharp transients better than a simple box filter.
 * 
 * OPTIMIZATION: Caches pre-computed kernels to avoid expensive recalculation.
 */
export function gaussianSmooth(data: number[], windowSize: number): number[] {
    if (data.length === 0 || windowSize < 3) return [...data];

    const halfWindow = Math.floor(windowSize / 2);
    const kernel = getGaussianKernel(windowSize);
    const result: number[] = new Array(data.length);

    for (let i = 0; i < data.length; i++) {
        let value = 0;
        let weightSum = 0;

        for (let k = 0; k < kernel.length; k++) {
            const idx = i - halfWindow + k;
            if (idx >= 0 && idx < data.length) {
                value += data[idx] * kernel[k];
                weightSum += kernel[k];
            }
        }

        result[i] = value / weightSum;
    }

    return result;
}

/**
 * Simple moving average for quick smoothing.
 */
export function movingAverage(data: number[], windowSize: number): number[] {
    if (data.length === 0 || windowSize < 2) return [...data];

    const halfWindow = Math.floor(windowSize / 2);
    const result: number[] = new Array(data.length);

    for (let i = 0; i < data.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = Math.max(0, i - halfWindow); j <= Math.min(data.length - 1, i + halfWindow); j++) {
            sum += data[j];
            count++;
        }
        result[i] = sum / count;
    }

    return result;
}

// ─── Butterworth-inspired Low-Pass Filter ────────────────────────────

/**
 * Second-order IIR low-pass filter (simplified Butterworth).
 * Good for removing high-frequency sensor noise while preserving
 * the shape of braking/acceleration events.
 *
 * @param data - Input signal
 * @param cutoffRatio - Cutoff as a fraction of Nyquist (0..1), lower = smoother
 */
export function lowPassFilter(data: number[], cutoffRatio: number = 0.2): number[] {
    if (data.length < 3) return [...data];

    const omega = Math.tan(Math.PI * cutoffRatio);
    const omega2 = omega * omega;
    const sqrt2 = Math.SQRT2;

    const denom = 1 + sqrt2 * omega + omega2;
    const b0 = omega2 / denom;
    const b1 = 2 * b0;
    const b2 = b0;
    const a1 = 2 * (omega2 - 1) / denom;
    const a2 = (1 - sqrt2 * omega + omega2) / denom;

    const result: number[] = new Array(data.length);
    result[0] = data[0];
    result[1] = data[1];

    for (let i = 2; i < data.length; i++) {
        result[i] = b0 * data[i] + b1 * data[i - 1] + b2 * data[i - 2]
            - a1 * result[i - 1] - a2 * result[i - 2];
    }

    return result;
}

// ─── Derivative / Rate of Change ─────────────────────────────────────

/**
 * Computes the numerical derivative of a signal using central differences.
 * Returns rate of change per sample.
 */
export function derivative(data: number[]): number[] {
    if (data.length < 2) return data.map(() => 0);

    const result: number[] = new Array(data.length);

    result[0] = data[1] - data[0];
    for (let i = 1; i < data.length - 1; i++) {
        result[i] = (data[i + 1] - data[i - 1]) / 2;
    }
    result[data.length - 1] = data[data.length - 1] - data[data.length - 2];

    return result;
}

/**
 * Computes derivative with respect to a non-uniform independent variable
 * (e.g., speed change per meter of distance).
 */
export function derivativeNonUniform(
    values: number[],
    independentVar: number[],
): number[] {
    const n = values.length;
    if (n < 2) return values.map(() => 0);

    const result: number[] = new Array(n);

    const dx0 = independentVar[1] - independentVar[0];
    result[0] = dx0 !== 0 ? (values[1] - values[0]) / dx0 : 0;

    for (let i = 1; i < n - 1; i++) {
        const dx = independentVar[i + 1] - independentVar[i - 1];
        result[i] = dx !== 0 ? (values[i + 1] - values[i - 1]) / dx : 0;
    }

    const dxN = independentVar[n - 1] - independentVar[n - 2];
    result[n - 1] = dxN !== 0 ? (values[n - 1] - values[n - 2]) / dxN : 0;

    return result;
}

// ─── Peak / Extrema Detection ────────────────────────────────────────

export interface Extremum {
    index: number;
    value: number;
    type: 'maximum' | 'minimum';
}

/**
 * Finds local maxima and minima in a signal.
 * Uses a prominence-based approach to filter out noise peaks.
 *
 * @param data - The signal
 * @param minProminence - Minimum peak prominence to report
 */
export function findExtrema(data: number[], minProminence: number = 0): Extremum[] {
    if (data.length < 3) return [];

    const extrema: Extremum[] = [];

    for (let i = 1; i < data.length - 1; i++) {
        if (data[i] > data[i - 1] && data[i] > data[i + 1]) {
            // Candidate maximum
            const prominence = computeProminence(data, i, 'maximum');
            if (prominence >= minProminence) {
                extrema.push({ index: i, value: data[i], type: 'maximum' });
            }
        } else if (data[i] < data[i - 1] && data[i] < data[i + 1]) {
            // Candidate minimum
            const prominence = computeProminence(data, i, 'minimum');
            if (prominence >= minProminence) {
                extrema.push({ index: i, value: data[i], type: 'minimum' });
            }
        }
    }

    return extrema;
}

function computeProminence(data: number[], peakIdx: number, type: 'maximum' | 'minimum'): number {
    const peakVal = data[peakIdx];
    let leftBound = peakVal;
    let rightBound = peakVal;

    // Search left
    for (let i = peakIdx - 1; i >= 0; i--) {
        if (type === 'maximum') {
            if (data[i] > peakVal) break;
            leftBound = Math.min(leftBound, data[i]);
        } else {
            if (data[i] < peakVal) break;
            leftBound = Math.max(leftBound, data[i]);
        }
    }

    // Search right
    for (let i = peakIdx + 1; i < data.length; i++) {
        if (type === 'maximum') {
            if (data[i] > peakVal) break;
            rightBound = Math.min(rightBound, data[i]);
        } else {
            if (data[i] < peakVal) break;
            rightBound = Math.max(rightBound, data[i]);
        }
    }

    if (type === 'maximum') {
        return peakVal - Math.max(leftBound, rightBound);
    } else {
        return Math.min(leftBound, rightBound) - peakVal;
    }
}

// ─── Spatial Resampling ──────────────────────────────────────────────

/**
 * Resamples telemetry data at uniform distance intervals.
 * This is critical for comparing laps — they must share the same
 * spatial reference frame.
 *
 * @param points - Input points (must have .distance populated)
 * @param resolution - Distance between output samples (meters)
 */
export function resampleByDistance(
    points: SpatialTelemetryPoint[],
    resolution: number,
): SpatialTelemetryPoint[] {
    if (points.length < 2) return [...points];

    const totalDistance = points[points.length - 1].distance;
    const numSamples = Math.floor(totalDistance / resolution) + 1;
    const result: SpatialTelemetryPoint[] = [];

    let srcIdx = 0;

    for (let i = 0; i < numSamples; i++) {
        const targetDist = i * resolution;

        // Advance source index
        while (srcIdx < points.length - 2 && points[srcIdx + 1].distance < targetDist) {
            srcIdx++;
        }

        const p1 = points[srcIdx];
        const p2 = points[Math.min(srcIdx + 1, points.length - 1)];

        const segLen = p2.distance - p1.distance;
        const t = segLen > 0 ? (targetDist - p1.distance) / segLen : 0;

        result.push(interpolatePoint(p1, p2, t, targetDist));
    }

    return result;
}

function interpolatePoint(
    p1: SpatialTelemetryPoint,
    p2: SpatialTelemetryPoint,
    t: number,
    distance: number,
): SpatialTelemetryPoint {
    const lerp = (a: number, b: number) => a + (b - a) * t;

    return {
        timestamp: lerp(p1.timestamp, p2.timestamp),
        speed: lerp(p1.speed, p2.speed),
        gforceX: lerp(p1.gforceX, p2.gforceX),
        gforceY: lerp(p1.gforceY, p2.gforceY),
        gforceZ: lerp(p1.gforceZ, p2.gforceZ),
        location: {
            latitude: lerp(p1.location.latitude, p2.location.latitude),
            longitude: lerp(p1.location.longitude, p2.location.longitude),
            altitude: p1.location.altitude && p2.location.altitude
                ? lerp(p1.location.altitude, p2.location.altitude)
                : p1.location.altitude,
            accuracy: lerp(p1.location.accuracy || 5, p2.location.accuracy || 5),
            speed: lerp(p1.location.speed || 0, p2.location.speed || 0),
            heading: lerpAngle(p1.location.heading || 0, p2.location.heading || 0, t),
            timestamp: lerp(p1.location.timestamp, p2.location.timestamp),
        },
        distance,
        elapsedTime: lerp(p1.elapsedTime, p2.elapsedTime),
        curvature: lerp(p1.curvature, p2.curvature),
        smoothedSpeed: lerp(p1.smoothedSpeed, p2.smoothedSpeed),
        smoothedGForceX: lerp(p1.smoothedGForceX, p2.smoothedGForceX),
        smoothedGForceY: lerp(p1.smoothedGForceY, p2.smoothedGForceY),
        rpm: p1.rpm && p2.rpm ? lerp(p1.rpm, p2.rpm) : p1.rpm,
        throttle: p1.throttle !== undefined && p2.throttle !== undefined
            ? lerp(p1.throttle, p2.throttle) : p1.throttle,
        brake: p1.brake !== undefined && p2.brake !== undefined
            ? lerp(p1.brake, p2.brake) : p1.brake,
    };
}

function lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    return ((a + diff * t) + 360) % 360;
}

// ─── Curvature Computation ───────────────────────────────────────────

/**
 * Computes path curvature from GPS coordinates using Menger curvature
 * (three-point circle fitting).
 */
export function computeCurvature(locations: Location[]): number[] {
    const n = locations.length;
    if (n < 3) return new Array(n).fill(0);

    const curvatures: number[] = new Array(n).fill(0);

    for (let i = 1; i < n - 1; i++) {
        const p1 = locations[i - 1];
        const p2 = locations[i];
        const p3 = locations[i + 1];

        // Convert to local XY (meters) for curvature calculation
        const x1 = 0;
        const y1 = 0;
        const x2 = LocationService.calculateDistance(p1, p2);
        const bearing12 = LocationService.calculateBearing(p1, p2) * Math.PI / 180;
        const x2r = x2 * Math.sin(bearing12);
        const y2r = x2 * Math.cos(bearing12);
        const d13 = LocationService.calculateDistance(p1, p3);
        const bearing13 = LocationService.calculateBearing(p1, p3) * Math.PI / 180;
        const x3r = d13 * Math.sin(bearing13);
        const y3r = d13 * Math.cos(bearing13);

        // Menger curvature: κ = 4·Area(triangle) / (|p1p2|·|p2p3|·|p3p1|)
        const area = Math.abs(
            (x2r - x1) * (y3r - y1) - (x3r - x1) * (y2r - y1)
        ) / 2;

        const d12 = Math.sqrt((x2r - x1) ** 2 + (y2r - y1) ** 2);
        const d23 = Math.sqrt((x3r - x2r) ** 2 + (y3r - y2r) ** 2);
        const d31 = Math.sqrt((x1 - x3r) ** 2 + (y1 - y3r) ** 2);

        const denom = d12 * d23 * d31;
        curvatures[i] = denom > 0.001 ? (4 * area) / denom : 0;
    }

    // Edge values
    curvatures[0] = curvatures[1];
    curvatures[n - 1] = curvatures[n - 2];

    return curvatures;
}

// ─── Cumulative Distance ─────────────────────────────────────────────

/**
 * Computes cumulative distance along a path of locations.
 */
export function computeCumulativeDistance(locations: Location[]): number[] {
    const distances: number[] = [0];

    for (let i = 1; i < locations.length; i++) {
        const d = LocationService.calculateDistance(locations[i - 1], locations[i]);
        distances.push(distances[i - 1] + d);
    }

    return distances;
}

// ─── Outlier Rejection ───────────────────────────────────────────────

/**
 * Removes physically implausible data points (GPS jumps, sensor spikes).
 * Replaces outliers with interpolated values.
 */
export function rejectOutliers(
    data: number[],
    maxDeviation: number = 3.0,
): number[] {
    if (data.length < 5) return [...data];

    // Compute median and MAD (Median Absolute Deviation)
    const sorted = [...data].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const absDeviations = data.map(d => Math.abs(d - median));
    const sortedDev = [...absDeviations].sort((a, b) => a - b);
    const mad = sortedDev[Math.floor(sortedDev.length / 2)] * 1.4826; // Scale to match stddev

    const result = [...data];
    for (let i = 0; i < result.length; i++) {
        if (mad > 0 && Math.abs(result[i] - median) / mad > maxDeviation) {
            // Replace with linear interpolation from neighbors
            const left = i > 0 ? result[i - 1] : result[i];
            const right = i < result.length - 1 ? data[i + 1] : result[i];
            result[i] = (left + right) / 2;
        }
    }

    return result;
}

// ─── Zero-Phase Filtering ────────────────────────────────────────────

/**
 * Applies a filter forwards and backwards to achieve zero phase distortion.
 * This ensures that peaks and transients remain at their true positions.
 */
export function zeroPhaseFilter(data: number[], windowSize: number): number[] {
    const forward = gaussianSmooth(data, windowSize);
    const backward = gaussianSmooth([...forward].reverse(), windowSize);
    return backward.reverse();
}

// ─── Utility: Clamp ──────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

// ─── Utility: Linear Interpolation ───────────────────────────────────

export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * clamp(t, 0, 1);
}

// ─── Utility: Generate unique ID ─────────────────────────────────────

export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
