/**
 * RaceBuddy - Corner Arc Visualization
 *
 * Renders the Garmin Catalyst–style corner arc showing turn entry,
 * apex, and exit with optimal vs actual driving line overlay.
 * Uses react-native-svg for the arc rendering.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Polygon, Line, G } from 'react-native-svg';
import { OpportunityApex } from '../types/analysis';

interface CornerArcProps {
    apex: OpportunityApex;
    cornerDirection?: number; // 1 = right, -1 = left
    size?: number;
    showLabels?: boolean;
}

const CornerArc: React.FC<CornerArcProps> = ({
    apex,
    cornerDirection = 1,
    size = 180,
    showLabels = true,
}) => {
    const cx = size / 2;
    const cy = size / 2 + 10;
    const radius = size * 0.38;

    // Arc angles (in degrees, 0 = top)
    const startAngle = -140;
    const endAngle = -40;
    const arcSweep = endAngle - startAngle;

    // Flip for left turns
    const flip = cornerDirection < 0 ? -1 : 1;

    // Position along the arc for turn entry and apex
    const turnEntryAngle = startAngle + arcSweep * 0.25;
    const apexAngle = startAngle + arcSweep * 0.5;
    const exitAngle = startAngle + arcSweep * 0.75;

    // Determine colors based on apex analysis
    const getArcColor = (progress: number): string => {
        // Green = good (matches optimal), Yellow = room to improve, Red = significant gap
        if (progress < 0.3) return '#4CAF50'; // Entry
        if (progress < 0.6) {
            // Apex zone
            if (apex.apexType === 'on_target') return '#4CAF50';
            if (apex.apexType === 'early') return '#FFC107';
            return '#FF5722';
        }
        return '#4CAF50'; // Exit
    };

    // Create arc path segments with gradient colors
    const createArcPath = (
        startDeg: number,
        endDeg: number,
        r: number,
    ): string => {
        const startRad = (startDeg * Math.PI) / 180;
        const endRad = (endDeg * Math.PI) / 180;
        const x1 = cx + r * Math.cos(startRad) * flip;
        const y1 = cy + r * Math.sin(startRad);
        const x2 = cx + r * Math.cos(endRad) * flip;
        const y2 = cy + r * Math.sin(endRad);
        const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;

        return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${flip > 0 ? 1 : 0} ${x2} ${y2}`;
    };

    // Optimal line (thin, magenta/pink)
    const optimalArcPath = createArcPath(startAngle, endAngle, radius - 8);
    // Actual line (thicker, shows color-coded performance)
    const actualArcPath = createArcPath(startAngle, endAngle, radius);

    // Segment the actual arc into colored sections
    const numSegments = 12;
    const segmentAngle = arcSweep / numSegments;

    // Position helper
    const posOnArc = (angleDeg: number, r: number) => {
        const rad = (angleDeg * Math.PI) / 180;
        return {
            x: cx + r * Math.cos(rad) * flip,
            y: cy + r * Math.sin(rad),
        };
    };

    // Turn entry marker position
    const turnEntryPos = posOnArc(turnEntryAngle, radius + 20);
    // Apex marker position
    const apexPos = posOnArc(apexAngle, radius + 20);

    // Speed labels positions
    const speedLeftPos = posOnArc(startAngle + arcSweep * 0.15, radius + 35);
    const speedCenterPos = posOnArc(apexAngle, radius - 35);
    const speedRightPos = posOnArc(startAngle + arcSweep * 0.85, radius + 35);

    return (
        <View style={[styles.container, { width: size, height: size + 40 }]}>
            <Svg width={size} height={size + 20} viewBox={`0 0 ${size} ${size + 20}`}>
                {/* Background track outline */}
                <Path
                    d={createArcPath(startAngle, endAngle, radius)}
                    stroke="#333"
                    strokeWidth={14}
                    fill="none"
                    strokeLinecap="round"
                />

                {/* Colored arc segments (actual performance) */}
                {Array.from({ length: numSegments }).map((_, i) => {
                    const segStart = startAngle + i * segmentAngle;
                    const segEnd = segStart + segmentAngle + 1; // +1 for overlap
                    const progress = i / numSegments;
                    const color = getArcColor(progress);

                    return (
                        <Path
                            key={`seg-${i}`}
                            d={createArcPath(segStart, Math.min(segEnd, endAngle), radius)}
                            stroke={color}
                            strokeWidth={10}
                            fill="none"
                            strokeLinecap="round"
                        />
                    );
                })}

                {/* Optimal line (thin pink/magenta) */}
                <Path
                    d={optimalArcPath}
                    stroke="#E040FB"
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray="6 3"
                />

                {/* Turn Entry diamond marker */}
                <G transform={`translate(${turnEntryPos.x}, ${turnEntryPos.y})`}>
                    <Polygon
                        points="0,-6 6,0 0,6 -6,0"
                        fill="#E040FB"
                    />
                </G>

                {/* Apex triangle marker */}
                <G transform={`translate(${apexPos.x}, ${apexPos.y})`}>
                    <Polygon
                        points="0,-7 6,5 -6,5"
                        fill="#E040FB"
                    />
                </G>

                {/* Speed labels on the arc */}
                {showLabels && (
                    <>
                        {/* Entry speed */}
                        <G transform={`translate(${speedLeftPos.x}, ${speedLeftPos.y})`}>
                            <Circle r={2} fill="#fff" />
                        </G>

                        {/* Apex speed (center bottom of arc) */}
                        <G transform={`translate(${speedCenterPos.x}, ${speedCenterPos.y})`}>
                            <Circle r={2} fill="#fff" />
                        </G>

                        {/* Exit speed */}
                        <G transform={`translate(${speedRightPos.x}, ${speedRightPos.y})`}>
                            <Circle r={2} fill="#fff" />
                        </G>
                    </>
                )}
            </Svg>

            {/* Speed numbers overlay */}
            {showLabels && (
                <View style={styles.speedOverlay}>
                    <Text style={[styles.speedText, { position: 'absolute', left: 10, top: size * 0.35 }]}>
                        {Math.round(apex.bestLapApexSpeed + 15)}
                    </Text>
                    <Text style={[styles.speedTextLarge, { position: 'absolute', left: size * 0.35, top: size * 0.45 }]}>
                        {Math.round(apex.bestLapApexSpeed)}
                    </Text>
                    <Text style={[styles.speedTextSmall, { position: 'absolute', left: size * 0.35, top: size * 0.45 + 22 }]}>
                        {Math.round(apex.optimalApexSpeed)}
                    </Text>
                    <Text style={[styles.speedText, { position: 'absolute', right: 10, top: size * 0.35 }]}>
                        {Math.round(apex.bestLapApexSpeed + 8)}
                    </Text>
                    <Text style={[styles.speedText, { position: 'absolute', left: size * 0.4, bottom: 0 }]}>
                        {Math.round(apex.bestLapApexSpeed - 5)}
                    </Text>
                </View>
            )}

            {/* Legend */}
            <View style={styles.legend}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDiamond, { backgroundColor: '#E040FB' }]} />
                    <Text style={styles.legendText}>TURN ENTRY</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendTriangle, { borderBottomColor: '#E040FB' }]} />
                    <Text style={styles.legendText}>APEX</Text>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    speedOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    speedText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    speedTextLarge: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
        fontFamily: 'monospace',
    },
    speedTextSmall: {
        color: '#aaa',
        fontSize: 14,
        fontWeight: '600',
        fontFamily: 'monospace',
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
        marginTop: 5,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    legendDiamond: {
        width: 8,
        height: 8,
        transform: [{ rotate: '45deg' }],
        marginRight: 5,
    },
    legendTriangle: {
        width: 0,
        height: 0,
        borderLeftWidth: 5,
        borderRightWidth: 5,
        borderBottomWidth: 8,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        marginRight: 5,
    },
    legendText: {
        color: '#aaa',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});

export default CornerArc;
