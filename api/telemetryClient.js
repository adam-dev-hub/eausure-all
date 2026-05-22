import hardwareClient from './hardwareClient';

/**
 * Fetch paginated sensor data for the authenticated user.
 * @param {Object} params - { nodeId, gatewayId, page, limit, startDate, endDate, eventType }
 */
export async function getSensorData(params = {}) {
  const response = await hardwareClient.get('/sensor-data', { params });
  return response.data;
}

/**
 * Fetch the latest sensor reading, optionally scoped to a node.
 * @param {Object} params - { nodeId, gatewayId }
 */
export async function getLatestSensorData(params = {}) {
  const response = await hardwareClient.get('/sensor-data/latest', { params });
  return response.data;
}

/**
 * Fetch aggregated stats for a time window.
 * @param {Object} params - { hours, nodeId, gatewayId }
 */
export async function getSensorStats(params = {}) {
  const response = await hardwareClient.get('/sensor-data/stats', { params });
  return response.data;
}

/**
 * Compute a global quality score (0-10) from a sensor data record.
 * Averages the individual scores (pH, TDS, turbidity).
 * Higher = better quality.
 */
export function computeQualityScore(record) {
  if (!record) return 5;
  const phScore = record.ph?.score ?? 5;
  const tdsScore = record.tds?.score ?? 5;
  const turbScore = record.turbidity?.score ?? 5;
  return Math.round((phScore + tdsScore + turbScore) / 3 * 10) / 10;
}

/**
 * Get a color based on quality score.
 * 8-10: green, 5-7: amber, 0-4: red
 */
export function getScoreColor(score) {
  if (score >= 8) return '#22c55e';
  if (score >= 5) return '#f59e0b';
  return '#ef4444';
}

/**
 * Get a gradient pair based on quality score.
 */
export function getScoreGradient(score) {
  if (score >= 8) return ['#22c55e', '#059669'];
  if (score >= 5) return ['#f59e0b', '#d97706'];
  return ['#ef4444', '#dc2626'];
}

/**
 * Get quality label in French.
 */
export function getScoreLabel(score) {
  if (score >= 8) return 'Excellente';
  if (score >= 6) return 'Bonne';
  if (score >= 4) return 'Moyenne';
  if (score >= 2) return 'Dégradée';
  return 'Critique';
}
