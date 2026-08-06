/**
 * MemoryStore
 * Simple filesystem-backed memory for AI preferences and small notes.
 * Use from Node/desktop or adapt to AsyncStorage for mobile.
 */

import fs from 'fs';
import path from 'path';

const MEMORY_PATH = path.join(process.cwd(), 'memories', 'ai_memory.json');

function readRaw() {
    try {
        const raw = fs.readFileSync(MEMORY_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        return {};
    }
}

function writeRaw(obj: any) {
    try {
        fs.writeFileSync(MEMORY_PATH, JSON.stringify(obj, null, 2), 'utf8');
        return true;
    } catch (err) {
        return false;
    }
}

export function get(key: string) {
    const obj = readRaw();
    return obj[key];
}

export function set(key: string, value: any) {
    const obj = readRaw();
    obj[key] = value;
    return writeRaw(obj);
}

export function list() {
    return readRaw();
}

export function pushToArray(key: string, value: any, maxLen: number = 20) {
    const obj = readRaw();
    if (!Array.isArray(obj[key])) obj[key] = [];
    obj[key].unshift(value);
    if (obj[key].length > maxLen) obj[key].length = maxLen;
    return writeRaw(obj);
}

export default { get, set, list, pushToArray };
