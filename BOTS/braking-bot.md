# Braking Bot — Spec

Purpose
- Produce compact, actionable recommendations for braking zones (when to brake, how much) using downsampled approach profiles.

Input (minimal)
- `segment`: {segmentIndex, startDistance, endDistance}
- `approach`: downsampled array of SpatialTelemetryPoint-like objects `{distance, smoothedSpeed, smoothedGForceY}` (max 30 points)
- `brakingEvent?`: `{startDistance, endDistance, duration, speedAtStart, speedAtEnd, peakGForce}`
- `verbosity`: optional, default `minimal`

Prompt template (pasteable)
Context: JSON containing `segment`, `approach`, and optional `brakingEvent`.
Task: Return JSON only: `{recommendedBrakeDistanceDelta_m: float, recommendedBrakeIntensity_pct: float, expectedTimeGain_s: float, shortAdvice: string}`. `shortAdvice` <= 12 words.

Token-saving notes
- Send at most 30 approach points, 2–3 decimal precision.
- Request JSON-only response and `verbosity:minimal`.

Usage
- Call locally to generate coaching lines for the UI; store outputs and avoid re-sending unchanged inputs.

Output example
`{"recommendedBrakeDistanceDelta_m":5.2,"recommendedBrakeIntensity_pct":8.0,"expectedTimeGain_s":0.35,"shortAdvice":"Brake 5m later; apply 8% harder"}`
