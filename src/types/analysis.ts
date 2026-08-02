/**
 * RaceBuddy - Ideal Lap Analysis Types
 * Data models for telemetry analysis, ideal lap construction,
 * and Garmin Catalyst–style opportunity analysis.
 */

import { Location, TelemetryData } from './index';

// ─── Spatial Telemetry ───────────────────────────────────────────────

/** A single telemetry sample enriched with cumulative distance */
export interface SpatialTelemetryPoint extends TelemetryData {
    /** Cumulative distance from lap start (meters) */
    distance: number;
    /** Elapsed time from lap start (seconds) */
    elapsedTime: number;
    /** Instantaneous curvature (1/m), 0 = straight */
    curvature: number;
    /** Smoothed speed (km/h) after filtering */
    smoothedSpeed: number;
    /** Smoothed lateral G */
    smoothedGForceX: number;
    /** Smoothed longitudinal G */
    smoothedGForceY: number;
}

// ─── Lap Representation ──────────────────────────────────────────────

export interface LapTelemetry {
    lapId: string;
    lapNumber: number;
    lapTime: number; // milliseconds
    isValid: boolean;
    points: SpatialTelemetryPoint[];
    /** Total distance of the lap in meters */
    totalDistance: number;
}

// ─── Track Segmentation ──────────────────────────────────────────────

export type SegmentType = 'straight' | 'corner' | 'braking_zone' | 'acceleration_zone';

export interface TrackSegment {
    id: string;
    segmentIndex: number;
    type: SegmentType;
    startDistance: number;
    endDistance: number;
    /** Corner number if type === 'corner' */
    cornerNumber?: number;
    /** Corner direction: positive = right, negative = left */
    cornerDirection?: number;
    /** Average curvature in this segment */
    avgCurvature: number;
}

// ─── Braking / Acceleration Events ──────────────────────────────────

export interface DrivingEvent {
    id: string;
    type: 'braking' | 'acceleration';
    /** Distance from lap start where event begins */
    startDistance: number;
    /** Distance from lap start where event ends */
    endDistance: number;
    /** Time offset from lap start (s) for best lap */
    bestLapTime: number;
    /** Time offset from lap start (s) for ideal lap */
    idealLapTime: number;
    /** Speed at event start (km/h) */
    speedAtStart: number;
    /** Speed at event end (km/h) */
    speedAtEnd: number;
    /** Peak G-force during event */
    peakGForce: number;
    /** Duration of event in seconds */
    duration: number;
    /** Associated track segment */
    segmentId: string;
}

// ─── Ideal Lap ───────────────────────────────────────────────────────

export interface IdealLapResult {
    /** The constructed ideal lap telemetry */
    idealLap: LapTelemetry;
    /** Which source lap contributed each segment */
    segmentSources: SegmentSource[];
    /** Total ideal lap time (ms) */
    idealLapTime: number;
    /** Best actual lap time (ms) */
    bestLapTime: number;
    /** Time saved vs best lap (ms, positive = improvement) */
    timeSaved: number;
}

export interface SegmentSource {
    segmentId: string;
    segmentIndex: number;
    sourceLapId: string;
    sourceLapNumber: number;
    timeInSegment: number; // ms
    bestLapTimeInSegment: number; // ms
    timeDelta: number; // ms, negative = faster in ideal
}

// ─── Opportunity Analysis (Garmin Catalyst style) ────────────────────

export type OpportunityCategory = 'braking' | 'apex' | 'speed' | 'overview';

export interface Opportunity {
    id: string;
    /** Sequential opportunity number */
    number: number;
    /** Associated corner / segment */
    segment: TrackSegment;
    /** Total time delta available (seconds, positive = time to gain) */
    totalTimeDelta: number;

    /** Overview analysis */
    overview: OpportunityOverview;
    /** Braking analysis */
    braking: OpportunityBraking;
    /** Apex / line analysis */
    apex: OpportunityApex;
    /** Speed analysis */
    speed: OpportunitySpeed;
}

export interface OpportunityOverview {
    description: string;
    timeDelta: number; // seconds
    /** Key advice string */
    advice: string;
}

export interface OpportunityBraking {
    /** Distance delta to optimal braking point (meters, positive = brake later) */
    distanceDelta: number;
    /** How much harder the brakes should be applied (%, positive = harder) */
    intensityDelta: number;
    /** Time delta from braking improvement (seconds) */
    timeDelta: number;
    /** Best lap braking G-force */
    bestLapBrakingG: number;
    /** Optimal braking G-force */
    optimalBrakingG: number;
    /** Speed at braking point — best lap */
    bestLapBrakingSpeed: number;
    /** Speed at braking point — optimal */
    optimalBrakingSpeed: number;
    /** Deceleration profile: array of {distance, speed} for best & optimal */
    bestLapProfile: SpeedDistancePoint[];
    optimalProfile: SpeedDistancePoint[];
}

export interface OpportunityApex {
    /** Apex type classification */
    apexType: 'early' | 'late' | 'on_target';
    /** Turn entry classification */
    turnEntryType: 'early' | 'late' | 'on_target';
    /** Distance to optimal apex (meters, positive = too late) */
    apexDistanceDelta: number;
    /** Minimum speed at apex — best lap */
    bestLapApexSpeed: number;
    /** Minimum speed at apex — optimal */
    optimalApexSpeed: number;
    /** Lateral G at apex — best */
    bestLapApexG: number;
    /** Lateral G at apex — optimal */
    optimalApexG: number;
    /** Time delta from apex improvement */
    timeDelta: number;
    /** Advice string */
    advice: string;
    /** Acceleration profile for chart */
    bestLapAccelProfile: GForceDistancePoint[];
    optimalAccelProfile: GForceDistancePoint[];
    /** Speed profile for chart */
    bestLapSpeedProfile: SpeedDistancePoint[];
    optimalSpeedProfile: SpeedDistancePoint[];
}

export interface OpportunitySpeed {
    /** Max speed in segment — best lap */
    bestLapMaxSpeed: number;
    /** Max speed in segment — optimal */
    optimalMaxSpeed: number;
    /** Min speed in segment — best lap */
    bestLapMinSpeed: number;
    /** Min speed in segment — optimal */
    optimalMinSpeed: number;
    /** Time delta from speed improvement */
    timeDelta: number;
    /** Speed trace for overlay */
    bestLapProfile: SpeedDistancePoint[];
    optimalProfile: SpeedDistancePoint[];
    /** Time trace for overlay */
    bestLapTimeProfile: TimeDistancePoint[];
    optimalTimeProfile: TimeDistancePoint[];
}

// ─── Chart Data Points ───────────────────────────────────────────────

export interface SpeedDistancePoint {
    distance: number;
    speed: number;
}

export interface GForceDistancePoint {
    distance: number;
    gForce: number;
}

export interface TimeDistancePoint {
    distance: number;
    time: number;
}

export interface DeltaTimePoint {
    distance: number;
    /** Cumulative delta: positive = ideal is faster */
    delta: number;
}

// ─── Full Analysis Result ────────────────────────────────────────────

export interface LapAnalysisResult {
    /** Session ID */
    sessionId: string;
    /** Track segments detected */
    segments: TrackSegment[];
    /** The ideal lap construction */
    idealLap: IdealLapResult;
    /** The best actual lap */
    bestLap: LapTelemetry;
    /** All braking / acceleration events */
    drivingEvents: DrivingEvent[];
    /** Opportunities ranked by time gain */
    opportunities: Opportunity[];
    /** Delta time curve over distance */
    deltaTimeCurve: DeltaTimePoint[];
    /** Summary statistics */
    summary: AnalysisSummary;
}

export interface AnalysisSummary {
    bestLapTime: number; // ms
    idealLapTime: number; // ms
    totalTimeDelta: number; // ms
    totalOpportunities: number;
    biggestOpportunityIndex: number;
    avgSpeedBest: number; // km/h
    avgSpeedIdeal: number; // km/h
    maxSpeedBest: number;
    maxSpeedIdeal: number;
    maxBrakingGBest: number;
    maxBrakingGIdeal: number;
    maxLateralGBest: number;
    maxLateralGIdeal: number;
    /** Raw telemetry quality score (0-1) */
    dataQualityScore: number;
    /** Overall analysis confidence (0-1) */
    analysisConfidence: number;
}

// ─── Algorithm Configuration ─────────────────────────────────────────

export interface AnalysisConfig {
    /** Smoothing window size for speed (number of samples) */
    speedSmoothingWindow: number;
    /** Smoothing window for G-forces */
    gForceSmoothingWindow: number;
    /** Minimum braking deceleration threshold (G) */
    brakingThreshold: number;
    /** Minimum acceleration threshold (G) */
    accelerationThreshold: number;
    /** Minimum curvature to classify as corner (1/m) */
    cornerCurvatureThreshold: number;
    /** Minimum segment length (meters) */
    minSegmentLength: number;
    /** Distance resolution for spatial resampling (meters) */
    spatialResolution: number;
    /** Maximum physically plausible lateral G */
    maxPlausibleLateralG: number;
    /** Maximum physically plausible longitudinal G */
    maxPlausibleLongitudinalG: number;
    /** Transition smoothing length at segment boundaries (meters) */
    transitionSmoothingLength: number;
}

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
    speedSmoothingWindow: 7,
    gForceSmoothingWindow: 5,
    brakingThreshold: 0.25,
    accelerationThreshold: 0.15,
    cornerCurvatureThreshold: 0.005,
    minSegmentLength: 20,
    spatialResolution: 1.0,
    maxPlausibleLateralG: 2.5,
    maxPlausibleLongitudinalG: 2.0,
    transitionSmoothingLength: 15,
};
