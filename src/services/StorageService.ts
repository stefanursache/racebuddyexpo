/**
 * RaceBuddy — Persistent Storage Service
 *
 * Wraps AsyncStorage for persisting sessions, tracks, and settings.
 * All data survives app restarts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { RacingSession, Track, LapTime } from '../types';

const KEYS = {
    SESSIONS: '@racebuddy/sessions',
    CUSTOM_TRACKS: '@racebuddy/custom_tracks',
    SETTINGS: '@racebuddy/settings',
};

// ── Helpers for Date serialization ───────────────────────────────────
// JSON.stringify converts Date → string; we need to revive them on load.

function reviveDates(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
        // ISO date string pattern
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(obj)) return new Date(obj);
        return obj;
    }
    if (Array.isArray(obj)) return obj.map(reviveDates);
    if (typeof obj === 'object') {
        const out: any = {};
        for (const k of Object.keys(obj)) out[k] = reviveDates(obj[k]);
        return out;
    }
    return obj;
}

// ── Sessions ─────────────────────────────────────────────────────────

export async function loadSessions(): Promise<RacingSession[]> {
    try {
        const raw = await AsyncStorage.getItem(KEYS.SESSIONS);
        if (!raw) return [];
        return reviveDates(JSON.parse(raw)) as RacingSession[];
    } catch (e) {
        console.warn('⚠️ Failed to load sessions:', e);
        return [];
    }
}

export async function saveSessions(sessions: RacingSession[]): Promise<void> {
    try {
        await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
    } catch (e) {
        console.warn('⚠️ Failed to save sessions:', e);
    }
}

export async function addSessionPersist(session: RacingSession): Promise<RacingSession[]> {
    const existing = await loadSessions();
    const updated = [session, ...existing];
    await saveSessions(updated);
    return updated;
}

// ── Custom Tracks ────────────────────────────────────────────────────

export async function loadCustomTracks(): Promise<Track[]> {
    try {
        const raw = await AsyncStorage.getItem(KEYS.CUSTOM_TRACKS);
        if (!raw) return [];
        return reviveDates(JSON.parse(raw)) as Track[];
    } catch (e) {
        console.warn('⚠️ Failed to load custom tracks:', e);
        return [];
    }
}

export async function saveCustomTracks(tracks: Track[]): Promise<void> {
    try {
        await AsyncStorage.setItem(KEYS.CUSTOM_TRACKS, JSON.stringify(tracks));
    } catch (e) {
        console.warn('⚠️ Failed to save custom tracks:', e);
    }
}

export async function addCustomTrackPersist(track: Track): Promise<Track[]> {
    const existing = await loadCustomTracks();
    const updated = [...existing, track];
    await saveCustomTracks(updated);
    return updated;
}

export async function deleteCustomTrackPersist(trackId: string): Promise<Track[]> {
    const existing = await loadCustomTracks();
    const updated = existing.filter(t => t.id !== trackId);
    await saveCustomTracks(updated);
    return updated;
}

// ── Settings ─────────────────────────────────────────────────────────

export async function loadSettings(): Promise<Record<string, any>> {
    try {
        const raw = await AsyncStorage.getItem(KEYS.SETTINGS);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch (e) {
        console.warn('⚠️ Failed to load settings:', e);
        return {};
    }
}

export async function saveSettings(settings: Record<string, any>): Promise<void> {
    try {
        await AsyncStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
        console.warn('⚠️ Failed to save settings:', e);
    }
}

// ── Clear All ────────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
    try {
        await AsyncStorage.multiRemove([KEYS.SESSIONS, KEYS.CUSTOM_TRACKS, KEYS.SETTINGS]);
        console.log('🗑️ All data cleared');
    } catch (e) {
        console.warn('⚠️ Failed to clear data:', e);
    }
}
