import { Accelerometer, Gyroscope } from 'expo-sensors';
import { TelemetryData, Location } from '../types';
import { LocationService } from './LocationService';

/**
 * expo-sensors Accelerometer returns values in G's (multiples of
 * earth gravity ≈ 9.81 m/s²). A phone lying flat reads roughly
 * { x: 0, y: 0, z: -1 }.  We DO NOT divide by 9.81.
 *
 * Axis mapping (phone in landscape, screen facing driver):
 *   x → lateral   (positive = right turn)
 *   y → longitudinal (positive = acceleration, negative = braking)
 *   z → vertical  (subtract 1G gravity when phone is flat)
 */

// EMA (Exponential Moving Average) coefficient — 0 = no smoothing, 1 = max smoothing
const SMOOTH = 0.25;

export class SensorService {
    private static accelerometerSubscription: any = null;
    private static gyroscopeSubscription: any = null;
    private static telemetryCallback: ((data: TelemetryData) => void) | null = null;
    private static isInitialized = false;

    // Smoothed values
    private static sX = 0;
    private static sY = 0;
    private static sZ = 0;
    private static sSpeed = 0;

    // Calibration offset (captured at init so gravity is zeroed)
    private static calX = 0;
    private static calY = 0;
    private static calZ = -1; // default: phone flat face-up → z ≈ -1G
    private static calSamples = 0;
    private static isCalibrated = false;
    private static lastLocationForSpeed: Location | null = null;

    static initialize(): void {
        if (this.isInitialized) return;

        // 20 Hz for racing-grade updates
        Accelerometer.setUpdateInterval(50);
        Gyroscope.setUpdateInterval(50);

        this.isInitialized = true;
        this.isCalibrated = false;
        this.calSamples = 0;
        console.log('📱 Sensor service initialized');
    }

    /** Call once when phone is mounted & stationary to zero-out gravity */
    static calibrate(): void {
        this.isCalibrated = false;
        this.calSamples = 0;
        this.calX = 0;
        this.calY = 0;
        this.calZ = 0;
        this.sX = 0;
        this.sY = 0;
        this.sZ = 0;
        this.sSpeed = 0;
        this.lastLocationForSpeed = null;
        console.log('🔧 Calibrating sensors — hold still…');
    }

    static startTelemetryCollection(callback: (data: TelemetryData) => void): void {
        this.telemetryCallback = callback;

        let lastAccelData = { x: 0, y: 0, z: 0 };
        let lastGyroData = { x: 0, y: 0, z: 0 };

        this.accelerometerSubscription = Accelerometer.addListener(({ x, y, z }) => {
            // Auto-calibrate from first 20 samples (~1 sec)
            if (!this.isCalibrated) {
                this.calX += x;
                this.calY += y;
                this.calZ += z;
                this.calSamples++;
                if (this.calSamples >= 20) {
                    this.calX /= this.calSamples;
                    this.calY /= this.calSamples;
                    this.calZ /= this.calSamples;
                    this.isCalibrated = true;
                    console.log(`✅ Calibrated: offset=(${this.calX.toFixed(3)}, ${this.calY.toFixed(3)}, ${this.calZ.toFixed(3)})`);
                }
                return;
            }

            // Subtract calibration offset (removes gravity)
            const rawX = x - this.calX;
            const rawY = y - this.calY;
            const rawZ = z - this.calZ;

            // EMA smoothing
            this.sX = this.sX * SMOOTH + rawX * (1 - SMOOTH);
            this.sY = this.sY * SMOOTH + rawY * (1 - SMOOTH);
            this.sZ = this.sZ * SMOOTH + rawZ * (1 - SMOOTH);

            lastAccelData = { x: this.sX, y: this.sY, z: this.sZ };
            this.processTelemetryData(lastAccelData, lastGyroData);
        });

        this.gyroscopeSubscription = Gyroscope.addListener(({ x, y, z }) => {
            lastGyroData = { x, y, z };
        });

        console.log('📊 Telemetry collection started');
    }

    private static processTelemetryData(
        accelData: { x: number; y: number; z: number },
        gyroData: { x: number; y: number; z: number }
    ): void {
        const currentLocation = LocationService.getLastKnownLocation();

        if (!currentLocation || !this.telemetryCallback) return;

        // Values are already in G's thanks to expo-sensors
        const gforceX = accelData.x;  // Lateral (right +)
        const gforceY = accelData.y;  // Longitudinal (accel +, brake -)
        const gforceZ = accelData.z;  // Vertical (bumps)

        // Speed from GPS (expo-location gives m/s); fall back to distance/time if needed.
        let speed = currentLocation.speed && currentLocation.speed > 0
            ? currentLocation.speed * 3.6 // → km/h
            : 0;

        if (speed <= 0 && this.lastLocationForSpeed) {
            const dtSeconds = (currentLocation.timestamp - this.lastLocationForSpeed.timestamp) / 1000;
            if (dtSeconds > 0.25) {
                const distanceMeters = LocationService.calculateDistance(this.lastLocationForSpeed, currentLocation);
                speed = (distanceMeters / dtSeconds) * 3.6;
            }
        }

        if (speed > 0) {
            this.sSpeed = this.sSpeed * 0.75 + speed * 0.25;
            speed = this.sSpeed;
        }

        this.lastLocationForSpeed = currentLocation;

        const telemetryData: TelemetryData = {
            timestamp: Date.now(),
            speed,
            gforceX,
            gforceY,
            gforceZ,
            location: currentLocation,
        };

        this.telemetryCallback(telemetryData);
    }

    static stopTelemetryCollection(): void {
        if (this.accelerometerSubscription) {
            this.accelerometerSubscription.remove();
            this.accelerometerSubscription = null;
        }

        if (this.gyroscopeSubscription) {
            this.gyroscopeSubscription.remove();
            this.gyroscopeSubscription = null;
        }

        this.telemetryCallback = null;
        console.log('⏹️ Telemetry collection stopped');
    }

    // Utility methods for data analysis
    static calculateMaxGForce(telemetryData: TelemetryData[]): {
        maxLateral: number;
        maxLongitudinal: number;
        maxBraking: number;
        maxAcceleration: number;
    } {
        let maxLateral = 0;
        let maxLongitudinal = 0;
        let maxBraking = 0;
        let maxAcceleration = 0;

        telemetryData.forEach(data => {
            maxLateral = Math.max(maxLateral, Math.abs(data.gforceX));
            maxLongitudinal = Math.max(maxLongitudinal, Math.abs(data.gforceY));

            if (data.gforceY < 0) {
                maxBraking = Math.max(maxBraking, Math.abs(data.gforceY));
            } else {
                maxAcceleration = Math.max(maxAcceleration, data.gforceY);
            }
        });

        return { maxLateral, maxLongitudinal, maxBraking, maxAcceleration };
    }

    static calculateAverageSpeed(telemetryData: TelemetryData[]): number {
        if (telemetryData.length === 0) return 0;

        const totalSpeed = telemetryData.reduce((sum, data) => sum + data.speed, 0);
        return totalSpeed / telemetryData.length;
    }

    static findBrakingZones(telemetryData: TelemetryData[]): TelemetryData[] {
        // Find points where longitudinal G-force indicates significant braking
        return telemetryData.filter(data => data.gforceY < -0.3); // Threshold for braking detection
    }
}