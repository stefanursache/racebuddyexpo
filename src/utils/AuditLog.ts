/**
 * AuditLog
 * Simple filesystem-backed audit log for AI agent actions.
 * Records each action with timestamp, actor, action, sessionId, signature and a short description.
 */

import fs from 'fs';
import path from 'path';

const AUDIT_PATH = path.join(process.cwd(), 'ai_activity.json');

function readRaw() {
    try {
        const raw = fs.readFileSync(AUDIT_PATH, 'utf8');
        return JSON.parse(raw || '[]');
    } catch (err) {
        return [];
    }
}

function writeRaw(arr: any[]) {
    try {
        fs.writeFileSync(AUDIT_PATH, JSON.stringify(arr, null, 2), 'utf8');
        return true;
    } catch (err) {
        return false;
    }
}

export function list() {
    return readRaw();
}

export function findBySignature(signature: string) {
    const arr = readRaw();
    for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].signature === signature) return arr[i];
    }
    return null;
}

export function searchBySession(sessionId: string) {
    const arr = readRaw();
    return arr.filter(e => e.sessionId === sessionId);
}

export function append(entry: any) {
    const arr = readRaw();
    const now = Date.now();
    const id = `${now.toString(36)}-${Math.floor(Math.random() * 10000)}`;
    const e = { id, ts: now, ...entry };
    arr.push(e);
    const ok = writeRaw(arr);
    return ok ? e : null;
}

export default { list, findBySignature, searchBySession, append };
