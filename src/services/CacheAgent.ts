/**
 * Simple filesystem cache agent for LLM responses.
 * Note: on mobile replace with AsyncStorage or similar.
 */

import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.ai_cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

export async function get(signature: string) {
    const p = path.join(CACHE_DIR, `${signature}.json`);
    if (!fs.existsSync(p)) return null;
    try {
        const raw = fs.readFileSync(p, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        return null;
    }
}

export async function set(signature: string, response: any) {
    const p = path.join(CACHE_DIR, `${signature}.json`);
    try {
        fs.writeFileSync(p, JSON.stringify({ response, ts: Date.now() }, null, 2));
        return true;
    } catch (err) {
        return false;
    }
}

export async function clearOlderThan(days: number) {
    const files = fs.readdirSync(CACHE_DIR);
    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    for (const f of files) {
        const p = path.join(CACHE_DIR, f);
        try {
            const stat = fs.statSync(p);
            if (stat.mtimeMs < cutoff) fs.unlinkSync(p);
        } catch (err) {
            // ignore
        }
    }
}

export default { get, set, clearOlderThan };
