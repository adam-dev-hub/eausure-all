import { apiFetch, type Gateway, type IotNode } from './client';

export function getGateways() {
  return apiFetch<Gateway[]>('/api/gateways', {});
}

export function getGatewayNodes(gatewayId: string) {
  return apiFetch<IotNode[]>(`/api/gateways/${encodeURIComponent(gatewayId)}/nodes`, {});
}

export function triggerNodeMeasurement(gatewayId: string, nodeId: string) {
  return apiFetch<{ queued?: boolean }>(`/api/gateways/${encodeURIComponent(gatewayId)}/nodes/${encodeURIComponent(nodeId)}/measure`, { method: 'POST' });
}
