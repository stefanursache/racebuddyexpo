// Core data types for RaceBuddy

export interface Location {
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    timestamp: number;
}

export interface TrackPoint {
    id: string;
    location: Location;
    isFinishLine?: boolean;
    isSector?: boolean;
    sectorNumber?: number;
}

export interface Track {
    id: string;
    name: string;
    description: string;
    country: string;
    length: number; // in meters
    finishLineLocation?: Location;
    trackPoints: TrackPoint[];
    sectors: number;
    bestLapTime?: number;
    createdAt: Date;
    isCustom: boolean;
}

export interface LapTime {
    id: string;
    lapNumber: number;
    startTime: Date;
    endTime: Date;
    duration: number; // in milliseconds
    sectorTimes: number[];
    isValid: boolean;
    isBestLap: boolean;
}

export interface TelemetryData {
    timestamp: number;
    speed: number; // km/h
    gforceX: number; // lateral G-force
    gforceY: number; // longitudinal G-force
    gforceZ: number; // vertical G-force
    rpm?: number;
    throttle?: number; // 0-100%
    brake?: number; // 0-100%
    location: Location;
}

export interface RacingSession {
    id: string;
    trackId: string;
    trackName: string;
    startTime: Date;
    endTime?: Date;
    lapTimes: LapTime[];
    telemetryData: TelemetryData[];
    bestLapTime?: number;
    totalLaps: number;
    isActive: boolean;
    weather?: string;
    temperature?: number;
    notes?: string;
}

export interface VehicleInfo {
    vin?: string;
    manufacturer?: string;
    model?: string;
    year?: number;
    plant?: string;
    bodyStyle?: string;
    fuelType?: string;
    source: 'obd' | 'manual' | 'unknown';
}

export interface OBDData {
    // Core Performance
    rpm?: number;
    speed?: number;
    throttle?: number;
    engineLoad?: number;
    coolantTemp?: number;
    fuelLevel?: number;

    // Engine Intake & Fuel System
    intakeAirTemp?: number;                // °C
    mafRate?: number;                      // g/s (Mass Air Flow)
    fuelPressure?: number;                 // kPa
    fuelConsumptionRate?: number;          // L/h

    // Oxygen Sensors (Pre & Post Catalyst)
    o2Sensor1?: number;                    // Voltage (V) - Before catalyst
    o2Sensor2?: number;                    // Voltage (V) - After catalyst

    // Transmission & Drivetrain
    gear?: number;                         // Current gear (1-6, 0=Park/Neutral)

    // Electrical System
    batteryVoltage?: number;               // V (typically 12-14.5V)

    // Environmental
    ambientAirTemp?: number;               // °C
    vehicleDistance?: number;              // km

    // Timing
    ignitionTiming?: number;               // Degrees before TDC

    // Engine Status
    engineFrictionPercent?: number;        // % of peak torque
    catalystTemp?: number;                 // °C (Bank 1)

    // Derived/Calculated
    acceleration?: number;                 // g (calculated from speed change)
    engineEfficiency?: number;             // % (0-100)
    fuelTrim?: number;                     // % (long-term fuel adjustment)

    // Vehicle identity
    vin?: string;
    vehicleInfo?: VehicleInfo;

    timestamp: number;
}

export interface CoachingTip {
    id: string;
    title: string;
    message: string;
    type: 'braking' | 'acceleration' | 'cornering' | 'general';
    priority: 'low' | 'medium' | 'high';
    timestamp: number;
}

// Navigation types — Catalyst layout (DRIVE / TRACKS / HISTORY / COACH / SETUP)
export type RootTabParamList = {
    Dashboard: undefined;  // DRIVE
    Tracks: undefined;     // TRACKS
    Sessions: undefined;   // HISTORY
    Analysis: undefined;   // COACH
    Settings: undefined;   // SETUP
};

export type TelemetryStackParamList = {
    TelemetryView: undefined;
    SessionAnalysis: { sessionId: string };
    LapComparison: { lapIds: string[] };
};