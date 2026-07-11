'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IClientOptions } from 'mqtt';
import { toast } from 'sonner';
import type { SensorReading } from '@/lib/api/client';
import { apiErrorFromResponse, classifyApiError } from '@/lib/api/error-utils';
import { useT } from '@/lib/useT';

export type LiveSensorConnectionStatus = 'connecting' | 'mqtt' | 'polling' | 'offline' | 'error';

interface UseLiveSensorDataResult {
  latest: SensorReading | null;
  history: SensorReading[];
  loading: boolean;
  error: string | null;
  connectionStatus: LiveSensorConnectionStatus;
  source: 'mqtt' | 'polling';
  refresh: () => Promise<void>;
}

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const MAX_HISTORY = 25;

function readingKey(reading: SensorReading) {
  return reading._id || `${reading.gatewayId}:${reading.nodeId}:${reading.sequence}:${reading.timestamp}`;
}

function uniqueReadings(items: SensorReading[]) {
  const seen = new Set<string>();
  const result: SensorReading[] = [];

  for (const item of items) {
    const key = readingKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function matchesFilter(reading: SensorReading, gatewayId?: string, nodeId?: string) {
  if (gatewayId && reading.gatewayId !== gatewayId && reading.gatewayHardwareId !== gatewayId) return false;
  if (nodeId && reading.nodeId !== nodeId) return false;
  return true;
}

export function useLiveSensorData(gatewayId?: string, nodeId?: string, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS): UseLiveSensorDataResult {
  const t = useT('dashboard');
  const [latest, setLatest] = useState<SensorReading | null>(null);
  const [history, setHistory] = useState<SensorReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<LiveSensorConnectionStatus>('connecting');
  const [source, setSource] = useState<'mqtt' | 'polling'>('polling');
  const fallbackToastShownRef = useRef(false);

  const mqttUrl = process.env.NEXT_PUBLIC_MQTT_BROKER_URL || 'ws://broker.hivemq.com:8000/mqtt';
  const mqttTopic = process.env.NEXT_PUBLIC_MQTT_TOPIC || 'water-quality/live-data';

  const addReading = useCallback((reading: SensorReading) => {
    setLatest(reading);
    setHistory((prev) => uniqueReadings([reading, ...prev]).slice(0, MAX_HISTORY));
  }, []);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams();
    if (gatewayId) params.set('gatewayId', gatewayId);
    if (nodeId) params.set('nodeId', nodeId);

    try {
      const response = await fetch(`/api/eausure/latest${params.toString() ? `?${params.toString()}` : ''}`, { cache: 'no-store' });
      if (!response.ok) throw await apiErrorFromResponse(response);

      const reading = (await response.json()) as SensorReading | null;
      if (reading && matchesFilter(reading, gatewayId, nodeId)) {
        addReading(reading);
      }
      setError(null);
      fallbackToastShownRef.current = false;
    } catch (err) {
      console.error('[live sensor data] Failed to refresh latest reading', err);
      setError(classifyApiError(err, t));
      setConnectionStatus((current) => (current === 'mqtt' ? current : 'error'));
      if (!fallbackToastShownRef.current) {
        toast.warning(t('live.unavailableTitle'), {
          description: t('live.unavailableDescription'),
          duration: 6000,
        });
        fallbackToastShownRef.current = true;
      }
    } finally {
      setLoading(false);
    }
  }, [addReading, gatewayId, nodeId, t]);

  useEffect(() => {
    let mounted = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let mqttClient: { end: (force?: boolean) => void } | null = null;

    const startPolling = () => {
      if (!mounted || pollInterval) return;
      setSource('polling');
      setConnectionStatus('polling');
      void refresh();
      pollInterval = setInterval(() => {
        void refresh();
      }, pollIntervalMs);
    };

    const stopPolling = () => {
      if (!pollInterval) return;
      clearInterval(pollInterval);
      pollInterval = null;
    };

    const start = async () => {
      setLoading(true);
      setConnectionStatus('connecting');
      await refresh();

      try {
        const mqtt = await import('mqtt');
        const client = mqtt.connect(mqttUrl, {
          reconnectPeriod: 4000,
          connectTimeout: 10_000,
        } as IClientOptions);

        mqttClient = client;

        client.on('connect', () => {
          if (!mounted) return;
          client.subscribe(mqttTopic, { qos: 1 }, (err) => {
            if (err) {
              startPolling();
              return;
            }

            stopPolling();
            setSource('mqtt');
            setConnectionStatus('mqtt');
            setError(null);
          });
        });

        client.on('message', (_topic, message) => {
          if (!mounted) return;
          try {
            const payload = JSON.parse(message.toString()) as SensorReading;
            if (!payload || !matchesFilter(payload, gatewayId, nodeId)) return;
            addReading(payload);
            setLoading(false);
            setError(null);
          } catch {
            startPolling();
          }
        });

        client.on('error', () => {
          if (!mounted) return;
          startPolling();
        });

        client.on('offline', () => {
          if (!mounted) return;
          setConnectionStatus('offline');
          startPolling();
        });
      } catch {
        startPolling();
      }
    };

    void start();

    return () => {
      mounted = false;
      stopPolling();
      if (mqttClient) mqttClient.end(true);
    };
  }, [addReading, gatewayId, mqttTopic, mqttUrl, nodeId, pollIntervalMs, refresh]);

  return useMemo(
    () => ({ latest, history, loading, error, connectionStatus, source, refresh }),
    [connectionStatus, error, history, latest, loading, refresh, source]
  );
}
