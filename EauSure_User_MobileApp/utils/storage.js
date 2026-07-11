// utils/storage.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_KEY = 'eau_sure_onboarding_complete';

export const OnboardingService = {
  checkIfSeen: async () => {
    try {
      const value = await AsyncStorage.getItem(ONBOARDING_KEY);
      return value === 'true';
    } catch (e) {
      return false;
    }
  },

  markAsSeen: async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch (e) {
      console.error('Failed to save onboarding status');
    }
  },

  // DEV ONLY: Call this to reset and test the flow again
  resetOnboarding: async () => {
    try {
      await AsyncStorage.removeItem(ONBOARDING_KEY);
    } catch (e) {
      console.error('Failed to reset onboarding');
    }
  },
};