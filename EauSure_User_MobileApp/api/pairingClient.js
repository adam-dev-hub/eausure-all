import hardwareClient from './hardwareClient';

export async function getUserGateways() {
  const response = await hardwareClient.get('/gateways');
  return response.data;
}

export async function getGatewayNodes(gatewayId) {
  const response = await hardwareClient.get(`/gateways/${gatewayId}/nodes`);
  return response.data;
}

export async function getGatewayCommandStatus(gatewayId, commandId) {
  const response = await hardwareClient.get(`/gateways/${gatewayId}/commands/${commandId}`);
  return response.data;
}

export async function confirmPairingCandidate(gatewayId, nodeId, nodeName, bleMac) {
  const response = await hardwareClient.post(`/gateways/${gatewayId}/pairing/confirm-candidate`, {
    nodeId,
    nodeName,
    bleMac,
  });
  return response.data;
}

export async function scanNodes(gatewayId) {
  const response = await hardwareClient.get(`/gateways/${gatewayId}/pairing/scan`);
  return response.data;
}

export async function getPairingSession(gatewayId, sessionId) {
  const response = await hardwareClient.get(`/gateways/${gatewayId}/pairing/session/${sessionId}`);
  return response.data;
}

export async function updateGatewayLocation(gatewayId, { lat, lng, city, country }) {
  const response = await hardwareClient.put(`/gateways/${gatewayId}/location`, {
    lat,
    lng,
    city: city || '',
    country: country || '',
  });
  return response.data;
}

export async function updateNodeConfig(gatewayId, nodeId, config) {
  const response = await hardwareClient.put(`/gateways/${gatewayId}/nodes/${nodeId}/config`, config);
  return response.data;
}

export async function unpairNode(gatewayId, nodeId) {
  const response = await hardwareClient.delete(`/gateways/${gatewayId}/nodes/${nodeId}`);
  return response.data;
}

export async function cancelPairing(gatewayId) {
  const response = await hardwareClient.post(`/gateways/${gatewayId}/pairing/cancel`);
  return response.data;
}

export async function triggerGatewayFirmwareUpdate(gatewayId, payload) {
  const response = await hardwareClient.post(`/gateways/${gatewayId}/firmware-update`, payload);
  return response.data;
}

export async function triggerNodeFirmwareUpdate(gatewayId, nodeId, payload) {
  const response = await hardwareClient.post(`/gateways/${gatewayId}/nodes/${nodeId}/firmware-update`, payload);
  return response.data;
}
