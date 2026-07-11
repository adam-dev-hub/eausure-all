import axios from 'axios';
import { getAuthToken } from './tokenStore';

const BASE_URL = process.env.EXPO_PUBLIC_ADMIN_API_URL || 'https://eau-sure-app-admin.vercel.app/api';

function buildResolvedUrl(config) {
  const base = config?.baseURL || '';
  const url = config?.url || '';
  if (!base) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${base.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

const adminClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

adminClient.interceptors.request.use(async (config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log('[AdminAPI][REQ]', {
    method: (config.method || 'get').toUpperCase(),
    url: buildResolvedUrl(config),
  });
  return config;
});

adminClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.log('[AdminAPI][ERR]', {
      method: (error.config?.method || 'get').toUpperCase(),
      url: buildResolvedUrl(error.config),
      status: error.response?.status || null,
      data: error.response?.data || null,
      message: error.message,
    });
    return Promise.reject(error);
  }
);

export async function getActiveFirmwareReleases() {
  const response = await adminClient.get('/fuota/catalog');

  const releases = Array.isArray(response.data?.releases) ? response.data.releases : [];
  console.log('[AdminAPI][FUOTA_CATALOG]', {
    count: releases.length,
    releases: releases.map((release) => ({
      id: release.id,
      platform: release.platform,
      version: release.version,
      channel: release.channel,
      status: release.status,
      filename: release.filename,
    })),
  });
  return {
    success: true,
    data: releases,
  };
}

export default adminClient;
