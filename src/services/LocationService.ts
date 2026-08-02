import * as ExpoLocation from 'expo-location';
import { Location } from '../types';

export class LocationService {
    private static subscription: ExpoLocation.LocationSubscription | null = null;
    private static currentLocation: Location | null = null;
    private static locationUpdateCallback: ((location: Location) => void) | null = null;

    static async getCurrentLocation(): Promise<Location | null> {
        try {
            const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.error('❌ Location permission not granted');
                return null;
            }

            const position = await ExpoLocation.getCurrentPositionAsync({
                accuracy: ExpoLocation.Accuracy.BestForNavigation,
            });

            const location: Location = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                altitude: position.coords.altitude || undefined,
                accuracy: position.coords.accuracy || undefined,
                speed: position.coords.speed || undefined,
                heading: position.coords.heading || undefined,
                timestamp: position.timestamp,
            };

            this.currentLocation = location;
            console.log('📍 Current location:', location);
            return location;
        } catch (error) {
            console.error('❌ Location error:', error);
            return null;
        }
    }

    static async startLocationTracking(callback: (location: Location) => void): Promise<void> {
        this.locationUpdateCallback = callback;

        try {
            // First request foreground permission
            let { status } = await ExpoLocation.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.error('❌ Foreground location permission not granted');
                return;
            }

            this.subscription = await ExpoLocation.watchPositionAsync(
                {
                    accuracy: ExpoLocation.Accuracy.BestForNavigation,
                    distanceInterval: 1, // Update every meter
                    timeInterval: 100, // Update every 100ms for racing precision
                },
                (position) => {
                    const location: Location = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        altitude: position.coords.altitude || undefined,
                        accuracy: position.coords.accuracy || undefined,
                        speed: position.coords.speed || undefined,
                        heading: position.coords.heading || undefined,
                        timestamp: position.timestamp,
                    };

                    this.currentLocation = location;

                    if (this.locationUpdateCallback) {
                        this.locationUpdateCallback(location);
                    }
                }
            );

            console.log('🏁 Location tracking started');
        } catch (error) {
            console.error('❌ Location tracking error:', error);
        }
    }

    static stopLocationTracking(): void {
        if (this.subscription) {
            this.subscription.remove();
            this.subscription = null;
            this.locationUpdateCallback = null;
            console.log('⏹️ Location tracking stopped');
        }
    }

    static getLastKnownLocation(): Location | null {
        return this.currentLocation;
    }

    // Calculate distance between two points using Haversine formula
    static calculateDistance(point1: Location, point2: Location): number {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = (point1.latitude * Math.PI) / 180;
        const φ2 = (point2.latitude * Math.PI) / 180;
        const Δφ = ((point2.latitude - point1.latitude) * Math.PI) / 180;
        const Δλ = ((point2.longitude - point1.longitude) * Math.PI) / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    }

    // Calculate bearing between two points
    static calculateBearing(point1: Location, point2: Location): number {
        const φ1 = (point1.latitude * Math.PI) / 180;
        const φ2 = (point2.latitude * Math.PI) / 180;
        const Δλ = ((point2.longitude - point1.longitude) * Math.PI) / 180;

        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

        const θ = Math.atan2(y, x);
        return (θ * 180 / Math.PI + 360) % 360; // Bearing in degrees
    }
}