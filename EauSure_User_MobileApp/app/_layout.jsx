// app/_layout.jsx
import { Slot, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '../context/AuthContext'; // Check your path
import { OnboardingProvider, useOnboarding } from '../context/OnboardingContext'; // Check your path
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StatusBar } from 'react-native';
import { useFonts, Ubuntu_400Regular, Ubuntu_500Medium, Ubuntu_700Bold } from '@expo-google-fonts/ubuntu';
import { ProfileProvider } from '../context/ProfileContext';

function RootLayoutNav() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { hasSeenOnboarding, isLoading: isOnboardingLoading } = useOnboarding();
  const segments = useSegments();
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Ubuntu_400Regular,
    Ubuntu_500Medium,
    Ubuntu_700Bold,
  });

  // State to hold the splash screen visible
  const [isReady, setIsReady] = useState(false);

  // 1. COMBINED CHECK: Are all data sources loaded?
  const isLoadingData = isAuthLoading || isOnboardingLoading || !fontsLoaded;

  useEffect(() => {
    // If we are still fetching data (User, Onboarding status, Fonts), do nothing.
    if (isLoadingData) return;

    // Data is ready! Now let's decide where to go.
    const inAuthGroup = segments[0] === '(auth)';
    const inTabsGroup = segments[0] === '(tabs)';
    const inOnboarding = segments[0] === '(onboarding)';

    // Scenario 1: User is Logged In -> Go to Tabs
    if (user) {
      if (!inTabsGroup) {
        router.replace('/(tabs)');
      } else {
        // We are already in the right place (e.g. user reloaded on the dashboard)
        setIsReady(true);
      }
    } 
    // Scenario 2: User NOT Logged In + Has seen Onboarding -> Go to Auth
    else if (hasSeenOnboarding) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      } else {
        // Already on login/register screen
        setIsReady(true);
      }
    } 
    // Scenario 3: User NOT Logged In + NEW User -> Go to Onboarding
    else {
      if (!inOnboarding) {
        router.replace('/(onboarding)');
      } else {
        // Already on onboarding
        setIsReady(true);
      }
    }
  }, [user, hasSeenOnboarding, isLoadingData, segments]);


  // 2. LISTEN FOR NAVIGATION SUCCESS
  // If we triggered a redirect above, this ensures we hide the spinner 
  // ONLY after the new route has actually mounted.
  useEffect(() => {
    if (!isLoadingData && segments.length > 0) {
       // A small timeout allows the UI to paint before lifting the curtain
       // This kills the last millisecond of "White Flash"
       const timer = setTimeout(() => {
         setIsReady(true);
       }, 50); 
       return () => clearTimeout(timer);
    }
  }, [segments, isLoadingData]);


  // 3. THE LOADING SCREEN (The "Curtain")
  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  // 4. THE APP
  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <StatusBar barStyle="light-content" />
      <Slot />
    </View>
  );
}

import { MqttProvider } from '../context/MqttContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <MqttProvider>
          <OnboardingProvider>
            <RootLayoutNav />
          </OnboardingProvider>
        </MqttProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}