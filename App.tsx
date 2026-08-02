import React, { useEffect } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';

// Screens — Garmin Catalyst layout
import DashboardScreen from './src/screens/DashboardScreen';   // DRIVE
import TracksScreen from './src/screens/TracksScreen';         // TRACKS / SETUP
import SessionsScreen from './src/screens/SessionsScreen';     // HISTORY
import OpportunitiesScreen from './src/components/OpportunitiesScreen'; // COACH
import SettingsScreen from './src/screens/SettingsScreen';     // SETTINGS

// Services
import { SensorService } from './src/services/SensorService';
import { PermissionsService } from './src/services/PermissionsService';

// Types
import { RootTabParamList } from './src/types';

const Tab = createBottomTabNavigator<RootTabParamList>();

// Catalyst‑style pure‑black theme
const CatalystTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#FFC107',
    background: '#000000',
    card: '#000000',
    text: '#ffffff',
    border: '#111111',
    notification: '#FFC107',
  },
};

const App: React.FC = () => {
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      console.log('🚗 RaceBuddy starting up…');
      SensorService.initialize();
      const perms = await PermissionsService.requestAllPermissions();
      if (perms.location) console.log('✅ Location OK');
      else console.warn('⚠️ Location denied — GPS limited');
      console.log('🏁 RaceBuddy ready!');
    } catch (e) {
      console.error('❌ Init failed:', e);
    }
  };

  const icon = (name: keyof RootTabParamList, focused: boolean) => {
    const c = focused ? '#FFC107' : '#444';
    const s = 22;
    switch (name) {
      case 'Dashboard': return <MaterialIcons name="speed" size={s} color={c} />;
      case 'Tracks': return <MaterialIcons name="map" size={s} color={c} />;
      case 'Sessions': return <MaterialIcons name="history" size={s} color={c} />;
      case 'Analysis': return <MaterialIcons name="insights" size={s} color={c} />;
      case 'Settings': return <MaterialIcons name="settings" size={s} color={c} />;
      default: return <MaterialIcons name="help" size={s} color={c} />;
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#000000" />
      <NavigationContainer theme={CatalystTheme}>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            tabBarIcon: ({ focused }) => icon(route.name, focused),
            tabBarActiveTintColor: '#FFC107',
            tabBarInactiveTintColor: '#444',
            tabBarStyle: {
              backgroundColor: '#000',
              borderTopWidth: 1,
              borderTopColor: '#111',
              height: 72,
              paddingBottom: 22,
              paddingTop: 6,
            },
            tabBarLabelStyle: {
              fontSize: 10,
              fontWeight: '900',
              letterSpacing: 0.5,
            },
            headerShown: false, // screens handle their own headers
          })}
        >
          <Tab.Screen
            name="Dashboard"
            component={DashboardScreen}
            options={{ title: 'DRIVE' }}
          />
          <Tab.Screen
            name="Tracks"
            component={TracksScreen}
            options={{ title: 'TRACKS' }}
          />
          <Tab.Screen
            name="Sessions"
            component={SessionsScreen}
            options={{ title: 'HISTORY' }}
          />
          <Tab.Screen
            name="Analysis"
            component={OpportunitiesScreen}
            options={{ title: 'COACH' }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: 'SETUP' }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App;
