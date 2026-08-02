/**
 * RaceBuddy — User Settings Screen
 *
 * Units, display preferences, OBD connection, data management.
 * Pure black Catalyst aesthetic.
 */

import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Switch, Alert, TextInput, Modal, Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Line, Path, Circle, Text as SvgText } from 'react-native-svg';
import { OBDService, OBDConnectionState, OBDDevice } from '../services/OBDService';
import { SensorService } from '../services/SensorService';
import { OBDData, VehicleInfo } from '../types';
import { getSavedSessions } from './DashboardScreen';

// ── Persisted settings (in-memory; swap for AsyncStorage in production) ─
export type SpeedUnit = 'kmh' | 'mph';
export type TempUnit = 'c' | 'f';

interface Settings {
    speedUnit: SpeedUnit;
    tempUnit: TempUnit;
    gForceSmoothing: boolean;
    hapticFeedback: boolean;
    keepScreenOn: boolean;
    showRPM: boolean;
    showThrottle: boolean;
    wifiOBDHost: string;
    wifiOBDPort: string;
    driverName: string;
    carName: string;
}

let _settings: Settings = {
    speedUnit: 'kmh',
    tempUnit: 'c',
    gForceSmoothing: true,
    hapticFeedback: true,
    keepScreenOn: true,
    showRPM: true,
    showThrottle: true,
    wifiOBDHost: '192.168.0.10',
    wifiOBDPort: '35000',
    driverName: '',
    carName: '',
};

export const getSettings = () => _settings;
export const updateSettings = (partial: Partial<Settings>) => {
    _settings = { ..._settings, ...partial };
};

const SettingsScreen: React.FC = () => {
    const [s, setS] = useState<Settings>({ ..._settings });
    const [obdState, setObdState] = useState<OBDConnectionState>('disconnected');
    const [obdMsg, setObdMsg] = useState('');
    const [showBLE, setShowBLE] = useState(false);
    const [showCalibration, setShowCalibration] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [bleDevices, setBleDevices] = useState<OBDDevice[]>([]);
    const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);

    useEffect(() => {
        OBDService.initialize();
        OBDService.onStateChange((state, msg) => { setObdState(state); setObdMsg(msg ?? ''); });
        OBDService.onData((data: OBDData) => {
            if (data.vehicleInfo) {
                setVehicleInfo(data.vehicleInfo);
            }
        });
        const lastData = OBDService.getLastData();
        if (lastData.vehicleInfo) {
            setVehicleInfo(lastData.vehicleInfo);
        }
        return () => { OBDService.onStateChange(() => { }); OBDService.onData(() => { }); };
    }, []);

    const save = (partial: Partial<Settings>) => {
        const next = { ...s, ...partial };
        setS(next);
        updateSettings(partial);
    };

    // ── BLE scan ──────
    const startBleScan = () => {
        setScanning(true);
        setBleDevices([]);
        OBDService.scanBluetooth((d) => {
            setBleDevices(prev => {
                if (prev.find(x => x.id === d.id)) return prev;
                return [...prev, d];
            });
        }, 8000);
        setTimeout(() => setScanning(false), 8500);
    };

    const connectBLE = async (d: OBDDevice) => {
        const ok = await OBDService.connectBluetooth(d.id);
        if (ok) { setShowBLE(false); Alert.alert('Connected', `Connected to ${d.name}`); }
        else Alert.alert('Failed', 'Could not connect. Make sure the adapter is powered on.');
    };

    const connectWifi = async () => {
        const ok = await OBDService.connectWifi(s.wifiOBDHost, parseInt(s.wifiOBDPort));
        if (ok) Alert.alert('Connected', `WiFi OBD at ${s.wifiOBDHost}:${s.wifiOBDPort}`);
        else Alert.alert('Failed', 'Could not connect via WiFi.');
    };

    const disconnectOBD = () => { OBDService.disconnect(); };

    const recalibrateMotion = () => {
        setShowCalibration(true);
    };

    const startCalibration = () => {
        setShowCalibration(false);
        SensorService.calibrate();
        Alert.alert(
            'Calibration started',
            'Keep the phone mounted exactly as it will be during driving. Hold the car still for about 1 second so RaceBuddy can zero the mounted orientation.'
        );
    };

    const clearData = () => {
        Alert.alert('Clear All Data', 'This will delete all sessions and custom tracks. Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete All', style: 'destructive', onPress: () => {
                    Alert.alert('Cleared', 'All data has been cleared.');
                }
            },
        ]);
    };

    const obdConnected = obdState === 'connected';
    const sessions = getSavedSessions();

    useEffect(() => {
        if (!vehicleInfo || !vehicleInfo.manufacturer || s.carName) return;
        const fallbackName = vehicleInfo.model && vehicleInfo.model !== 'Unknown model'
            ? `${vehicleInfo.manufacturer} ${vehicleInfo.model}`
            : vehicleInfo.manufacturer;
        save({ carName: fallbackName });
    }, [vehicleInfo]);

    const insets = useSafeAreaInsets();
    const topPad = insets.top + Dimensions.get('window').height * 0.03;

    return (
        <ScrollView style={[st.root, { paddingTop: topPad }]} contentContainerStyle={{ paddingBottom: 60 }}>
            <View style={st.header}>
                <Text style={st.headerTitle}>SETTINGS</Text>
            </View>

            {/* ── Profile ─────── */}
            <SectionLabel text="PROFILE" />
            <View style={st.card}>
                <InputRow label="DRIVER NAME" value={s.driverName} placeholder="Your name" onChange={v => save({ driverName: v })} />
                <Divider />
                <InputRow label="CAR / VEHICLE" value={s.carName} placeholder="e.g. Porsche 911 GT3" onChange={v => save({ carName: v })} />
            </View>

            {/* ── Units ─────── */}
            <SectionLabel text="UNITS" />
            <View style={st.card}>
                <ToggleRow label="SPEED" options={['KM/H', 'MPH']} selected={s.speedUnit === 'kmh' ? 0 : 1}
                    onSelect={i => save({ speedUnit: i === 0 ? 'kmh' : 'mph' })} />
                <Divider />
                <ToggleRow label="TEMPERATURE" options={['°C', '°F']} selected={s.tempUnit === 'c' ? 0 : 1}
                    onSelect={i => save({ tempUnit: i === 0 ? 'c' : 'f' })} />
            </View>

            {/* ── Display ─────── */}
            <SectionLabel text="DISPLAY" />
            <View style={st.card}>
                <SwitchRow label="G-Force Smoothing" value={s.gForceSmoothing} onChange={v => save({ gForceSmoothing: v })} />
                <Divider />
                <SwitchRow label="Haptic Feedback" value={s.hapticFeedback} onChange={v => save({ hapticFeedback: v })} />
                <Divider />
                <SwitchRow label="Keep Screen On" value={s.keepScreenOn} onChange={v => save({ keepScreenOn: v })} />
                <Divider />
                <SwitchRow label="Show RPM (OBD)" value={s.showRPM} onChange={v => save({ showRPM: v })} />
                <Divider />
                <SwitchRow label="Show Throttle (OBD)" value={s.showThrottle} onChange={v => save({ showThrottle: v })} />
                <Divider />
                <TouchableOpacity style={st.calibrateBtn} onPress={recalibrateMotion} activeOpacity={0.7}>
                    <MaterialIcons name="tune" size={18} color="#000" />
                    <View style={{ flex: 1 }}>
                        <Text style={st.calibrateBtnTxt}>RECALIBRATE ACCEL / BRAKE</Text>
                        <Text style={st.calibrateHint}>Re-zero the phone orientation and g-force baseline</Text>
                    </View>
                </TouchableOpacity>
            </View>

            {/* ── OBD2 Connection ─────── */}
            <SectionLabel text="OBD2 CONNECTION" />
            <View style={st.card}>
                <View style={st.obdStatus}>
                    <MaterialIcons
                        name={obdConnected ? 'bluetooth-connected' : 'bluetooth-disabled'}
                        size={32}
                        color={obdConnected ? '#00E676' : '#555'}
                    />
                    <View style={{ flex: 1, marginLeft: 14 }}>
                        <Text style={[st.obdStateTxt, { color: obdConnected ? '#00E676' : '#888' }]}>
                            {obdState.toUpperCase()}
                        </Text>
                        {obdMsg ? <Text style={st.obdMsg}>{obdMsg}</Text> : null}
                    </View>
                    {obdConnected && (
                        <TouchableOpacity onPress={disconnectOBD}>
                            <Text style={st.disconnectTxt}>DISCONNECT</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {(vehicleInfo || obdConnected) && (
                    <View style={st.vehicleCard}>
                        <Text style={st.vehicleTitle}>VEHICLE IDENTITY</Text>
                        {vehicleInfo?.vin ? <Text style={st.vehicleText}>VIN: {vehicleInfo.vin}</Text> : null}
                        <Text style={st.vehicleText}>Manufacturer: {vehicleInfo?.manufacturer ?? 'Unknown'}</Text>
                        <Text style={st.vehicleText}>Model: {vehicleInfo?.model ?? 'Unknown'}</Text>
                        <Text style={st.vehicleText}>Year: {vehicleInfo?.year ?? 'Unknown'}</Text>
                        <Text style={st.vehicleText}>Plant: {vehicleInfo?.plant ?? 'Unknown'}</Text>
                    </View>
                )}

                {!obdConnected && (
                    <>
                        <Divider />
                        <Text style={st.obdSectionLbl}>BLUETOOTH</Text>
                        <TouchableOpacity style={st.obdBtn} onPress={() => setShowBLE(true)} activeOpacity={0.7}>
                            <MaterialIcons name="bluetooth-searching" size={18} color="#000" />
                            <Text style={st.obdBtnTxt}>SCAN BLE DEVICES</Text>
                        </TouchableOpacity>

                        <Divider />
                        <Text style={st.obdSectionLbl}>WIFI (ELM327)</Text>
                        <View style={st.wifiRow}>
                            <View style={{ flex: 2 }}>
                                <Text style={st.wifiLbl}>HOST</Text>
                                <TextInput style={st.wifiInput} value={s.wifiOBDHost}
                                    onChangeText={v => save({ wifiOBDHost: v })} placeholderTextColor="#444"
                                    keyboardType="numeric" />
                            </View>
                            <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={st.wifiLbl}>PORT</Text>
                                <TextInput style={st.wifiInput} value={s.wifiOBDPort}
                                    onChangeText={v => save({ wifiOBDPort: v })} placeholderTextColor="#444"
                                    keyboardType="numeric" />
                            </View>
                        </View>
                        <TouchableOpacity style={[st.obdBtn, { backgroundColor: '#2196F3' }]} onPress={connectWifi} activeOpacity={0.7}>
                            <MaterialIcons name="wifi" size={18} color="#fff" />
                            <Text style={[st.obdBtnTxt, { color: '#fff' }]}>CONNECT WiFi</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>

            {/* ── Data ─────── */}
            <SectionLabel text="DATA" />
            <View style={st.card}>
                <View style={st.dataRow}>
                    <Text style={st.dataLabel}>Sessions</Text>
                    <Text style={st.dataVal}>{sessions.length}</Text>
                </View>
                <Divider />
                <TouchableOpacity style={st.dangerBtn} onPress={clearData}>
                    <MaterialIcons name="delete-forever" size={20} color="#FF1744" />
                    <Text style={st.dangerTxt}>CLEAR ALL DATA</Text>
                </TouchableOpacity>
            </View>

            {/* ── About ─────── */}
            <SectionLabel text="ABOUT" />
            <View style={st.card}>
                <View style={st.dataRow}>
                    <Text style={st.dataLabel}>Version</Text>
                    <Text style={st.dataVal}>1.0.0</Text>
                </View>
                <Divider />
                <View style={st.dataRow}>
                    <Text style={st.dataLabel}>Engine</Text>
                    <Text style={st.dataVal}>Ideal Lap v2</Text>
                </View>
            </View>

            {/* ═══ BLE Scan Modal ═══ */}
            <Modal visible={showBLE} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { OBDService.stopScan(); setShowBLE(false); }}>
                <View style={st.modalRoot}>
                    <View style={st.modalHead}>
                        <TouchableOpacity onPress={() => { OBDService.stopScan(); setShowBLE(false); }}>
                            <MaterialIcons name="close" size={24} color="#888" />
                        </TouchableOpacity>
                        <Text style={st.modalTitle}>BLUETOOTH OBD2</Text>
                        <View style={{ width: 24 }} />
                    </View>
                    <View style={{ padding: 20 }}>
                        <TouchableOpacity style={[st.obdBtn, scanning && { opacity: 0.5 }]} onPress={startBleScan} disabled={scanning}>
                            <MaterialIcons name="bluetooth-searching" size={18} color="#000" />
                            <Text style={st.obdBtnTxt}>{scanning ? 'SCANNING…' : 'SCAN FOR DEVICES'}</Text>
                        </TouchableOpacity>

                        {bleDevices.length === 0 && !scanning && (
                            <Text style={st.scanHint}>Tap Scan to search for OBD2 adapters.{'\n'}Make sure your adapter is powered on.</Text>
                        )}
                        {scanning && bleDevices.length === 0 && (
                            <Text style={st.scanHint}>Searching for OBD2 adapters…</Text>
                        )}

                        {bleDevices.map(d => (
                            <TouchableOpacity key={d.id} style={st.bleDevice} onPress={() => connectBLE(d)} activeOpacity={0.7}>
                                <MaterialIcons name="bluetooth" size={24} color="#2196F3" />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={st.bleDevName}>{d.name}</Text>
                                    <Text style={st.bleDevRssi}>{d.rssi} dBm</Text>
                                </View>
                                <Text style={st.bleConnTxt}>CONNECT</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </Modal>

            {/* ── Motion Calibration Modal ─────── */}
            <Modal visible={showCalibration} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCalibration(false)}>
                <View style={st.modalRoot}>
                    <View style={st.modalHead}>
                        <TouchableOpacity onPress={() => setShowCalibration(false)}>
                            <MaterialIcons name="close" size={24} color="#888" />
                        </TouchableOpacity>
                        <Text style={st.modalTitle}>PHONE MOUNT CALIBRATION</Text>
                        <View style={{ width: 24 }} />
                    </View>

                    <ScrollView contentContainerStyle={st.calibrationContent}>
                        <Text style={st.calibrationLead}>
                            Place the phone in the exact mounted position you will use while driving.
                        </Text>
                        <MountIllustration />

                        <View style={st.calibrationSteps}>
                            <CalibrationStep
                                number="1"
                                title="Mount it first"
                                description="Clip the phone into the holder before calibrating. The screen should face the driver, exactly like it will on track."
                            />
                            <CalibrationStep
                                number="2"
                                title="Match the real driving angle"
                                description="Do not hold the phone in your hand. Angle and tilt must match the final mount position, otherwise brake and lateral G can drift."
                            />
                            <CalibrationStep
                                number="3"
                                title="Stay still for one second"
                                description="Once you tap start, keep the car stationary so RaceBuddy can zero the baseline cleanly."
                            />
                        </View>

                        <View style={st.calibrationNote}>
                            <MaterialIcons name="info-outline" size={18} color="#FFC107" />
                            <Text style={st.calibrationNoteText}>
                                If the phone is rotated differently later, accel and brake will drift. Re-run this calibration after changing the mount.
                            </Text>
                        </View>

                        <View style={st.calibrationActions}>
                            <TouchableOpacity style={[st.calibrationBtn, st.calibrationBtnSecondary]} onPress={() => setShowCalibration(false)}>
                                <Text style={st.calibrationBtnSecondaryText}>CANCEL</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={st.calibrationBtn} onPress={startCalibration}>
                                <MaterialIcons name="sports-motorsports" size={18} color="#000" />
                                <Text style={st.calibrationBtnText}>START CALIBRATION</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </View>
            </Modal>
        </ScrollView>
    );
};

// ─── Sub-components ──────────────────────────────────────────────────

const SectionLabel: React.FC<{ text: string }> = ({ text }) => (
    <Text style={st.sectionLabel}>{text}</Text>
);

const Divider: React.FC = () => <View style={st.divider} />;

const SwitchRow: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, value, onChange }) => (
    <View style={st.switchRow}>
        <Text style={st.switchLabel}>{label}</Text>
        <Switch
            value={value}
            onValueChange={onChange}
            trackColor={{ false: '#333', true: 'rgba(255,193,7,0.4)' }}
            thumbColor={value ? '#FFC107' : '#666'}
        />
    </View>
);

const ToggleRow: React.FC<{ label: string; options: string[]; selected: number; onSelect: (i: number) => void }> = ({ label, options, selected, onSelect }) => (
    <View style={st.toggleRow}>
        <Text style={st.switchLabel}>{label}</Text>
        <View style={st.toggleGroup}>
            {options.map((opt, i) => (
                <TouchableOpacity
                    key={i}
                    style={[st.toggleBtn, i === selected && st.toggleBtnActive]}
                    onPress={() => onSelect(i)}
                >
                    <Text style={[st.toggleBtnText, i === selected && st.toggleBtnTextActive]}>{opt}</Text>
                </TouchableOpacity>
            ))}
        </View>
    </View>
);

const InputRow: React.FC<{ label: string; value: string; placeholder: string; onChange: (v: string) => void }> = ({ label, value, placeholder, onChange }) => (
    <View style={st.inputRow}>
        <Text style={st.inputLabel}>{label}</Text>
        <TextInput style={st.inputField} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#444" />
    </View>
);

const CalibrationStep: React.FC<{ number: string; title: string; description: string }> = ({ number, title, description }) => (
    <View style={st.stepRow}>
        <View style={st.stepBadge}>
            <Text style={st.stepBadgeText}>{number}</Text>
        </View>
        <View style={{ flex: 1 }}>
            <Text style={st.stepTitle}>{title}</Text>
            <Text style={st.stepText}>{description}</Text>
        </View>
    </View>
);

const MountIllustration: React.FC = () => (
    <View style={st.illustrationWrap}>
        <Svg width="100%" height={230} viewBox="0 0 340 230">
            <Rect x={10} y={120} width={320} height={80} rx={18} fill="#101010" stroke="#2A2A2A" strokeWidth={2} />
            <Rect x={38} y={98} width={264} height={58} rx={10} fill="#171717" stroke="#FFC107" strokeWidth={2.5} />
            <Rect x={116} y={84} width={108} height={84} rx={10} fill="#111" stroke="#666" strokeWidth={1.5} />
            <Rect x={126} y={92} width={88} height={58} rx={4} fill="#000" stroke="#333" strokeWidth={1} />
            <Circle cx={170} cy={117} r={13} fill="#00E676" opacity={0.9} />
            <Path d="M170 24 L170 66" stroke="#FFC107" strokeWidth={3} strokeLinecap="round" />
            <Path d="M155 42 L170 24 L185 42" fill="none" stroke="#FFC107" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M80 174 L54 174" stroke="#666" strokeWidth={3} strokeLinecap="round" />
            <Path d="M260 174 L286 174" stroke="#666" strokeWidth={3} strokeLinecap="round" />
            <Line x1={170} y1={188} x2={170} y2={214} stroke="#00E676" strokeWidth={3} strokeLinecap="round" />
            <Path d="M154 202 L170 214 L186 202" fill="none" stroke="#00E676" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            <SvgText x={170} y={18} fill="#FFC107" fontSize={13} fontWeight="900" textAnchor="middle">SCREEN FACES DRIVER</SvgText>
            <SvgText x={170} y={226} fill="#00E676" fontSize={12} fontWeight="900" textAnchor="middle">PHONE MUST STAY STILL FOR CALIBRATION</SvgText>
            <SvgText x={56} y={166} fill="#888" fontSize={10} fontWeight="800">MOUNT</SvgText>
            <SvgText x={236} y={166} fill="#888" fontSize={10} fontWeight="800">DASH / WINDSHIELD</SvgText>
        </Svg>
    </View>
);

// ─── Styles ──────────────────────────────────────────────────────────

const st = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    headerTitle: { color: '#FFC107', fontSize: 20, fontWeight: '900', letterSpacing: 2 },

    sectionLabel: { color: '#666', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 20, marginBottom: 8, marginLeft: 16 },

    card: { backgroundColor: '#111', marginHorizontal: 12, borderRadius: 10, padding: 16, borderWidth: 1, borderColor: '#1a1a1a' },
    divider: { height: 1, backgroundColor: '#1a1a1a', marginVertical: 12 },

    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    switchLabel: { color: '#ddd', fontSize: 14, fontWeight: '600' },

    toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    toggleGroup: { flexDirection: 'row', borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#333' },
    toggleBtn: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#222' },
    toggleBtnActive: { backgroundColor: '#FFC107' },
    toggleBtnText: { color: '#888', fontSize: 12, fontWeight: '800' },
    toggleBtnTextActive: { color: '#000', fontSize: 12, fontWeight: '900' },

    inputRow: {},
    inputLabel: { color: '#666', fontSize: 10, fontWeight: '900', letterSpacing: 0.5, marginBottom: 6 },
    inputField: { color: '#fff', fontSize: 15, fontWeight: '600', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#222' },

    obdStatus: { flexDirection: 'row', alignItems: 'center' },
    obdStateTxt: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
    obdMsg: { color: '#555', fontSize: 11, marginTop: 2 },
    disconnectTxt: { color: '#FF1744', fontSize: 12, fontWeight: '900' },

    obdSectionLbl: { color: '#FFC107', fontSize: 10, fontWeight: '900', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
    obdBtn: { backgroundColor: '#FFC107', borderRadius: 8, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 },
    obdBtnTxt: { color: '#000', fontSize: 13, fontWeight: '900' },
    vehicleCard: { backgroundColor: '#0d0d0d', borderRadius: 8, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#222' },
    vehicleTitle: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
    vehicleText: { color: '#aaa', fontSize: 12, marginBottom: 4 },

    calibrateBtn: { backgroundColor: '#FFC107', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
    calibrateBtnTxt: { color: '#000', fontSize: 13, fontWeight: '900', letterSpacing: 0.2 },
    calibrateHint: { color: '#333', fontSize: 11, marginTop: 2, lineHeight: 14 },

    wifiRow: { flexDirection: 'row', marginBottom: 10 },
    wifiLbl: { color: '#666', fontSize: 9, fontWeight: '900', letterSpacing: 0.5, marginBottom: 4 },
    wifiInput: { backgroundColor: '#1a1a1a', borderRadius: 6, color: '#fff', fontSize: 14, fontFamily: 'monospace', paddingHorizontal: 10, paddingVertical: 8 },

    dataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dataLabel: { color: '#ddd', fontSize: 14, fontWeight: '600' },
    dataVal: { color: '#FFC107', fontSize: 14, fontWeight: '900', fontFamily: 'monospace' },

    dangerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 6, borderWidth: 1, borderColor: '#FF1744' },
    dangerTxt: { color: '#FF1744', fontSize: 13, fontWeight: '900' },

    scanHint: { color: '#555', fontSize: 13, textAlign: 'center', marginTop: 30, lineHeight: 20 },

    // Modal
    modalRoot: { flex: 1, backgroundColor: '#000' },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#222' },
    modalTitle: { color: '#FFC107', fontSize: 16, fontWeight: '900', letterSpacing: 1, flex: 1, textAlign: 'center' },

    bleDevice: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 8, padding: 16, marginTop: 10, borderWidth: 1, borderColor: '#222' },
    bleDevName: { color: '#fff', fontSize: 15, fontWeight: '700' },
    bleDevRssi: { color: '#888', fontSize: 11 },
    bleConnTxt: { color: '#00E676', fontSize: 12, fontWeight: '900' },
});

export default SettingsScreen;
