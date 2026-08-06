# Batch Agent

Purpose
- Execute large batches of analyses and LLM summarizations efficiently and cheaply.

Responsibilities
- Run `AnalysisAgent` locally over many sessions.
- Use `IngestionAgent` to prepare payloads, consult `CacheAgent` for hits, and only call `SummarizerAgent`/LLM for misses.
- Rate-limit LLM calls and aggregate multiple small requests into a single compact request where possible.

APIs
- `processBatch(sessions[]) -> {results, stats}`

Cost-saving strategies
- Merge multiple opportunities into a single LLM request with clear output mapping to keep token overhead low.
- Use cached responses and only refresh when `analysisConfidence` or `dataQualityScore` changes beyond a threshold.

Notes
- Useful for nightly processing pipelines, CI checks, or bulk coach card generation.