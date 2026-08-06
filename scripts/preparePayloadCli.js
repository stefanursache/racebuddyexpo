#!/usr/bin/env node
// Lightweight CLI to prepare a compact payload from a LapAnalysisResult JSON
// Usage: node preparePayloadCli.js path/to/analysis.json

const fs = require('fs');
const path = require('path');

function round(n, p) {
    const m = Math.pow(10, p);
    return Math.round((n + Number.EPSILON) * m) / m;
}

function djb2Hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h) + str.charCodeAt(i);
        h = h & 0xffffffff;
    }
    return (h >>> 0).toString(16);
}

function downsampleDelta(curve, stepMeters) {
    if (!Array.isArray(curve) || curve.length === 0) return [];
    const out = [];
    let last = curve[0].distance - stepMeters - 1;
    for (const p of curve) {
        if (p.distance >= last + stepMeters) {
            out.push(p);
            last = p.distance;
        }
    }
    return out;
}

function usage() {
    console.log('Usage: node preparePayloadCli.js path/to/analysis.json [options]');
    console.log('Options: --stepMeters=N --precision=N --format=json|csv');
}

const argv = process.argv.slice(2);
if (argv.length === 0) {
    usage();
    process.exit(1);
}

const filePath = argv[0];
const opts = { stepMeters: 1, precision: 2, format: 'json' };
for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--stepMeters=')) opts.stepMeters = Number(a.split('=')[1]);
    if (a.startsWith('--precision=')) opts.precision = Number(a.split('=')[1]);
    if (a.startsWith('--format=')) opts.format = a.split('=')[1];
}

if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(2);
}

const raw = fs.readFileSync(filePath, 'utf8');
let analysis;
try {
    analysis = JSON.parse(raw);
} catch (err) {
    console.error('Failed to parse JSON:', err.message);
    process.exit(3);
}

// Build compact payload (mirrors TypeScript helper behavior)
const bestLap = analysis.bestLap || { points: [], lapTime: 0, lapId: 'best' };
const lapSummaries = [bestLap].map(l => ({
    lapId: l.lapId,
    lapNumber: l.lapNumber,
    lapTime: round((l.lapTime || 0) / 1000, 2),
    totalDistance: round(l.totalDistance || 0, opts.precision),
    avgSpeed: round((l.points || []).reduce((s, p) => s + (p.smoothedSpeed || 0), 0) / Math.max(1, (l.points || []).length), opts.precision),
    maxSpeed: round(Math.max(...((l.points || []).map(p => p.smoothedSpeed || 0)), 0), opts.precision),
    maxLateralG: round(Math.max(...((l.points || []).map(p => Math.abs(p.smoothedGForceX || 0))), 0), opts.precision),
    numPoints: (l.points || []).length,
}));

const segments = (analysis.segments || []).map(s => ({
    segmentIndex: s.segmentIndex,
    type: s.type,
    startDistance: round(s.startDistance || 0, opts.precision),
    endDistance: round(s.endDistance || 0, opts.precision),
    avgCurvature: round(s.avgCurvature || 0, opts.precision),
}));

const delta = downsampleDelta(analysis.deltaTimeCurve || [], opts.stepMeters).map(p => ({
    distance: round(p.distance, opts.precision),
    delta: round(p.delta, opts.precision),
}));

const opportunities = (analysis.opportunities || []).slice(0, 10).map(o => ({
    segmentIndex: o.segment?.segmentIndex,
    totalTimeDelta_s: round(o.totalTimeDelta || 0, opts.precision),
    primaryCause: (() => {
        const b = Math.abs((o.braking && o.braking.timeDelta) || 0);
        const a = Math.abs((o.apex && o.apex.timeDelta) || 0);
        const s = Math.abs((o.speed && o.speed.timeDelta) || 0);
        if (b >= a && b >= s) return 'braking';
        if (a >= b && a >= s) return 'apex';
        return 'speed';
    })(),
}));

const payloadObj = {
    sessionId: analysis.sessionId || 'unknown',
    summary: {
        bestLap_s: round(((analysis.bestLap && analysis.bestLap.lapTime) || 0) / 1000, 2),
        idealLap_s: round(((analysis.idealLap && analysis.idealLap.idealLapTime) || 0) / 1000, 2),
        totalGain_s: round(((analysis.idealLap && analysis.idealLap.timeSaved) || 0) / 1000, 2),
    },
    laps: lapSummaries,
    segments,
    opportunities,
    deltaCurve: delta,
};

let finalPayload = payloadObj;
if (opts.format === 'csv') {
    const deltaCsv = delta.map(p => `${p.distance},${p.delta}`).join('\n');
    finalPayload = {
        meta: { sessionId: payloadObj.sessionId },
        deltaCsv,
        summary: payloadObj.summary,
        opportunities: payloadObj.opportunities,
    };
}

const signature = djb2Hash(JSON.stringify(finalPayload));

const out = { signature, payload: finalPayload };
console.log(JSON.stringify(out, null, 2));

// Optionally write to file next to input
const outPath = path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)) + '.prepared.json');
try {
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.error('Wrote prepared payload to', outPath);
} catch (err) {
    // ignore
}
