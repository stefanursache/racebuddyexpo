# Coach Bot — Spec

Purpose
- Produce a single, concise coaching sentence (≤12 words) per segment or opportunity for display on HUD/UI.

Input (minimal)
- `segment` or `opportunity` small object
- optional `contextHints`: `{primaryCause:'braking'|'apex'|'speed', magnitudeScore:0-1}`

Prompt template
Context: small JSON.
Task: Return JSON only: `{advice:"12-word sentence"}`. Keep actionable, present-tense, no qualifiers.

Token-saving tips
- Supply only the cause and score; keep prompt terse. Use `verbosity:minimal`.

Output example
`{"advice":"Brake 5m later; apply firmer pressure for cleaner apex"}`
