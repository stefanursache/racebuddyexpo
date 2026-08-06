/**
 * ClaudeIngestion
 *
 * Lightweight utilities to produce compact payloads from a full
 * `LapAnalysisResult` for sending to Claude-style LLMs while
 * minimizing token usage.
 */

import {
  LapAnalysisResult,
  DeltaTimePoint,
} from '../types/analysis';

type Options = {
  maxPointsPerProfile?: number; // cap points per profile (default 30)
  stepMeters?: number; // sampling step for delta curve (default 1m)
  floatPrecision?: number; // decimals (default 2)
  exportFormat?: 'json' | 'csv';
};

function round(n: number, p: number) {
  const m = Math.pow(10, p);
  return Math.round((n + Number.EPSILON) * m) / m;
}

function djb2Hash(str: string) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i); /* h * 33 + c */
    h = h & 0xffffffff;
  }
  return (h >>> 0).toString(16);
}

function downsampleDelta(curve: DeltaTimePoint[], stepMeters: number) {
  if (curve.length === 0) return [] as DeltaTimePoint[];
  const out: DeltaTimePoint[] = [];
  let last = curve[0].distance - stepMeters - 1;
  for (const p of curve) {
    if (p.distance >= last + stepMeters) {
      out.push(p);
      last = p.distance;
    }
  }
  return out;
}

function limitProfile<T extends { distance: number }>(arr: T[], maxPoints: number) {
  if (arr.length <= maxPoints) return arr.slice();
  const out: T[] = [];
  const step = (arr.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    out.push(arr[idx]);
  }
  return out;
}

export function preparePayload(analysis: LapAnalysisResult, opts: Options = {}) {
  const { maxPointsPerProfile = 30, stepMeters = 1, floatPrecision = 2, exportFormat = 'json' } = opts;

  // Minimal lap summaries
  const laps = [analysis.bestLap].concat([]); // keep bestLap only by default
  const lapSummaries = laps.map(l => ({
    lapId: l.lapId,
    lapNumber: l.lapNumber,
    lapTime: round(l.lapTime / 1000, 2), // seconds
    totalDistance: round(l.totalDistance, floatPrecision),
    avgSpeed: round(l.points.reduce((s, p) => s + p.smoothedSpeed, 0) / Math.max(1, l.points.length), floatPrecision),
    maxSpeed: round(Math.max(...l.points.map(p => p.smoothedSpeed), 0), floatPrecision),
    maxLateralG: round(Math.max(...l.points.map(p => Math.abs(p.smoothedGForceX)), 0), floatPrecision),
    numPoints: l.points.length,
  }));

  // Compact segments
  const segments = analysis.segments.map(s => ({
    segmentIndex: s.segmentIndex,
    type: s.type,
    startDistance: round(s.startDistance, floatPrecision),
    endDistance: round(s.endDistance, floatPrecision),
    avgCurvature: round(s.avgCurvature, floatPrecision),
  }));

  // Downsample delta curve
  const delta = downsampleDelta(analysis.deltaTimeCurve, stepMeters).map(p => ({
    distance: round(p.distance, floatPrecision),
    delta: round(p.delta, floatPrecision),
  }));

  // Opportunities: keep only small fields
  const opportunities = analysis.opportunities.slice(0, 10).map(o => ({
    segmentIndex: o.segment.segmentIndex,
    totalTimeDelta_s: round(o.totalTimeDelta, floatPrecision),
    primaryCause: (() => {
      // simple heuristic: compare braking/apex/speed time deltas
      const b = Math.abs(o.braking?.timeDelta || 0);
      const a = Math.abs(o.apex?.timeDelta || 0);
      const s = Math.abs(o.speed?.timeDelta || 0);
      if (b >= a && b >= s) return 'braking';
      if (a >= b && a >= s) return 'apex';
      return 'speed';
    })(),
  }));

  const payloadObj: any = {
    sessionId: analysis.sessionId,
    summary: {
      bestLap_s: round(analysis.bestLap.lapTime / 1000, 2),
      idealLap_s: round(analysis.idealLap.idealLapTime / 1000, 2),
      totalGain_s: round((analysis.idealLap.timeSaved || 0) / 1000, 2),
    },
    laps: lapSummaries,
    segments,
    opportunities,
    deltaCurve: delta,
  };

  let finalPayload: any = payloadObj;
  if (exportFormat === 'csv') {
    // Simple CSV: deltaCurve only (small) + metadata JSON
    const deltaCsv = delta.map(p => `${p.distance},${p.delta}`).join('\n');
    finalPayload = {
      meta: { sessionId: payloadObj.sessionId },
      deltaCsv,
      summary: payloadObj.summary,
      opportunities: payloadObj.opportunities,
    };
  }

  const signature = djb2Hash(JSON.stringify(finalPayload));

  return { signature, payload: finalPayload };
}

export default { preparePayload };
