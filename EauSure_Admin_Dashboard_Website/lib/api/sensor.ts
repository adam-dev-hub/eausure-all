import { apiFetch, type SensorHistoryResponse, type SensorReading, type SensorStats } from './client';

export type SensorDataQuery = {
  page?: string | number;
  limit?: string | number;
  gatewayId?: string;
  nodeId?: string;
  startDate?: string;
  endDate?: string;
  eventType?: string;
};

export function getSensorData(query: URLSearchParams | SensorDataQuery) {
  return apiFetch<SensorHistoryResponse | SensorReading[]>('/api/sensor-data', { query });
}

export function getLatestSensorReading(query?: Pick<SensorDataQuery, 'nodeId' | 'gatewayId'> | URLSearchParams) {
  return apiFetch<SensorReading | null>('/api/sensor-data/latest', { query });
}

export function getSensorStats(query?: Pick<SensorDataQuery, 'nodeId' | 'gatewayId'> & { hours?: string | number } | URLSearchParams) {
  return apiFetch<SensorStats>('/api/sensor-data/stats', { query });
}
