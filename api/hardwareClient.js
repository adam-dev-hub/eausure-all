import axios from 'axios';
import { getAuthToken } from './tokenStore';

export const HARDWARE_API_URL = process.env.EXPO_PUBLIC_HARDWARE_API_URL || 'https://eau-sure-api.vercel.app/api';

export function maskToken(token) {
  if (!token) return '<missing>';
  if (token.length <= 18) return `${token.slice(0, 4)}...${token.slice(-4)}`;
  return `${token.slice(0, 10)}...${token.slice(-8)}`;
}

function buildResolvedUrl(config) {
  const base = config?.baseURL || '';
  const url = config?.url || '';
  if (!base) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${base.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

const hardwareClient = axios.create({
  baseURL: HARDWARE_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

hardwareClient.interceptors.request.use(async (config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log('[HardwareAPI][REQ]', {
    method: (config.method || 'get').toUpperCase(),
    url: buildResolvedUrl(config),
    token: maskToken(token),
    data: config.data || null,
  });
  return config;
});

hardwareClient.interceptors.response.use(
  (response) => {
    console.log('[HardwareAPI][RES]', {
      method: (response.config?.method || 'get').toUpperCase(),
      url: buildResolvedUrl(response.config),
      status: response.status,
      data: response.data,
    });
    return response;
  },
  (error) => {
    console.log('[HardwareAPI][ERR]', {
      method: (error.config?.method || 'get').toUpperCase(),
      url: buildResolvedUrl(error.config),
      status: error.response?.status || null,
      data: error.response?.data || null,
      message: error.message,
    });
    return Promise.reject(error);
  }
);

export function isHardwareApiConfigured() {
  return HARDWARE_API_URL.trim().length > 0;
}

export default hardwareClient;
