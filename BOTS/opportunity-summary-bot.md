# Opportunity Summary Bot — Spec

Purpose
- Take compact analysis outputs (opportunities + deltaCurve sample) and return a ranked, short JSON summary suitable for UI badges and notifications.

Input (minimal)
- `opportunities`: array of Opportunity-like small objects `{segmentIndex, totalTimeDelta_s, primaryCause}` (max 10)
- `summary`: `{bestLapTime_s, idealLapTime_s, totalGain_s}`
- `verbosity`: optional

Prompt template
Context: `opportunities` + `summary`.
Task: Return JSON only: `{topOpportunities:[{segmentIndex,int, timeGain_s,float(2dp), cause,string, brief:string}], overall:{bestLap_s,idealLap_s,totalGain_s}}`.
Limit: return max 5 top opportunities.

Token tips
- Use 2 decimal places; omit long texts; request JSON-only.

Output example
`{"topOpportunities":[{"segmentIndex":3,"timeGain_s":0.88,"cause":"braking","brief":"Brake later, harder"}],"overall":{"bestLap_s":122.1,"idealLap_s":121.2,"totalGain_s":0.9}}`
