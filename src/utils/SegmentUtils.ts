/**
 * RaceBuddy - Segment Utilities
 *
 * High-performance utilities for segment operations.
 * Optimized to reduce redundant filtering and improve lookup performance.
 */

import { SpatialTelemetryPoint, TrackSegment } from '../types/analysis';

/**
 * Efficiently extracts points within a segment using binary search.
 * Much faster than repeated .filter() calls on large arrays.
 *
 * @param points - Points array (must have .distance in ascending order)
 * @param segment - Segment with startDistance and endDistance
 * @returns Slice of points within segment bounds
 */
export function getSegmentPointsOptimized(
    points: SpatialTelemetryPoint[],
    segment: TrackSegment,
): SpatialTelemetryPoint[] {
    if (points.length === 0) return [];

    // Use binary search to find start index
    const startIdx = binarySearchDistance(points, segment.startDistance);
    const endIdx = binarySearchDistance(points, segment.endDistance, startIdx);

    // Return slice (O(1) reference, not copying)
    return points.slice(startIdx, endIdx + 1);
}

/**
 * Binary search for distance in points array.
 * Returns index of first point >= targetDistance (or last index if not found).
 */
function binarySearchDistance(
    points: SpatialTelemetryPoint[],
    targetDistance: number,
    startHint?: number,
): number {
    let left = startHint || 0;
    let right = points.length - 1;

    // Early exit for out-of-bounds
    if (targetDistance <= points[0].distance) return 0;
    if (targetDistance >= points[right].distance) return right;

    while (left < right) {
        const mid = Math.floor((left + right) / 2);
        if (points[mid].distance < targetDistance) {
            left = mid + 1;
        } else {
            right = mid;
        }
    }

    return left;
}

/**
 * Batch extract points for multiple segments. Avoids redundant scanning.
 * Returns results in same order as segments.
 */
export function getSegmentPointsBatch(
    points: SpatialTelemetryPoint[],
    segments: TrackSegment[],
): SpatialTelemetryPoint[][] {
    if (segments.length === 0) return [];

    const results: SpatialTelemetryPoint[][] = new Array(segments.length);
    let currentIdx = 0;

    for (let s = 0; s < segments.length; s++) {
        const segment = segments[s];

        // Find start index (only scan forward from previous position)
        while (
            currentIdx < points.length &&
            points[currentIdx].distance < segment.startDistance
        ) {
            currentIdx++;
        }

        const startIdx = currentIdx;
        let endIdx = startIdx;

        // Find end index
        while (
            endIdx < points.length &&
            points[endIdx].distance <= segment.endDistance
        ) {
            endIdx++;
        }

        results[s] = points.slice(startIdx, endIdx);
    }

    return results;
}

/**
 * Computes elapsed time for a segment. Avoids array filtering.
 * Assumes points are in ascending distance order.
 */
export function getSegmentTimeOptimized(
    points: SpatialTelemetryPoint[],
    segment: TrackSegment,
): number {
    const segPoints = getSegmentPointsOptimized(points, segment);

    if (segPoints.length < 2) return 0;

    const firstPoint = segPoints[0];
    const lastPoint = segPoints[segPoints.length - 1];

    return lastPoint.elapsedTime - firstPoint.elapsedTime;
}

/**
 * Finds all extrema of a signal within a segment.
 * Useful for identifying peaks and troughs efficiently.
 */
export function findSegmentExtrema(
    points: SpatialTelemetryPoint[],
    segment: TrackSegment,
    signalKey: keyof SpatialTelemetryPoint,
): { index: number; distance: number; value: number }[] {
    const segPoints = getSegmentPointsOptimized(points, segment);
    const extrema: { index: number; distance: number; value: number }[] = [];

    if (segPoints.length < 3) return extrema;

    for (let i = 1; i < segPoints.length - 1; i++) {
        const prev = segPoints[i - 1][signalKey] as number;
        const curr = segPoints[i][signalKey] as number;
        const next = segPoints[i + 1][signalKey] as number;

        if ((curr > prev && curr > next) || (curr < prev && curr < next)) {
            extrema.push({
                index: i,
                distance: segPoints[i].distance,
                value: curr,
            });
        }
    }

    return extrema;
}

/**
 * Finds segment at a given distance. Returns null if not found.
 * O(log n) with binary search.
 */
export function findSegmentAtDistance(
    segments: TrackSegment[],
    distance: number,
): TrackSegment | null {
    // Binary search on segments by startDistance
    let left = 0;
    let right = segments.length - 1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const segment = segments[mid];

        if (distance < segment.startDistance) {
            right = mid - 1;
        } else if (distance > segment.endDistance) {
            left = mid + 1;
        } else {
            return segment;
        }
    }

    return null;
}

/**
 * Filters segments by type more efficiently (no string allocations).
 */
export function filterSegmentsByType(
    segments: TrackSegment[],
    type: 'corner' | 'straight',
): TrackSegment[] {
    return segments.filter(s => s.type === type);
}

/**
 * Pre-compute segment lookup index for O(1) distance → segment mapping.
 * Useful for repeated lookups in tight loops.
 */
export class SegmentIndex {
    private segmentMap: Map<string, TrackSegment> = new Map();
    private sortedSegments: TrackSegment[];

    constructor(segments: TrackSegment[]) {
        this.sortedSegments = [...segments].sort((a, b) => a.startDistance - b.startDistance);

        for (const seg of this.sortedSegments) {
            this.segmentMap.set(seg.id, seg);
        }
    }

    getAtDistance(distance: number): TrackSegment | null {
        if (this.sortedSegments.length === 0) return null;

        // Binary search
        let left = 0;
        let right = this.sortedSegments.length - 1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const seg = this.sortedSegments[mid];

            if (distance < seg.startDistance) {
                right = mid - 1;
            } else if (distance > seg.endDistance) {
                left = mid + 1;
            } else {
                return seg;
            }
        }

        return null;
    }

    getById(id: string): TrackSegment | undefined {
        return this.segmentMap.get(id);
    }

    getAll(): TrackSegment[] {
        return this.sortedSegments;
    }

    getCorners(): TrackSegment[] {
        return this.sortedSegments.filter(s => s.type === 'corner');
    }

    getStraights(): TrackSegment[] {
        return this.sortedSegments.filter(s => s.type === 'straight');
    }
}
