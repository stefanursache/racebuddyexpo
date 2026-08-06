/**
 * TelemetryBridge
 *
 * Fuse telemetry from multiple sources:
 *  - Phone sensors (accelerometer/gyro) via SensorService
 *  - Phone GPS via LocationService
 *  - Car OBD via OBDService
 *
 * Export a single unified TelemetryData object to the app.
 */

import { SensorService } from './SensorService';
import { LocationService } from './LocationService';
import { OBDService } from './OBDService';
import { TelemetryData } from '../types';

type TelemetryCallback = (t: TelemetryData) => void;

class TelemetryBridgeClass {
    private callback: TelemetryCallback | null = null;
    private lastOBD: any = null;
    private lastLocation: any = null;
    private isStarted = false;

    start(callback: TelemetryCallback) {
        if (this.isStarted) return;
        this.callback = callback;
        this.isStarted = true;

        // Start phone location tracking
        void LocationService.startLocationTracking((loc) => {
            this.lastLocation = loc;
        });

        // Start sensor collection — SensorService will call back with TelemetryData
        SensorService.initialize();
        SensorService.startTelemetryCollection((data) => {
            // Merge with latest OBD snapshot
            const obd = OBDService.getLastData();
            const merged = this.mergeData(data, obd, this.lastLocation);
            this.callback?.(merged);
        });

        // Subscribe to OBD updates and emit merged telemetry when OBD changes
        OBDService.onData((obdData) => {
            this.lastOBD = obdData;
            // If we don't have sensor-derived gforces, synthesize minimal telemetry
            const gps = this.lastLocation || LocationService.getLastKnownLocation();
            const telemetry: TelemetryData = {
                timestamp: Date.now(),
                speed: obdData.speed ?? (gps?.speed ? gps.speed * 3.6 : 0),
                gforceX: 0,
                gforceY: 0,
                gforceZ: 0,
                rpm: obdData.rpm,
                throttle: obdData.throttle,
                brake: undefined,
                location: gps || { latitude: 0, longitude: 0, timestamp: Date.now() },
            } as any;

            const merged = this.mergeData(telemetry, obdData, gps);
            this.callback?.(merged);
        });
    }

    stop() {
        if (!this.isStarted) return;
        SensorService.stopTelemetryCollection();
        LocationService.stopLocationTracking();
        // OBDService should remain connected as configured by user; we don't auto-disconnect here.
        this.isStarted = false;
        this.callback = null;
    }

    private mergeData(sensor: TelemetryData, obd: any, location: any): TelemetryData {
        const merged: any = {
            timestamp: sensor.timestamp || Date.now(),
            // Prefer OBD speed when available (more accurate from vehicle)
            speed: (obd && obd.speed) ? obd.speed : (sensor.speed || (location?.speed ? location.speed * 3.6 : 0)),
            // Use phone sensor g-forces when present
            gforceX: sensor.gforceX ?? 0,
            gforceY: sensor.gforceY ?? 0,
            gforceZ: sensor.gforceZ ?? 0,
            location: location || sensor.location || { latitude: 0, longitude: 0, timestamp: Date.now() },
            // Merge OBD fields
            rpm: obd?.rpm ?? undefined,
            throttle: obd?.throttle ?? undefined,
            engineLoad: obd?.engineLoad ?? undefined,
            coolantTemp: obd?.coolantTemp ?? undefined,
            fuelLevel: obd?.fuelLevel ?? undefined,
            batteryVoltage: obd?.batteryVoltage ?? undefined,
        };

        return merged as TelemetryData;
    }
}

export const TelemetryBridge = new TelemetryBridgeClass();

export default TelemetryBridge;
