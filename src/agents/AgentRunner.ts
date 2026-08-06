/**
 * AgentRunner
 *
 * Simple orchestration stub demonstrating how agents interact to
 * minimize LLM usage and cost. This is a lightweight example — adapt
 * to your app's environment (mobile, backend, CI).
 */

import ClaudeIngestion from '../utils/ClaudeIngestion';
import CacheAgent from '../services/CacheAgent';
import { sendAnalysisToClaude } from '../services/ClaudeService';
import AuditLog from '../utils/AuditLog';

export async function runSingleAnalysis(analysisResult: any, opts: any = {}) {
    // 1. Prepare compressed payload
    const { signature, payload } = ClaudeIngestion.preparePayload(analysisResult, opts);

    // 2. Check audit log for previous runs with the same signature
    try {
        const prev = AuditLog.findBySignature(signature);
        if (prev) {
            // If a previous run exists, try to return the cached response
            const cachedPrev = await CacheAgent.get(signature);
            if (cachedPrev) return { signature, response: cachedPrev, cached: true, fromAudit: true };
        }
    } catch (err) {
        // ignore audit errors
    }

    // 3. Check cache (fallback)
    const cached = await CacheAgent.get(signature);
    if (cached) return { signature, response: cached, cached: true };

    // 3. Send to LLM via ClaudeService
    const { signature: sig2, response } = await sendAnalysisToClaude(payload, opts);

    // 4. Cache the response
    try {
        await CacheAgent.set(signature, response);
    } catch (err) {
        // ignore cache set errors
    }

    // 5. Append to audit log
    try {
        AuditLog.append({ actor: 'AgentRunner', action: 'runSingleAnalysis', sessionId: analysisResult.sessionId || null, signature, description: 'Ran single analysis and summarized via LLM', resultSummary: response && response.received ? response.received : null });
    } catch (err) {
        // ignore
    }

    return { signature, response, cached: false };
}

export default { runSingleAnalysis };
