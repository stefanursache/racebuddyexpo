# Ingestion Bot — Spec

Purpose
- Lightweight assistant to validate and compress payloads before sending to Claude.

Actions
- Validate presence of required fields (`sessionId`, `laps[]`, `opportunities[]`)
- Downsample `deltaTimeCurve` by stepMeters (default 1m)
- Round floats to 2 decimals
- Serialize numeric arrays as CSV if requested

Input
- Full `LapAnalysisResult` (local). Configuration: `{maxPointsPerProfile:30, stepMeters:1, floatPrecision:2, exportFormat:'json'|'csv'}`

Output
- Cleaned minimal payload ready to send to Claude (JSON or CSV string) plus a short `signature` hash to allow caching.

Usage (local)
- Run ingestion before sending any data to AI; cache results by `signature` to avoid re-sending.

Example output
`{"signature":"abc123","payload":{...}}`
