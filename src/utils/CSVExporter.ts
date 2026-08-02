/**
 * CSV Export Utility for RaceBuddy Sessions
 * Exports comprehensive telemetry and lap data for analysis
 */

import { RacingSession, TelemetryData, LapTime } from '../types';

export interface CSVExportOptions {
    includeRawTelemetry?: boolean;  // Include every telemetry sample
    includeLapTimes?: boolean;       // Include lap summary
    includeSectors?: boolean;        // Include sector times
}

/**
 * Generate CSV content from a RacingSession
 * Combines lap times, telemetry data, and OBD sensor readings
 */
export function generateSessionCSV(session: RacingSession, options: CSVExportOptions = {}): string {
    const {
        includeRawTelemetry = true,
        includeLapTimes = true,
        includeSectors = true,
    } = options;

    let csv = '';

    // ─── Session Header ───────────────────────────────────────
    csv += '# RACEBUDDY SESSION EXPORT\n';
    csv += `Track,${escapeCSV(session.trackName)}\n`;
    csv += `Session ID,${session.id}\n`;
    csv += `Start Time,${session.startTime.toISOString()}\n`;
    csv += `End Time,${session.endTime?.toISOString() || 'ACTIVE'}\n`;
    csv += `Total Laps,${session.totalLaps}\n`;
    csv += `Best Lap Time (ms),${session.bestLapTime || '--'}\n`;
    if (session.weather) csv += `Weather,${escapeCSV(session.weather)}\n`;
    if (session.temperature) csv += `Temp (°C),${session.temperature}\n`;
    if (session.notes) csv += `Notes,${escapeCSV(session.notes)}\n`;
    csv += '\n';

    // ─── Lap Summary ──────────────────────────────────────────
    if (includeLapTimes && session.lapTimes.length > 0) {
        csv += '# LAP SUMMARY\n';
        csv += 'Lap,Duration (ms),Lap Time,Sector 1,Sector 2,Sector 3,Valid,Best\n';

        session.lapTimes.forEach(lap => {
            const lapMs = lap.duration;
            const lapTime = formatTime(lapMs);
            const s1 = formatTime(lap.sectorTimes[0] || 0);
            const s2 = formatTime(lap.sectorTimes[1] || 0);
            const s3 = formatTime(lap.sectorTimes[2] || 0);

            csv += `${lap.lapNumber},${lapMs},${lapTime},${s1},${s2},${s3},${lap.isValid},${lap.isBestLap}\n`;
        });
        csv += '\n';
    }

    // ─── Raw Telemetry Data ───────────────────────────────────
    if (includeRawTelemetry && session.telemetryData.length > 0) {
        csv += '# RAW TELEMETRY\n';
        csv += 'Timestamp (ms),Time Offset (ms),Speed (km/h),G-Force X (lateral),G-Force Y (long),G-Force Z (vert),RPM,Throttle (%),Brake (%),Latitude,Longitude,Altitude (m)\n';

        const startTime = session.telemetryData[0]?.timestamp || 0;

        session.telemetryData.forEach(data => {
            const timeOffset = data.timestamp - startTime;
            const lat = data.location?.latitude || '';
            const lng = data.location?.longitude || '';
            const alt = data.location?.altitude || '';

            csv += `${data.timestamp},${timeOffset},${data.speed.toFixed(2)},${data.gforceX.toFixed(2)},${data.gforceY.toFixed(2)},${data.gforceZ.toFixed(2)},${data.rpm ?? ''},${data.throttle ?? ''},${data.brake ?? ''},${lat},${lng},${alt}\n`;
        });
        csv += '\n';
    }

    // ─── Statistics Summary ───────────────────────────────────
    if (session.lapTimes.length > 0) {
        csv += '# STATISTICS\n';
        const lapDurations = session.lapTimes.map(l => l.duration);
        const avgLap = lapDurations.reduce((a, b) => a + b, 0) / lapDurations.length;
        const minLap = Math.min(...lapDurations);
        const maxLap = Math.max(...lapDurations);

        csv += `Best Lap,${formatTime(minLap)},${minLap}ms\n`;
        csv += `Average Lap,${formatTime(avgLap)},${avgLap.toFixed(0)}ms\n`;
        csv += `Worst Lap,${formatTime(maxLap)},${maxLap}ms\n`;
        csv += `Lap Range,${formatTime(maxLap - minLap)},${(maxLap - minLap).toFixed(0)}ms\n`;

        if (session.telemetryData.length > 0) {
            const speeds = session.telemetryData.map(t => t.speed);
            const maxSpeed = Math.max(...speeds);
            const minSpeed = Math.min(...speeds);
            const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;

            csv += `Max Speed,${maxSpeed.toFixed(1)} km/h\n`;
            csv += `Min Speed,${minSpeed.toFixed(1)} km/h\n`;
            csv += `Avg Speed,${avgSpeed.toFixed(1)} km/h\n`;

            const gforces = session.telemetryData.map(t =>
                Math.sqrt(t.gforceX ** 2 + t.gforceY ** 2 + t.gforceZ ** 2)
            );
            const maxG = Math.max(...gforces);
            csv += `Peak G-Force,${maxG.toFixed(2)}g\n`;
        }
    }

    return csv;
}

/**
 * Generate filename for CSV export
 */
export function generateSessionFilename(session: RacingSession): string {
    const date = new Date(session.startTime);
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    const track = session.trackName.replace(/\s+/g, '_').substring(0, 20);
    return `RaceBuddy_${track}_${dateStr}_${timeStr}.csv`;
}

/**
 * Format milliseconds to MM:SS.mmm format
 */
function formatTime(ms: number): string {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
}

/**
 * Escape special characters for CSV
 */
function escapeCSV(str: string): string {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}
