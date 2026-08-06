/**
 * Small integration helper to show how to call `preparePayload` in-app
 * before sending to an LLM. This file is a stub — replace `sendToLLM`
 * with your real integration.
 */

import ClaudeIngestion from '../utils/ClaudeIngestion';
import MemoryStore from '../utils/MemoryStore';
import CacheAgent from './CacheAgent';
import AuditLog from '../utils/AuditLog';

export async function sendAnalysisToClaude(analysisResult: any, opts: any = {}) {
    // Read lightweight preferences from memory (if available)
    const mem = MemoryStore.list();
    const prefs = (mem && mem.notes) || {};

    // Inject default precision from memory unless explicitly provided
    const floatPrecision = opts.floatPrecision ?? prefs.defaultFloatPrecision ?? 2;
    const stepMeters = opts.stepMeters ?? 1;

    // Prepare compact payload (attach a small memory hint so the LLM can follow user prefs)
    const { signature, payload } = ClaudeIngestion.preparePayload(analysisResult as any, {
        ...opts,
        floatPrecision,
        stepMeters,
    } as any);

    // Attach memory header to payload (non-sensitive, short)
    payload._memory = {
        preferredPromptStyle: prefs.preferredPromptStyle || 'json-only, minimal',
        defaultFloatPrecision: floatPrecision,
    };

    // Check local cache first
    try {
        const cached = await CacheAgent.get(signature);
        if (cached) {
            return { signature, response: cached, cached: true };
        }
    } catch (err) {
        // cache errors shouldn't block operation
        console.warn('CacheAgent.get error', err);
    }

    // Example stubbed network send — replace with real call
    const response = await sendToLLM(payload);

    // Cache response and record recent analysis in memory
    try {
        await CacheAgent.set(signature, response);
    } catch (err) {
        console.warn('CacheAgent.set error', err);
    }

    try {
        MemoryStore.pushToArray('lastAnalyses', { sessionId: analysisResult.sessionId || null, signature, ts: Date.now() });
    } catch (err) {
        // ignore
    }

    // Append audit log entry
    try {
        AuditLog.append({ actor: 'ClaudeService', action: 'sendAnalysis', sessionId: analysisResult.sessionId || null, signature, description: 'Sent prepared payload to LLM', resultSummary: response && response.received ? response.received : null });
    } catch (err) {
        // ignore
    }

    return { signature, response, cached: false };
}

async function sendToLLM(payload: any) {
    // Replace this with your real network code (fetch/axios)
    console.log('Stub sendToLLM: payload summary', payload.summary);
    return { ok: true, received: payload.summary };
}

export default { sendAnalysisToClaude };
