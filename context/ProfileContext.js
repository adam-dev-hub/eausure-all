import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert } from 'react-native';
import profileClient from '../api/profileClient';
import { useAuth } from './AuthContext'; // <-- 1. Import useAuth

const ProfileContext = createContext({});
const profileRequestCache = {
  token: null,
  promise: null,
};

function maskToken(token) {
  if (!token) return '<missing>';
  if (token.length <= 18) return `${token.slice(0, 4)}...${token.slice(-4)}`;
  return `${token.slice(0, 10)}...${token.slice(-8)}`;
}

export function useProfile() {
  return useContext(ProfileContext);
}

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const profileLogSeqRef = React.useRef(0);

  // 2. Grab the user state from AuthContext
  const { user, isLoading: authLoading } = useAuth(); 

  const logProfile = (step, payload = {}) => {
    profileLogSeqRef.current += 1;
    console.log(`[ProfileFlow][${profileLogSeqRef.current}] ${step}`, payload);
  };

  const fetchProfile = async () => {
    const requestToken = user?.token || null;
    logProfile('fetchProfile start', {
      hasUser: !!user,
      authLoading,
      userEmail: user?.email || null,
      token: maskToken(requestToken),
    });
    // 3. Block the request if there is no authenticated user
    if (!user) {
      logProfile('fetchProfile aborted: no user');
      setLoading(false);
      return;
    }

    logProfile('setLoading(true)');
    setLoading(true);
    try {
      logProfile('profileClient.get(/me) start', {
        userEmail: user?.email || null,
        token: maskToken(requestToken),
        dedupeHit: profileRequestCache.token === requestToken && !!profileRequestCache.promise,
      });
      if (profileRequestCache.token !== requestToken || !profileRequestCache.promise) {
        profileRequestCache.token = requestToken;
        profileRequestCache.promise = profileClient.get('/me').finally(() => {
          if (profileRequestCache.token === requestToken) {
            profileRequestCache.promise = null;
          }
        });
      }
      const res = await profileRequestCache.promise;
      logProfile('profileClient.get(/me) success', {
        email: res.data?.email || null,
      });
      setProfile(res.data);
      setError(null);
    } catch (err) {
      logProfile('profileClient.get(/me) error', {
        message: err.message,
        status: err.response?.status || null,
        data: err.response?.data || null,
      });
      console.error("Fetch Profile Error:", {
        message: err.message,
        status: err.response?.status || null,
        data: err.response?.data || null,
      });
      setError("Could not load profile settings");
    } finally {
      logProfile('setLoading(false)');
      setLoading(false);
    }
  };

  const updateProfile = async (updates) => {
    try {
      const oldProfile = { ...profile };
      setProfile({ ...profile, ...updates });

      const res = await profileClient.put('/me', updates);
      
      setProfile(res.data);
      return { success: true };
    } catch (err) {
      console.error("Update Profile Error:", {
        message: err.message,
        status: err.response?.status || null,
        data: err.response?.data || null,
      });
      Alert.alert("Error", "Failed to save settings");
      fetchProfile(); 
      return { success: false, error: err.message };
    }
  };

  // 4. Bind the fetch to the user state instead of mounting
  useEffect(() => {
    logProfile('useEffect fired', {
      authLoading,
      hasUser: !!user,
      userEmail: user?.email || null,
      token: maskToken(user?.token),
    });
    // Only attempt to fetch if AuthContext has finished its initial load
    if (!authLoading) {
      if (user) {
        logProfile('useEffect -> fetchProfile');
        fetchProfile();
      } else {
        // Clear profile if user logs out or session dies
        logProfile('useEffect -> clear profile (no user)');
        setProfile(null);
        setLoading(false);
      }
    }
  }, [user, authLoading]);

  return (
    <ProfileContext.Provider value={{ 
      profile, 
      loading, 
      error, 
      fetchProfile, 
      updateProfile 
    }}>
      {children}
    </ProfileContext.Provider>
  );
}
