import axios from 'axios';
import { getAuthToken } from './tokenStore';

const BASE_URL = process.env.EXPO_PUBLIC_PROFILE_API_URL || 'https://eau-sure-app-profile.vercel.app/api';

function maskToken(token) {
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

const profileClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'okhttp/4.12.0',
  },
});

// Auto-attach token to every request
profileClient.interceptors.request.use(async (config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log('[ProfileAPI][REQ]', {
    method: (config.method || 'get').toUpperCase(),
    url: buildResolvedUrl(config),
    token: maskToken(token),
    headers: {
      Accept: config.headers?.Accept,
      'Content-Type': config.headers?.['Content-Type'],
      'User-Agent': config.headers?.['User-Agent'],
      Authorization: token ? `Bearer ${maskToken(token)}` : '<missing>',
    },
  });
  return config;
});

profileClient.interceptors.response.use(
  (response) => {
    console.log('[ProfileAPI][RES]', {
      method: (response.config?.method || 'get').toUpperCase(),
      url: buildResolvedUrl(response.config),
      status: response.status,
      data: response.data,
    });
    return response;
  },
  (error) => {
    console.log('[ProfileAPI][ERR]', {
      method: (error.config?.method || 'get').toUpperCase(),
      url: buildResolvedUrl(error.config),
      status: error.response?.status || null,
      data: error.response?.data || null,
      message: error.message,
    });
    return Promise.reject(error);
  }
);

export default profileClient;
