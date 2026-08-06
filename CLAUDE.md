# RaceBuddyExpo — Claude Reference (compact)

Purpose
- Single-page reference for Claude-style prompts to minimize token usage and AI credits when analyzing RaceBuddy telemetry and producing opportunities/insights.

What to include in prompts (minimal):
- Session metadata: `sessionId`, `trackId`, `startTime`, `lapTimes[]` (only lap id, number, start/end timestamps, duration, isValid).
- Per-lap summary (not raw telemetry): `lapId`, `lapNumber`, `lapTime(ms)`, `totalDistance(m)`, statistical aggregates: `avgSpeed(km/h)`, `maxSpeed`, `maxLateralG`, `maxLongitudinalG`, `numPoints`.
- For any segment you want analysis on: send segment object with `segmentIndex`, `type`, `startDistance`, `endDistance`, `avgCurvature`.
- Delta/time series: optionally send a compact delta array: [{distance, deltaSeconds}] sampled every 1m or every N points.

Key data shapes (send these exact, small fields):
- TelemetryData (if needed, send only a few samples or aggregated arrays): `{timestamp, speed, gforceX, gforceY, location{lat,long}, rpm?}`
- SpatialTelemetryPoint (only when necessary): `{distance, elapsedTime, smoothedSpeed, smoothedGForceX, smoothedGForceY}`
- TrackSegment: `{id, segmentIndex, type, startDistance, endDistance, avgCurvature}`
- DrivingEvent: `{type, startDistance, endDistance, duration, speedAtStart, speedAtEnd, peakGForce}`

Minimal example payload (compact JSON example to paste):
{
  "sessionId":"s123",
  "trackId":"t-paris",
  "laps":[
    {"lapId":"l1","lapNumber":1,"lapTime":123456,"totalDistance":4500,"avgSpeed":145.2,"maxSpeed":198.3,"maxLateralG":1.5},
    {"lapId":"l2","lapNumber":2,"lapTime":122100,"totalDistance":4500,"avgSpeed":146.1,"maxSpeed":199.0,"maxLateralG":1.6}
  ],
  "segments":[{"segmentIndex":3,"type":"corner","startDistance":2300,"endDistance":2400,"avgCurvature":0.02}],
  "deltaCurve":[{"distance":2300,"delta":0.24},{"distance":2301,"delta":0.26}]
}

Project entry points (call locally first):
- `LapAnalyzer.analyzeSession(session: RacingSession)` — full analysis pipeline, returns `LapAnalysisResult`. Call this locally and only send summarized outputs to Claude.
- `TelemetryPreprocessor.processLap(rawData[], lapTime)` — preprocess raw telemetry locally (filtering, smoothing, curvature, distances).
- `IdealLapEngine.constructIdealLap(laps[], bestLap)` — construct ideal lap locally. Use cached resampled results to avoid recomputation.

Important files to reference locally before calling Claude (include these smaller extracts, not full files):
- src/types/analysis.ts — canonical types & DEFAULT_ANALYSIS_CONFIG
- src/types/index.ts — `TelemetryData`, `RacingSession`, `LapTime` shapes
- src/services/LapAnalyzer.ts — orchestration & `generateOpportunities` logic
- src/services/TelemetryPreprocessor.ts — preprocessing steps and data-quality scoring
- src/services/TrackSegmenter.ts — segmentation heuristics (corner thresholds)
- src/services/IdealLapEngine.ts — ideal-lap stitching & smoothing

(DEFAULTS you can paste instead of entire files):
- DEFAULT_ANALYSIS_CONFIG:
  - `speedSmoothingWindow: 7`
  - `gForceSmoothingWindow: 5`
  - `brakingThreshold: 0.25`
  - `accelerationThreshold: 0.15`
  - `cornerCurvatureThreshold: 0.005`
  - `minSegmentLength: 20`
  - `spatialResolution: 1.0`
  - `maxPlausibleLateralG: 2.5`
  - `maxPlausibleLongitudinalG: 2.0`
  - `transitionSmoothingLength: 15`

Tips to reduce Claude credits (practical):
- Precompute everything locally that is deterministic and cheap: smoothing, resampling, curvature, segment detection, ideal lap construction, delta curve.
- Only send: (1) a short JSON summary per lap, (2) per-segment aggregated profiles (avg/peak), and (3) a downsampled `deltaCurve` (1 sample per meter or per 5m).
- If you need natural-language advice per opportunity, send the small `Opportunity` objects (overview, braking.apex.speed deltas) rather than raw arrays.
- Use templated prompts and instruct Claude to respond only with a compact JSON structure (no long prose). Example: `Return only JSON: {opportunities:[{id,score,adviceShort}],summary:{bestLapTime,idealLapTime,totalTimeDelta}}`.
- Suppress verbose explanations: include `"verbosity":"minimal"` in prompts.
- When asking for rephrasing or short coaching tips, request a fixed token budget: e.g., `Max tokens: 120` (if your Claude interface supports it).
- For repeated analyses, cache Claude outputs keyed by (sessionId, analysisConfig hash) so you don't resend identical inputs.

Prompt templates (concise)
- Opportunity summary (minimal):
```
Context: analysis summary JSON (laps[], segments[], deltaCurve[])
Task: Produce an ordered list of up to 5 opportunities with fields {segmentIndex, totalTimeDelta_seconds, primaryCause: 'braking'|'apex'|'speed', adviceShort(<=12 words)}. Respond ONLY with compact JSON array.
```
- Coaching tip (single corner):
```
Context: segment object + braking & apex deltas + small profiles (max 20 points)
Task: Return a single 12-word coaching sentence focused on one primary action (brake/apex/exit). Return as JSON: {advice:"..."}
```

Compression & serialization
- Convert floats to 2-3 decimal places before sending.
- Use distance-indexed arrays rather than full objects to save tokens: `deltaDist:[0.24,0.26,...]` with an attached `startDistance` and `stepMeters`.
- Send arrays as CSV strings if your Claude usage supports parsing small CSV (shorter than JSON for dense numeric arrays).

Example minimal outputs you should request from Claude (to keep tokens low):
- {opportunities: [{segmentIndex:int, timeGain_s:float(2dp), cause:string, adviceShort:string}]}
- {summary: {bestLap_s, idealLap_s, totalGain_s}}

Operational workflow (recommended)
1. Locally run `TelemetryPreprocessor.extractLaps` → `LapAnalyzer.analyzeSession` to produce `LapAnalysisResult`.
2. Keep full `LapAnalysisResult` locally. Extract and downsample `deltaTimeCurve` and `opportunities`.
3. Build the minimal JSON payload described above and send to Claude with a one-line task instruction and `verbosity:minimal`.
4. Cache Claude responses keyed by dataset hash.

When to send raw telemetry to Claude (try to avoid)
- Only when you want human-like summarization of raw signals (rare). Instead, compute features locally and ask Claude to translate features to coaching language.

Notes for developers
- Entrypoint for automation is `src/services/LapAnalyzer.ts` — prefer invoking this locally.
- If you must include code context, paste only the small helper lists and `DEFAULT_ANALYSIS_CONFIG`.

Files created:
- This file: CLAUDE.md (root of the project)

End of reference — keep this file with your workspace and paste the minimal JSON into Claude to save credits.

Bots and helper scripts
- The repository includes focused bot specs under `BOTS/` (braking, apex, opportunity-summary, coach, ingestion). Use these with minimal JSON payloads to keep Claude responses cheap.
- A local helper `src/utils/ClaudeIngestion.ts` is provided to produce the compact payloads described above. It downsamples, rounds floats, and produces a signature for caching.

Quick usage (TypeScript)
1. Import the ingestion helper and create a compact payload before sending to Claude:

```ts
import { preparePayload } from './src/utils/ClaudeIngestion';

const { signature, payload } = preparePayload(analysisResult, {
  maxPointsPerProfile: 30,
  stepMeters: 1,
  floatPrecision: 2,
  exportFormat: 'json',
});

// send `payload` to Claude; cache responses using `signature`
```

2. Use the bot specs in `BOTS/` for prompt templates and expected JSON outputs.

Agents (recommended)
- `AGENTS/IngestionAgent.md` — prepare and canonicalize payloads locally, produce `signature` and `payload`.
- `AGENTS/AnalysisAgent.md` — run full `LapAnalyzer` locally and annotate `dataQualityScore`.
- `AGENTS/CacheAgent.md` — local cache for LLM responses keyed by `signature` to avoid re-sends.
- `AGENTS/SummarizerAgent.md` — minimal LLM prompts and JSON-only responses for coaching/advice.
- `AGENTS/BatchAgent.md` — batch orchestration to merge and rate-limit LLM calls.

Implementation
- `src/utils/ClaudeIngestion.ts` — prepares payloads.
- `src/services/CacheAgent.ts` — filesystem cache (used for desktop/CI). Replace with AsyncStorage on mobile.
- `src/services/ClaudeService.ts` — send-to-LLM stub (replace with real integration).
- `src/agents/AgentRunner.ts` — orchestration example combining ingestion, cache, and LLM send.
 - `src/services/TelemetryBridge.ts` — new helper that fuses phone sensors, GPS, and OBD into unified telemetry objects for downstream analysis.

Recommended workflow
1. Run `AnalysisAgent` locally to get `LapAnalysisResult`.
2. Run `IngestionAgent` (prepare payload + signature).
3. Check `CacheAgent` for hits. If hit, use cached result.
4. If miss, call `SummarizerAgent`/LLM with the compact payload and cache the result.

This workflow minimizes tokens by ensuring only compressed, canonical payloads are sent and by reusing cached responses.

AI Memory (automatic)
- Location: `memories/ai_memory.json` — a small JSON file stored in the repo root. It contains short preferences, recent analysis pointers, and caching metadata.
- Access: use `src/utils/MemoryStore.ts` to read, write, list, and push recent items. On mobile, replace with AsyncStorage or secure storage.

Why use memory
- Keep Claude prompts consistent (preferred styles, precision, verbosity).
- Persist small facts (e.g., whether a user prefers short coaching tips, saved tracks, or an API key placeholder) to avoid repeating context in prompts.
- Cache metadata and previously generated replies (use `CacheAgent` for full LLM responses and `ai_memory.json` for lightweight preferences).

Examples
- Read preference in code:

```ts
import MemoryStore from './src/utils/MemoryStore';
const prefs = MemoryStore.list().notes || {};
console.log('Preferred prompt style', prefs.preferredPromptStyle);
```

- Push a recent analysis reference:

```ts
MemoryStore.pushToArray('lastAnalyses', { sessionId: 's123', ts: Date.now() });
```

- How to reference inside `CLAUDE.md` prompts
  - When building a prompt, include a one-line memory block at the top of the prompt: `MEMORY: {"preferredPromptStyle":"json-only, minimal","defaultFloatPrecision":2}`
  - Example final prompt header:

```
MEMORY: {"preferredPromptStyle":"json-only, minimal","defaultFloatPrecision":2}
CONTEXT: {"sessionId":"s123","summary":{...}}
TASK: Produce JSON-only top 3 opportunities.
```

Security & notes
- Do not store secrets or personal PII in `ai_memory.json` (it's kept in the repo). For secrets use environment variables or a secure store.
- Keep memory small (short arrays, shallow objects) — the goal is to reduce repeated prompt context, not to replicate the entire app state.

File locations
- Memory file: `memories/ai_memory.json`
- Access helper: `src/utils/MemoryStore.ts`