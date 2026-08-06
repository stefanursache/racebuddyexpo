# Ingestion Agent

Purpose
- Run locally to validate, compress, and canonicalize `LapAnalysisResult` outputs before any LLM call.
- Enforce token-saving rules: downsampling, rounding, CSV conversion, and signature generation.

Responsibilities
- Accept raw `LapAnalysisResult` objects.
- Produce compact payloads using `src/utils/ClaudeIngestion.preparePayload`.
- Maintain a short TTL cache of prepared payloads (signature -> payload).
- Emit a decision: `sendToLLM` or `cachedResponseAvailable`.

When to run
- Always run before any remote LLM invocation.

Example API
- `prepare(analysisResult) -> {signature, payload, cached}`
- `getPrepared(signature) -> payload|null`

Token rules
- Max 30 points per profile
- Delta step default 1m
- Float precision default 2
- JSON-only LLM requests by default

Notes
- Implement as a synchronous local module for deterministic, fast runs.