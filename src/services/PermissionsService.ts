import * as Location from 'expo-location';

export class PermissionsService {
    static async requestLocationPermission(): Promise<boolean> {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            console.log('📍 Location permission status:', status);
            return status === 'granted';
        } catch (error) {
            console.error('❌ Location permission error:', error);
            return false;
        }
    }

    static async requestBackgroundLocationPermission(): Promise<boolean> {
        try {
            if (__DEV__) {
                console.log('ℹ️ Skipping background location permission in development; using foreground-only tracking');
                return false;
            }

            const { status } = await Location.requestBackgroundPermissionsAsync();
            console.log('📍 Background location permission status:', status);
            return status === 'granted';
        } catch (error) {
            console.error('❌ Background location permission error:', error);
            return false;
        }
    }

    static async requestAllPermissions(): Promise<{
        location: boolean;
        backgroundLocation: boolean;
    }> {
        console.log('🔐 Requesting all required permissions...');

        const location = await this.requestLocationPermission();
        const backgroundLocation = await this.requestBackgroundLocationPermission();

        console.log('✅ Permissions granted:', { location, backgroundLocation });

        return {
            location,
            backgroundLocation,
        };
    }
}