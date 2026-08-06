# Summarizer Agent

Purpose
- Produce extremely compact summaries and coaching lines from compact payloads.
- Designed to request only essential outputs from the LLM and ask for JSON-only responses.

Responsibilities
- Build terse prompt templates from `BOTS/*` specs.
- Enforce maximum token constraints and return only the compact JSON shape.
- Optionally post-process LLM output to validate and canonicalize fields.

API
- `summarize(payload, templateName) -> compactJson`

Token economy
- Use fixed-length outputs, short advice (≤12 words), and numeric rounding.
- Request `verbosity:minimal` and `response_format:json-only` in prompts.

Notes
- This agent can be implemented either in the client or as a small server-side microservice.