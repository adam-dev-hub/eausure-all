// context/OnboardingContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { OnboardingService } from '../utils/storage';

const OnboardingContext = createContext({});

export function useOnboarding() {
  return useContext(OnboardingContext);
}

export function OnboardingProvider({ children }) {
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkStorage();
  }, []);

  const checkStorage = async () => {
    try {
      const seen = await OnboardingService.checkIfSeen();
      setHasSeenOnboarding(seen);
    } catch (e) {
      console.error("Failed to load onboarding status", e);
    } finally {
      setIsLoading(false);
    }
  };

  const completeOnboarding = async () => {
    await OnboardingService.markAsSeen();
    setHasSeenOnboarding(true); // <--- Updates state immediately
  };

  const resetOnboarding = async () => {
    await OnboardingService.resetOnboarding();
    setHasSeenOnboarding(false);
  };

  return (
    <OnboardingContext.Provider
      value={{
        hasSeenOnboarding,
        isLoading,
        completeOnboarding,
        resetOnboarding
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}