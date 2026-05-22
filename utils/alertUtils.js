import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// ─── Seuils par défaut ───────────────────────────────────────────────────────
export const DEFAULT_THRESHOLDS = {
  phMin:       6.5,
  phMax:       8.5,
  tdsMax:      1000,
  turbScore:   5,
  tempMin:     5,
  tempMax:     35,
  batteryMin:  20,
};

/**
 * Analyse un enregistrement capteurs et retourne les alertes déclenchées.
 */
export function detectAlerts(record, nodeName = 'Bouée', thresholds = DEFAULT_THRESHOLDS) {
  if (!record) return [];
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const alerts = [];

  const ph = record.ph?.value;
  if (typeof ph === 'number') {
    if (ph < t.phMin)
      alerts.push({
        key: 'ph_low',
        label: 'pH trop acide',
        title: 'Alerte pH — Acidité anormale',
        body: `${nodeName} : pH ${ph.toFixed(1)} détecté. Seuil minimum : ${t.phMin}.`,
        value: ph,
        severity: ph < 5 ? 'critical' : 'warning',
      });
    else if (ph > t.phMax)
      alerts.push({
        key: 'ph_high',
        label: 'pH trop basique',
        title: 'Alerte pH — Alcalinité anormale',
        body: `${nodeName} : pH ${ph.toFixed(1)} détecté. Seuil maximum : ${t.phMax}.`,
        value: ph,
        severity: ph > 10 ? 'critical' : 'warning',
      });
  }

  const tds = record.tds?.value;
  if (typeof tds === 'number' && tds > t.tdsMax)
    alerts.push({
      key: 'tds_high',
      label: 'TDS élevé',
      title: 'Alerte TDS — Concentration élevée',
      body: `${nodeName} : ${tds} ppm détectés. Seuil maximum : ${t.tdsMax} ppm.`,
      value: tds,
      severity: tds > 1500 ? 'critical' : 'warning',
    });

  const turbScore = record.turbidity?.score;
  if (typeof turbScore === 'number' && turbScore <= t.turbScore)
    alerts.push({
      key: 'turb_low',
      label: 'Turbidité élevée',
      title: 'Alerte Turbidité — Eau trouble',
      body: `${nodeName} : score de turbidité ${turbScore}/10. Seuil minimum : ${t.turbScore}/10.`,
      value: turbScore,
      severity: turbScore <= 3 ? 'critical' : 'warning',
    });

  const temp = record.temperature?.water;
  if (typeof temp === 'number') {
    if (temp < t.tempMin)
      alerts.push({
        key: 'temp_low',
        label: 'Température basse',
        title: 'Alerte Température — Valeur basse',
        body: `${nodeName} : ${temp.toFixed(1)}°C détectés. Seuil minimum : ${t.tempMin}°C.`,
        value: temp,
        severity: 'warning',
      });
    else if (temp > t.tempMax)
      alerts.push({
        key: 'temp_high',
        label: 'Température élevée',
        title: 'Alerte Température — Valeur élevée',
        body: `${nodeName} : ${temp.toFixed(1)}°C détectés. Seuil maximum : ${t.tempMax}°C.`,
        value: temp,
        severity: 'warning',
      });
  }

  const batt = record.battery?.percentage;
  if (typeof batt === 'number' && batt < t.batteryMin)
    alerts.push({
      key: 'batt_low',
      label: 'Batterie faible',
      title: 'Alerte Batterie — Niveau critique',
      body: `${nodeName} : batterie à ${batt}%. Seuil minimum : ${t.batteryMin}%.`,
      value: batt,
      severity: batt < 10 ? 'critical' : 'warning',
    });

  if (record.event?.type === 'SHAKE')
    alerts.push({
      key: 'shake',
      label: 'Chute détectée',
      title: 'Alerte Chute — Mouvement anormal',
      body: `${nodeName} : chute ou choc détecté (${record.event.accelG?.toFixed(1)} G).`,
      value: record.event.accelG,
      severity: 'critical',
    });

  return alerts;
}

// ─── Notifications locales ───────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

export async function registerForPushNotifications() {
  if (!Device.isDevice) return false;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return false;

  if (Platform.OS === 'android') {
    // Canal critique — son + vibration forte
    await Notifications.setNotificationChannelAsync('water-alerts-critical', {
      name: 'Alertes critiques EauSûre',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 300, 200, 300],
      lightColor: '#ef4444',
      sound: 'default',
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    });

    // Canal avertissement — discret
    await Notifications.setNotificationChannelAsync('water-alerts-warning', {
      name: 'Avertissements EauSûre',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 150],
      lightColor: '#f59e0b',
      sound: 'default',
      enableLights: true,
      enableVibrate: true,
      showBadge: true,
    });
  }

  return true;
}

const _notifiedKeys = new Set();

/**
 * Envoie une notification locale propre — sans emoji, avec icône app.
 */
export async function sendAlertNotification(alert, pushEnabled = true, criticalOnly = false) {
  if (!pushEnabled) return;
  if (criticalOnly && alert.severity !== 'critical') return;

  const dedupeKey = alert.key;
  if (_notifiedKeys.has(dedupeKey)) return;
  _notifiedKeys.add(dedupeKey);
  setTimeout(() => _notifiedKeys.delete(dedupeKey), 5 * 60 * 1000);

  const channelId = alert.severity === 'critical'
    ? 'water-alerts-critical'
    : 'water-alerts-warning';

  await Notifications.scheduleNotificationAsync({
    content: {
      title: alert.title,
      body:  alert.body,
      sound: 'default',
      data:  { alertKey: alert.key, severity: alert.severity },
      // Android : icône monochrome blanche définie dans app.json + couleur d'accentuation
      ...(Platform.OS === 'android' && {
        channelId,
        color: alert.severity === 'critical' ? '#ef4444' : '#f59e0b',
        // L'icône notification-icon.png (blanche sur transparent) est déclarée dans app.json
        // et sera utilisée automatiquement par expo-notifications
      }),
    },
    trigger: null,
  });
}
