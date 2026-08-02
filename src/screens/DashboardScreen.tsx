/**
 * RaceBuddy — Garmin Catalyst–style DRIVE screen
 *
 * Pure black background, big bold monospace numbers, live delta bar,
 * G-force trace ball, sector indicators.  Designed for glanceable
 * reading while driving.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Dimensions,
    Animated, Alert, Modal, FlatList, StatusBar, ScrollView,
    useWindowDimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as ScreenOrientation from 'expo-screen-orientation';
import { LocationService } from '../services/LocationService';
import { SensorService } from '../services/SensorService';
import { OBDService, OBDDevice, OBDConnectionState } from '../services/OBDService';
import { Location, TelemetryData, Track, LapTime, RacingSession, OBDData } from '../types';
import { loadSessions, addSessionPersist, saveSessions, loadCustomTracks, addCustomTrackPersist, saveCustomTracks } from '../services/StorageService';

const { width: W } = Dimensions.get('window');

// ─── Default tracks (always available) ───────────────────────────────
const DEFAULT_TRACKS: Track[] = [
    { id: 'silverstone', name: 'Silverstone Circuit', description: 'Historic British GP circuit', country: 'United Kingdom', length: 5891, finishLineLocation: { latitude: 52.071111, longitude: -1.016111, timestamp: Date.now() }, trackPoints: [], sectors: 3, bestLapTime: 86450, createdAt: new Date(), isCustom: false },
    { id: 'nurburgring', name: 'Nürburgring Nordschleife', description: 'The legendary Green Hell', country: 'Germany', length: 20832, finishLineLocation: { latitude: 50.335556, longitude: 6.951944, timestamp: Date.now() }, trackPoints: [], sectors: 4, bestLapTime: 375200, createdAt: new Date(), isCustom: false },
    { id: 'spa', name: 'Circuit de Spa-Francorchamps', description: 'Belgian Grand Prix circuit', country: 'Belgium', length: 7004, finishLineLocation: { latitude: 50.437222, longitude: 5.971389, timestamp: Date.now() }, trackPoints: [], sectors: 3, bestLapTime: 103078, createdAt: new Date(), isCustom: false },
    { id: 'monaco', name: 'Circuit de Monaco', description: 'Street circuit through Monte Carlo', country: 'Monaco', length: 3337, finishLineLocation: { latitude: 43.734452, longitude: 7.421386, timestamp: Date.now() }, trackPoints: [], sectors: 3, bestLapTime: 74260, createdAt: new Date(), isCustom: false },
    { id: 'laguna-seca', name: 'Laguna Seca', description: 'Iconic California circuit', country: 'United States', length: 3602, finishLineLocation: { latitude: 36.584244, longitude: -121.748887, timestamp: Date.now() }, trackPoints: [], sectors: 3, bestLapTime: 81340, createdAt: new Date(), isCustom: false },
];

// ─── Shared reactive store (in-memory + AsyncStorage) ────────────────
let _savedSessions: RacingSession[] = [];
let _customTracks: Track[] = [];
let _storeReady = false;
const _listeners: (() => void)[] = [];

function notifyListeners() { _listeners.forEach(fn => fn()); }
export function onStoreChange(fn: () => void) { _listeners.push(fn); return () => { const i = _listeners.indexOf(fn); if (i >= 0) _listeners.splice(i, 1); }; }

export const getSavedSessions = () => _savedSessions;
export const getAllTracks = () => [...DEFAULT_TRACKS, ..._customTracks];
export const AVAILABLE_TRACKS = getAllTracks(); // backward compat (snapshot)

export const addSession = async (s: RacingSession) => {
    _savedSessions = await addSessionPersist(s);
    notifyListeners();
};

export const addCustomTrack = async (t: Track) => {
    _customTracks = await addCustomTrackPersist(t);
    notifyListeners();
};

export const updateCustomTrack = async (track: Track) => {
    const existing = await loadCustomTracks();
    _customTracks = existing.map(item => (item.id === track.id ? track : item));
    await saveCustomTracks(_customTracks);
    notifyListeners();
};

export const deleteCustomTrack = async (trackId: string) => {
    const existing = await loadCustomTracks();
    _customTracks = existing.filter(item => item.id !== trackId);
    await saveCustomTracks(_customTracks);
    notifyListeners();
};

async function initStore() {
    if (_storeReady) return;
    _savedSessions = await loadSessions();
    _customTracks = await loadCustomTracks();
    _storeReady = true;
    console.log(`💾 Loaded ${_savedSessions.length} sessions, ${_customTracks.length} custom tracks`);
    notifyListeners();
}

// ─── Component ───────────────────────────────────────────────────────

const DashboardScreen: React.FC = () => {
    const insets = useSafeAreaInsets();
    const { width: winW, height: winH } = useWindowDimensions();
    const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
    const [currentLocation, setLocation] = useState<Location | null>(null);
    const [gpsTrail, setGpsTrail] = useState<{ latitude: number; longitude: number }[]>([]);
    const mapRef = useRef<MapView>(null);
    const [connGps, setConnGps] = useState(false);
    const [connSensors, setConnSensors] = useState(false);
    const [connObd, setConnObd] = useState(false);

    const [isActive, setIsActive] = useState(false);
    const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
    const [lapTimeMs, setLapTimeMs] = useState(0);
    const [currentLap, setCurrentLap] = useState(1);
    const [laps, setLaps] = useState<LapTime[]>([]);
    const [sessionStart, setSessionStart] = useState<Date | null>(null);

    const [delta, setDelta] = useState(0);
    const [predictedDelta, setPredictedDelta] = useState(0);
    const [bestLapMs, setBestLapMs] = useState<number | null>(null);
    const [currentSector, setCurrentSector] = useState(1);

    const [showTrackPicker, setShowTrackPicker] = useState(false);
    const [showStartCalibration, setShowStartCalibration] = useState(false);
    const [pendingTrack, setPendingTrack] = useState<Track | null>(null);
    const [showBluetooth, setShowBluetooth] = useState(false);
    const [btScanning, setBtScanning] = useState(false);
    const [btDevices, setBtDevices] = useState<OBDDevice[]>([]);
    const [obdData, setObdData] = useState<OBDData | null>(null);
    const [obdState, setObdState] = useState<OBDConnectionState>('disconnected');
    const [isEndingSession, setIsEndingSession] = useState(false);

    const pulseAnim = useRef(new Animated.Value(1)).current;
    const telemetrySamplesRef = useRef<TelemetryData[]>([]);
    const lastAutoLapAtRef = useRef(0);
    const previousLocationRef = useRef<Location | null>(null);
    const endHoldAnim = useRef(new Animated.Value(0)).current;
    const endHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const endHoldIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [, forceUpdate] = useState(0);
    const [endHoldMs, setEndHoldMs] = useState(0);

    useEffect(() => {
        initStore().then(() => forceUpdate(n => n + 1));
        const unsub = onStoreChange(() => forceUpdate(n => n + 1));
        SensorService.initialize();
        OBDService.initialize();
        OBDService.onData(d => { setObdData(d); });
        OBDService.onStateChange((state) => {
            setObdState(state);
            setConnObd(state === 'connected');
        });
        telemetrySamplesRef.current = [];
        (async () => {
            const loc = await LocationService.getCurrentLocation();
            if (loc) { setLocation(loc); setConnGps(true); }
            await LocationService.startLocationTracking(l => {
                setLocation(l); setConnGps(true);
            });
            SensorService.startTelemetryCollection(t => { setTelemetry(t); setConnSensors(true); });
        })();
        return () => { unsub(); LocationService.stopLocationTracking(); SensorService.stopTelemetryCollection(); };
    }, []);

    useEffect(() => {
        if (!isActive || !telemetry) return;

        const lastSample = telemetrySamplesRef.current[telemetrySamplesRef.current.length - 1];
        if (lastSample && lastSample.timestamp === telemetry.timestamp) return;

        telemetrySamplesRef.current.push(telemetry);
    }, [isActive, telemetry]);

    const clearEndHoldTimers = () => {
        if (endHoldTimeoutRef.current) {
            clearTimeout(endHoldTimeoutRef.current);
            endHoldTimeoutRef.current = null;
        }
        if (endHoldIntervalRef.current) {
            clearInterval(endHoldIntervalRef.current);
            endHoldIntervalRef.current = null;
        }
    };

    const resetEndHold = (animate = true) => {
        clearEndHoldTimers();
        setEndHoldMs(0);
        if (animate) {
            Animated.timing(endHoldAnim, { toValue: 0, duration: 120, useNativeDriver: false }).start();
        } else {
            endHoldAnim.setValue(0);
        }
    };

    useEffect(() => {
        return () => {
            clearEndHoldTimers();
        };
    }, []);

    useEffect(() => {
        if (!isActive) resetEndHold(false);
    }, [isActive]);

    // Accumulate GPS trail from location updates during active session
    useEffect(() => {
        if (!isActive || !currentLocation) return;
        setGpsTrail(prev => {
            const last = prev[prev.length - 1];
            if (last && Math.abs(last.latitude - currentLocation.latitude) < 0.000005
                && Math.abs(last.longitude - currentLocation.longitude) < 0.000005) return prev;
            return [...prev, { latitude: currentLocation.latitude, longitude: currentLocation.longitude }];
        });
    }, [isActive, currentLocation]);

    useEffect(() => {
        if (!isActive || !selectedTrack || (!selectedTrack.finishLineLocation && selectedTrack.trackPoints.length === 0) || !currentLocation) {
            previousLocationRef.current = currentLocation;
            return;
        }

        const finishLocation = selectedTrack.finishLineLocation
            ?? selectedTrack.trackPoints.find(point => point.isFinishLine)?.location
            ?? selectedTrack.trackPoints[0]?.location;
        if (!finishLocation) return;

        const currentDistance = LocationService.calculateDistance(currentLocation, finishLocation);
        const previousLocation = previousLocationRef.current;
        const previousDistance = previousLocation
            ? LocationService.calculateDistance(previousLocation, finishLocation)
            : null;

        const gpsAccuracy = currentLocation.accuracy ?? 20;
        const lapTriggerDistance = Math.max(12, Math.min(30, gpsAccuracy * 1.5));
        const movingFastEnough = speed >= 15;

        if (
            previousDistance !== null
            && previousDistance > lapTriggerDistance
            && currentDistance <= lapTriggerDistance
            && movingFastEnough
            && lapTimeMs >= 5000
        ) {
            const now = Date.now();
            if (now - lastAutoLapAtRef.current >= 7000) {
                lastAutoLapAtRef.current = now;

                const lap: LapTime = {
                    id: now.toString(),
                    lapNumber: currentLap,
                    startTime: new Date(now - lapTimeMs),
                    endTime: new Date(now),
                    duration: lapTimeMs,
                    sectorTimes: [Math.round(lapTimeMs * 0.32), Math.round(lapTimeMs * 0.35), Math.round(lapTimeMs * 0.33)],
                    isValid: true,
                    isBestLap: false,
                };

                const all = [...laps, lap];
                const best = Math.min(...all.map(item => item.duration));
                setBestLapMs(best);
                setLaps(all.map(item => ({ ...item, isBestLap: item.duration === best })));
                setCurrentLap(counter => counter + 1);
                setLapTimeMs(0);
                setDelta(0);
                setPredictedDelta(0);
            }
        }

        previousLocationRef.current = currentLocation;
    }, [isActive, selectedTrack, currentLocation, speed, lapTimeMs, currentLap, laps]);

    useEffect(() => {
        if (!isActive) return;
        const iv = setInterval(() => {
            setLapTimeMs(p => p + 100);
            setDelta(d => Math.max(-2, Math.min(2, d + (Math.random() - 0.48) * 0.04)));
            setPredictedDelta(d => Math.max(-3, Math.min(3, d + (Math.random() - 0.47) * 0.06)));
            setCurrentSector(sec => Math.random() < 0.003 ? (sec % 3) + 1 : sec);
        }, 100);
        Animated.loop(Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 0.25, duration: 700, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])).start();
        return () => clearInterval(iv);
    }, [isActive]);

    // Tick total-time counter every second while active
    const [totalTimeMs, setTotalTimeMs] = useState(0);
    useEffect(() => {
        if (!isActive || !sessionStart) return;
        const iv = setInterval(() => setTotalTimeMs(Date.now() - sessionStart.getTime()), 1000);
        return () => clearInterval(iv);
    }, [isActive, sessionStart]);

    const fmtLap = (ms: number) => {
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const f = Math.floor((ms % 1000) / 100);
        return `${m}:${s.toString().padStart(2, '0')}.${f}`;
    };
    const fmtDelta = (sec: number) => `${sec >= 0 ? '+' : '-'}${Math.abs(sec).toFixed(2)}`;
    const speed = Math.round(
        telemetry?.speed
        ?? obdData?.speed
        ?? 0,
    );
    const latG = telemetry?.gforceX ?? 0;
    const lonG = telemetry?.gforceY ?? 0;
    const autoLapEnabled = Boolean(isActive && (selectedTrack?.finishLineLocation || selectedTrack?.trackPoints.length));

    const handleStart = () => setShowTrackPicker(true);
    const pickTrack = async (t: Track) => {
        setPendingTrack(t);
        setShowTrackPicker(false);
        setShowStartCalibration(true);
    };
    const startSessionWithCalibration = async () => {
        if (!pendingTrack) return;

        setSelectedTrack(pendingTrack);
        setShowStartCalibration(false);
        setIsActive(true); setSessionStart(new Date()); setGpsTrail([]);
        setLapTimeMs(0); setCurrentLap(1); setLaps([]); setDelta(0); setPredictedDelta(0);
        setBestLapMs(pendingTrack.bestLapTime ?? null); setCurrentSector(1);
        telemetrySamplesRef.current = [];
        lastAutoLapAtRef.current = 0;
        previousLocationRef.current = null;
        SensorService.calibrate();
        try { await ScreenOrientation.unlockAsync(); } catch { }
        setPendingTrack(null);
    };
    const cancelStartCalibration = () => {
        setPendingTrack(null);
        setShowStartCalibration(false);
    };
    const markLap = () => {
        if (!isActive) return;
        const lap: LapTime = {
            id: Date.now().toString(), lapNumber: currentLap,
            startTime: new Date(Date.now() - lapTimeMs), endTime: new Date(), duration: lapTimeMs,
            sectorTimes: [Math.round(lapTimeMs * 0.32), Math.round(lapTimeMs * 0.35), Math.round(lapTimeMs * 0.33)],
            isValid: true, isBestLap: false,
        };
        const all = [...laps, lap];
        const best = Math.min(...all.map(l => l.duration));
        setBestLapMs(best);
        setLaps(all.map(l => ({ ...l, isBestLap: l.duration === best })));
        setCurrentLap(c => c + 1); setLapTimeMs(0); setDelta(0); setPredictedDelta(0);
    };
    const buildSession = () => ({
        id: Date.now().toString(),
        trackId: selectedTrack?.id || '',
        trackName: selectedTrack?.name || 'Unknown',
        startTime: sessionStart || new Date(),
        endTime: new Date(),
        lapTimes: laps,
        telemetryData: telemetrySamplesRef.current.slice(),
        bestLapTime: laps.length ? Math.min(...laps.map(l => l.duration)) : undefined,
        totalLaps: laps.length,
        isActive: false,
    });
    const finalizeSession = async () => {
        if (isEndingSession) return;
        resetEndHold(false);
        setIsEndingSession(true);

        const session = buildSession();

        // End the session UI immediately, then persist in background.
        setIsActive(false);
        setSelectedTrack(null);
        setLapTimeMs(0);
        setCurrentLap(1);
        setLaps([]);
        setDelta(0);
        setPredictedDelta(0);
        setCurrentSector(1);
        setSessionStart(null);
        setTotalTimeMs(0);
        setGpsTrail([]);
        telemetrySamplesRef.current = [];
        pulseAnim.stopAnimation();
        forceUpdate(n => n + 1);

        try {
            await addSession(session);
        } catch (error) {
            console.warn('⚠️ Failed to save session:', error);
            Alert.alert('Save Warning', 'The session ended, but saving the session data failed.');
        } finally {
            setIsEndingSession(false);
            try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch { }
        }
    };

    const endSession = () => {
        if (!isActive || isEndingSession) return;
        console.log('🛑 End button pressed');
        void finalizeSession();
    };

    const handleEndPressIn = () => {
        if (!isActive || isEndingSession) return;
        resetEndHold(false);
        const startedAt = Date.now();
        Animated.timing(endHoldAnim, { toValue: 1, duration: 3000, useNativeDriver: false }).start();

        endHoldIntervalRef.current = setInterval(() => {
            const elapsed = Date.now() - startedAt;
            setEndHoldMs(Math.min(3000, elapsed));
        }, 100);

        endHoldTimeoutRef.current = setTimeout(() => {
            clearEndHoldTimers();
            setEndHoldMs(3000);
            void finalizeSession();
        }, 3000);
    };

    const handleEndPressOut = () => {
        if (isEndingSession) return;
        resetEndHold();
    };
    const startBtScan = () => {
        setBtScanning(true); setBtDevices([]);
        OBDService.scanBluetooth((d) => {
            setBtDevices(prev => {
                if (prev.find(x => x.id === d.id)) return prev;
                return [...prev, d];
            });
        }, 8000);
        setTimeout(() => setBtScanning(false), 8500);
    };
    const connectDev = async (d: OBDDevice) => {
        const ok = await OBDService.connectBluetooth(d.id);
        if (ok) { setConnObd(true); setShowBluetooth(false); Alert.alert('Connected', `Connected to ${d.name}`); }
        else Alert.alert('Failed', 'Could not connect. Is the adapter powered on?');
    };
    const connectWifi = async () => {
        const ok = await OBDService.connectWifi();
        if (ok) { setConnObd(true); setShowBluetooth(false); Alert.alert('Connected', 'WiFi OBD connected'); }
        else Alert.alert('Failed', 'Could not connect via WiFi.');
    };
    const disconnectObd = () => { OBDService.disconnect(); setConnObd(false); };

    const topPad = Math.max(insets.top + 8, 40); // Minimum safe padding

    // ══════ IDLE VIEW ══════
    if (!isActive) {
        return (
            <View style={[st.root, { paddingTop: topPad, paddingHorizontal: insets.left + insets.right }]}>
                <StatusBar barStyle="light-content" />
                <View style={[st.topBar, { marginHorizontal: -insets.left }]}>
                    <StatusDot label="GPS" on={connGps} />
                    <StatusDot label="IMU" on={connSensors} />
                    <TouchableOpacity onPress={() => setShowBluetooth(true)}><StatusDot label="OBD" on={connObd} /></TouchableOpacity>
                </View>
                <View style={st.idleCenter}>
                    <Text style={st.idleSpeedVal}>{speed}</Text>
                    <Text style={st.idleSpeedUnit}>KM/H</Text>
                    <GBall latG={latG} lonG={lonG} size={110} />
                </View>
                <TouchableOpacity style={st.startBtn} onPress={handleStart} activeOpacity={0.8}>
                    <MaterialIcons name="flag" size={28} color="#000" />
                    <Text style={st.startBtnText}>START SESSION</Text>
                </TouchableOpacity>
                {autoLapEnabled && (
                    <View style={st.autoLapBadge}>
                        <MaterialIcons name="gps-fixed" size={14} color="#00E676" />
                        <Text style={st.autoLapBadgeText}>AUTO LAP DETECTION ACTIVE</Text>
                    </View>
                )}
                {_savedSessions.length > 0 && (
                    <View style={st.lastCard}>
                        <Text style={st.lastTitle}>LAST SESSION</Text>
                        <Text style={st.lastTrack}>{_savedSessions[0].trackName}</Text>
                        <Text style={st.lastInfo}>{_savedSessions[0].totalLaps} laps  ·  Best {_savedSessions[0].bestLapTime ? fmtLap(_savedSessions[0].bestLapTime) : '--'}</Text>
                    </View>
                )}
                <TrackPickerModal visible={showTrackPicker} onClose={() => setShowTrackPicker(false)} onSelect={pickTrack} />
                <BluetoothModal visible={showBluetooth} onClose={() => setShowBluetooth(false)} connected={connObd} scanning={btScanning} devices={btDevices} onScan={startBtScan} onConnect={connectDev} onWifi={connectWifi} onDisconnect={disconnectObd} obdState={obdState} obdData={obdData} />
                <StartCalibrationModal
                    visible={showStartCalibration}
                    trackName={pendingTrack?.name ?? 'Selected Track'}
                    onCancel={cancelStartCalibration}
                    onStart={startSessionWithCalibration}
                />
            </View>
        );
    }

    // ══════ LIVE DRIVE VIEW  (Garmin Catalyst — adapts to orientation) ══════
    const isLandscape = winW > winH;
    const marginH = Math.max(winW * 0.05, insets.left + 8);
    const marginT = Math.max(isLandscape ? insets.top + winH * 0.03 : insets.top + winH * 0.05, insets.top + 12);

    const lastLapMs = laps.length > 0 ? laps[laps.length - 1].duration : null;
    const fmtTotal = (ms: number) => {
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };
    const fmtDeltaBig = (sec: number) => {
        const sign = sec >= 0 ? '+' : '-';
        const abs = Math.abs(sec);
        const m = Math.floor(abs / 60);
        const s = Math.floor(abs % 60);
        const f = Math.floor((abs * 100) % 100);
        return `${sign}${m}:${s.toString().padStart(2, '0')}.${f.toString().padStart(2, '0')}`;
    };

    // Delta background gradient
    const deltaClampAbs = Math.min(Math.abs(delta), 2);
    const deltaIntensity = Math.min(1, deltaClampAbs / 1.0);
    const bgGreen = `rgba(0,200,83,${(deltaIntensity * 0.55).toFixed(2)})`;
    const bgRed = `rgba(255,23,68,${(deltaIntensity * 0.55).toFixed(2)})`;
    const deltaBgColor = delta <= -0.05 ? bgGreen : delta >= 0.05 ? bgRed : 'transparent';
    const deltaTextColor = delta <= -0.05 ? '#00E676' : delta >= 0.05 ? '#FF1744' : '#FFC107';
    const holdSecondsLeft = Math.max(0, Math.ceil((3000 - endHoldMs) / 1000));
    const endButtonLabel = isEndingSession ? 'ENDING...' : endHoldMs > 0 ? `HOLD ${holdSecondsLeft}` : 'HOLD 3s';
    const endFillWidth = endHoldAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
    });

    /* ── Shared sub-components used in both layouts ── */
    const TopBarRow = () => (
        <View style={ls.topBar}>
            <View style={ls.topCell}>
                <Text style={ls.topLabel}>LAST LAP</Text>
                <Text style={ls.topVal}>{lastLapMs != null ? fmtLap(lastLapMs) : '-:--.-'}</Text>
            </View>
            <View style={ls.topCenter}>
                <View style={ls.recRow}>
                    <Animated.View style={[ls.recDot, { opacity: pulseAnim }]} />
                    <Text style={ls.recTxt}>REC</Text>
                    <Text style={ls.trackTxt} numberOfLines={1}>  {selectedTrack?.name}</Text>
                </View>
                <View style={ls.statusDots}>
                    <View style={[ls.sDot, { backgroundColor: connGps ? '#00E676' : '#444' }]} />
                    <View style={[ls.sDot, { backgroundColor: connSensors ? '#00E676' : '#444' }]} />
                    <View style={[ls.sDot, { backgroundColor: connObd ? '#00E676' : '#444' }]} />
                </View>
            </View>
            <View style={[ls.topCell, { alignItems: 'flex-end' }]}>
                <Text style={ls.topLabel}>BEST LAP</Text>
                <Text style={[ls.topVal, { color: '#00E676' }]}>{bestLapMs != null ? fmtLap(bestLapMs) : '-:--.-'}</Text>
            </View>
        </View>
    );

    const RecentLapsRow = () => laps.length > 0 ? (
        <View style={ls.recentRow}>
            {[...laps].reverse().slice(0, 3).map(l => (
                <View key={l.id} style={ls.recentItem}>
                    <Text style={ls.recentNum}>L{l.lapNumber}</Text>
                    <Text style={[ls.recentTime, l.isBestLap && { color: '#00E676' }]}>{fmtLap(l.duration)}</Text>
                    {l.isBestLap && <MaterialIcons name="star" size={10} color="#FFC107" />}
                </View>
            ))}
        </View>
    ) : null;

    const SectorDots = () => (
        <View style={ls.sectorRow}>
            {[1, 2, 3].map(s => (
                <View key={s} style={[ls.sectorDot, s === currentSector && ls.sectorDotActive, s < currentSector && ls.sectorDotDone]} />
            ))}
        </View>
    );

    const BottomBar = () => (
        <View style={ls.bottomBar}>
            <View style={ls.bottomLeft}>
                {autoLapEnabled && (
                    <View style={ls.autoLapPill}>
                        <MaterialIcons name="gps-fixed" size={12} color="#00E676" />
                        <Text style={ls.autoLapPillText}>AUTO LAP</Text>
                    </View>
                )}
            </View>
            <TouchableOpacity
                style={[ls.endBtn, isEndingSession && { opacity: 0.65 }]}
                onPressIn={handleEndPressIn}
                onPressOut={handleEndPressOut}
                activeOpacity={0.7}
                disabled={isEndingSession}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                pressRetentionOffset={{ top: 16, bottom: 16, left: 16, right: 16 }}
            >
                <Animated.View pointerEvents="none" style={[ls.endBtnHoldFill, { width: endFillWidth }]} />
                <MaterialIcons name="power-settings-new" size={24} color="#FF1744" />
                <Text style={ls.endLabel}>{endButtonLabel}</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={[ls.root, { paddingTop: marginT, paddingLeft: marginH, paddingRight: marginH }]}>
            <StatusBar hidden />
            {/* Delta gradient tint */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: deltaBgColor }]} pointerEvents="none" />

            <TopBarRow />
            <View style={ls.sep} />

            {isLandscape ? (
                /* ═══ LANDSCAPE: 3-column layout ═══ */
                <View style={ls.body}>
                    {/* LEFT — Speed + G-Ball */}
                    <View style={ls.sideCol}>
                        <Text style={ls.speedVal}>{speed}</Text>
                        <Text style={ls.speedUnit}>KM/H</Text>
                        <View style={{ marginTop: 8 }}><GBall latG={latG} lonG={lonG} size={80} /></View>
                        {obdData && obdData.rpm != null && (
                            <View style={ls.obdMini}>
                                <Text style={ls.obdMiniLabel}>RPM</Text>
                                <Text style={ls.obdMiniVal}>{obdData.rpm}</Text>
                            </View>
                        )}
                    </View>
                    <View style={ls.vSep} />
                    {/* CENTER — BIG DELTA */}
                    <View style={ls.centerCol}>
                        <Text style={ls.deltaLabel}>DELTA</Text>
                        <Text style={[ls.deltaVal, { color: deltaTextColor }]}>{fmtDeltaBig(delta)}</Text>
                        <SectorDots />
                        <View style={ls.lapTimerWrap}>
                            <Text style={ls.lapTimerLabel}>LAP {currentLap}</Text>
                            <Text style={ls.lapTimerVal}>{fmtLap(lapTimeMs)}</Text>
                        </View>
                        <RecentLapsRow />
                    </View>
                    <View style={ls.vSep} />
                    {/* RIGHT — Total + LAP btn */}
                    <View style={ls.sideCol}>
                        <Text style={ls.topLabel}>TOTAL TIME</Text>
                        <Text style={ls.totalVal}>{fmtTotal(totalTimeMs)}</Text>
                        {obdData && obdData.throttle != null && (
                            <View style={ls.obdMini}>
                                <Text style={ls.obdMiniLabel}>THR</Text>
                                <Text style={ls.obdMiniVal}>{obdData.throttle.toFixed(0)}%</Text>
                            </View>
                        )}
                        <View style={{ flex: 1 }} />
                        <TouchableOpacity style={ls.lapBtn} onPress={markLap} activeOpacity={0.7}>
                            <Text style={ls.lapBtnCount}>{laps.length}</Text>
                            <Text style={ls.lapBtnLabel}>LAP</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (
                /* ═══ PORTRAIT: vertical stacked layout ═══ */
                <View style={{ flex: 1 }}>
                    {/* Big Delta */}
                    <View style={ls.pDeltaWrap}>
                        <Text style={ls.deltaLabel}>DELTA</Text>
                        <Text style={[ls.pDeltaVal, { color: deltaTextColor }]}>{fmtDeltaBig(delta)}</Text>
                    </View>
                    <View style={ls.sep} />
                    {/* Speed + G-ball row */}
                    <View style={ls.pSpeedRow}>
                        <View style={{ alignItems: 'center' }}>
                            <Text style={ls.pSpeedVal}>{speed}</Text>
                            <Text style={ls.speedUnit}>KM/H</Text>
                        </View>
                        <GBall latG={latG} lonG={lonG} size={90} />
                    </View>
                    <View style={ls.sep} />
                    {/* Lap timer */}
                    <View style={ls.pLapRow}>
                        <SectorDots />
                        <Text style={ls.lapTimerLabel}>LAP {currentLap}</Text>
                        <Text style={ls.pLapTimerVal}>{fmtLap(lapTimeMs)}</Text>
                    </View>
                    <RecentLapsRow />
                    <View style={ls.sep} />
                    {/* Total time + OBD */}
                    <View style={ls.pTotalRow}>
                        <View>
                            <Text style={ls.topLabel}>TOTAL TIME</Text>
                            <Text style={ls.totalVal}>{fmtTotal(totalTimeMs)}</Text>
                        </View>
                        {obdData && obdData.rpm != null && (
                            <View style={ls.obdMini}>
                                <Text style={ls.obdMiniLabel}>RPM</Text>
                                <Text style={ls.obdMiniVal}>{obdData.rpm}</Text>
                            </View>
                        )}
                        {obdData && obdData.throttle != null && (
                            <View style={ls.obdMini}>
                                <Text style={ls.obdMiniLabel}>THR</Text>
                                <Text style={ls.obdMiniVal}>{obdData.throttle.toFixed(0)}%</Text>
                            </View>
                        )}
                    </View>
                    <View style={{ flex: 1 }} />
                    {/* Lap + End buttons */}
                    <View style={ls.pBtnRow}>
                        {autoLapEnabled && (
                            <View style={ls.autoLapInline}>
                                <MaterialIcons name="gps-fixed" size={14} color="#00E676" />
                                <Text style={ls.autoLapInlineText}>AUTO LAP ON</Text>
                            </View>
                        )}
                        <TouchableOpacity style={ls.pLapBtn} onPress={markLap} activeOpacity={0.7}>
                            <MaterialIcons name="flag" size={22} color="#000" />
                            <Text style={ls.pLapBtnTxt}>LAP</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[ls.pEndBtn, isEndingSession && { opacity: 0.75 }]}
                            onPressIn={handleEndPressIn}
                            onPressOut={handleEndPressOut}
                            activeOpacity={0.7}
                            disabled={isEndingSession}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                            pressRetentionOffset={{ top: 18, bottom: 18, left: 18, right: 18 }}
                        >
                            <Animated.View pointerEvents="none" style={[ls.endBtnHoldFill, { width: endFillWidth }]} />
                            <MaterialIcons name="power-settings-new" size={26} color="#fff" />
                            <Text style={ls.pEndBtnTxt}>{endButtonLabel}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <View style={ls.sep} />
            {isLandscape && <BottomBar />}
        </View>
    );
};

// ─── G-Force Ball ────────────────────────────────────────────────────

const GBall: React.FC<{ latG: number; lonG: number; size: number }> = ({ latG, lonG, size }) => {
    const r = size / 2;
    const maxG = 1.5;
    const cx = r + (latG / maxG) * (r - 10);
    const cy = r - (lonG / maxG) * (r - 10);
    return (
        <Svg width={size} height={size}>
            <Circle cx={r} cy={r} r={r - 2} stroke="#333" strokeWidth={1} fill="none" />
            <Circle cx={r} cy={r} r={(r - 2) * 0.66} stroke="#222" strokeWidth={0.5} fill="none" />
            <Circle cx={r} cy={r} r={(r - 2) * 0.33} stroke="#222" strokeWidth={0.5} fill="none" />
            <Line x1={r} y1={2} x2={r} y2={size - 2} stroke="#222" strokeWidth={0.5} />
            <Line x1={2} y1={r} x2={size - 2} y2={r} stroke="#222" strokeWidth={0.5} />
            <SvgText x={r} y={12} fill="#444" fontSize={8} textAnchor="middle" fontWeight="bold">ACCEL</SvgText>
            <SvgText x={r} y={size - 4} fill="#444" fontSize={8} textAnchor="middle" fontWeight="bold">BRAKE</SvgText>
            <Circle cx={cx} cy={cy} r={8} fill="#00E676" opacity={0.85} />
            <Circle cx={cx} cy={cy} r={4} fill="#fff" />
        </Svg>
    );
};

const StatusDot: React.FC<{ label: string; on: boolean }> = ({ label, on }) => (
    <View style={st.statusDot}>
        <View style={[st.statusCircle, { backgroundColor: on ? '#00E676' : '#555' }]} />
        <Text style={[st.statusLbl, { color: on ? '#00E676' : '#555' }]}>{label}</Text>
    </View>
);

const CalibrationStep: React.FC<{
    number: string;
    title: string;
    description: string;
}> = ({ number, title, description }) => (
    <View style={st.calStepRow}>
        <View style={st.calStepNumber}>
            <Text style={st.calStepNumberText}>{number}</Text>
        </View>
        <View style={st.calStepCopy}>
            <Text style={st.calStepTitle}>{title}</Text>
            <Text style={st.calStepDesc}>{description}</Text>
        </View>
    </View>
);

const TelCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={st.telCell}>
        <Text style={st.telCellLbl}>{label}</Text>
        <Text style={st.telCellVal}>{value}</Text>
    </View>
);

const TrackPickerModal: React.FC<{ visible: boolean; onClose: () => void; onSelect: (t: Track) => void }> = ({ visible, onClose, onSelect }) => (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={st.modalRoot}>
            <View style={st.modalHead}>
                <TouchableOpacity onPress={onClose}><MaterialIcons name="close" size={24} color="#888" /></TouchableOpacity>
                <Text style={st.modalTitle}>SELECT TRACK</Text>
                <View style={{ width: 24 }} />
            </View>
            <FlatList data={getAllTracks()} keyExtractor={t => t.id} contentContainerStyle={{ padding: 15 }}
                renderItem={({ item }) => (
                    <TouchableOpacity style={st.pickCard} onPress={() => onSelect(item)} activeOpacity={0.7}>
                        <View style={{ flex: 1 }}>
                            <Text style={st.pickName}>{item.name}</Text>
                            <Text style={st.pickSub}>{item.country}  ·  {(item.length / 1000).toFixed(2)} km</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color="#FFC107" />
                    </TouchableOpacity>
                )}
            />
        </View>
    </Modal>
);

const BluetoothModal: React.FC<{
    visible: boolean; onClose: () => void; connected: boolean;
    scanning: boolean; devices: OBDDevice[];
    onScan: () => void; onConnect: (d: OBDDevice) => void;
    onWifi: () => void; onDisconnect: () => void;
    obdState: OBDConnectionState; obdData: OBDData | null;
}> = ({ visible, onClose, connected, scanning, devices, onScan, onConnect, onWifi, onDisconnect, obdState, obdData }) => (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={st.modalRoot}>
            <View style={st.modalHead}>
                <TouchableOpacity onPress={onClose}><MaterialIcons name="close" size={24} color="#888" /></TouchableOpacity>
                <Text style={st.modalTitle}>OBD2 CONNECTION</Text>
                <View style={{ width: 24 }} />
            </View>
            <ScrollView style={{ padding: 20 }}>
                {/* Status */}
                <View style={st.btStatus}>
                    <MaterialIcons name={connected ? 'bluetooth-connected' : 'bluetooth'} size={40} color={connected ? '#00E676' : '#555'} />
                    <Text style={[st.btStatusTxt, { color: connected ? '#00E676' : '#888' }]}>
                        {obdState === 'connected' ? 'CONNECTED' : obdState === 'connecting' ? 'CONNECTING…' : 'NOT CONNECTED'}
                    </Text>
                    {obdState === 'connected' && obdData && (
                        <View style={{ marginTop: 12, alignItems: 'center' }}>
                            <Text style={{ color: '#FFC107', fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>LIVE DATA</Text>
                            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', fontFamily: 'monospace', marginTop: 4 }}>
                                {obdData.rpm ?? '—'} RPM  ·  {obdData.speed ?? '—'} km/h
                            </Text>
                            <Text style={{ color: '#888', fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                                Throttle {obdData.throttle?.toFixed(0) ?? '—'}%  ·  Load {obdData.engineLoad?.toFixed(0) ?? '—'}%  ·  {obdData.coolantTemp ?? '—'}°C
                            </Text>
                        </View>
                    )}
                </View>

                {connected ? (
                    <TouchableOpacity style={[st.btScanBtn, { backgroundColor: '#FF1744', marginBottom: 16 }]} onPress={onDisconnect}>
                        <MaterialIcons name="link-off" size={20} color="#fff" />
                        <Text style={[st.btScanTxt, { color: '#fff' }]}>DISCONNECT</Text>
                    </TouchableOpacity>
                ) : (
                    <>
                        {/* BLE Scan */}
                        <Text style={{ color: '#FFC107', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 8 }}>BLUETOOTH</Text>
                        <TouchableOpacity style={[st.btScanBtn, scanning && { opacity: 0.5 }]} onPress={onScan} disabled={scanning}>
                            <MaterialIcons name="bluetooth-searching" size={20} color="#000" />
                            <Text style={st.btScanTxt}>{scanning ? 'SCANNING…' : 'SCAN FOR ADAPTERS'}</Text>
                        </TouchableOpacity>
                        {devices.map(d => (
                            <TouchableOpacity key={d.id} style={st.btDev} onPress={() => onConnect(d)}>
                                <MaterialIcons name="bluetooth" size={24} color="#2196F3" />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={st.btDevName}>{d.name}</Text>
                                    <Text style={st.btDevSig}>{d.rssi} dBm</Text>
                                </View>
                                <Text style={st.btConnLabel}>CONNECT</Text>
                            </TouchableOpacity>
                        ))}

                        {/* WiFi */}
                        <Text style={{ color: '#FFC107', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 24, marginBottom: 8 }}>WIFI</Text>
                        <TouchableOpacity style={[st.btScanBtn, { backgroundColor: '#333' }]} onPress={onWifi}>
                            <MaterialIcons name="wifi" size={20} color="#fff" />
                            <Text style={[st.btScanTxt, { color: '#fff' }]}>CONNECT VIA WIFI</Text>
                        </TouchableOpacity>
                        <Text style={{ color: '#555', fontSize: 11, textAlign: 'center', marginTop: 8 }}>
                            WiFi adapters: connect your phone to the adapter's WiFi first
                        </Text>
                    </>
                )}
            </ScrollView>
        </View>
    </Modal>
);

const StartCalibrationModal: React.FC<{
    visible: boolean;
    trackName: string;
    onCancel: () => void;
    onStart: () => void;
}> = ({ visible, trackName, onCancel, onStart }) => (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
        <View style={st.modalRoot}>
            <View style={st.modalHead}>
                <TouchableOpacity onPress={onCancel}>
                    <MaterialIcons name="close" size={24} color="#888" />
                </TouchableOpacity>
                <Text style={st.modalTitle}>START SESSION CALIBRATION</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={st.startCalContent}>
                <Text style={st.startCalLead}>
                    Before recording starts, RaceBuddy needs the phone mounted in the exact driving position so lateral and braking G stay consistent.
                </Text>

                <View style={st.startCalTrackPill}>
                    <MaterialIcons name="flag" size={16} color="#000" />
                    <Text style={st.startCalTrackText}>{trackName}</Text>
                </View>

                <MountIllustrationSmall />

                <View style={st.startCalChecklist}>
                    <CalibrationStep
                        number="1"
                        title="Mount the phone first"
                        description="Clip or suction the phone into the holder before starting the session."
                    />
                    <CalibrationStep
                        number="2"
                        title="Match the final angle"
                        description="Screen facing the driver, same tilt and rotation you will use on track."
                    />
                    <CalibrationStep
                        number="3"
                        title="Keep the car still"
                        description="Tap start only when the car is stationary so the motion baseline is captured cleanly."
                    />
                </View>

                <View style={st.startCalWarning}>
                    <MaterialIcons name="warning-amber" size={18} color="#FFC107" />
                    <Text style={st.startCalWarningText}>
                        If you move the phone or change the mount later, accel / brake values will drift. Re-run calibration after any mount change.
                    </Text>
                </View>

                <View style={st.startCalActions}>
                    <TouchableOpacity style={[st.startCalBtn, st.startCalBtnSecondary]} onPress={onCancel}>
                        <Text style={st.startCalBtnSecondaryText}>BACK</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={st.startCalBtn} onPress={onStart}>
                        <MaterialIcons name="sports-motorsports" size={18} color="#000" />
                        <Text style={st.startCalBtnText}>CALIBRATE & START</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    </Modal>
);

const MountIllustrationSmall: React.FC = () => (
    <View style={st.startCalIllustration}>
        <Svg width="100%" height={180} viewBox="0 0 340 180">
            <Rect x={14} y={98} width={312} height={58} rx={16} fill="#101010" stroke="#2A2A2A" strokeWidth={2} />
            <Rect x={44} y={76} width={252} height={46} rx={10} fill="#171717" stroke="#FFC107" strokeWidth={2.5} />
            <Rect x={123} y={62} width={94} height={70} rx={10} fill="#111" stroke="#666" strokeWidth={1.5} />
            <Rect x={131} y={69} width={78} height={48} rx={4} fill="#000" stroke="#333" strokeWidth={1} />
            <Circle cx={170} cy={94} r={10} fill="#00E676" opacity={0.9} />
            <Path d="M170 18 L170 48" stroke="#FFC107" strokeWidth={3} strokeLinecap="round" />
            <Path d="M158 30 L170 18 L182 30" fill="none" stroke="#FFC107" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            <Line x1={170} y1={144} x2={170} y2={166} stroke="#00E676" strokeWidth={3} strokeLinecap="round" />
            <Path d="M160 156 L170 166 L180 156" fill="none" stroke="#00E676" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            <SvgText x={170} y={14} fill="#FFC107" fontSize={12} fontWeight="900" textAnchor="middle">SCREEN FACES DRIVER</SvgText>
            <SvgText x={170} y={176} fill="#00E676" fontSize={11} fontWeight="900" textAnchor="middle">MOUNTED POSITION = CALIBRATION POSITION</SvgText>
        </Svg>
    </View>
);

// ─── Styles ──────────────────────────────────────────────────────────

const st = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    topBar: { flexDirection: 'row', justifyContent: 'center', gap: 30, paddingTop: 8, paddingBottom: 6 },
    statusDot: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    statusCircle: { width: 8, height: 8, borderRadius: 4 },
    statusLbl: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },

    idleCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    idleSpeedVal: { color: '#fff', fontSize: 96, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false },
    idleSpeedUnit: { color: '#555', fontSize: 16, fontWeight: '800', letterSpacing: 2, marginTop: -5, marginBottom: 20 },
    startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#FFC107', marginHorizontal: 40, paddingVertical: 18, borderRadius: 8, marginBottom: 20 },
    startBtnText: { color: '#000', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
    autoLapBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'center', backgroundColor: '#111', borderWidth: 1, borderColor: '#1f1f1f', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 16 },
    autoLapBadgeText: { color: '#00E676', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    lastCard: { backgroundColor: '#111', marginHorizontal: 20, borderRadius: 8, padding: 16, marginBottom: 20 },
    lastTitle: { color: '#FFC107', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
    lastTrack: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 4 },
    lastInfo: { color: '#888', fontSize: 13 },

    driveTopRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4 },
    recRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF1744' },
    recLabel: { color: '#FF1744', fontSize: 11, fontWeight: '900' },
    driveTrackName: { flex: 1, color: '#888', fontSize: 12, fontWeight: '700', textAlign: 'center', letterSpacing: 0.5 },
    miniStatus: { flexDirection: 'row', gap: 4 },
    miniDot: { width: 6, height: 6, borderRadius: 3 },

    /* ── Catalyst live-view layout ─────────────────────────── */

    catalystTopRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingTop: 2, paddingBottom: 6 },
    catalystTopCell: { flex: 1 },
    catalystSmallLabel: { color: '#888', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
    catalystTopVal: { color: '#fff', fontSize: 28, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false, marginTop: 2 },
    catalystTrackCenter: { alignItems: 'center', paddingHorizontal: 4 },
    catalystTrackTxt: { color: '#666', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 4, maxWidth: 120, textAlign: 'center' },

    catalystSep: { height: 1, backgroundColor: '#222', marginHorizontal: 10 },

    catalystDeltaWrap: { alignItems: 'center', paddingVertical: 10 },
    catalystDeltaLabel: { color: '#888', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 2 },
    catalystDeltaVal: { fontSize: 54, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false, lineHeight: 58 },

    catalystMapWrap: { flex: 1, marginHorizontal: 10, borderRadius: 8, overflow: 'hidden', minHeight: 130, position: 'relative', backgroundColor: '#111' },
    catalystMapSpeed: { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'baseline', gap: 3 },
    catalystMapSpeedVal: { color: '#fff', fontSize: 26, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false },
    catalystMapSpeedUnit: { color: '#666', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
    catalystMapGBall: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 34, padding: 2 },

    catalystLapTimerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },
    catalystSectorDots: { flexDirection: 'row', gap: 5, marginRight: 10 },
    catalystLapTimerLabel: { color: '#FFC107', fontSize: 12, fontWeight: '900', letterSpacing: 1, marginRight: 10 },
    catalystLapTimerVal: { color: '#fff', fontSize: 30, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false },

    catalystBottomRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 },
    catalystEndBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#111', borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
    catalystEndLabel: { color: '#FF1744', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
    catalystTotalWrap: { flex: 1, alignItems: 'center' },
    catalystTotalVal: { color: '#fff', fontSize: 28, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false, marginTop: 2 },
    catalystLapCountBtn: { alignItems: 'center', backgroundColor: '#111', borderWidth: 1, borderColor: '#FFC107', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6, minWidth: 60 },
    catalystLapCountVal: { color: '#FFC107', fontSize: 26, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false },
    catalystLapCountLabel: { color: '#FFC107', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: -2 },

    sectorDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#333', backgroundColor: 'transparent' },
    sectorDotActive: { borderColor: '#FFC107', backgroundColor: '#FFC107' },
    sectorDotDone: { borderColor: '#00E676', backgroundColor: '#00E676' },

    telStrip: { flexDirection: 'row', backgroundColor: '#111', marginHorizontal: 10, borderRadius: 6, paddingVertical: 10, marginTop: 6 },
    telCell: { flex: 1, alignItems: 'center' },
    telCellLbl: { color: '#444', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
    telCellVal: { color: '#fff', fontSize: 20, fontWeight: '900', fontFamily: 'monospace' },
    telDiv: { width: 1, backgroundColor: '#222' },

    liveMapLabel: { position: 'absolute', top: 6, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
    liveMapLabelTxt: { color: '#00E676', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },

    recentLaps: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 6, paddingHorizontal: 10 },
    recentLapItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    recentLapNum: { color: '#555', fontSize: 11, fontWeight: '700' },
    recentLapTime: { color: '#ccc', fontSize: 13, fontWeight: '800', fontFamily: 'monospace' },

    modalRoot: { flex: 1, backgroundColor: '#000' },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#222' },
    modalTitle: { color: '#FFC107', fontSize: 16, fontWeight: '900', letterSpacing: 1, flex: 1, textAlign: 'center' },
    pickCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 8, padding: 18, marginBottom: 8, borderWidth: 1, borderColor: '#222' },
    pickName: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 4 },
    pickSub: { color: '#888', fontSize: 12 },
    btStatus: { alignItems: 'center', backgroundColor: '#111', borderRadius: 12, padding: 30, marginBottom: 20 },
    btStatusTxt: { fontSize: 14, fontWeight: '900', letterSpacing: 1, marginTop: 10 },
    btScanBtn: { backgroundColor: '#FFC107', borderRadius: 8, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    btScanTxt: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
    btDev: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 8, padding: 16, marginTop: 10, borderWidth: 1, borderColor: '#222' },
    btDevName: { color: '#fff', fontSize: 15, fontWeight: '700' },
    btDevSig: { color: '#888', fontSize: 11 },
    btConnLabel: { color: '#00E676', fontSize: 12, fontWeight: '900' },

    startCalContent: { padding: 18, paddingBottom: 40 },
    startCalLead: { color: '#E6E6E6', fontSize: 14, lineHeight: 20, fontWeight: '700', marginBottom: 14 },
    startCalTrackPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, backgroundColor: '#FFC107', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 16 },
    startCalTrackText: { color: '#000', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
    startCalIllustration: { backgroundColor: '#0B0B0B', borderRadius: 12, borderWidth: 1, borderColor: '#202020', padding: 10, marginBottom: 18 },
    startCalChecklist: { gap: 12, marginBottom: 16 },
    startCalWarning: { flexDirection: 'row', gap: 10, backgroundColor: '#1A1403', borderRadius: 12, borderWidth: 1, borderColor: '#3A2A00', padding: 14, marginBottom: 18 },
    startCalWarningText: { flex: 1, color: '#FFD54F', fontSize: 12, lineHeight: 18, fontWeight: '600' },
    startCalActions: { flexDirection: 'row', gap: 10 },
    startCalBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFC107', borderRadius: 10, paddingVertical: 14 },
    startCalBtnText: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
    startCalBtnSecondary: { backgroundColor: '#151515', borderWidth: 1, borderColor: '#333' },
    startCalBtnSecondaryText: { color: '#E6E6E6', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
    calStepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#111', borderWidth: 1, borderColor: '#232323', borderRadius: 12, padding: 14 },
    calStepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFC107', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    calStepNumberText: { color: '#000', fontSize: 13, fontWeight: '900' },
    calStepCopy: { flex: 1 },
    calStepTitle: { color: '#fff', fontSize: 14, fontWeight: '900', marginBottom: 4 },
    calStepDesc: { color: '#A8A8A8', fontSize: 12, lineHeight: 17, fontWeight: '600' },
});

// ─── Landscape live-session styles ───────────────────────────────────

const ls = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },

    /* Top bar */
    topBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
    topCell: { flex: 1 },
    topLabel: { color: '#888', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
    topVal: { color: '#fff', fontSize: 24, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false, marginTop: 1 },
    topCenter: { alignItems: 'center', paddingHorizontal: 8 },
    recRow: { flexDirection: 'row', alignItems: 'center' },
    recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF1744' },
    recTxt: { color: '#FF1744', fontSize: 10, fontWeight: '900', marginLeft: 4 },
    trackTxt: { color: '#555', fontSize: 9, fontWeight: '700', maxWidth: 160 },
    statusDots: { flexDirection: 'row', gap: 4, marginTop: 3 },
    sDot: { width: 5, height: 5, borderRadius: 3 },

    sep: { height: 1, backgroundColor: '#222', marginHorizontal: 10 },
    vSep: { width: 1, backgroundColor: '#222', marginVertical: 6 },

    /* Main body — 3 columns */
    body: { flex: 1, flexDirection: 'row', paddingHorizontal: 10 },

    sideCol: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
    speedVal: { color: '#fff', fontSize: 52, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false, lineHeight: 54 },
    speedUnit: { color: '#444', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginTop: -2 },

    obdMini: { alignItems: 'center', marginTop: 8 },
    obdMiniLabel: { color: '#444', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
    obdMiniVal: { color: '#fff', fontSize: 18, fontWeight: '900', fontFamily: 'monospace' },

    centerCol: { flex: 2, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
    deltaLabel: { color: '#888', fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 0 },
    deltaVal: { fontSize: 60, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false, lineHeight: 64 },

    sectorRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
    sectorDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#333', backgroundColor: 'transparent' },
    sectorDotActive: { borderColor: '#FFC107', backgroundColor: '#FFC107' },
    sectorDotDone: { borderColor: '#00E676', backgroundColor: '#00E676' },

    lapTimerWrap: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6, gap: 8 },
    lapTimerLabel: { color: '#FFC107', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    lapTimerVal: { color: '#fff', fontSize: 28, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false },

    recentRow: { flexDirection: 'row', gap: 14, marginTop: 6 },
    recentItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    recentNum: { color: '#555', fontSize: 10, fontWeight: '700' },
    recentTime: { color: '#aaa', fontSize: 12, fontWeight: '800', fontFamily: 'monospace' },

    autoLapPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#1f1f1f', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginRight: 10 },
    autoLapPillText: { color: '#00E676', fontSize: 9, fontWeight: '900', letterSpacing: 1 },

    totalVal: { color: '#fff', fontSize: 26, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false, marginTop: 2 },

    lapBtn: { alignItems: 'center', backgroundColor: '#111', borderWidth: 1, borderColor: '#FFC107', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8, marginTop: 10 },
    lapBtnCount: { color: '#FFC107', fontSize: 24, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false },
    lapBtnLabel: { color: '#FFC107', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: -2 },
    autoLapInline: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', borderWidth: 1, borderColor: '#1f1f1f', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
    autoLapInlineText: { color: '#00E676', fontSize: 9, fontWeight: '900', letterSpacing: 1 },

    /* Bottom bar */
    bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, zIndex: 20 },
    bottomLeft: { flex: 1, alignItems: 'flex-start' },
    endBtn: { minWidth: 148, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#111', borderWidth: 1, borderColor: '#333', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, overflow: 'hidden' },
    endBtnHoldFill: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255, 23, 68, 0.20)' },
    endLabel: { color: '#FF1744', fontSize: 15, fontWeight: '900', letterSpacing: 1 },

    /* ── Portrait-specific styles ── */
    pDeltaWrap: { alignItems: 'center', paddingVertical: 14 },
    pDeltaVal: { fontSize: 52, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false, lineHeight: 56 },
    pSpeedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 10 },
    pSpeedVal: { color: '#fff', fontSize: 72, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false, lineHeight: 74 },
    pLapRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
    pLapTimerVal: { color: '#fff', fontSize: 32, fontWeight: '900', fontFamily: 'monospace', includeFontPadding: false, marginLeft: 'auto' },
    pTotalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 8 },
    pBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, zIndex: 20 },
    pLapBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFC107', paddingVertical: 16, borderRadius: 8 },
    pLapBtnTxt: { color: '#000', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
    pEndBtn: { flex: 0.9, marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FF1744', paddingVertical: 18, borderRadius: 10, overflow: 'hidden' },
    pEndBtnTxt: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
});

export default DashboardScreen;
