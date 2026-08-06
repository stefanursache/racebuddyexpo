# Apex Bot — Spec

Purpose
- Analyze apex timing and line; provide a compact classification and short advice focused on apex timing and entry.

Input (minimal)
- `segment`: {segmentIndex, startDistance, endDistance}
- `apexProfiles`: two small arrays (best & ideal) of `{distance, smoothedSpeed, smoothedGForceX}` (max 30 points each)
- `verbosity`: optional

Prompt template
Context: `segment` + `apexProfiles` (best/ideal).
Task: Return JSON only: `{apexType: 'early'|'late'|'on_target', apexDistanceDelta_m: float, timeGain_s: float, adviceShort: string}`. AdviceShort <= 12 words.

Token tips
- Send only numeric arrays with 2 decimal places; compress as CSV if supported.

Output example
`{"apexType":"late","apexDistanceDelta_m":3.5,"timeGain_s":0.22,"adviceShort":"Apex later; focus on later turn-in"}`
