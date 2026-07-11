import type { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';

export interface ValidationError {
  field?: string;
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: ValidationError[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface SensorReading {
  _id?: string;
  userId: string;
  gatewayId: string;
  gatewayHardwareId: string;
  nodeId: string;
  sequence: number;
  timestamp: string;
  receivedAt?: string;
  battery: { percentage: number; voltage: number; current: number };
  ph: { value: number; score: number };
  tds: { value: number; score: number };
  turbidity: { voltage: number; score: number };
  temperature: { water: number; mpu: number; esp32: number };
  event: { type: string; accelG?: number; dynAccelG?: number };
  signal: { rssi: number; snr: number };
  createdAt?: string;
  updatedAt?: string;
}

export interface SensorStats {
  statistics: {
    avgPH: number;
    avgTDS: number;
    avgTemp: number;
    avgBattery: number;
    minPH: number;
    maxPH: number;
    minTDS: number;
    maxTDS: number;
    count: number;
  };
  events: Array<{ _id: string; count: number }>;
  period: string;
}

export interface SensorHistoryResponse {
  data: SensorReading[];
  pagination?: Pagination;
}

export interface GatewayConfig {
  measureInterval: number;
  shakeEnabled: boolean;
  shakeThreshold: number;
  units: string;
  nodeActive: boolean;
}

export interface Gateway {
  _id?: string;
  gatewayId: string;
  name: string;
  ownerId: string;
  lastSeenAt: string;
  mqttTopic: string;
  config: GatewayConfig;
  status: {
    online: boolean;
    lastHeartbeatAt: string;
    rssi: number;
    snr: number;
    firmwareVersion: string;
  };
}

export interface GatewayStatus {
  gatewayId: string;
  name: string;
  status: string | { online?: boolean };
  lastSeenAt: string;
}

export interface IotNode {
  _id?: string;
  nodeId: string;
  name: string;
  gatewayId: string;
  gatewayHardwareId: string;
  pairedAt: string;
  status: {
    active: boolean;
    lastSeenAt: string;
    firmwareVersion: string;
    lastRssi: number;
    lastSnr: number;
  };
}

export class ExternalApiError extends Error {
  status: number;
  errors?: ValidationError[];

  constructor(message: string, status: number, errors?: ValidationError[]) {
    super(message);
    this.name = 'ExternalApiError';
    this.status = status;
    this.errors = errors;
  }
}

type ApiFetchOptions = {
  request: NextRequest;
  method?: string;
  query?: URLSearchParams | Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
};

function getBaseUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) {
    throw new ExternalApiError('NEXT_PUBLIC_API_URL is not configured', 500);
  }

  return baseUrl.replace(/\/$/, '');
}

function createQueryString(query?: ApiFetchOptions['query']) {
  if (!query) return '';

  const params = query instanceof URLSearchParams ? query : new URLSearchParams();
  if (!(query instanceof URLSearchParams)) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') return;
      params.set(key, String(value));
    });
  }

  const value = params.toString();
  return value ? `?${value}` : '';
}

async function getBearerToken(): Promise<string> {
  const session = await getServerSession(authOptions);

  if (!session?.user || !session.accessToken) {
    throw new ExternalApiError('Unauthorized', 401);
  }

  return session.accessToken;
}

function errorMessageFromPayload(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const typed = payload as Partial<ApiResponse<unknown>>;
    if (typeof typed.message === 'string' && typed.message) return typed.message;
    if (Array.isArray(typed.errors) && typed.errors.length > 0) {
      return typed.errors.map((error) => error.message).filter(Boolean).join(', ') || fallback;
    }
  }

  return fallback;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions): Promise<T> {
  const token = await getBearerToken();
  const url = `${getBaseUrl()}${path}${createQueryString(options.query)}`;
  const headers = new Headers({ Authorization: `Bearer ${token}` });

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body,
    cache: 'no-store',
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json().catch(() => null) : await response.text().catch(() => null);

  if (!response.ok) {
    const typed = payload && typeof payload === 'object' ? (payload as Partial<ApiResponse<unknown>>) : undefined;
    throw new ExternalApiError(errorMessageFromPayload(payload, `External API request failed with status ${response.status}`), response.status, typed?.errors);
  }

  if (payload && typeof payload === 'object' && 'success' in payload) {
    const typed = payload as ApiResponse<T>;
    if (typed.success === false) {
      throw new ExternalApiError(errorMessageFromPayload(typed, 'External API request failed'), response.status, typed.errors);
    }
    if (typed.data !== undefined) {
      return typed.data as T;
    }
  }

  return payload as T;
}

export function toRouteError(error: unknown) {
  if (error instanceof ExternalApiError) {
    return {
      body: { success: false, message: error.message, errors: error.errors },
      status: error.status,
    };
  }

  return {
    body: { success: false, message: error instanceof Error ? error.message : 'Unexpected API error' },
    status: 500,
  };
}
