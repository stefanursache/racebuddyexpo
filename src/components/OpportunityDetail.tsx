/**
 * RaceBuddy - Opportunity Detail Screen
 *
 * Garmin Catalyst–inspired "Opportunity" analysis page with tabs for
 * OVERVIEW, BRAKING, APEX, and SPEED analysis. Matches the dark theme
 * and data-dense layout of the Catalyst device UI.
 */

import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Opportunity, OpportunityCategory, LapAnalysisResult } from '../types/analysis';
import CornerArc from './CornerArc';
import {
    SpeedMiniChart,
    AccelMiniChart,
    TimeDeltaMiniChart,
    BrakingGauge,
    DualLineChart,
} from './MiniCharts';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OpportunityDetailProps {
    analysis: LapAnalysisResult;
    initialOpportunityIndex?: number;
    onClose?: () => void;
}

const OpportunityDetail: React.FC<OpportunityDetailProps> = ({
    analysis,
    initialOpportunityIndex = 0,
    onClose,
}) => {
    const insets = useSafeAreaInsets();
    const [currentIndex, setCurrentIndex] = useState(initialOpportunityIndex);
    const [activeTab, setActiveTab] = useState<OpportunityCategory>('overview');

    const opportunities = analysis.opportunities;
    const opportunity = opportunities[currentIndex];

    if (!opportunity) {
        return (
            <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
                <Text style={styles.noDataText}>No opportunities found</Text>
            </SafeAreaView>
        );
    }

    const goNext = () => {
        if (currentIndex < opportunities.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setActiveTab('overview');
        }
    };

    const goPrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
            setActiveTab('overview');
        }
    };

    const tabs: { key: OpportunityCategory; label: string }[] = [
        { key: 'overview', label: 'OVERVIEW' },
        { key: 'braking', label: 'BRAKING' },
        { key: 'apex', label: 'APEX' },
        { key: 'speed', label: 'SPEED' },
    ];

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
            {/* ─── Top Navigation Bar ─── */}
            <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity
                    style={styles.navButton}
                    onPress={goPrev}
                    disabled={currentIndex === 0}
                >
                    <MaterialIcons
                        name="chevron-left"
                        size={28}
                        color={currentIndex === 0 ? '#555' : '#FFC107'}
                    />
                </TouchableOpacity>

                {/* Title */}
                <View style={styles.titleContainer}>
                    <Text style={styles.titleText}>OPPORTUNITY {opportunity.number}</Text>
                </View>

                <TouchableOpacity
                    style={styles.navButton}
                    onPress={goNext}
                    disabled={currentIndex === opportunities.length - 1}
                >
                    <MaterialIcons
                        name="chevron-right"
                        size={28}
                        color={currentIndex === opportunities.length - 1 ? '#555' : '#FFC107'}
                    />
                </TouchableOpacity>

                {/* Home button */}
                <TouchableOpacity style={styles.homeButton} onPress={onClose}>
                    <MaterialIcons name="home" size={22} color="#FFC107" />
                </TouchableOpacity>
            </View>

            {/* ─── Tab Bar ─── */}
            <View style={styles.tabBar}>
                {tabs.map(tab => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[
                            styles.tab,
                            activeTab === tab.key && styles.activeTab,
                        ]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text
                            style={[
                                styles.tabText,
                                activeTab === tab.key && styles.activeTabText,
                            ]}
                        >
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* ─── Tab Content ─── */}
            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentInner}
                showsVerticalScrollIndicator={false}
            >
                {activeTab === 'overview' && (
                    <OverviewTab opportunity={opportunity} analysis={analysis} />
                )}
                {activeTab === 'braking' && (
                    <BrakingTab opportunity={opportunity} />
                )}
                {activeTab === 'apex' && (
                    <ApexTab opportunity={opportunity} />
                )}
                {activeTab === 'speed' && (
                    <SpeedTab opportunity={opportunity} />
                )}
            </ScrollView>

            {/* ─── Legend Bar ─── */}
            <View style={styles.legendBar}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#E040FB' }]} />
                    <Text style={styles.legendLabel}>OPTIMAL</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#FFF' }]} />
                    <Text style={styles.legendLabel}>AVERAGE</Text>
                </View>
            </View>
        </SafeAreaView>
    );
};

// ─── OVERVIEW TAB ────────────────────────────────────────────────────

const OverviewTab: React.FC<{
    opportunity: Opportunity;
    analysis: LapAnalysisResult;
}> = ({ opportunity, analysis }) => {
    const { braking, apex, speed, overview } = opportunity;

    return (
        <View style={styles.tabContent}>
            {/* Description text */}
            <Text style={styles.descriptionText}>{overview.description}</Text>

            <View style={styles.overviewRow}>
                {/* Left: Braking Gauge / Corner Arc */}
                <View style={styles.overviewLeft}>
                    <BrakingGauge
                        bestG={braking.bestLapBrakingG}
                        optimalG={braking.optimalBrakingG}
                    />
                </View>

                {/* Right: Mini Charts */}
                <View style={styles.overviewRight}>
                    <AccelMiniChart
                        bestProfile={apex.bestLapAccelProfile}
                        optimalProfile={apex.optimalAccelProfile}
                        width={SCREEN_WIDTH * 0.35}
                        height={50}
                    />
                    <SpeedMiniChart
                        bestProfile={speed.bestLapProfile}
                        optimalProfile={speed.optimalProfile}
                        width={SCREEN_WIDTH * 0.35}
                        height={50}
                    />
                    <TimeDeltaMiniChart
                        bestProfile={speed.bestLapTimeProfile}
                        optimalProfile={speed.optimalTimeProfile}
                        width={SCREEN_WIDTH * 0.35}
                        height={50}
                    />
                </View>
            </View>

            {/* Thumbnails placeholder (Catalyst shows track images) */}
            <View style={styles.thumbnailRow}>
                {[1, 2, 3, 4].map(i => (
                    <View key={i} style={styles.thumbnail}>
                        <MaterialIcons name="videocam" size={20} color="#555" />
                    </View>
                ))}
            </View>

            {/* Time delta badge */}
            <View style={styles.timeDeltaBadge}>
                <Text style={styles.timeDeltaValue}>
                    -{overview.timeDelta.toFixed(2)} S
                </Text>
            </View>
        </View>
    );
};

// ─── BRAKING TAB ─────────────────────────────────────────────────────

const BrakingTab: React.FC<{ opportunity: Opportunity }> = ({ opportunity }) => {
    const { braking } = opportunity;
    const brakingDirection = braking.distanceDelta > 0 ? 'LATER' : 'EARLIER';

    return (
        <View style={styles.tabContent}>
            {/* Braking advice */}
            <Text style={styles.descriptionText}>
                {`YOU ACHIEVED YOUR FASTEST TIME WHEN YOU BRAKED:\n${brakingDirection}: ${Math.abs(braking.distanceDelta).toFixed(0)} M.    HARDER: ${Math.abs(braking.intensityDelta).toFixed(0)} %    LONGER: ${braking.timeDelta.toFixed(2)} S`}
            </Text>

            <View style={styles.brakingLayout}>
                {/* Left: Gauge */}
                <View style={styles.brakingGaugeContainer}>
                    <BrakingGauge
                        bestG={braking.bestLapBrakingG}
                        optimalG={braking.optimalBrakingG}
                        maxG={1.5}
                    />
                    {/* Speed values around gauge */}
                    <View style={styles.gaugeSpeedValues}>
                        <Text style={styles.gaugeSpeed}>{Math.round(braking.bestLapBrakingSpeed)}</Text>
                        <Text style={styles.gaugeSpeedSmall}>{Math.round(braking.optimalBrakingSpeed)}</Text>
                    </View>
                </View>

                {/* Right: Charts */}
                <View style={styles.brakingChartsContainer}>
                    <AccelMiniChart
                        bestProfile={opportunity.apex.bestLapAccelProfile}
                        optimalProfile={opportunity.apex.optimalAccelProfile}
                        width={SCREEN_WIDTH * 0.38}
                        height={50}
                    />
                    <SpeedMiniChart
                        bestProfile={braking.bestLapProfile}
                        optimalProfile={braking.optimalProfile}
                        width={SCREEN_WIDTH * 0.38}
                        height={50}
                    />
                    <TimeDeltaMiniChart
                        bestProfile={opportunity.speed.bestLapTimeProfile}
                        optimalProfile={opportunity.speed.optimalTimeProfile}
                        width={SCREEN_WIDTH * 0.38}
                        height={50}
                    />
                </View>
            </View>
        </View>
    );
};

// ─── APEX TAB ────────────────────────────────────────────────────────

const ApexTab: React.FC<{ opportunity: Opportunity }> = ({ opportunity }) => {
    const { apex, segment } = opportunity;

    return (
        <View style={styles.tabContent}>
            {/* Apex advice */}
            <Text style={styles.descriptionText}>{apex.advice}</Text>

            <View style={styles.apexLayout}>
                {/* Left: Corner Arc visualization */}
                <View style={styles.apexArcContainer}>
                    <CornerArc
                        apex={apex}
                        cornerDirection={segment.cornerDirection}
                        size={160}
                    />

                    {/* Apex type badges */}
                    <View style={styles.apexTypeBadges}>
                        <View style={styles.apexBadge}>
                            <Text style={[
                                styles.apexBadgeText,
                                { color: apex.apexType === 'early' ? '#FFC107' : apex.apexType === 'late' ? '#FF5722' : '#00E676' },
                            ]}>
                                APEX TYPE: {apex.apexType.toUpperCase()}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Right: Charts */}
                <View style={styles.apexChartsContainer}>
                    <AccelMiniChart
                        bestProfile={apex.bestLapAccelProfile}
                        optimalProfile={apex.optimalAccelProfile}
                        width={SCREEN_WIDTH * 0.35}
                        height={50}
                    />
                    <SpeedMiniChart
                        bestProfile={apex.bestLapSpeedProfile}
                        optimalProfile={apex.optimalSpeedProfile}
                        width={SCREEN_WIDTH * 0.35}
                        height={50}
                    />
                    <TimeDeltaMiniChart
                        bestProfile={opportunity.speed.bestLapTimeProfile}
                        optimalProfile={opportunity.speed.optimalTimeProfile}
                        width={SCREEN_WIDTH * 0.35}
                        height={50}
                    />
                </View>
            </View>
        </View>
    );
};

// ─── SPEED TAB ───────────────────────────────────────────────────────

const SpeedTab: React.FC<{ opportunity: Opportunity }> = ({ opportunity }) => {
    const { speed } = opportunity;

    return (
        <View style={styles.tabContent}>
            <Text style={styles.descriptionText}>
                SPEED COMPARISON THROUGH THIS SECTION
            </Text>

            {/* Large speed chart */}
            <View style={styles.speedMainChart}>
                <DualLineChart
                    title="SPEED"
                    valueTop={Math.round(Math.max(speed.bestLapMaxSpeed, speed.optimalMaxSpeed)).toString()}
                    valueBottom={Math.round(Math.min(speed.bestLapMinSpeed, speed.optimalMinSpeed)).toString()}
                    unit="KM/H"
                    bestData={speed.bestLapProfile.map(p => ({ x: p.distance, y: p.speed }))}
                    optimalData={speed.optimalProfile.map(p => ({ x: p.distance, y: p.speed }))}
                    width={SCREEN_WIDTH * 0.6}
                    height={100}
                />
            </View>

            {/* Speed stats */}
            <View style={styles.speedStatsRow}>
                <View style={styles.speedStatCard}>
                    <Text style={styles.speedStatLabel}>MAX SPEED</Text>
                    <View style={styles.speedStatValues}>
                        <Text style={styles.speedStatBest}>
                            {Math.round(speed.bestLapMaxSpeed)} KM/H
                        </Text>
                        <Text style={styles.speedStatOptimal}>
                            {Math.round(speed.optimalMaxSpeed)} KM/H
                        </Text>
                    </View>
                </View>

                <View style={styles.speedStatCard}>
                    <Text style={styles.speedStatLabel}>MIN SPEED</Text>
                    <View style={styles.speedStatValues}>
                        <Text style={styles.speedStatBest}>
                            {Math.round(speed.bestLapMinSpeed)} KM/H
                        </Text>
                        <Text style={styles.speedStatOptimal}>
                            {Math.round(speed.optimalMinSpeed)} KM/H
                        </Text>
                    </View>
                </View>

                <View style={styles.speedStatCard}>
                    <Text style={styles.speedStatLabel}>TIME DELTA</Text>
                    <View style={styles.speedStatValues}>
                        <Text style={[styles.speedStatDelta, { color: speed.timeDelta > 0 ? '#F44336' : '#00E676' }]}>
                            {speed.timeDelta > 0 ? '+' : ''}{speed.timeDelta.toFixed(2)} S
                        </Text>
                    </View>
                </View>
            </View>

            {/* Time chart */}
            <View style={styles.speedTimeChart}>
                <TimeDeltaMiniChart
                    bestProfile={speed.bestLapTimeProfile}
                    optimalProfile={speed.optimalTimeProfile}
                    width={SCREEN_WIDTH * 0.6}
                    height={80}
                />
            </View>
        </View>
    );
};

// ─── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111',
    },
    noDataText: {
        color: '#888',
        fontSize: 16,
        textAlign: 'center',
        marginTop: 100,
    },

    // ─── Top Navigation ─────────
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#111',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#444',
    },
    navButton: {
        padding: 8,
    },
    titleContainer: {
        flex: 1,
        alignItems: 'center',
        backgroundColor: '#FFC107',
        paddingVertical: 8,
        marginHorizontal: 12,
        borderRadius: 4,
    },
    titleText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 1,
    },
    homeButton: {
        padding: 8,
        backgroundColor: '#1a1a1a',
        borderRadius: 4,
        marginLeft: 8,
    },

    // ─── Tab Bar ─────────
    tabBar: {
        flexDirection: 'row',
        backgroundColor: '#111',
        paddingHorizontal: 12,
        paddingVertical: 2,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderBottomWidth: 3,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: '#FFC107',
    },
    tabText: {
        color: '#888',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    activeTabText: {
        color: '#FFC107',
    },

    // ─── Content ─────────
    content: {
        flex: 1,
    },
    contentInner: {
        padding: 12,
        paddingBottom: 30,
    },
    tabContent: {},

    // ─── Description ─────────
    descriptionText: {
        color: '#CCC',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
        lineHeight: 16,
        marginBottom: 12,
        textTransform: 'uppercase',
    },

    // ─── Overview Tab ─────────
    overviewRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    overviewLeft: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    overviewRight: {
        flex: 1.2,
        paddingLeft: 5,
    },
    thumbnailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 15,
        gap: 6,
    },
    thumbnail: {
        flex: 1,
        height: 50,
        backgroundColor: '#111',
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    timeDeltaBadge: {
        alignSelf: 'flex-end',
        backgroundColor: '#1a1a1a',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
        marginTop: 10,
    },
    timeDeltaValue: {
        color: '#00E676',
        fontSize: 14,
        fontWeight: '900',
        fontFamily: 'monospace',
    },

    // ─── Braking Tab ─────────
    brakingLayout: {
        flexDirection: 'row',
    },
    brakingGaugeContainer: {
        flex: 1,
        alignItems: 'center',
    },
    gaugeSpeedValues: {
        alignItems: 'center',
        marginTop: 5,
    },
    gaugeSpeed: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    gaugeSpeedSmall: {
        color: '#aaa',
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'monospace',
    },
    brakingChartsContainer: {
        flex: 1.2,
        paddingLeft: 5,
    },

    // ─── Apex Tab ─────────
    apexLayout: {
        flexDirection: 'row',
    },
    apexArcContainer: {
        flex: 1,
        alignItems: 'center',
    },
    apexTypeBadges: {
        marginTop: 8,
        alignItems: 'center',
    },
    apexBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        backgroundColor: '#111',
        borderRadius: 4,
    },
    apexBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    apexChartsContainer: {
        flex: 1,
        paddingLeft: 5,
    },

    // ─── Speed Tab ─────────
    speedMainChart: {
        alignItems: 'center',
        marginVertical: 10,
    },
    speedStatsRow: {
        flexDirection: 'row',
        gap: 8,
        marginVertical: 10,
    },
    speedStatCard: {
        flex: 1,
        backgroundColor: '#111',
        borderRadius: 8,
        padding: 10,
        alignItems: 'center',
    },
    speedStatLabel: {
        color: '#888',
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 0.5,
        marginBottom: 5,
    },
    speedStatValues: {
        alignItems: 'center',
    },
    speedStatBest: {
        color: '#fff',
        fontSize: 13,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    speedStatOptimal: {
        color: '#E040FB',
        fontSize: 11,
        fontWeight: '600',
        fontFamily: 'monospace',
    },
    speedStatDelta: {
        fontSize: 16,
        fontWeight: '900',
        fontFamily: 'monospace',
    },
    speedTimeChart: {
        alignItems: 'center',
        marginTop: 10,
    },

    // ─── Legend Bar ─────────
    legendBar: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: 8,
        backgroundColor: '#111',
        borderTopWidth: 1,
        borderTopColor: '#444',
        gap: 30,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 6,
    },
    legendLabel: {
        color: '#AAA',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
});

export default OpportunityDetail;
