# Cache Agent

Purpose
- Keep local cache of LLM responses keyed by the ingestion `signature`.
- Avoid re-sending identical payloads to Claude; return cached response immediately.

Responsibilities
- Store responses to `.ai_cache/<signature>.json` (or a chosen storage location).
- Track timestamps and TTL; evict old entries.
- Provide quick validation of cache hit/miss.

API
- `get(signature) -> response|null`
- `set(signature, response)`
- `clearOlderThan(days)`

Notes
- Keep responses minimal (summary + timestamp) to reduce disk usage.
- Use filesystem for simplicity; allow swapping to IndexedDB or AsyncStorage for mobile.

Security
- Don't store sensitive PII in cache. Hash payloads to ensure privacy.