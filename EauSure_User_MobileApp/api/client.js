import axios from 'axios';
import { getAuthToken } from './tokenStore';

const API_URL = process.env.EXPO_PUBLIC_AUTH_API_URL || 'https://eau-sure-app-auth.vercel.app/api';

const client = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});
client.interceptors.request.use(async (config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default client;
