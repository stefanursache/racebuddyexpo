/**
 * RaceBuddy - Mini Telemetry Charts
 *
 * Small inline charts used in the Catalyst-style opportunity cards
 * for showing accel/decel, speed, and time delta profiles.
 * Renders using react-native-svg for crisp vector graphics.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Line, Rect, G, Text as SvgText } from 'react-native-svg';
import {
    SpeedDistancePoint,
    GForceDistancePoint,
    TimeDistancePoint,
} from '../types/analysis';

// ─── Generic Mini Line Chart ─────────────────────────────────────────

interface MiniChartProps {
    width?: number;
    height?: number;
    title: string;
    /** Primary label (e.g., "0.43") */
    valueTop?: string;
    /** Secondary label (e.g., "-0.70") */
    valueBottom?: string;
    unit?: string;
}

interface DualLineChartProps extends MiniChartProps {
    bestData: { x: number; y: number }[];
    optimalData: { x: number; y: number }[];
    bestColor?: string;
    optimalColor?: string;
    showGrid?: boolean;
    yMin?: number;
    yMax?: number;
}

export const DualLineChart: React.FC<DualLineChartProps> = ({
    width = 140,
    height = 55,
    title,
    valueTop,
    valueBottom,
    unit,
    bestData,
    optimalData,
    bestColor = '#FFFFFF',
    optimalColor = '#E040FB',
    showGrid = true,
    yMin: yMinProp,
    yMax: yMaxProp,
}) => {
    const padding = { top: 4, right: 4, bottom: 4, left: 4 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Compute ranges
    const allY = [...bestData.map(d => d.y), ...optimalData.map(d => d.y)];
    const allX = [...bestData.map(d => d.x), ...optimalData.map(d => d.x)];

    const xMin = Math.min(...allX);
    const xMax = Math.max(...allX);
    const yMin = yMinProp ?? Math.min(...allY);
    const yMax = yMaxProp ?? Math.max(...allY);

    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;

    const toX = (x: number) => padding.left + ((x - xMin) / xRange) * chartWidth;
    const toY = (y: number) => padding.top + (1 - (y - yMin) / yRange) * chartHeight;

    const buildPath = (data: { x: number; y: number }[]): string => {
        if (data.length === 0) return '';
        return data.map((d, i) => {
            const x = toX(d.x);
            const y = toY(d.y);
            return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
        }).join(' ');
    };

    return (
        <View style={[styles.chartContainer, { width: width + 60 }]}>
            {/* Title and values column */}
            <View style={styles.chartLabelColumn}>
                <Text style={styles.chartTitle}>{title}</Text>
                {valueTop !== undefined && (
                    <Text style={styles.chartValueTop}>{valueTop}</Text>
                )}
                {unit && <Text style={styles.chartUnit}>{unit}</Text>}
                {valueBottom !== undefined && (
                    <Text style={styles.chartValueBottom}>{valueBottom}</Text>
                )}
            </View>

            {/* Chart SVG */}
            <View style={[styles.chartSvgContainer, { width, height }]}>
                <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
                    {/* Background */}
                    <Rect x={0} y={0} width={width} height={height} fill="#2A2A3A" rx={4} />

                    {/* Grid lines */}
                    {showGrid && (
                        <G>
                            <Line
                                x1={padding.left} y1={toY((yMin + yMax) / 2)}
                                x2={width - padding.right} y2={toY((yMin + yMax) / 2)}
                                stroke="#444" strokeWidth={0.5}
                            />
                        </G>
                    )}

                    {/* Optimal line (behind) */}
                    <Path
                        d={buildPath(optimalData)}
                        stroke={optimalColor}
                        strokeWidth={1.5}
                        fill="none"
                    />

                    {/* Best lap line (front) */}
                    <Path
                        d={buildPath(bestData)}
                        stroke={bestColor}
                        strokeWidth={1.5}
                        fill="none"
                    />
                </Svg>
            </View>
        </View>
    );
};

// ─── Speed Chart ─────────────────────────────────────────────────────

interface SpeedChartProps {
    bestProfile: SpeedDistancePoint[];
    optimalProfile: SpeedDistancePoint[];
    width?: number;
    height?: number;
}

export const SpeedMiniChart: React.FC<SpeedChartProps> = ({
    bestProfile,
    optimalProfile,
    width = 140,
    height = 55,
}) => {
    const bestMax = Math.max(...bestProfile.map(p => p.speed), 0);
    const optMax = Math.max(...optimalProfile.map(p => p.speed), 0);
    const bestMin = Math.min(...bestProfile.map(p => p.speed), 999);
    const optMin = Math.min(...optimalProfile.map(p => p.speed), 999);

    return (
        <DualLineChart
            title="SPEED"
            valueTop={Math.round(Math.max(bestMax, optMax)).toString()}
            valueBottom={Math.round(Math.min(bestMin, optMin)).toString()}
            unit="KM/H"
            bestData={bestProfile.map(p => ({ x: p.distance, y: p.speed }))}
            optimalData={optimalProfile.map(p => ({ x: p.distance, y: p.speed }))}
            bestColor="#FFFFFF"
            optimalColor="#E040FB"
            width={width}
            height={height}
        />
    );
};

// ─── Accel/Decel Chart ───────────────────────────────────────────────

interface AccelChartProps {
    bestProfile: GForceDistancePoint[];
    optimalProfile: GForceDistancePoint[];
    width?: number;
    height?: number;
}

export const AccelMiniChart: React.FC<AccelChartProps> = ({
    bestProfile,
    optimalProfile,
    width = 140,
    height = 55,
}) => {
    const bestMax = Math.max(...bestProfile.map(p => p.gForce), 0);
    const optMax = Math.max(...optimalProfile.map(p => p.gForce), 0);
    const bestMin = Math.min(...bestProfile.map(p => p.gForce), 0);
    const optMin = Math.min(...optimalProfile.map(p => p.gForce), 0);

    return (
        <DualLineChart
            title="ACCEL/DECEL."
            valueTop={Math.max(bestMax, optMax).toFixed(2)}
            valueBottom={Math.min(bestMin, optMin).toFixed(2)}
            unit="G"
            bestData={bestProfile.map(p => ({ x: p.distance, y: p.gForce }))}
            optimalData={optimalProfile.map(p => ({ x: p.distance, y: p.gForce }))}
            bestColor="#FFFFFF"
            optimalColor="#E040FB"
            width={width}
            height={height}
            yMin={-2}
            yMax={1}
        />
    );
};

// ─── Time Delta Chart ────────────────────────────────────────────────

interface TimeDeltaChartProps {
    bestProfile: TimeDistancePoint[];
    optimalProfile: TimeDistancePoint[];
    width?: number;
    height?: number;
}

export const TimeDeltaMiniChart: React.FC<TimeDeltaChartProps> = ({
    bestProfile,
    optimalProfile,
    width = 140,
    height = 55,
}) => {
    // Compute delta at each point
    const minLen = Math.min(bestProfile.length, optimalProfile.length);
    const lastBest = minLen > 0 ? bestProfile[minLen - 1].time : 0;
    const lastOpt = minLen > 0 ? optimalProfile[minLen - 1].time : 0;
    const delta = lastOpt - lastBest;

    return (
        <DualLineChart
            title="TIME"
            valueTop="0.00"
            valueBottom={delta.toFixed(2)}
            unit="S"
            bestData={bestProfile.map(p => ({ x: p.distance, y: p.time }))}
            optimalData={optimalProfile.map(p => ({ x: p.distance, y: p.time }))}
            bestColor="#FFFFFF"
            optimalColor="#E040FB"
            width={width}
            height={height}
        />
    );
};

// ─── Braking Gauge ───────────────────────────────────────────────────

interface BrakingGaugeProps {
    bestG: number;
    optimalG: number;
    maxG?: number;
}

export const BrakingGauge: React.FC<BrakingGaugeProps> = ({
    bestG,
    optimalG,
    maxG = 2.0,
}) => {
    const size = 100;
    const cx = size / 2;
    const cy = size / 2 + 5;
    const radius = size * 0.35;
    const startAngle = -210;
    const endAngle = 30;
    const sweep = endAngle - startAngle;

    const gToAngle = (g: number) => startAngle + (g / maxG) * sweep;

    const arcPath = (start: number, end: number, r: number) => {
        const s = (start * Math.PI) / 180;
        const e = (end * Math.PI) / 180;
        const x1 = cx + r * Math.cos(s);
        const y1 = cy + r * Math.sin(s);
        const x2 = cx + r * Math.cos(e);
        const y2 = cy + r * Math.sin(e);
        const large = Math.abs(end - start) > 180 ? 1 : 0;
        return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
    };

    return (
        <View style={styles.gaugeContainer}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {/* Background arc */}
                <Path
                    d={arcPath(startAngle, endAngle, radius)}
                    stroke="#333"
                    strokeWidth={8}
                    fill="none"
                    strokeLinecap="round"
                />

                {/* Green zone (low G) */}
                <Path
                    d={arcPath(startAngle, gToAngle(maxG * 0.4), radius)}
                    stroke="#4CAF50"
                    strokeWidth={8}
                    fill="none"
                    strokeLinecap="round"
                />

                {/* Yellow zone (medium G) */}
                <Path
                    d={arcPath(gToAngle(maxG * 0.4), gToAngle(maxG * 0.7), radius)}
                    stroke="#FFC107"
                    strokeWidth={8}
                    fill="none"
                    strokeLinecap="round"
                />

                {/* Red zone (high G) */}
                <Path
                    d={arcPath(gToAngle(maxG * 0.7), endAngle, radius)}
                    stroke="#F44336"
                    strokeWidth={8}
                    fill="none"
                    strokeLinecap="round"
                />

                {/* Best lap needle */}
                {(() => {
                    const angle = (gToAngle(bestG) * Math.PI) / 180;
                    const needleLen = radius - 8;
                    return (
                        <Line
                            x1={cx}
                            y1={cy}
                            x2={cx + needleLen * Math.cos(angle)}
                            y2={cy + needleLen * Math.sin(angle)}
                            stroke="#FFF"
                            strokeWidth={2}
                            strokeLinecap="round"
                        />
                    );
                })()}
            </Svg>

            {/* G-force labels */}
            <View style={styles.gLabels}>
                <Text style={styles.gLabelLeft}>-{maxG.toFixed(0)}G</Text>
                <Text style={styles.gLabelRight}>{maxG.toFixed(0)}G</Text>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    chartContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    chartLabelColumn: {
        width: 55,
        marginRight: 5,
        alignItems: 'flex-end',
    },
    chartTitle: {
        color: '#888',
        fontSize: 8,
        fontWeight: '800',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    chartValueTop: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    chartUnit: {
        color: '#666',
        fontSize: 8,
        fontWeight: '700',
        marginVertical: 1,
    },
    chartValueBottom: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    chartSvgContainer: {
        borderRadius: 4,
        overflow: 'hidden',
    },
    gaugeContainer: {
        alignItems: 'center',
    },
    gLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: 80,
        marginTop: -10,
    },
    gLabelLeft: {
        color: '#aaa',
        fontSize: 10,
        fontWeight: '700',
    },
    gLabelRight: {
        color: '#aaa',
        fontSize: 10,
        fontWeight: '700',
    },
});
