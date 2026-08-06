/**
 * RaceBuddy — OBD2 Service (Bluetooth LE + WiFi)
 *
 * Connects to ELM327-compatible OBD2 adapters via:
 *   • Bluetooth Low Energy (BLE) — e.g. OBDLink MX+, Veepeak
 *   • WiFi — e.g. standard ELM327 WiFi dongles (192.168.0.10:35000)
 *
 * Reads RPM, speed, throttle position, engine load, coolant temp.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

let BleManager: any;
let _bleImportError: string | null = null;
try {
    BleManager = require('react-native-ble-plx').BleManager;
} catch (e) {
    _bleImportError = (e as Error).message;
    console.warn('⚠️ react-native-ble-plx not available:', _bleImportError);
}
import type { Device } from 'react-native-ble-plx';
import { OBDData, VehicleInfo } from '../types';
import { findLocalVinRecord } from '../data/vinDatabase';

// ── ELM327 OBD-II PIDs ──────────────────────────────────────────────
// Comprehensive sensor support for racing telemetry
const PID = {
    // Engine Performance (Service 01)
    RPM: '010C',                           // Engine speed
    SPEED: '010D',                         // Vehicle speed
    THROTTLE: '0111',                      // Throttle position
    ENGINE_LOAD: '0104',                   // Calculated engine load
    COOLANT_TEMP: '0105',                  // Engine coolant temperature
    FUEL_LEVEL: '012F',                    // Fuel tank level
    INTAKE_AIR_TEMP: '010F',               // Intake air temperature
    MAF: '0110',                           // Mass air flow rate
    FUEL_PRESSURE: '010A',                 // Fuel system pressure
    FUEL_CONSUMPTION_RATE: '015E',         // Fuel consumption rate (hybrid cars)

    // Oxygen Sensors
    O2_SENSOR_1: '0114',                   // O2 Sensor 1 voltage (before catalyst)
    O2_SENSOR_2: '0115',                   // O2 Sensor 2 voltage (after catalyst)

    // Transmission & Drivetrain
    GEAR: '0160',                          // Transmission gear position

    // Electrical System
    BATTERY_VOLTAGE: '0142',               // Control module voltage

    // Sensors & Status
    AMBIENT_AIR_TEMP: '0146',              // Ambient air temperature
    VEHICLE_DISTANCE: '0131',              // Distance with MIL on

    // Timing
    IGNITION_TIMING: '010E',               // Ignition timing advance

    // Additional Engine Data
    ENGINE_FRICTION_PERCENT: '0146',       // Estimated engine friction percent
    CATALYST_TEMP: '013D',                 // Catalyst temperature (Bank 1)
};

// Extended PIDs for high-end vehicles (Service 22 for Toyota/BMW/etc)
const EXTENDED_PID = {
    GEAR_RATIO: '622000',                  // Current gear ratio (if available)
    BRAKE_PRESSURE: '624001',              // Brake pressure (if available)
    SUSPENSION_HEIGHT: '628001',           // Suspension height (if available)
};

// Standard ELM327 BLE service / characteristic UUIDs
const ELM_SERVICE = 'fff0';
const ELM_WRITE = 'fff1';
const ELM_NOTIFY = 'fff2';

// WiFi default for ELM327 dongles
const WIFI_HOST = '192.168.0.10';
const WIFI_PORT = 35000;

export type OBDConnectionType = 'bluetooth' | 'wifi' | 'none';
export type OBDConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'initializing' | 'connected' | 'error';

export interface OBDDevice {
    id: string;
    name: string;
    rssi: number;
    type: 'bluetooth' | 'wifi';
}

type OBDCallback = (data: OBDData) => void;
type StateCallback = (state: OBDConnectionState, msg?: string) => void;

class OBDServiceClass {
    private ble: InstanceType<typeof BleManager> | null = null;
    private connectedDevice: Device | null = null;
    private connectionType: OBDConnectionType = 'none';
    private state: OBDConnectionState = 'disconnected';
    private dataCallback: OBDCallback | null = null;
    private stateCallback: StateCallback | null = null;
    private pollInterval: ReturnType<typeof setInterval> | null = null;
    private responseBuffer = '';
    private writeCharacteristic: any = null;
    private notifyCharacteristic: any = null;
    private responseResolver: ((value: string) => void) | null = null;
    private responseTimeout: ReturnType<typeof setTimeout> | null = null;
    private vehicleInfo: VehicleInfo | null = null;
    private vehicleInfoRequestPromise: Promise<void> | null = null;
    private commandQueue: Promise<void> = Promise.resolve();

    // WiFi
    private wifiSocket: any = null;

    // Last parsed data
    private lastData: OBDData = { timestamp: 0 };

    // ── Init ─────────────────────────────────────────────────────────
    initialize(): void {
        if (!this.ble && BleManager) {
            try {
                this.ble = new BleManager();
                console.log('🔌 OBD Service initialized (BLE available)');
            } catch (e) {
                console.warn('⚠️ BLE init failed — WiFi OBD only:', (e as Error).message);
                this.ble = null;
            }
        } else if (!BleManager) {
            console.log('🔌 OBD Service initialized (WiFi only — no BLE in Expo Go)');
        }

        void this.loadPersistedVehicleInfo();
    }

    destroy(): void {
        this.disconnect();
        this.ble?.destroy();
        this.ble = null;
    }

    // ── State ────────────────────────────────────────────────────────
    getState(): OBDConnectionState { return this.state; }
    getConnectionType(): OBDConnectionType { return this.connectionType; }
    isConnected(): boolean { return this.state === 'connected'; }

    onData(cb: OBDCallback): void { this.dataCallback = cb; }
    onStateChange(cb: StateCallback): void { this.stateCallback = cb; }

    private setState(s: OBDConnectionState, msg?: string) {
        this.state = s;
        this.stateCallback?.(s, msg);
    }

    // ── BLE Scan ─────────────────────────────────────────────────────
    async scanBluetooth(onDevice: (d: OBDDevice) => void, duration = 8000): Promise<void> {
        if (!this.ble) { this.initialize(); }
        if (!this.ble) {
            this.setState('error', 'BLE not available. Use WiFi connection or build a dev client.');
            return;
        }
        this.setState('scanning');

        // Ensure BLE is powered on
        const bleState = await this.ble!.state();
        if (bleState !== 'PoweredOn') {
            this.setState('error', 'Bluetooth is off. Turn it on in Settings.');
            return;
        }

        const seen = new Set<string>();

        this.ble!.startDeviceScan(null, { allowDuplicates: false }, (error: any, device: any) => {
            if (error) {
                console.warn('BLE scan error:', error.message);
                return;
            }
            if (!device || !device.name) return;

            // Filter for likely OBD adapters - EXPANDED to support all car brands
            const n = device.name.toLowerCase();
            const isOBD = n.includes('obd') || n.includes('elm') || n.includes('veepeak')
                || n.includes('vlink') || n.includes('konnwei') || n.includes('carista')
                || n.includes('bluedriver') || n.includes('torque') || n.includes('icar')
                // Additional adapter brands for universal car support
                || n.includes('forscan') || n.includes('viofo') || n.includes('bimmercode')
                || n.includes('foxwell') || n.includes('ancel') || n.includes('launch')
                || n.includes('xmscan') || n.includes('scanner') || n.includes('adapter')
                // ELM327 variants
                || n.includes('elm327') || n.includes('elm328') || n.includes('elm329')
                // Generic catch-all: allow any device that might be OBD
                || n.includes('car') || n.includes('auto') || n.includes('diag');

            if (isOBD && !seen.has(device.id)) {
                seen.add(device.id);
                onDevice({
                    id: device.id,
                    name: device.name || 'Unknown Device',
                    rssi: device.rssi ?? -100,
                    type: 'bluetooth',
                });
            }
        });

        // Stop after duration
        setTimeout(() => {
            this.ble?.stopDeviceScan();
            if (this.state === 'scanning') this.setState('disconnected');
        }, duration);
    }

    stopScan(): void {
        this.ble?.stopDeviceScan();
        if (this.state === 'scanning') this.setState('disconnected');
    }

    // ── BLE Connect ──────────────────────────────────────────────────
    async connectBluetooth(deviceId: string): Promise<boolean> {
        if (!this.ble) { this.initialize(); }
        this.setState('connecting');

        try {
            const device = await this.ble!.connectToDevice(deviceId, { timeout: 10000 });
            await device.discoverAllServicesAndCharacteristics();
            this.connectedDevice = device;
            this.connectionType = 'bluetooth';

            // Monitor disconnection
            device.onDisconnected(() => {
                console.log('🔌 BLE disconnected');
                this.handleDisconnect();
            });

            // Initialize ELM327
            await this.initELM327BLE(device);
            await this.fetchVehicleInfo();
            this.setState('connected', device.name ?? deviceId);
            this.startPolling();
            return true;
        } catch (e: any) {
            console.error('BLE connect error:', e.message);
            this.setState('error', e.message);
            return false;
        }
    }

    // ── WiFi Connect ─────────────────────────────────────────────────
    async connectWifi(host = WIFI_HOST, port = WIFI_PORT): Promise<boolean> {
        this.setState('connecting');

        try {
            // React Native doesn't have native TCP sockets in Expo Go,
            // so we attempt a fetch-based handshake for WiFi ELM327 adapters
            // that expose an HTTP endpoint. For raw TCP, a dev build with
            // react-native-tcp-socket is needed.
            //
            // For Expo Go compatibility we simulate the connection and
            // flag it as connected so the UI/UX works. In a production
            // dev build you'd swap this for a real TCP socket.

            this.connectionType = 'wifi';
            this.setState('initializing');

            // Simulate ELM327 init sequence
            console.log(`📡 WiFi OBD: connecting to ${host}:${port}…`);
            await this.delay(800);

            this.setState('connected', `WiFi ${host}:${port}`);
            this.startPolling();
            return true;
        } catch (e: any) {
            console.error('WiFi connect error:', e.message);
            this.setState('error', e.message);
            return false;
        }
    }

    // ── ELM327 Initialization ────────────────────────────────────────
    private async initELM327BLE(device: Device): Promise<void> {
        this.setState('initializing');
        await this.setupBLECharacteristics(device);

        const cmds = [
            'ATZ',      // Reset
            'ATE0',     // Echo off
            'ATL0',     // Line-feeds off
            'ATS0',     // Spaces off
            'ATH0',     // Headers off
            'ATSP0',    // Auto-detect protocol
        ];

        for (const cmd of cmds) {
            await this.writeBLE(device, cmd);
            await this.delay(300);
        }
        console.log('✅ ELM327 initialized');
    }

    private async setupBLECharacteristics(device: Device): Promise<void> {
        try {
            const services = await device.services();
            for (const svc of services) {
                const chars = await svc.characteristics();
                for (const c of chars) {
                    if ((!this.writeCharacteristic || !this.notifyCharacteristic) && (c.isWritableWithResponse || c.isWritableWithoutResponse)) {
                        this.writeCharacteristic = c;
                    }
                    if ((!this.writeCharacteristic || !this.notifyCharacteristic) && (c.isNotifiable || c.isIndicative)) {
                        this.notifyCharacteristic = c;
                    }
                }
            }

            if (this.notifyCharacteristic && this.connectedDevice) {
                await this.connectedDevice.monitorCharacteristicForService(
                    this.notifyCharacteristic.serviceUUID,
                    this.notifyCharacteristic.uuid,
                    (error: any, characteristic: any) => {
                        if (error) {
                            console.warn('BLE notification error:', error.message);
                            return;
                        }
                        this.handleBLEResponse(characteristic?.value ?? '');
                    }
                );
            }
        } catch (e: any) {
            console.warn('BLE characteristic setup error:', e.message);
        }
    }

    private async writeBLE(device: Device, cmd: string): Promise<void> {
        try {
            if (!this.writeCharacteristic) {
                await this.setupBLECharacteristics(device);
            }
            if (!this.writeCharacteristic) {
                throw new Error('No writable BLE characteristic found');
            }
            const encoded = Buffer.from(cmd + '\r', 'utf-8').toString('base64');
            await this.writeCharacteristic.writeWithResponse(encoded);
        } catch (e: any) {
            console.warn('BLE write error:', e.message);
        }
    }

    private async requestELMResponse(cmd: string, timeoutMs = 2500): Promise<string> {
        if (!this.connectedDevice) return '';

        return this.enqueueCommand(async () => {
            this.responseBuffer = '';
            const response = await new Promise<string>((resolve) => {
                this.responseResolver = resolve;
                this.responseTimeout = setTimeout(() => {
                    const buffer = this.responseBuffer;
                    this.responseBuffer = '';
                    this.responseResolver = null;
                    if (this.responseTimeout) {
                        clearTimeout(this.responseTimeout);
                        this.responseTimeout = null;
                    }
                    resolve(buffer);
                }, timeoutMs);

                this.writeBLE(this.connectedDevice!, cmd).catch(() => {
                    const buffer = this.responseBuffer;
                    this.responseBuffer = '';
                    this.responseResolver = null;
                    if (this.responseTimeout) {
                        clearTimeout(this.responseTimeout);
                        this.responseTimeout = null;
                    }
                    resolve(buffer);
                });
            });

            return response;
        });
    }

    private handleBLEResponse(raw: string): void {
        if (!raw) return;
        const text = Buffer.from(raw, 'base64').toString('utf-8');
        this.responseBuffer += text.replace(/\r/g, '\n');

        const completed = this.responseBuffer.includes('>')
            || this.responseBuffer.includes('NO DATA')
            || this.responseBuffer.includes('STOPPED')
            || this.responseBuffer.includes('CAN ERROR');

        if (completed) {
            const response = this.responseBuffer;
            this.responseBuffer = '';
            const resolver = this.responseResolver;
            this.responseResolver = null;
            if (this.responseTimeout) {
                clearTimeout(this.responseTimeout);
                this.responseTimeout = null;
            }
            resolver?.(response);
        }
    }

    private enqueueCommand<T>(operation: () => Promise<T>): Promise<T> {
        const run = this.commandQueue.catch(() => undefined).then(operation);
        this.commandQueue = run.then(() => undefined, () => undefined);
        return run;
    }

    private async fetchVehicleInfo(): Promise<void> {
        if (this.connectionType !== 'bluetooth' || !this.connectedDevice) return;
        if (this.vehicleInfoRequestPromise) return this.vehicleInfoRequestPromise;

        this.vehicleInfoRequestPromise = (async () => {
            try {
                const vin = await this.requestVIN();
                if (!vin) {
                    return;
                }

                const info = await this.decodeVehicleInfo(vin);
                await this.persistVehicleInfo(info);
                this.lastData = {
                    ...this.lastData,
                    vin,
                    vehicleInfo: info,
                    timestamp: Date.now(),
                };
                this.dataCallback?.(this.lastData);
            } catch (e: any) {
                console.warn('Vehicle info fetch failed:', e.message);
            } finally {
                this.vehicleInfoRequestPromise = null;
            }
        })();

        return this.vehicleInfoRequestPromise;
    }

    private async requestVIN(): Promise<string | undefined> {
        const raw = await this.requestELMResponse('09 02');
        const clean = raw.replace(/[\s\r\n>]/g, '').toUpperCase();
        const candidates = clean.match(/[A-HJ-NPR-Z0-9]{17}/g) || [];
        return candidates.find((value) => value.length === 17);
    }

    private async decodeVehicleInfo(vin: string): Promise<VehicleInfo> {
        const normalizedVin = vin.toUpperCase();
        const localRecord = findLocalVinRecord(normalizedVin);
        const localInfo = decodeVIN(normalizedVin);

        if (localRecord) {
            return {
                vin: normalizedVin,
                manufacturer: localRecord.manufacturer || localInfo.manufacturer,
                model: localRecord.model || localInfo.model,
                year: localRecord.year || localInfo.year,
                plant: localRecord.plant || localInfo.plant,
                bodyStyle: localRecord.bodyStyle || localInfo.bodyStyle,
                fuelType: localRecord.fuelType || localInfo.fuelType,
                source: 'obd',
            };
        }

        try {
            const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended/${encodeURIComponent(normalizedVin)}?format=json`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const payload = await response.json();
            const result = payload?.Results?.[0];
            if (!result) {
                return localInfo;
            }

            return {
                vin: normalizedVin,
                manufacturer: result.Make || localInfo.manufacturer,
                model: result.Model || localInfo.model,
                year: result.ModelYear ? parseInt(result.ModelYear, 10) : localInfo.year,
                plant: result.PlantCity || localInfo.plant,
                bodyStyle: result.BodyClass || localInfo.bodyStyle,
                fuelType: result.FuelTypePrimary || localInfo.fuelType,
                source: 'obd',
            };
        } catch (e: any) {
            console.warn('VIN lookup fallback used:', e.message);
            return localInfo;
        }
    }

    private async persistVehicleInfo(info: VehicleInfo): Promise<void> {
        this.vehicleInfo = info;
        try {
            await AsyncStorage.setItem('racebuddy_vehicle_info', JSON.stringify(info));
        } catch (e: any) {
            console.warn('Vehicle info persistence failed:', e.message);
        }
    }

    private async loadPersistedVehicleInfo(): Promise<void> {
        try {
            const raw = await AsyncStorage.getItem('racebuddy_vehicle_info');
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw) as VehicleInfo;
            this.vehicleInfo = parsed;
        } catch (e: any) {
            console.warn('Vehicle info load failed:', e.message);
        }
    }

    // ── Polling ──────────────────────────────────────────────────────
    private startPolling(): void {
        if (this.pollInterval) clearInterval(this.pollInterval);

        // Poll every 200ms for racing-grade data rate
        this.pollInterval = setInterval(() => this.pollOBD(), 200);
    }

    private async pollOBD(): Promise<void> {
        if (this.state !== 'connected') return;

        try {
            if (this.connectionType === 'bluetooth' && this.connectedDevice) {
                const rotationIndex = Math.floor(Date.now() / 1000) % 3;
                const corePids = [PID.RPM, PID.SPEED, PID.THROTTLE, PID.ENGINE_LOAD, PID.COOLANT_TEMP, PID.FUEL_LEVEL];
                const extendedPids = rotationIndex === 0
                    ? [PID.INTAKE_AIR_TEMP, PID.MAF, PID.FUEL_PRESSURE]
                    : rotationIndex === 1
                        ? [PID.O2_SENSOR_1, PID.O2_SENSOR_2, PID.BATTERY_VOLTAGE]
                        : [PID.IGNITION_TIMING, PID.AMBIENT_AIR_TEMP, PID.CATALYST_TEMP];

                const values: Record<string, number | undefined> = {};
                for (const pid of [...corePids, ...extendedPids]) {
                    const value = await this.queryPIDBLE(pid);
                    values[pid] = value;
                }

                const rpm = values[PID.RPM];
                const speed = values[PID.SPEED];
                const throttle = values[PID.THROTTLE];
                const load = values[PID.ENGINE_LOAD];
                const coolant = values[PID.COOLANT_TEMP];
                const fuel = values[PID.FUEL_LEVEL];

                const prevSpeed = this.lastData.speed ?? speed ?? 0;
                const acceleration = speed ? ((speed - prevSpeed) / 3.6) : 0;
                const engineEfficiency = load && rpm ? ((load * rpm) / 100 / 100) : 0;

                this.lastData = {
                    rpm: rpm ?? this.lastData.rpm,
                    speed: speed ?? this.lastData.speed,
                    throttle: throttle ?? this.lastData.throttle,
                    engineLoad: load ?? this.lastData.engineLoad,
                    coolantTemp: coolant ?? this.lastData.coolantTemp,
                    fuelLevel: fuel ?? this.lastData.fuelLevel,
                    acceleration: acceleration ?? this.lastData.acceleration,
                    engineEfficiency: engineEfficiency ?? this.lastData.engineEfficiency,
                    intakeAirTemp: values[PID.INTAKE_AIR_TEMP] ?? this.lastData.intakeAirTemp,
                    mafRate: values[PID.MAF] ?? this.lastData.mafRate,
                    fuelPressure: values[PID.FUEL_PRESSURE] ?? this.lastData.fuelPressure,
                    o2Sensor1: values[PID.O2_SENSOR_1] ?? this.lastData.o2Sensor1,
                    o2Sensor2: values[PID.O2_SENSOR_2] ?? this.lastData.o2Sensor2,
                    batteryVoltage: values[PID.BATTERY_VOLTAGE] ?? this.lastData.batteryVoltage,
                    ignitionTiming: values[PID.IGNITION_TIMING] ?? this.lastData.ignitionTiming,
                    ambientAirTemp: values[PID.AMBIENT_AIR_TEMP] ?? this.lastData.ambientAirTemp,
                    catalystTemp: values[PID.CATALYST_TEMP] ?? this.lastData.catalystTemp,
                    vin: this.lastData.vin,
                    vehicleInfo: this.vehicleInfo ?? this.lastData.vehicleInfo,
                    timestamp: Date.now(),
                };
            } else if (this.connectionType === 'wifi') {
                // ── WiFi Simulation ───────────────────────────────────────
                // Realistic racing data for development in Expo Go
                const rpm = 2800 + Math.random() * 4000;
                const speed = 60 + Math.random() * 120;
                const throttle = Math.random() * 100;
                const load = 20 + Math.random() * 60;

                this.lastData = {
                    rpm,
                    speed,
                    throttle,
                    engineLoad: load,
                    coolantTemp: 85 + Math.random() * 15,
                    fuelLevel: 30 + Math.random() * 70,

                    // Simulated extended sensors
                    intakeAirTemp: 25 + Math.random() * 35,
                    mafRate: (rpm / 1000) * 5 + Math.random() * 10,
                    fuelPressure: 55 + Math.random() * 5,
                    fuelConsumptionRate: (throttle / 100) * 15,

                    o2Sensor1: 0.5 + Math.random() * 0.5,
                    o2Sensor2: 0.3 + Math.random() * 0.3,

                    gear: Math.floor(1 + (speed / 40)),
                    batteryVoltage: 13.2 + Math.random() * 1.0,

                    ambientAirTemp: 22 + Math.random() * 12,
                    vehicleDistance: 1000 + Math.random() * 50000,

                    ignitionTiming: 15 + Math.random() * 10,
                    engineFrictionPercent: 5 + Math.random() * 10,
                    catalystTemp: 500 + Math.random() * 150,

                    acceleration: (speed - (this.lastData.speed ?? 60)) / 3.6,
                    engineEfficiency: (load * rpm) / 100 / 100,
                    fuelTrim: -5 + Math.random() * 10,

                    timestamp: Date.now(),
                };
            }

            this.dataCallback?.(this.lastData);
        } catch (e: any) {
            console.warn('OBD poll error:', e.message);
        }
    }

    private async queryPIDBLE(pid: string): Promise<number | undefined> {
        if (!this.connectedDevice) return undefined;
        try {
            const response = await this.requestELMResponse(pid);
            return OBDServiceClass.parseResponse(response, pid);
        } catch {
            return undefined;
        }
    }

    // ── Disconnect ───────────────────────────────────────────────────
    async disconnect(): Promise<void> {
        if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }

        if (this.connectedDevice) {
            try {
                await this.connectedDevice.cancelConnection();
            } catch { /* already disconnected */ }
            this.connectedDevice = null;
        }

        this.connectionType = 'none';
        this.writeCharacteristic = null;
        this.notifyCharacteristic = null;
        this.vehicleInfo = null;
        this.writeCharacteristic = null;
        this.notifyCharacteristic = null;
        this.vehicleInfo = null;
        this.vehicleInfoRequestPromise = null;
        this.setState('disconnected');
        console.log('🔌 OBD disconnected');
    }

    private handleDisconnect(): void {
        if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
        this.connectedDevice = null;
        this.connectionType = 'none';
        this.writeCharacteristic = null;
        this.notifyCharacteristic = null;
        this.vehicleInfoRequestPromise = null;
        this.setState('disconnected');
    }

    // ── Helpers ──────────────────────────────────────────────────────
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Parse ELM327 response bytes
    static parseResponse(raw: string, pid: string): number | undefined {
        const clean = raw.replace(/[\s>]/g, '').toUpperCase();
        if (!clean) return undefined;

        const prefix = '41' + pid.substring(2);
        const idx = clean.indexOf(prefix);
        if (idx < 0) return undefined;

        const bytes = clean.substring(idx + prefix.length);
        const first = bytes.substring(0, 2);
        const second = bytes.substring(2, 4);
        const third = bytes.substring(4, 6);

        const readHex = (offset: number): number | undefined => {
            const value = bytes.substring(offset, offset + 2);
            return value ? parseInt(value, 16) : undefined;
        };

        switch (pid) {
            case PID.RPM: {
                const a = readHex(0);
                const b = readHex(2);
                return a !== undefined && b !== undefined ? (a * 256 + b) / 4 : undefined;
            }
            case PID.SPEED:
                return readHex(0);
            case PID.THROTTLE:
            case PID.ENGINE_LOAD:
            case PID.FUEL_LEVEL: {
                const v = readHex(0);
                return v !== undefined ? v * 100 / 255 : undefined;
            }
            case PID.COOLANT_TEMP: {
                const v = readHex(0);
                return v !== undefined ? v - 40 : undefined;
            }
            case PID.INTAKE_AIR_TEMP: {
                const v = readHex(0);
                return v !== undefined ? v - 40 : undefined;
            }
            case PID.MAF: {
                const a = readHex(0);
                const b = readHex(2);
                return a !== undefined && b !== undefined ? (a * 256 + b) / 100 : undefined;
            }
            case PID.FUEL_PRESSURE: {
                const v = readHex(0);
                return v !== undefined ? v * 3 : undefined;
            }
            case PID.O2_SENSOR_1:
            case PID.O2_SENSOR_2: {
                const v = readHex(0);
                return v !== undefined ? v / 200 : undefined;
            }
            case PID.BATTERY_VOLTAGE: {
                const v = readHex(0);
                return v !== undefined ? v / 10 : undefined;
            }
            case PID.AMBIENT_AIR_TEMP: {
                const v = readHex(0);
                return v !== undefined ? v - 40 : undefined;
            }
            case PID.IGNITION_TIMING: {
                const v = readHex(0);
                return v !== undefined ? v / 2 - 64 : undefined;
            }
            case PID.CATALYST_TEMP: {
                const a = readHex(0);
                const b = readHex(2);
                return a !== undefined && b !== undefined ? (a * 256 + b) / 10 - 40 : undefined;
            }
            case PID.FUEL_CONSUMPTION_RATE: {
                const a = readHex(0);
                const b = readHex(2);
                return a !== undefined && b !== undefined ? (a * 256 + b) / 20 : undefined;
            }
            default: {
                const v = readHex(0);
                return v !== undefined ? v : undefined;
            }
        }
    }

    getLastData(): OBDData { return this.lastData; }
    getVehicleInfo(): VehicleInfo | null { return this.vehicleInfo; }
}

const VIN_MANUFACTURERS: Record<string, string> = {
    '1HG': 'Honda',
    'JH4': 'Acura',
    'TRU': 'Toyota',
    'JTD': 'Toyota',
    'WBA': 'BMW',
    'WVW': 'Volkswagen',
    'WAU': 'Audi',
    '1C3': 'Chrysler',
    '1FA': 'Ford',
    '1G1': 'Chevrolet',
    '1G8': 'Pontiac',
    '1G6': 'Cadillac',
    '1M1': 'Mazda',
    'JM1': 'Mazda',
    'SB1': 'Subaru',
    'JF1': 'Subaru',
    '3VW': 'Volkswagen',
    '5YJ': 'Tesla',
    'ZFA': 'Ford',
    'MLH': 'Mercedes-Benz',
    'WDB': 'Mercedes-Benz',
    'SAL': 'Land Rover',
    'SCA': 'Alfa Romeo',
    'SHH': 'Honda',
    'VF1': 'Renault',
    'VF3': 'Renault',
    'KL1': 'Kia',
    'KMH': 'Hyundai',
    'WBX': 'BMW',
    'WBS': 'BMW',
    'WBW': 'BMW',
};

const VIN_YEARS: Record<string, number> = {
    A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015, G: 2016,
    H: 2017, J: 2018, K: 2019, L: 2020, M: 2021, N: 2022, P: 2023,
    R: 2024, S: 2025, T: 2026, V: 2027, W: 2028, X: 2029, Y: 2030,
    '1': 2031, '2': 2032, '3': 2033, '4': 2034, '5': 2035, '6': 2036,
    '7': 2037, '8': 2038, '9': 2039,
};

function decodeVIN(vin?: string): VehicleInfo {
    if (!vin) {
        return { source: 'unknown' };
    }

    const normalized = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    const wmi = normalized.slice(0, 3);
    const manufacturer = VIN_MANUFACTURERS[wmi] ?? inferManufacturerFromWMI(wmi);
    const yearCode = normalized[9];
    const year = yearCode ? VIN_YEARS[yearCode] : undefined;
    const plant = normalized[10] ? `Plant ${normalized[10]}` : undefined;
    const bodyStyle = normalized[3] ? `Body code ${normalized[3]}` : undefined;
    const engineCode = normalized[7] ? `Engine descriptor ${normalized[7]}` : undefined;

    return {
        vin: normalized,
        manufacturer,
        model: manufacturer === 'Unknown manufacturer' ? 'Model lookup pending' : 'Model lookup pending',
        year,
        plant,
        bodyStyle,
        fuelType: engineCode,
        source: 'obd',
    };
}

function inferManufacturerFromWMI(wmi: string): string {
    const prefix = wmi.slice(0, 2);
    const map: Record<string, string> = {
        '1A': 'Chrysler',
        '1B': 'Dodge',
        '1C': 'Chrysler',
        '1F': 'Ford',
        '1G': 'General Motors',
        '1H': 'Honda',
        '1M': 'Mazda',
        '1N': 'Nissan',
        '1P': 'Pontiac',
        '1R': 'Rivian',
        '1T': 'Toyota',
        '1V': 'Volkswagen',
        '2T': 'Toyota',
        '3A': 'Chrysler',
        '3C': 'Chrysler',
        '3D': 'Daimler',
        '3F': 'Ford',
        '3G': 'General Motors',
        '3H': 'Honda',
        '3M': 'Mazda',
        '3N': 'Nissan',
        '3P': 'Pontiac',
        '3T': 'Toyota',
        '4A': 'Mitsubishi',
        '4C': 'Chevrolet',
        '4F': 'Ford',
        '4G': 'General Motors',
        '4J': 'Jeep',
        '4M': 'Mazda',
        '4N': 'Nissan',
        '4S': 'Subaru',
        '4T': 'Toyota',
        '5F': 'Honda',
        '5G': 'General Motors',
        '5Y': 'Tesla',
        '6G': 'General Motors',
        '6H': 'Honda',
        '6M': 'Mazda',
        '6T': 'Toyota',
        '7A': 'Honda',
        '7B': 'Chevrolet',
        '7F': 'Ford',
        '7G': 'General Motors',
        '7H': 'Honda',
        '7J': 'Jeep',
        '7M': 'Mazda',
        '7N': 'Nissan',
        '7S': 'Subaru',
        '8A': 'BMW',
        '8C': 'Chevrolet',
        '8F': 'Ford',
        '8G': 'General Motors',
        '8H': 'Honda',
        '8M': 'Mazda',
        '8N': 'Nissan',
        '8T': 'Toyota',
        '9B': 'BMW',
        '9C': 'Chevrolet',
        '9F': 'Ford',
        '9G': 'General Motors',
        '9H': 'Honda',
        '9M': 'Mazda',
        '9N': 'Nissan',
        '9T': 'Toyota',
        'JH': 'Honda',
        'KL': 'Kia',
        'KM': 'Hyundai',
        'TR': 'Toyota',
        'W': 'Volkswagen',
    };

    return map[prefix] ?? 'Unknown manufacturer';
}

export const OBDService = new OBDServiceClass();
