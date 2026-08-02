/**
 * RaceBuddy — Garmin Catalyst–style TRACKS screen
 *
 * Track selection, custom track creation via GPS recording OR
 * drawing on an interactive map. Pure black Catalyst aesthetic.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, Modal, Alert, Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, MapPressEvent, PROVIDER_DEFAULT } from 'react-native-maps';
import { Track, TrackPoint, Location } from '../types';
import { LocationService } from '../services/LocationService';
import { getAllTracks, addCustomTrack, deleteCustomTrack, onStoreChange, updateCustomTrack } from './DashboardScreen';

const { width: W } = Dimensions.get('window');

const TracksScreen: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [, forceUpdate] = useState(0);

    // Create modal
    const [showCreate, setShowCreate] = useState(false);
    const [createMode, setCreateMode] = useState<'gps' | 'draw'>('draw');
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newCountry, setNewCountry] = useState('Custom');
    const [editingTrackId, setEditingTrackId] = useState<string | null>(null);

    // GPS recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recordedPts, setRecordedPts] = useState<Location[]>([]);
    const [trackLen, setTrackLen] = useState(0);

    // Map drawing state
    const [drawPts, setDrawPts] = useState<{ latitude: number; longitude: number }[]>([]);
    const mapRef = useRef<MapView>(null);

    useEffect(() => {
        const unsub = onStoreChange(() => forceUpdate(n => n + 1));
        return unsub;
    }, []);

    const filtered = getAllTracks().filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.country.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const fmt = (ms: number) => {
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const f = Math.floor(ms % 1000);
        return `${m}:${s.toString().padStart(2, '0')}.${f.toString().padStart(3, '0')}`;
    };

    const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const polylineLen = (pts: { latitude: number; longitude: number }[]) => {
        let d = 0;
        for (let i = 1; i < pts.length; i++) {
            d += haversine(pts[i - 1].latitude, pts[i - 1].longitude, pts[i].latitude, pts[i].longitude);
        }
        return d;
    };

    // ── open create ──
    const openCreate = () => {
        setEditingTrackId(null);
        setNewName(''); setNewDesc(''); setNewCountry('Custom'); setRecordedPts([]); setTrackLen(0);
        setDrawPts([]); setIsRecording(false);
        setCreateMode('draw'); setShowCreate(true);
    };

    const openEdit = (track: Track) => {
        setEditingTrackId(track.id);
        setNewName(track.name);
        setNewDesc(track.description);
        setNewCountry(track.country || 'Custom');
        setRecordedPts([]);
        setTrackLen(0);
        setDrawPts(track.trackPoints.map(point => ({
            latitude: point.location.latitude,
            longitude: point.location.longitude,
        })));
        setIsRecording(false);
        setCreateMode('draw');
        setShowCreate(true);
    };

    const closeCreate = () => {
        if (isRecording) stopRec();
        setShowCreate(false);
        setEditingTrackId(null);
    };

    // ── GPS recording ──
    const startRec = async () => {
        if (!newName.trim()) { Alert.alert('Name Required', 'Enter a track name.'); return; }
        setIsRecording(true); setRecordedPts([]); setTrackLen(0);
        await LocationService.startLocationTracking(loc => {
            setRecordedPts(prev => {
                const pts = [...prev, loc];
                if (pts.length >= 2) {
                    const a = pts[pts.length - 2], b = pts[pts.length - 1];
                    setTrackLen(l => l + haversine(a.latitude, a.longitude, b.latitude, b.longitude));
                }
                return pts;
            });
        });
    };
    const stopRec = () => { setIsRecording(false); LocationService.stopLocationTracking(); };

    // ── Map draw ──
    const onMapPress = (e: MapPressEvent) => {
        const c = e.nativeEvent.coordinate;
        setDrawPts(prev => [...prev, c]);
    };
    const undoLastPoint = () => setDrawPts(prev => prev.slice(0, -1));
    const clearDraw = () => setDrawPts([]);

    // ── Save ──
    const saveTrack = async () => {
        let points: { latitude: number; longitude: number }[] = [];
        let length = 0;
        const isEditing = Boolean(editingTrackId);

        if (createMode === 'gps') {
            if (recordedPts.length < 5) { Alert.alert('Not Enough Data', 'Drive further to record a track.'); return; }
            points = recordedPts.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
            length = trackLen;
        } else {
            if (drawPts.length < 3) { Alert.alert('Not Enough Points', 'Tap on the map to add at least 3 points.'); return; }
            points = drawPts;
            length = polylineLen(drawPts);
        }

        if (!newName.trim()) { Alert.alert('Name Required', 'Enter a track name.'); return; }

        const tps: TrackPoint[] = points.map((p, i) => ({
            id: `pt-${i}`,
            location: { latitude: p.latitude, longitude: p.longitude, timestamp: Date.now() },
            isFinishLine: i === 0,
            isSector: i === 0 || i === Math.floor(points.length / 3) || i === Math.floor(points.length * 2 / 3),
            sectorNumber: i === 0 ? 1 : i === Math.floor(points.length / 3) ? 2 : i === Math.floor(points.length * 2 / 3) ? 3 : undefined,
        }));

        const t: Track = {
            id: editingTrackId ?? `custom-${Date.now()}`, name: newName.trim(),
            description: newDesc.trim() || 'Custom track',
            country: newCountry.trim() || 'Custom', length: Math.round(length), trackPoints: tps,
            sectors: 3, createdAt: isEditing ? getAllTracks().find(track => track.id === editingTrackId)?.createdAt ?? new Date() : new Date(), isCustom: true,
        };

        if (isEditing) {
            await updateCustomTrack(t);
        } else {
            await addCustomTrack(t);
        }
        setShowCreate(false);
        setEditingTrackId(null);
        forceUpdate(n => n + 1);
        Alert.alert(isEditing ? 'Updated' : 'Saved', `"${t.name}" ${isEditing ? 'updated' : 'saved'} (${(length / 1000).toFixed(2)} km, ${points.length} pts).`);
    };

    const deleteTrack = (track: Track) => {
        Alert.alert(
            'Delete Track',
            `Delete "${track.name}"? This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        await deleteCustomTrack(track.id);
                        if (selectedId === track.id) setSelectedId(null);
                        forceUpdate(n => n + 1);
                    },
                },
            ]
        );
    };

    const trackHasPoints = (t: Track) => t.trackPoints.length > 2;

    const insets = useSafeAreaInsets();
    const topPad = insets.top + Dimensions.get('window').height * 0.03;

    return (
        <ScrollView style={[st.root, { paddingTop: topPad }]} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Header */}
            <View style={st.header}>
                <Text style={st.headerTitle}>TRACKS</Text>
                <Text style={st.headerSub}>{getAllTracks().length} tracks available</Text>
            </View>

            {/* Search */}
            <View style={st.searchWrap}>
                <MaterialIcons name="search" size={20} color="#555" />
                <TextInput style={st.searchInput} placeholder="Search tracks…" placeholderTextColor="#444"
                    value={searchQuery} onChangeText={setSearchQuery} />
            </View>

            {/* Track list */}
            {filtered.map(t => (
                <TouchableOpacity key={t.id} style={[st.card, selectedId === t.id && st.cardSel]}
                    onPress={() => setSelectedId(t.id)} activeOpacity={0.7}>
                    {/* Mini map for custom tracks with points */}
                    {trackHasPoints(t) && selectedId === t.id && (
                        <MapView
                            style={st.miniMap}
                            provider={PROVIDER_DEFAULT}
                            scrollEnabled={false} zoomEnabled={false} rotateEnabled={false}
                            initialRegion={{
                                latitude: t.trackPoints[0].location.latitude,
                                longitude: t.trackPoints[0].location.longitude,
                                latitudeDelta: 0.015, longitudeDelta: 0.015,
                            }}
                        >
                            <Polyline
                                coordinates={t.trackPoints.map(p => ({
                                    latitude: p.location.latitude,
                                    longitude: p.location.longitude,
                                }))}
                                strokeColor="#FFC107" strokeWidth={3}
                            />
                            <Marker coordinate={{
                                latitude: t.trackPoints[0].location.latitude,
                                longitude: t.trackPoints[0].location.longitude,
                            }} pinColor="#00E676" title="Start/Finish" />
                        </MapView>
                    )}
                    <View style={st.cardTop}>
                        <View style={{ flex: 1 }}>
                            <Text style={st.cardName}>{t.name}</Text>
                            <View style={st.countryRow}>
                                <MaterialIcons name="location-on" size={13} color="#FFC107" />
                                <Text style={st.cardCountry}>{t.country}</Text>
                            </View>
                        </View>
                        {selectedId === t.id && <MaterialIcons name="check-circle" size={20} color="#00E676" />}
                    </View>
                    <View style={st.cardActions}>
                        {t.isCustom && (
                            <>
                                <TouchableOpacity style={st.cardActionBtn} onPress={() => openEdit(t)} activeOpacity={0.75}>
                                    <MaterialIcons name="edit" size={16} color="#FFC107" />
                                    <Text style={st.cardActionText}>EDIT</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[st.cardActionBtn, st.cardActionDanger]} onPress={() => deleteTrack(t)} activeOpacity={0.75}>
                                    <MaterialIcons name="delete-outline" size={16} color="#FF1744" />
                                    <Text style={[st.cardActionText, { color: '#FF1744' }]}>DELETE</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                    <View style={st.cardMetrics}>
                        <MetricCell label="LENGTH" value={`${(t.length / 1000).toFixed(2)} km`} />
                        <MetricCell label="SECTORS" value={`${t.sectors}`} />
                        <MetricCell label="BEST" value={t.bestLapTime ? fmt(t.bestLapTime) : '--'} />
                    </View>
                    <View style={st.badge}>
                        <MaterialIcons name={t.isCustom ? 'gps-fixed' : 'verified'} size={12}
                            color={t.isCustom ? '#FFC107' : '#00E676'} />
                        <Text style={[st.badgeText, { color: t.isCustom ? '#FFC107' : '#00E676' }]}>
                            {t.isCustom ? 'CUSTOM' : 'OFFICIAL'}
                        </Text>
                    </View>
                </TouchableOpacity>
            ))}

            {/* Create button */}
            <TouchableOpacity style={st.createBtn} onPress={openCreate} activeOpacity={0.8}>
                <MaterialIcons name="add-location" size={22} color="#FFC107" />
                <Text style={st.createText}>CREATE CUSTOM TRACK</Text>
            </TouchableOpacity>
            <Text style={st.createHint}>Draw on the map or record via GPS</Text>

            {/* ═══ Create Modal ═══ */}
            <Modal visible={showCreate} animationType="slide" presentationStyle="fullScreen"
                onRequestClose={closeCreate}>
                <View style={[st.modalRoot, { paddingTop: insets.top }]}>
                    {/* Head */}
                    <View style={st.modalHead}>
                        <TouchableOpacity onPress={closeCreate}>
                            <MaterialIcons name="close" size={24} color="#888" />
                        </TouchableOpacity>
                        <Text style={st.modalTitle}>{editingTrackId ? 'EDIT TRACK' : 'NEW TRACK'}</Text>
                        <View style={{ width: 24 }} />
                    </View>

                    {/* Mode tabs */}
                    <View style={st.modeTabs}>
                        <TouchableOpacity style={[st.modeTab, createMode === 'draw' && st.modeTabActive]}
                            onPress={() => setCreateMode('draw')}>
                            <MaterialIcons name="edit" size={16} color={createMode === 'draw' ? '#FFC107' : '#555'} />
                            <Text style={[st.modeTabTxt, createMode === 'draw' && st.modeTabTxtActive]}>DRAW ON MAP</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[st.modeTab, createMode === 'gps' && st.modeTabActive]}
                            onPress={() => setCreateMode('gps')}>
                            <MaterialIcons name="gps-fixed" size={16} color={createMode === 'gps' ? '#FFC107' : '#555'} />
                            <Text style={[st.modeTabTxt, createMode === 'gps' && st.modeTabTxtActive]}>GPS RECORD</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 30 }}>
                        <View style={{ padding: 16 }}>
                            <Text style={st.inputLbl}>TRACK NAME *</Text>
                            <TextInput style={st.input} placeholder="e.g. My Local Circuit" placeholderTextColor="#444"
                                value={newName} onChangeText={setNewName} editable={!isRecording} />
                            <Text style={st.inputLbl}>DESCRIPTION</Text>
                            <TextInput style={[st.input, { height: 60, textAlignVertical: 'top' }]}
                                placeholder="Optional…" placeholderTextColor="#444"
                                value={newDesc} onChangeText={setNewDesc} multiline editable={!isRecording} />
                            <Text style={st.inputLbl}>COUNTRY / REGION</Text>
                            <TextInput style={st.input} placeholder="Custom" placeholderTextColor="#444"
                                value={newCountry} onChangeText={setNewCountry} editable={!isRecording} />
                        </View>

                        {/* ── DRAW MODE ── */}
                        {createMode === 'draw' && (
                            <View>
                                <Text style={st.mapHint}>
                                    Tap on the map to place track points. First point = Start/Finish.
                                </Text>
                                <MapView
                                    ref={mapRef}
                                    style={st.mapView}
                                    provider={PROVIDER_DEFAULT}
                                    mapType="satellite"
                                    showsUserLocation
                                    initialRegion={{
                                        latitude: 44.4348,
                                        longitude: 26.0458,
                                        latitudeDelta: 0.01,
                                        longitudeDelta: 0.01,
                                    }}
                                    onPress={onMapPress}
                                >
                                    {drawPts.length >= 2 && (
                                        <Polyline coordinates={drawPts} strokeColor="#FFC107" strokeWidth={3} />
                                    )}
                                    {drawPts.length >= 3 && (
                                        <Polyline
                                            coordinates={[drawPts[drawPts.length - 1], drawPts[0]]}
                                            strokeColor="rgba(255,193,7,0.4)" strokeWidth={2}
                                            lineDashPattern={[6, 4]}
                                        />
                                    )}
                                    {drawPts.map((p, i) => (
                                        <Marker key={i} coordinate={p}
                                            pinColor={i === 0 ? '#00E676' : '#FFC107'}
                                            title={i === 0 ? 'Start / Finish' : `Point ${i + 1}`}
                                        />
                                    ))}
                                </MapView>

                                <View style={st.drawControls}>
                                    <View style={st.drawInfo}>
                                        <Text style={st.drawInfoTxt}>📍 {drawPts.length} pts</Text>
                                        <Text style={st.drawInfoTxt}>📏 {(polylineLen(drawPts) / 1000).toFixed(2)} km</Text>
                                    </View>
                                    <View style={st.drawBtns}>
                                        <TouchableOpacity style={st.undoBtn} onPress={undoLastPoint} disabled={drawPts.length === 0}>
                                            <MaterialIcons name="undo" size={18} color={drawPts.length > 0 ? '#FFC107' : '#333'} />
                                            <Text style={[st.undoBtnTxt, drawPts.length === 0 && { color: '#333' }]}>UNDO</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={st.clearDrawBtn} onPress={clearDraw} disabled={drawPts.length === 0}>
                                            <MaterialIcons name="delete-outline" size={18} color={drawPts.length > 0 ? '#FF1744' : '#333'} />
                                            <Text style={[st.clearDrawTxt, drawPts.length === 0 && { color: '#333' }]}>CLEAR</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {drawPts.length >= 3 && (
                                    <TouchableOpacity style={st.saveBtn} onPress={saveTrack}>
                                        <MaterialIcons name="save" size={18} color="#000" />
                                        <Text style={st.saveBtnText}>{editingTrackId ? 'UPDATE TRACK' : 'SAVE TRACK'}</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {/* ── GPS MODE ── */}
                        {createMode === 'gps' && (
                            <View style={{ paddingHorizontal: 16 }}>
                                <View style={st.recCard}>
                                    {isRecording ? (
                                        <>
                                            <View style={st.recRowInner}>
                                                <View style={st.pulseDot} />
                                                <Text style={st.recStatus}>RECORDING GPS…</Text>
                                            </View>
                                            {recordedPts.length >= 2 && (
                                                <MapView
                                                    style={st.recMiniMap}
                                                    provider={PROVIDER_DEFAULT}
                                                    mapType="satellite"
                                                    scrollEnabled={false} zoomEnabled={false}
                                                    region={{
                                                        latitude: recordedPts[recordedPts.length - 1].latitude,
                                                        longitude: recordedPts[recordedPts.length - 1].longitude,
                                                        latitudeDelta: 0.005, longitudeDelta: 0.005,
                                                    }}
                                                >
                                                    <Polyline
                                                        coordinates={recordedPts.map(p => ({ latitude: p.latitude, longitude: p.longitude }))}
                                                        strokeColor="#FF1744" strokeWidth={3}
                                                    />
                                                </MapView>
                                            )}
                                            <Text style={st.recStats}>📍 {recordedPts.length} pts  ·  📏 {(trackLen / 1000).toFixed(2)} km</Text>
                                            <Text style={st.recHint}>Drive around your track. Stop when done.</Text>
                                        </>
                                    ) : recordedPts.length > 0 ? (
                                        <>
                                            <MaterialIcons name="check-circle" size={36} color="#00E676" />
                                            <Text style={st.recDone}>RECORDING COMPLETE</Text>
                                            <Text style={st.recStats}>📍 {recordedPts.length} pts  ·  📏 {(trackLen / 1000).toFixed(2)} km</Text>
                                        </>
                                    ) : (
                                        <>
                                            <MaterialIcons name="gps-fixed" size={36} color="#444" />
                                            <Text style={st.recIdle}>Press "Start Recording" then drive your track</Text>
                                        </>
                                    )}
                                </View>

                                {!isRecording && recordedPts.length === 0 && (
                                    <TouchableOpacity style={st.recBtn} onPress={startRec}>
                                        <MaterialIcons name="fiber-manual-record" size={18} color="#fff" />
                                        <Text style={st.recBtnText}>START RECORDING</Text>
                                    </TouchableOpacity>
                                )}
                                {isRecording && (
                                    <TouchableOpacity style={st.stopRecBtn} onPress={stopRec}>
                                        <MaterialIcons name="stop" size={18} color="#fff" />
                                        <Text style={st.stopRecText}>STOP RECORDING</Text>
                                    </TouchableOpacity>
                                )}
                                {!isRecording && recordedPts.length > 0 && (
                                    <View style={{ gap: 10 }}>
                                        <TouchableOpacity style={st.saveBtn} onPress={saveTrack}>
                                            <MaterialIcons name="save" size={18} color="#000" />
                                            <Text style={st.saveBtnText}>{editingTrackId ? 'UPDATE TRACK' : 'SAVE TRACK'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={st.reRecBtn} onPress={startRec}>
                                            <MaterialIcons name="replay" size={18} color="#FFC107" />
                                            <Text style={st.reRecText}>RE-RECORD</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        )}
                    </ScrollView>
                </View>
            </Modal>
        </ScrollView>
    );
};

const MetricCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={st.metricCell}>
        <Text style={st.metricLbl}>{label}</Text>
        <Text style={st.metricVal}>{value}</Text>
    </View>
);

const st = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },

    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
    headerTitle: { color: '#FFC107', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
    headerSub: { color: '#666', fontSize: 12, fontWeight: '700', marginTop: 4 },

    searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', marginHorizontal: 12, marginBottom: 12, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
    searchInput: { flex: 1, color: '#fff', fontSize: 15, marginLeft: 8 },

    card: { backgroundColor: '#111', marginHorizontal: 12, marginBottom: 8, borderRadius: 8, padding: 16, borderWidth: 1, borderColor: '#1a1a1a' },
    cardSel: { borderColor: '#00E676' },
    miniMap: { height: 120, borderRadius: 8, marginBottom: 12 },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
    cardName: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 4 },
    countryRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    cardCountry: { color: '#FFC107', fontSize: 12, fontWeight: '700' },
    cardMetrics: { flexDirection: 'row', justifyContent: 'space-between' },
    metricCell: { alignItems: 'center', flex: 1 },
    metricLbl: { color: '#555', fontSize: 8, fontWeight: '900', letterSpacing: 0.5, marginBottom: 3 },
    metricVal: { color: '#fff', fontSize: 13, fontWeight: '900', fontFamily: 'monospace' },
    cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
    cardActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: '#151515', borderWidth: 1, borderColor: '#2a2a2a' },
    cardActionDanger: { borderColor: '#3a1418' },
    cardActionText: { color: '#FFC107', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
    badge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
    badgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

    createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginHorizontal: 12, marginTop: 10, paddingVertical: 16, borderRadius: 8, borderWidth: 2, borderColor: '#FFC107', borderStyle: 'dashed' },
    createText: { color: '#FFC107', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
    createHint: { color: '#444', fontSize: 11, textAlign: 'center', marginTop: 6 },

    // Modal
    modalRoot: { flex: 1, backgroundColor: '#000' },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#222' },
    modalTitle: { color: '#FFC107', fontSize: 16, fontWeight: '900', letterSpacing: 1, flex: 1, textAlign: 'center' },

    modeTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#222' },
    modeTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
    modeTabActive: { borderBottomWidth: 2, borderBottomColor: '#FFC107' },
    modeTabTxt: { color: '#555', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
    modeTabTxtActive: { color: '#FFC107' },

    inputLbl: { color: '#888', fontSize: 11, fontWeight: '900', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
    input: { backgroundColor: '#111', borderRadius: 8, padding: 14, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#222' },

    mapHint: { color: '#888', fontSize: 12, textAlign: 'center', paddingHorizontal: 16, marginBottom: 8 },
    mapView: { height: 350, marginHorizontal: 12, borderRadius: 12, overflow: 'hidden' },
    drawControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 10 },
    drawInfo: { flexDirection: 'row', gap: 12 },
    drawInfoTxt: { color: '#888', fontSize: 12, fontWeight: '700' },
    drawBtns: { flexDirection: 'row', gap: 10 },
    undoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#333' },
    undoBtnTxt: { color: '#FFC107', fontSize: 11, fontWeight: '900' },
    clearDrawBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#333' },
    clearDrawTxt: { color: '#FF1744', fontSize: 11, fontWeight: '900' },

    recCard: { backgroundColor: '#111', borderRadius: 12, padding: 25, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#222' },
    recRowInner: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    pulseDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#FF1744', marginRight: 8 },
    recStatus: { color: '#FF1744', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
    recStats: { color: '#888', fontSize: 13, marginTop: 6 },
    recHint: { color: '#555', fontSize: 11, marginTop: 6, textAlign: 'center' },
    recDone: { color: '#00E676', fontSize: 14, fontWeight: '900', marginTop: 6 },
    recIdle: { color: '#555', fontSize: 13, marginTop: 8, textAlign: 'center' },
    recMiniMap: { width: W - 100, height: 140, borderRadius: 8, marginTop: 10 },

    recBtn: { backgroundColor: '#FF1744', borderRadius: 8, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
    recBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
    stopRecBtn: { backgroundColor: '#FF1744', borderRadius: 8, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
    stopRecText: { color: '#fff', fontSize: 14, fontWeight: '900' },

    saveBtn: { backgroundColor: '#FFC107', borderRadius: 8, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, marginHorizontal: 12 },
    saveBtnText: { color: '#000', fontSize: 14, fontWeight: '900' },
    reRecBtn: { borderRadius: 8, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#FFC107' },
    reRecText: { color: '#FFC107', fontSize: 13, fontWeight: '900' },
});

export default TracksScreen;
