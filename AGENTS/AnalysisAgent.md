# Analysis Agent

Purpose
- Execute full local analysis (preprocessor → lap analyzer → ideal engine) and produce `LapAnalysisResult` entirely locally.
- Only surface compact summaries to LLMs.

Responsibilities
- Call `TelemetryPreprocessor.extractLaps`, `LapAnalyzer.analyzeSession`, and `IdealLapEngine` as needed.
- Provide hooks for batch processing multiple sessions in one run.
- Annotate outputs with `dataQualityScore` and `analysisConfidence` for agent decision-making.

When to run
- Run on-device or in CI prior to any remote AI step.

API
- `analyze(session) -> LapAnalysisResult`

Notes
- Prefer CPU-friendly settings; allow `fastMode` that reduces smoothing windows to speed processing at slight accuracy loss.