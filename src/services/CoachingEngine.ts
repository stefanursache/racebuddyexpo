/**
 * Enhanced Coaching Analysis Engine for RaceBuddy
 * 
 * Provides real, actionable coaching insights based on actual session telemetry.
 * Focuses on the top 3 opportunities with specific, data-driven recommendations.
 */

import { RacingSession, TelemetryData } from '../types';
import { LapAnalyzer } from '../services/LapAnalyzer';
import { TrackSegment } from '../types/analysis';

export interface CornerLocation {
    cornerNumber: number;
    distance: number;
    latitude: number;
    longitude: number;
    altitude: number;
    direction: 'left' | 'right';
}

export interface CoachingInsight {
    priority: 'high' | 'medium' | 'low';
    corner: number;
    topic: 'braking' | 'apex' | 'acceleration' | 'consistency';
    title: string;
    description: string;
    timeSaved: number; // seconds
    segment: TrackSegment;
    location: CornerLocation;
    metric: {
        current: number;
        target: number;
        unit: string;
        icon: string;
    };
}

export interface SessionCoachingAnalysis {
    topOpportunities: CoachingInsight[];
    allCorners: CornerLocation[];
    trackBounds: {
        minLat: number;
        maxLat: number;
        minLon: number;
        maxLon: number;
    };
    sessionEfficiency: number; // 0-100%
    consistencyScore: number; // 0-100% lap-to-lap variance
    recommendation: string;
}

export class RealCoachingEngine {
    /**
     * Analyze a session and provide real coaching insights
     */
    static analyzeSession(session: RacingSession): SessionCoachingAnalysis {
        try {
            // Use the real LapAnalyzer to get actual opportunity data
            const analyzer = new LapAnalyzer();
            const analysis = analyzer.analyzeSession(session);

            // Extract corner locations from telemetry
            const allCorners = this.extractCornerLocations(analysis.segments, analysis.bestLap);
            const trackBounds = this.calculateTrackBounds(analysis.bestLap);

            // Identify top 3 opportunities by time delta
            const topOpp = analysis.opportunities
                .sort((a, b) => b.totalTimeDelta - a.totalTimeDelta)
                .slice(0, 3)
                .map((opp, idx) => this.opportunityToInsight(opp, idx, analysis.segments, allCorners));

            // Calculate session efficiency (how close to ideal)
            const efficiency = Math.max(0, 100 - (analysis.summary.totalTimeDelta / analysis.summary.bestLapTime) * 100);

            // Calculate consistency (variance in lap times)
            const consistency = this.calculateConsistency(session.lapTimes);

            // Generate overall recommendation
            const recommendation = this.generateRecommendation(topOpp, efficiency, consistency);

            return {
                topOpportunities: topOpp,
                allCorners,
                trackBounds,
                sessionEfficiency: Math.round(efficiency * 10) / 10,
                consistencyScore: consistency,
                recommendation,
            };
        } catch (error) {
            console.error('Coaching analysis error:', error);
            return {
                topOpportunities: [],
                allCorners: [],
                trackBounds: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 },
                sessionEfficiency: 0,
                consistencyScore: 0,
                recommendation: 'Unable to analyze session. More laps needed for insights.',
            };
        }
    }

    /**
     * Extract corner locations from track segments and telemetry
     */
    private static extractCornerLocations(segments: TrackSegment[], bestLap: any): CornerLocation[] {
        const corners: CornerLocation[] = [];
        const cornerSegments = segments.filter(s => s.type === 'corner');

        cornerSegments.forEach((seg, idx) => {
            // Get telemetry points in this segment
            const segPoints = bestLap.points.filter((p: any) =>
                p.distance >= seg.startDistance && p.distance <= seg.endDistance
            );

            if (segPoints.length > 0) {
                // Calculate average position (apex)
                const midPoint = segPoints[Math.floor(segPoints.length / 2)];
                corners.push({
                    cornerNumber: seg.cornerNumber || idx + 1,
                    distance: seg.startDistance,
                    latitude: midPoint?.location?.latitude || 0,
                    longitude: midPoint?.location?.longitude || 0,
                    altitude: midPoint?.location?.altitude || 0,
                    direction: seg.cornerDirection && seg.cornerDirection > 0 ? 'right' : 'left',
                });
            }
        });

        return corners;
    }

    /**
     * Calculate geographic bounds of the track
     */
    private static calculateTrackBounds(bestLap: any): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
        if (!bestLap.points || bestLap.points.length === 0) {
            return { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };
        }

        const lats = bestLap.points.map((p: any) => p.location?.latitude || 0);
        const lons = bestLap.points.map((p: any) => p.location?.longitude || 0);

        return {
            minLat: Math.min(...lats),
            maxLat: Math.max(...lats),
            minLon: Math.min(...lons),
            maxLon: Math.max(...lons),
        };
    }

    /**
     * Convert opportunity to actionable coaching insight
     */
    private static opportunityToInsight(opp: any, index: number, segments: TrackSegment[], allCorners: CornerLocation[]): CoachingInsight {
        const topic = this.selectTopic(opp, index);
        const { title, description, metric } = this.generateAdvice(opp, topic);
        const location = allCorners.find(c => c.cornerNumber === opp.number) || allCorners[0];

        return {
            priority: index === 0 ? 'high' : index === 1 ? 'medium' : 'low',
            corner: opp.number,
            topic,
            title,
            description,
            timeSaved: opp.totalTimeDelta,
            segment: opp.segment,
            location,
            metric,
        };
    }

    /**
     * Determine coaching focus based on opportunity profile
     */
    private static selectTopic(opp: any, index: number): 'braking' | 'apex' | 'acceleration' | 'consistency' {
        if (index === 0) {
            // Biggest delta: focus on where most time is lost
            const brakingFraction = (opp.braking?.timeDelta || 0) / opp.totalTimeDelta;
            const apexFraction = (opp.apex?.timeDelta || 0) / opp.totalTimeDelta;

            if (brakingFraction > 0.5) return 'braking';
            if (apexFraction > 0.4) return 'apex';
        }
        if (index === 1) return 'apex';
        return 'acceleration';
    }

    /**
     * Generate specific, data-driven coaching advice
     */
    private static generateAdvice(
        opp: any,
        topic: string
    ): { title: string; description: string; metric: { current: number; target: number; unit: string; icon: string } } {
        switch (topic) {
            case 'braking':
                const brakingDelta = opp.braking?.distanceDelta || 0;
                const brakingDirection = brakingDelta > 0 ? 'later' : 'earlier';
                return {
                    title: `Corner ${opp.number}: BRAKE POINT`,
                    description: `You're braking ${Math.abs(brakingDelta).toFixed(0)} m ${brakingDirection}. Move your braking point deeper into the corner to carry more speed through apex.`,
                    metric: {
                        current: Math.round(opp.braking?.bestLapBrakingG || 0.8 * 10) / 10,
                        target: Math.round((opp.braking?.optimalBrakingG || 1.2) * 10) / 10,
                        unit: 'G',
                        icon: 'arrow-downward',
                    },
                };

            case 'apex':
                const apexType = opp.apex?.apexType || 'on_target';
                return {
                    title: `Corner ${opp.number}: APEX PLACEMENT`,
                    description: apexType === 'early'
                        ? `You're turning in too early. An earlier apex locks you into a tighter line. Turn in later and carry more mid-corner speed.`
                        : `You're clipping the apex late. Early apex allows later exit acceleration. Commit to the turn-in earlier.`,
                    metric: {
                        current: Math.round(opp.apex?.bestLapApexSpeed || 50),
                        target: Math.round(opp.apex?.optimalApexSpeed || 55),
                        unit: 'km/h',
                        icon: 'gps-fixed',
                    },
                };

            case 'acceleration':
                return {
                    title: `Corner ${opp.number}: THROTTLE APPLICATION`,
                    description: `Aggressive throttle application earlier in the exit will help carry momentum. You're being too conservative with acceleration timing.`,
                    metric: {
                        current: Math.round(opp.speed?.bestLapMaxSpeed || 100),
                        target: Math.round(opp.speed?.optimalMaxSpeed || 105),
                        unit: 'km/h',
                        icon: 'speed',
                    },
                };

            default:
                return {
                    title: `Corner ${opp.number}: CONSISTENCY`,
                    description: `Focus on smooth, progressive inputs. Small improvements here add up across the lap.`,
                    metric: {
                        current: 0,
                        target: 0,
                        unit: '',
                        icon: 'trending-up',
                    },
                };
        }
    }

    /**
     * Calculate lap-to-lap consistency (0-100%)
     */
    private static calculateConsistency(lapTimes: any[]): number {
        if (lapTimes.length < 2) return 100;

        const times = lapTimes.map(l => l.duration);
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const variance = times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length;
        const stdDev = Math.sqrt(variance);
        const coeffVar = (stdDev / avg) * 100;

        // Convert coefficient of variation to 0-100 consistency score
        // >5% = 0, <1% = 100
        return Math.max(0, Math.min(100, 100 - (coeffVar - 1) * 25));
    }

    /**
     * Generate overall session recommendation
     */
    private static generateRecommendation(
        insights: CoachingInsight[],
        efficiency: number,
        consistency: number
    ): string {
        if (insights.length === 0) {
            return 'Great session! Focus on building consistency across multiple laps.';
        }

        if (efficiency > 90) {
            return `You're very efficient! ${insights[0].title} is your biggest opportunity.`;
        }

        if (consistency < 60) {
            return 'Focus on repeating your best lap. Consistency will unlock more speed than chasing individual corners.';
        }

        if (insights[0].timeSaved > 0.5) {
            return `Big opportunity at Corner ${insights[0].corner}. Practice this specific corner in isolation.`;
        }

        return `Work on ${insights[0].topic === 'braking' ? 'brake point precision' : 'apex placement consistency'}. Small gains here multiply across the track.`;
    }
}

/**
 * Get coaching insights for a session
 * Used by SessionsScreen to display real coaching data
 */
export function getSessionCoaching(session: RacingSession): SessionCoachingAnalysis {
    return RealCoachingEngine.analyzeSession(session);
}

/**
 * Get corner location for map display
 */
export function getCornerLocation(insight: CoachingInsight | null): CornerLocation | null {
    return insight?.location || null;
}
