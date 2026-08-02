/**
 * RaceBuddy — Garmin Catalyst–style HISTORY screen
 *
 * Session list with Catalyst dark aesthetic. Tapping a session opens
 * a detailed analysis modal with lap progression chart, per-corner
 * coaching opportunities, and True Optimal Lap comparison.
 */

import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Modal, Dimensions, Share, Alert,
} from 'react-native';
const { height: SH } = Dimensions.get('window');
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, G, Text as SvgText, Line } from 'react-native-svg';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { RacingSession, LapTime } from '../types';
import { getSavedSessions, onStoreChange } from './DashboardScreen';
import { getSessionCoaching } from '../services/CoachingEngine';
import type { CoachingInsight } from '../services/CoachingEngine';
import { generateSessionCSV, generateSessionFilename } from '../utils/CSVExporter';

const { width: SW } = Dimensions.get('window');

const SessionsScreen: React.FC = () => {
    const [selectedSession, setSelectedSession] = useState<RacingSession | null>(null);
    const [detailVisible, setDetailVisible] = useState(false);
    const [activeTab, setActiveTab] = useState<'laps' | 'coach'>('laps');
    const [isExporting, setIsExporting] = useState(false);
    const [, refresh] = useState(0);

    useEffect(() => {
        const unsub = onStoreChange(() => refresh(n => n + 1));
        return unsub;
    }, []);

    // ─── Export Handler ──────────────────────────────────────
    const handleExportCSV = async () => {
        if (!selectedSession) return;

        try {
            setIsExporting(true);
            const csv = generateSessionCSV(selectedSession);
            const filename = generateSessionFilename(selectedSession);

            // Share CSV content via native share sheet
            await Share.share({
                message: csv,
                title: `Export ${filename}`,
                url: `data:text/csv;base64,${Buffer.from(csv).toString('base64')}`,
                filename: filename,
            }, {
                dialogTitle: 'Export Race Session as CSV',
                tintColor: '#FFC107',
            });
        } catch (error: any) {
            if (error.message !== 'User did not share') {
                Alert.alert('Export Error', 'Failed to export session data: ' + error.message);
            }
        } finally {
            setIsExporting(false);
        }
    };

    const sessions = getSavedSessions();

    const fmt = (ms: number) => {
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const f = Math.floor(ms % 1000);
        return `${m}:${s.toString().padStart(2, '0')}.${f.toString().padStart(3, '0')}`;
    };
    const fmtDate = (d: Date) => {
        const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${day}  ${time}`;
    };
    const fmtDur = (ses: RacingSession) => {
        if (!ses.endTime) return 'LIVE';
        const dur = ses.endTime.getTime() - ses.startTime.getTime();
        return `${Math.floor(dur / 60000)}:${Math.floor((dur % 60000) / 1000).toString().padStart(2, '0')}`;
    };

    const openSession = (s: RacingSession) => {
        setSelectedSession(s); setDetailVisible(true); setActiveTab('laps');
    };

    const insets = useSafeAreaInsets();
    const topPad = insets.top + Dimensions.get('window').height * 0.03;

    return (
        <View style={[st.root, { paddingTop: topPad }]}>
            <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
                {/* Header */}
                <View style={st.header}>
                    <Text style={st.headerTitle}>HISTORY</Text>
                    <Text style={st.headerSub}>{sessions.length} session{sessions.length !== 1 ? 's' : ''} recorded</Text>
                </View>

                {sessions.length === 0 ? (
                    <View style={st.empty}>
                        <MaterialIcons name="flag" size={48} color="#333" />
                        <Text style={st.emptyTitle}>NO SESSIONS YET</Text>
                        <Text style={st.emptySub}>Start a session from the Drive tab</Text>
                    </View>
                ) : (
                    sessions.map(ses => (
                        <TouchableOpacity key={ses.id} style={st.card} onPress={() => openSession(ses)} activeOpacity={0.7}>
                            <View style={st.cardTop}>
                                <View style={{ flex: 1 }}>
                                    <Text style={st.cardTrack}>{ses.trackName}</Text>
                                    <Text style={st.cardDate}>{fmtDate(ses.startTime)}</Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={22} color="#FFC107" />
                            </View>
                            <View style={st.cardMetrics}>
                                <Metric label="LAPS" value={`${ses.totalLaps}`} />
                                <Metric label="BEST" value={ses.bestLapTime ? fmt(ses.bestLapTime) : '--'} color="#00E676" />
                                <Metric label="DURATION" value={fmtDur(ses)} />
                            </View>
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>

            {/* ═══ Session Detail Modal ═══ */}
            <Modal visible={detailVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailVisible(false)}>
                <View style={st.modalRoot}>
                    {/* Modal header */}
                    <View style={st.modalHead}>
                        <TouchableOpacity onPress={() => setDetailVisible(false)}>
                            <MaterialIcons name="close" size={24} color="#888" />
                        </TouchableOpacity>
                        <Text style={st.modalTitle}>{selectedSession?.trackName}</Text>
                        <TouchableOpacity onPress={handleExportCSV} disabled={isExporting}>
                            <MaterialIcons name={isExporting ? "hourglass-empty" : "file-download"} size={24} color={isExporting ? "#666" : "#FFC107"} />
                        </TouchableOpacity>
                    </View>

                    {/* Tabs: LAPS / COACH */}
                    <View style={st.tabBar}>
                        <TouchableOpacity style={[st.tab, activeTab === 'laps' && st.tabActive]} onPress={() => setActiveTab('laps')}>
                            <Text style={[st.tabText, activeTab === 'laps' && st.tabTextActive]}>LAPS</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[st.tab, activeTab === 'coach' && st.tabActive]} onPress={() => setActiveTab('coach')}>
                            <Text style={[st.tabText, activeTab === 'coach' && st.tabTextActive]}>COACHING</Text>
                        </TouchableOpacity>
                    </View>

                    {selectedSession && (
                        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
                            {activeTab === 'laps' ? (
                                <LapsView session={selectedSession} fmt={fmt} fmtDate={fmtDate} fmtDur={fmtDur} />
                            ) : (
                                <CoachView session={selectedSession} />
                            )}
                        </ScrollView>
                    )}
                </View>
            </Modal>
        </View>
    );
};

// ─── LAPS view ──────────────────────────────────────────────────────

const LapsView: React.FC<{
    session: RacingSession;
    fmt: (ms: number) => string;
    fmtDate: (d: Date) => string;
    fmtDur: (s: RacingSession) => string;
}> = ({ session, fmt, fmtDate, fmtDur }) => (
    <View style={{ paddingHorizontal: 12 }}>
        {/* Summary strip */}
        <View style={st.summaryStrip}>
            <SummaryCell label="DATE" value={fmtDate(session.startTime)} />
            <SummaryCell label="LAPS" value={`${session.totalLaps}`} />
            <SummaryCell label="BEST" value={session.bestLapTime ? fmt(session.bestLapTime) : '--'} color="#00E676" />
            <SummaryCell label="DURATION" value={fmtDur(session)} />
        </View>

        {/* Lap chart */}
        {session.lapTimes.length > 1 && (
            <View style={st.chartCard}>
                <Text style={st.sectionLabel}>LAP PROGRESSION</Text>
                <LapChart laps={session.lapTimes} width={SW - 48} height={120} />
            </View>
        )}

        {/* Lap list */}
        <Text style={st.sectionLabel}>LAP TIMES</Text>
        {session.lapTimes.map(lap => (
            <View key={lap.id} style={[st.lapRow, lap.isBestLap && st.lapRowBest]}>
                <View style={st.lapNumWrap}>
                    <Text style={st.lapNum}>{lap.lapNumber}</Text>
                    {lap.isBestLap && <MaterialIcons name="star" size={14} color="#FFC107" />}
                </View>
                <Text style={[st.lapTime, lap.isBestLap && { color: '#00E676' }]}>{fmt(lap.duration)}</Text>
                <View style={st.sectors}>
                    {lap.sectorTimes.map((s, i) => (
                        <Text key={i} style={st.sectorTxt}>S{i + 1} {fmt(s)}</Text>
                    ))}
                </View>
            </View>
        ))}
    </View>
);

// ─── COACH view - Real Coaching Insights ─────────────────────────────

const CoachView: React.FC<{ session: RacingSession }> = ({ session }) => {
    const coaching = getSessionCoaching(session);
    const [selectedInsight, setSelectedInsight] = useState<CoachingInsight | null>(
        coaching.topOpportunities.length > 0 ? coaching.topOpportunities[0] : null
    );

    if (coaching.topOpportunities.length === 0) {
        return (
            <View style={{ paddingHorizontal: 12, marginTop: 20 }}>
                <View style={st.infoBox}>
                    <MaterialIcons name="info" size={24} color="#FFC107" />
                    <Text style={st.infoText}>{coaching.recommendation}</Text>
                </View>
            </View>
        );
    }

    const selectedCorner = selectedInsight?.location;
    const mapPadding = 50; // pixels

    return (
        <ScrollView style={{ flex: 1 }}>
            {/* Track Map */}
            {selectedCorner && coaching.trackBounds && (
                <View style={st.mapContainer}>
                    <MapView
                        style={st.map}
                        initialRegion={{
                            latitude: (coaching.trackBounds.minLat + coaching.trackBounds.maxLat) / 2,
                            longitude: (coaching.trackBounds.minLon + coaching.trackBounds.maxLon) / 2,
                            latitudeDelta: (coaching.trackBounds.maxLat - coaching.trackBounds.minLat) * 1.2,
                            longitudeDelta: (coaching.trackBounds.maxLon - coaching.trackBounds.minLon) * 1.2,
                        }}
                        scrollEnabled={true}
                        pitchEnabled={false}
                        zoomEnabled={true}
                    >
                        {/* All corners */}
                        {coaching.allCorners.map((corner) => (
                            <Marker
                                key={corner.cornerNumber}
                                coordinate={{ latitude: corner.latitude, longitude: corner.longitude }}
                                pinColor={selectedCorner.cornerNumber === corner.cornerNumber ? '#FF1744' : '#FFC107'}
                                title={`Corner ${corner.cornerNumber}`}
                                description={corner.direction}
                            />
                        ))}
                    </MapView>

                    {/* Highlighted corner info overlay */}
                    <View style={st.mapCornerLabel}>
                        <Text style={st.mapCornerNumber}>Corner {selectedCorner.cornerNumber}</Text>
                        <Text style={st.mapCornerDir}>{selectedCorner.direction.toUpperCase()}</Text>
                    </View>
                </View>
            )}

            {/* Session Efficiency */}
            <View style={st.efficiencyBanner}>
                <View style={st.efficiencyBox}>
                    <Text style={st.efficiencyLabel}>SESSION EFFICIENCY</Text>
                    <Text style={st.efficiencyScore}>{coaching.sessionEfficiency}%</Text>
                </View>
                <View style={st.efficiencyBox}>
                    <Text style={st.efficiencyLabel}>CONSISTENCY</Text>
                    <Text style={st.efficiencyScore}>{coaching.consistencyScore}%</Text>
                </View>
            </View>

            {/* Overall Recommendation */}
            <View style={{ paddingHorizontal: 12 }}>
                <View style={st.recommendationBox}>
                    <MaterialIcons name="lightbulb" size={18} color="#FFC107" />
                    <Text style={st.recommendationText}>{coaching.recommendation}</Text>
                </View>

                {/* Top Opportunities */}
                <Text style={st.sectionLabel}>TOP OPPORTUNITIES ({coaching.topOpportunities.length})</Text>

                {coaching.topOpportunities.map((insight, idx) => (
                    <TouchableOpacity
                        key={idx}
                        onPress={() => setSelectedInsight(insight)}
                        activeOpacity={0.7}
                    >
                        <View style={[
                            st.insightCard,
                            {
                                borderLeftColor: getPriorityColor(insight.priority),
                                borderLeftWidth: 4,
                                ...((selectedInsight?.corner === insight.corner) ? { backgroundColor: '#1a2a1a', borderWidth: 1, borderColor: '#00E676' } : {})
                            }
                        ]}>
                            <View style={st.insightHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={st.insightTitle}>{insight.title}</Text>
                                    <Text style={st.insightTopic}>{insight.topic.toUpperCase()}</Text>
                                </View>
                                <View style={st.timeSavedBox}>
                                    <Text style={st.timeSavedVal}>-{insight.timeSaved.toFixed(2)}s</Text>
                                </View>
                            </View>
                            <Text style={st.insightDescription}>{insight.description}</Text>
                            <View style={st.metricRow}>
                                <MaterialIcons name={insight.metric.icon as any} size={16} color="#FFC107" />
                                <Text style={st.metricLabel}>{insight.metric.current.toFixed(1)} {insight.metric.unit}</Text>
                                <MaterialIcons name="arrow-forward" size={14} color="#888" />
                                <Text style={[st.metricLabel, { color: '#00E676' }]}>{insight.metric.target.toFixed(1)}</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>
        </ScrollView>
    );
};

const getPriorityColor = (priority: string): string => {
    switch (priority) {
        case 'high': return '#FF1744';
        case 'medium': return '#FFC107';
        default: return '#4CAF50';
    }
};

// ─── Sub-components ──────────────────────────────────────────────────

const Metric: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
    <View style={st.metric}>
        <Text style={st.metricLbl}>{label}</Text>
        <Text style={[st.metricVal, color ? { color } : null]}>{value}</Text>
    </View>
);

const SummaryCell: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
    <View style={st.sumCell}>
        <Text style={st.sumLbl}>{label}</Text>
        <Text style={[st.sumVal, color ? { color } : null]}>{value}</Text>
    </View>
);

const Chip: React.FC<{ icon: string; label: string; color: string }> = ({ icon, label, color }) => (
    <View style={[st.chip, { borderColor: color }]}>
        <MaterialIcons name={icon as any} size={11} color={color} />
        <Text style={[st.chipText, { color }]}>{label}</Text>
    </View>
);

const StatBox: React.FC<{ label: string; best: string; ideal: string; unit: string }> = ({ label, best, ideal, unit }) => (
    <View style={st.statBox}>
        <Text style={st.statBoxLbl}>{label}</Text>
        <View style={st.statBoxRow}>
            <Text style={st.statBest}>{best}</Text>
            <Text style={st.statSep}>/</Text>
            <Text style={st.statIdeal}>{ideal}</Text>
            <Text style={st.statUnit}>{unit}</Text>
        </View>
    </View>
);

// Bar chart for laps
const LapChart: React.FC<{ laps: LapTime[]; width: number; height: number }> = ({ laps, width, height }) => {
    if (!laps.length) return null;
    const pad = { top: 8, right: 5, bottom: 18, left: 5 };
    const cw = width - pad.left - pad.right;
    const ch = height - pad.top - pad.bottom;
    const minT = Math.min(...laps.map(l => l.duration));
    const maxT = Math.max(...laps.map(l => l.duration));
    const range = maxT - minT || 1;
    const barW = Math.min(28, (cw / laps.length) - 4);

    return (
        <Svg width={width} height={height}>
            <Rect x={0} y={0} width={width} height={height} fill="#111" rx={6} />
            <Line x1={pad.left} y1={pad.top + ch} x2={width - pad.right} y2={pad.top + ch} stroke="#222" strokeWidth={1} />
            {laps.map((lap, i) => {
                const x = pad.left + (i / laps.length) * cw + (cw / laps.length - barW) / 2;
                const norm = (lap.duration - minT) / range;
                const barH = Math.max(6, (1 - norm) * ch * 0.8 + ch * 0.2);
                const y = pad.top + ch - barH;
                const color = lap.isBestLap ? '#00E676' : '#FFC107';
                return (
                    <G key={lap.id}>
                        <Rect x={x} y={y} width={barW} height={barH} fill={color} rx={3} opacity={0.85} />
                        <SvgText x={x + barW / 2} y={height - 3} fill="#666" fontSize={9} textAnchor="middle" fontWeight="bold">L{lap.lapNumber}</SvgText>
                    </G>
                );
            })}
        </Svg>
    );
};

// ─── Styles ──────────────────────────────────────────────────────────

const st = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },

    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
    headerTitle: { color: '#FFC107', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
    headerSub: { color: '#666', fontSize: 12, fontWeight: '700', marginTop: 4 },

    empty: { alignItems: 'center', paddingTop: 80 },
    emptyTitle: { color: '#444', fontSize: 16, fontWeight: '900', marginTop: 12 },
    emptySub: { color: '#333', fontSize: 13, marginTop: 4 },

    card: { backgroundColor: '#111', marginHorizontal: 12, marginBottom: 8, borderRadius: 8, padding: 16, borderWidth: 1, borderColor: '#1a1a1a' },
    cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    cardTrack: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 3 },
    cardDate: { color: '#666', fontSize: 12, fontWeight: '600' },
    cardMetrics: { flexDirection: 'row', justifyContent: 'space-between' },
    metric: { alignItems: 'center' },
    metricLbl: { color: '#555', fontSize: 9, fontWeight: '900', letterSpacing: 0.5, marginBottom: 3 },
    metricVal: { color: '#fff', fontSize: 15, fontWeight: '900', fontFamily: 'monospace' },

    // Modal
    modalRoot: { flex: 1, backgroundColor: '#000' },
    modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#222' },
    modalTitle: { color: '#FFC107', fontSize: 16, fontWeight: '900', letterSpacing: 1, flex: 1, textAlign: 'center' },

    tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#222' },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent' },
    tabActive: { borderBottomColor: '#FFC107' },
    tabText: { color: '#555', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
    tabTextActive: { color: '#FFC107' },

    summaryStrip: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#111', borderRadius: 8, padding: 12, marginTop: 12, marginBottom: 12 },
    sumCell: { alignItems: 'center', flex: 1 },
    sumLbl: { color: '#555', fontSize: 8, fontWeight: '900', letterSpacing: 0.5, marginBottom: 3 },
    sumVal: { color: '#fff', fontSize: 13, fontWeight: '900', fontFamily: 'monospace' },

    chartCard: { backgroundColor: '#111', borderRadius: 8, padding: 12, marginBottom: 12 },
    sectionLabel: { color: '#FFC107', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 8, marginTop: 4 },

    lapRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
    lapRowBest: { backgroundColor: '#0a1f0a', marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 6 },
    lapNumWrap: { width: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
    lapNum: { color: '#888', fontSize: 15, fontWeight: '800' },
    lapTime: { color: '#fff', fontSize: 17, fontWeight: '900', fontFamily: 'monospace', flex: 1 },
    sectors: { alignItems: 'flex-end' },
    sectorTxt: { color: '#555', fontSize: 9, fontWeight: '700', fontFamily: 'monospace', marginBottom: 1 },

    // Coach
    optimalBanner: { backgroundColor: '#111', borderRadius: 8, padding: 16, marginTop: 12, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
    optimalLabel: { color: '#FFC107', fontSize: 12, fontWeight: '900', letterSpacing: 1, marginBottom: 12 },
    optimalRow: { flexDirection: 'row', alignItems: 'center' },
    optimalBox: { flex: 1, alignItems: 'center' },
    optimalSmall: { color: '#555', fontSize: 8, fontWeight: '900', marginBottom: 3 },
    optimalTime: { color: '#fff', fontSize: 18, fontWeight: '900', fontFamily: 'monospace' },
    deltaBox: { alignItems: 'center', backgroundColor: '#0a1f0a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
    deltaSmall: { color: '#00E676', fontSize: 7, fontWeight: '900' },
    deltaGain: { color: '#00E676', fontSize: 15, fontWeight: '900', fontFamily: 'monospace' },

    oppCard: { backgroundColor: '#111', borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#1a1a1a' },
    oppTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    oppBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFC107', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    oppBadgeNum: { color: '#000', fontSize: 13, fontWeight: '900' },
    oppTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
    oppSub: { color: '#555', fontSize: 11, marginTop: 2 },
    oppDeltaBox: { backgroundColor: '#0a1f0a', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    oppDeltaVal: { color: '#00E676', fontSize: 13, fontWeight: '900', fontFamily: 'monospace' },
    oppChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, gap: 3 },
    chipText: { fontSize: 10, fontWeight: '700' },

    statsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    statBox: { flex: 1, backgroundColor: '#111', borderRadius: 6, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#1a1a1a' },
    statBoxLbl: { color: '#555', fontSize: 8, fontWeight: '900', letterSpacing: 0.5, marginBottom: 4 },
    statBoxRow: { flexDirection: 'row', alignItems: 'baseline' },
    statBest: { color: '#fff', fontSize: 14, fontWeight: '900', fontFamily: 'monospace' },
    statSep: { color: '#333', fontSize: 12, marginHorizontal: 3 },
    statIdeal: { color: '#00E676', fontSize: 14, fontWeight: '900', fontFamily: 'monospace' },
    statUnit: { color: '#444', fontSize: 9, marginLeft: 3, fontWeight: '700' },

    // Improved Coach Styles
    efficiencyBanner: { flexDirection: 'row', gap: 12, marginTop: 12, marginBottom: 12 },
    efficiencyBox: { flex: 1, backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#222' },
    efficiencyLabel: { color: '#555', fontSize: 9, fontWeight: '900', letterSpacing: 0.5, marginBottom: 6 },
    efficiencyScore: { color: '#FFC107', fontSize: 28, fontWeight: '900', fontFamily: 'monospace' },

    recommendationBox: { backgroundColor: '#1a2a1a', borderRadius: 8, padding: 12, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderLeftWidth: 4, borderLeftColor: '#FFC107' },
    recommendationText: { color: '#fff', fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 18 },

    infoBox: { backgroundColor: '#111', borderRadius: 8, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#222', gap: 10 },
    infoText: { color: '#FFC107', fontSize: 14, fontWeight: '700', textAlign: 'center' },

    insightCard: { backgroundColor: '#111', borderRadius: 8, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#222' },
    insightHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    insightTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
    insightTopic: { color: '#FFC107', fontSize: 10, fontWeight: '900', letterSpacing: 0.5, marginTop: 3 },
    timeSavedBox: { backgroundColor: '#0a1f0a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    timeSavedVal: { color: '#00E676', fontSize: 12, fontWeight: '900', fontFamily: 'monospace' },

    insightDescription: { color: '#aaa', fontSize: 12, fontWeight: '500', lineHeight: 17, marginBottom: 10 },
    metricRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#222' },
    metricLabel: { color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },

    // Map styles
    mapContainer: { height: 250, marginHorizontal: 12, marginBottom: 14, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#222' },
    map: { flex: 1 },
    mapCornerLabel: { position: 'absolute', bottom: 12, left: 12, backgroundColor: '#000a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#FFC107' },
    mapCornerNumber: { color: '#FFC107', fontSize: 14, fontWeight: '900', fontFamily: 'monospace' },
    mapCornerDir: { color: '#00E676', fontSize: 10, fontWeight: '700', marginTop: 2 },
});

export default SessionsScreen;
