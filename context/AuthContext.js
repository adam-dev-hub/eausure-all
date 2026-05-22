// context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import client from '../api/client';
import { clearAuthToken, setAuthToken } from '../api/tokenStore';

const AuthContext = createContext({});

function maskToken(token) {
  if (!token) return '<missing>';
  if (token.length <= 18) return `${token.slice(0, 4)}...${token.slice(-4)}`;
  return `${token.slice(0, 10)}...${token.slice(-8)}`;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const restoreStartedRef = React.useRef(false);
  const authFlowSeqRef = React.useRef(0);
  const authLogSeqRef = React.useRef(0);

  const logAuth = (step, payload = {}) => {
    authLogSeqRef.current += 1;
    console.log(`[AuthFlow][${authLogSeqRef.current}] ${step}`, payload);
  };

  useEffect(() => {
    logAuth('useEffect mount', {
      restoreStarted: restoreStartedRef.current,
    });
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;
    logAuth('checkLoginStatus scheduled');
    checkLoginStatus();
  }, []);

 const checkLoginStatus = async () => {
  logAuth('checkLoginStatus start');
  try {
    const token = await SecureStore.getItemAsync('userToken');
    logAuth('SecureStore.getItemAsync resolved', {
      token: maskToken(token),
      hasToken: !!token,
    });

    if (token) {
      logAuth('existing token found -> loginWithToken', {
        token: maskToken(token),
      });
      await loginWithToken(token);
    } else {
      logAuth('no token found -> clear local auth state');
      clearAuthToken();
      setUser(null);
    }

  } catch (e) {
    logAuth('checkLoginStatus exception', {
      message: e.message,
    });
    await SecureStore.deleteItemAsync('userToken');
    clearAuthToken();
    setUser(null);

  } finally {
    logAuth('checkLoginStatus finally -> setIsLoading(false)');
    setIsLoading(false);
  }
};

  const login = async (email, password) => {
    logAuth('login start', { email });
    try {
      const res = await client.post('/auth/login', { email, password });
      logAuth('login response', {
        hasToken: !!res.data?.token,
        token: maskToken(res.data?.token),
        userId: res.data?.user?.id || null,
      });

      if (res.data.token) {
        logAuth('SecureStore.setItemAsync(login token) start', {
          token: maskToken(res.data.token),
        });
        await SecureStore.setItemAsync('userToken', res.data.token);
        logAuth('SecureStore.setItemAsync(login token) done');
        await loginWithToken(res.data.token);
        return { success: true };
      }
    } catch (error) {
      logAuth('login error', {
        message: error.message,
        status: error.response?.status || null,
        data: error.response?.data || null,
      });
      return { 
        success: false, 
        msg: error.response?.data?.message || 'Erreur de connexion' 
      };
    }
  };
  const register = async (email, password, name) => {
  try {
    await client.post('/auth/register', { email, password, name });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      msg: error.response?.data?.message || "Erreur lors de l'inscription"
    };
  }
};
const loginWithToken = async (token) => {
  const flowId = ++authFlowSeqRef.current;
  logAuth('loginWithToken start', {
    flowId,
    token: maskToken(token),
  });
  try {
    setAuthToken(token);
    logAuth('SecureStore.setItemAsync(loginWithToken) start', {
      flowId,
      token: maskToken(token),
    });
    await SecureStore.setItemAsync('userToken', token);
    logAuth('SecureStore.setItemAsync(loginWithToken) done', { flowId });

    logAuth('GET /auth/me start', { flowId, token: maskToken(token) });
    const res = await client.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    logAuth('GET /auth/me success', {
      flowId,
      userId: res.data?.user?._id || null,
      email: res.data?.user?.email || null,
    });

    if (flowId !== authFlowSeqRef.current) {
      logAuth('loginWithToken stale flow ignored', {
        flowId,
        currentFlow: authFlowSeqRef.current,
      });
      return;
    }
    logAuth('setUser from loginWithToken', {
      flowId,
      token: maskToken(token),
      email: res.data?.user?.email || null,
    });
    setUser({ token, ...res.data.user });
  } catch (e) {
    logAuth('loginWithToken error', {
      flowId,
      token: maskToken(token),
      message: e.message,
      status: e.response?.status || null,
      data: e.response?.data || null,
    });
    await SecureStore.deleteItemAsync('userToken');
    clearAuthToken();
    if (flowId !== authFlowSeqRef.current) {
      logAuth('loginWithToken error stale flow ignored', {
        flowId,
        currentFlow: authFlowSeqRef.current,
      });
      return;
    }
    logAuth('setUser(null) from loginWithToken error', { flowId });
    setUser(null);
  }
};


  const logout = async () => {
    logAuth('logout start', {
      currentUserEmail: user?.email || null,
      token: maskToken(user?.token),
    });
    await SecureStore.deleteItemAsync('userToken');
    clearAuthToken();
    logAuth('logout setUser(null)');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, isLoading, login, register, logout, loginWithToken }}>
      {children}
    </AuthContext.Provider>
  );
}
