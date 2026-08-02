/**
 * RaceBuddy - Opportunities List Screen
 *
 * Shows a summary of all detected opportunities and the ideal lap
 * comparison dashboard. Tapping an opportunity opens the detailed
 * Catalyst-style analysis view.
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Line, Circle, G, Text as SvgText } from 'react-native-svg';
import { LapAnalysisResult, Opportunity, DeltaTimePoint } from '../types/analysis';
import OpportunityDetail from './OpportunityDetail';
import { generateMockAnalysis } from '../utils/MockAnalysisData';
import { LapAnalyzer } from '../services/LapAnalyzer';
import { loadSessions } from '../services/StorageService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const OpportunitiesScreen: React.FC = () => {
    const insets = useSafeAreaInsets();
    const [selectedOpportunity, setSelectedOpportunity] = useState<number | null>(null);
    const [analysis, setAnalysis] = useState<LapAnalysisResult>(() => generateMockAnalysis());
    const [analysisSource, setAnalysisSource] = useState<{
        kind: 'demo' | 'real';
        sessionName: string;
        sessionId: string;
        telemetryPoints: number;
    }>({
        kind: 'demo',
        sessionName: 'Demo Session',
        sessionId: 'demo-session',
        telemetryPoints: 0,
    });

    useEffect(() => {
        let mounted = true;

        const loadAnalysis = async () => {
            try {
                const sessions = await loadSessions();
                const candidate = sessions.find(session =>
                    Array.isArray(session.telemetryData)
                    && session.telemetryData.length > 0
                    && Array.isArray(session.lapTimes)
                    && session.lapTimes.length > 0,
                );

                if (!mounted) return;

                if (candidate) {
                    const analyzer = new LapAnalyzer();
                    const result = analyzer.analyzeSession(candidate);
                    setAnalysis(result);
                    setAnalysisSource({
                        kind: 'real',
                        sessionName: candidate.trackName || 'Recorded Session',
                        sessionId: candidate.id,
                        telemetryPoints: candidate.telemetryData.length,
                    });
                } else {
                    setAnalysis(generateMockAnalysis());
                    setAnalysisSource({
                        kind: 'demo',
                        sessionName: 'Demo Session',
                        sessionId: 'demo-session',
                        telemetryPoints: 0,
                    });
                }
            } catch (error) {
                console.warn('Failed to load real analysis, using demo data:', error);
                if (mounted) {
                    setAnalysis(generateMockAnalysis());
                    setAnalysisSource({
                        kind: 'demo',
                        sessionName: 'Demo Session',
                        sessionId: 'demo-session',
                        telemetryPoints: 0,
                    });
                }
            }
        };

        void loadAnalysis();

        return () => {
            mounted = false;
        };
    }, []);

    const formatTime = (ms: number): string => {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const frac = Math.floor((ms % 1000) / 10);
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${frac.toString().padStart(2, '0')}`;
    };

    const topPad = insets.top + 12;

    return (
        <View style={[styles.container, { paddingTop: topPad }]}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* ─── Summary Header ─── */}
                <View style={styles.summaryCard}>
                    <View style={styles.summaryHeader}>
                        <Text style={styles.summaryTitle}>IDEAL LAP ANALYSIS</Text>
                        <View style={styles.summaryBadge}>
                            <Text style={styles.summaryBadgeText}>
                                {analysis.opportunities.length} OPPORTUNITIES
                            </Text>
                        </View>
                    </View>

                    <View style={styles.sourceBar}>
                        <View style={styles.sourceTag}>
                            <Text style={styles.sourceTagText}>
                                {analysisSource.kind === 'real' ? 'REAL SESSION' : 'DEMO'}
                            </Text>
                        </View>
                        <Text style={styles.sourceText} numberOfLines={1}>
                            {analysisSource.sessionName} • {analysisSource.telemetryPoints} samples
                        </Text>
                        <View style={styles.confidenceChip}>
                            <Text style={styles.confidenceChipText}>
                                {Math.round(analysis.summary.analysisConfidence * 100)}% CONFIDENCE
                            </Text>
                        </View>
                    </View>

                    <View style={styles.summaryTimesRow}>
                        <View style={styles.summaryTimeCard}>
                            <Text style={styles.summaryTimeLabel}>BEST LAP</Text>
                            <Text style={styles.summaryTimeValue}>
                                {formatTime(analysis.summary.bestLapTime)}
                            </Text>
                        </View>

                        <View style={styles.summaryArrow}>
                            <MaterialIcons name="arrow-forward" size={20} color="#FFC107" />
                        </View>

                        <View style={styles.summaryTimeCard}>
                            <Text style={styles.summaryTimeLabel}>IDEAL LAP</Text>
                            <Text style={[styles.summaryTimeValue, { color: '#00E676' }]}>
                                {formatTime(analysis.summary.idealLapTime)}
                            </Text>
                        </View>

                        <View style={styles.summaryDeltaCard}>
                            <Text style={styles.summaryDeltaLabel}>POTENTIAL</Text>
                            <Text style={styles.summaryDeltaValue}>
                                -{(analysis.summary.totalTimeDelta / 1000).toFixed(2)}s
                            </Text>
                        </View>
                    </View>

                    {/* Stats grid */}
                    <View style={styles.statsGrid}>
                        <StatMini
                            label="AVG SPEED"
                            best={`${Math.round(analysis.summary.avgSpeedBest)}`}
                            ideal={`${Math.round(analysis.summary.avgSpeedIdeal)}`}
                            unit="KM/H"
                        />
                        <StatMini
                            label="MAX SPEED"
                            best={`${Math.round(analysis.summary.maxSpeedBest)}`}
                            ideal={`${Math.round(analysis.summary.maxSpeedIdeal)}`}
                            unit="KM/H"
                        />
                        <StatMini
                            label="MAX BRAKING"
                            best={`${analysis.summary.maxBrakingGBest.toFixed(2)}`}
                            ideal={`${analysis.summary.maxBrakingGIdeal.toFixed(2)}`}
                            unit="G"
                        />
                        <StatMini
                            label="MAX LATERAL"
                            best={`${analysis.summary.maxLateralGBest.toFixed(2)}`}
                            ideal={`${analysis.summary.maxLateralGIdeal.toFixed(2)}`}
                            unit="G"
                        />
                    </View>
                </View>

                {/* ─── Delta Time Chart ─── */}
                <View style={styles.deltaChartCard}>
                    <Text style={styles.sectionTitle}>TIME DELTA (BEST vs IDEAL)</Text>
                    <DeltaTimeChart
                        data={analysis.deltaTimeCurve}
                        width={SCREEN_WIDTH - 40}
                        height={100}
                    />
                </View>

                {/* ─── Opportunities List ─── */}
                <View style={styles.opportunitiesSection}>
                    <Text style={styles.sectionTitle}>OPPORTUNITIES</Text>
                    <Text style={styles.sectionSubtitle}>
                        Tap a corner for detailed analysis
                    </Text>

                    {analysis.opportunities.map((opp, index) => (
                        <TouchableOpacity
                            key={opp.id}
                            style={styles.opportunityCard}
                            onPress={() => setSelectedOpportunity(index)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.oppHeader}>
                                <View style={styles.oppNumberBadge}>
                                    <Text style={styles.oppNumberText}>{opp.number}</Text>
                                </View>
                                <View style={styles.oppInfo}>
                                    <Text style={styles.oppTitle}>
                                        Corner {opp.segment.cornerNumber || opp.number}
                                    </Text>
                                    <Text style={styles.oppSubtitle}>
                                        {opp.segment.cornerDirection && opp.segment.cornerDirection > 0
                                            ? 'Right turn'
                                            : 'Left turn'}
                                        {' • '}
                                        {Math.round(opp.segment.endDistance - opp.segment.startDistance)}m
                                    </Text>
                                </View>
                                <View style={styles.oppDelta}>
                                    <Text style={styles.oppDeltaValue}>
                                        -{opp.totalTimeDelta.toFixed(2)}s
                                    </Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={24} color="#666" />
                            </View>

                            {/* Mini insight bar */}
                            <View style={styles.oppInsightBar}>
                                <InsightChip
                                    icon="speed"
                                    label={`${Math.round(opp.speed.bestLapMinSpeed)}→${Math.round(opp.speed.optimalMinSpeed)} km/h`}
                                    color="#2196F3"
                                />
                                <InsightChip
                                    icon="arrow-downward"
                                    label={`${opp.braking.bestLapBrakingG.toFixed(1)}→${opp.braking.optimalBrakingG.toFixed(1)} G`}
                                    color="#F44336"
                                />
                                <InsightChip
                                    icon="gps-fixed"
                                    label={opp.apex.apexType.toUpperCase()}
                                    color={opp.apex.apexType === 'on_target' ? '#00E676' : '#FFC107'}
                                />
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>

            {/* ─── Opportunity Detail Modal ─── */}
            <Modal
                visible={selectedOpportunity !== null}
                animationType="slide"
                statusBarTranslucent={true}
            >
                {selectedOpportunity !== null && (
                    <OpportunityDetail
                        analysis={analysis}
                        initialOpportunityIndex={selectedOpportunity}
                        onClose={() => setSelectedOpportunity(null)}
                    />
                )}
            </Modal>
        </View>
    );
};

// ─── Delta Time Chart Component ──────────────────────────────────────

const DeltaTimeChart: React.FC<{
    data: DeltaTimePoint[];
    width: number;
    height: number;
}> = ({ data, width, height }) => {
    if (data.length < 2) return null;

    const padding = { top: 10, right: 10, bottom: 20, left: 35 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const xMin = data[0].distance;
    const xMax = data[data.length - 1].distance;
    const yMin = 0;
    const yMax = Math.max(...data.map(d => d.delta)) * 1.1;

    const toX = (x: number) => padding.left + ((x - xMin) / (xMax - xMin)) * chartW;
    const toY = (y: number) => padding.top + (1 - (y - yMin) / (yMax - yMin || 1)) * chartH;

    // Build the filled area path
    const linePath = data.map((d, i) =>
        `${i === 0 ? 'M' : 'L'} ${toX(d.distance)} ${toY(d.delta)}`
    ).join(' ');

    const areaPath = linePath
        + ` L ${toX(xMax)} ${toY(0)} L ${toX(xMin)} ${toY(0)} Z`;

    return (
        <Svg width={width} height={height}>
            {/* Background */}
            <Rect x={0} y={0} width={width} height={height} fill="#111" rx={8} />

            {/* Grid */}
            <Line
                x1={padding.left} y1={toY(0)}
                x2={width - padding.right} y2={toY(0)}
                stroke="#444" strokeWidth={1}
            />

            {/* Filled area */}
            <Path d={areaPath} fill="rgba(76, 175, 80, 0.2)" />

            {/* Line */}
            <Path d={linePath} stroke="#00E676" strokeWidth={2} fill="none" />

            {/* Y-axis labels */}
            <SvgText x={padding.left - 5} y={toY(yMax) + 4} fill="#888" fontSize={9} textAnchor="end">
                {yMax.toFixed(1)}s
            </SvgText>
            <SvgText x={padding.left - 5} y={toY(0) + 4} fill="#888" fontSize={9} textAnchor="end">
                0s
            </SvgText>

            {/* X-axis labels */}
            <SvgText x={toX(xMin)} y={height - 3} fill="#888" fontSize={9} textAnchor="start">
                0m
            </SvgText>
            <SvgText x={toX(xMax)} y={height - 3} fill="#888" fontSize={9} textAnchor="end">
                {Math.round(xMax)}m
            </SvgText>
        </Svg>
    );
};

// ─── Helper Components ───────────────────────────────────────────────

const StatMini: React.FC<{
    label: string;
    best: string;
    ideal: string;
    unit: string;
}> = ({ label, best, ideal, unit }) => (
    <View style={styles.statMini}>
        <Text style={styles.statMiniLabel}>{label}</Text>
        <View style={styles.statMiniValues}>
            <Text style={styles.statMiniBest}>{best}</Text>
            <Text style={styles.statMiniSep}>/</Text>
            <Text style={styles.statMiniIdeal}>{ideal}</Text>
            <Text style={styles.statMiniUnit}>{unit}</Text>
        </View>
    </View>
);

const InsightChip: React.FC<{
    icon: string;
    label: string;
    color: string;
}> = ({ icon, label, color }) => (
    <View style={[styles.insightChip, { borderColor: color }]}>
        <MaterialIcons name={icon as any} size={12} color={color} />
        <Text style={[styles.insightChipText, { color }]}>{label}</Text>
    </View>
);

// ─── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 30,
    },

    // ─── Summary Card ─────────
    summaryCard: {
        backgroundColor: '#111',
        margin: 12,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#1a1a1a',
    },
    summaryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    summaryTitle: {
        color: '#FFC107',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 1,
    },
    summaryBadge: {
        backgroundColor: '#222',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    summaryBadgeText: {
        color: '#FFC107',
        fontSize: 10,
        fontWeight: '800',
    },
    sourceBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    sourceTag: {
        backgroundColor: '#222',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
    },
    sourceTagText: {
        color: '#FFC107',
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.8,
    },
    sourceText: {
        flex: 1,
        color: '#AAA',
        fontSize: 10,
        fontWeight: '700',
    },
    confidenceChip: {
        backgroundColor: 'rgba(0,230,118,0.12)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 10,
    },
    confidenceChipText: {
        color: '#00E676',
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.6,
    },
    summaryTimesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
    },
    summaryTimeCard: {
        flex: 1,
        alignItems: 'center',
    },
    summaryTimeLabel: {
        color: '#888',
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    summaryTimeValue: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '900',
        fontFamily: 'monospace',
    },
    summaryArrow: {
        paddingHorizontal: 8,
    },
    summaryDeltaCard: {
        alignItems: 'center',
        backgroundColor: 'rgba(0,230,118,0.12)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    summaryDeltaLabel: {
        color: '#00E676',
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    summaryDeltaValue: {
        color: '#00E676',
        fontSize: 16,
        fontWeight: '900',
        fontFamily: 'monospace',
    },

    // ─── Stats Grid ─────────
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    statMini: {
        flex: 1,
        minWidth: '45%',
        backgroundColor: '#111',
        borderRadius: 6,
        padding: 8,
        alignItems: 'center',
    },
    statMiniLabel: {
        color: '#888',
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    statMiniValues: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    statMiniBest: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    statMiniSep: {
        color: '#555',
        fontSize: 12,
        marginHorizontal: 3,
    },
    statMiniIdeal: {
        color: '#00E676',
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    statMiniUnit: {
        color: '#666',
        fontSize: 9,
        marginLeft: 3,
        fontWeight: '700',
    },

    // ─── Delta Chart ─────────
    deltaChartCard: {
        backgroundColor: '#111',
        marginHorizontal: 12,
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: '#1a1a1a',
        marginBottom: 12,
    },
    sectionTitle: {
        color: '#FFC107',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    sectionSubtitle: {
        color: '#666',
        fontSize: 11,
        marginBottom: 12,
    },

    // ─── Opportunities Section ─────────
    opportunitiesSection: {
        paddingHorizontal: 12,
    },

    // ─── Opportunity Card ─────────
    opportunityCard: {
        backgroundColor: '#111',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#1a1a1a',
    },
    oppHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    oppNumberBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#FFC107',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    oppNumberText: {
        color: '#000',
        fontSize: 14,
        fontWeight: '900',
    },
    oppInfo: {
        flex: 1,
    },
    oppTitle: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '700',
    },
    oppSubtitle: {
        color: '#888',
        fontSize: 11,
        marginTop: 2,
    },
    oppDelta: {
        backgroundColor: 'rgba(0,230,118,0.12)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        marginRight: 8,
    },
    oppDeltaValue: {
        color: '#00E676',
        fontSize: 13,
        fontWeight: '900',
        fontFamily: 'monospace',
    },
    oppInsightBar: {
        flexDirection: 'row',
        gap: 6,
        flexWrap: 'wrap',
    },
    insightChip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 3,
        gap: 4,
    },
    insightChipText: {
        fontSize: 10,
        fontWeight: '700',
    },
});

export default OpportunitiesScreen;
