import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

const { GatewayWifiScan } = NativeModules;

async function ensureWifiScanPermissions() {
  if (Platform.OS !== 'android') {
    throw new Error('Le scan Wi-Fi de proximite est actuellement disponible uniquement sur Android.');
  }

  const permissions = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  if (Platform.Version >= 33) {
    permissions.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
  }

  const statuses = await PermissionsAndroid.requestMultiple(permissions);
  const denied = Object.values(statuses).some((status) => status !== PermissionsAndroid.RESULTS.GRANTED);

  if (denied) {
    throw new Error('Les permissions Wi-Fi/localisation sont requises pour lister les SSID disponibles.');
  }
}

export async function scanNearbyWifiNetworks() {
  if (!GatewayWifiScan?.scanAvailableSsids) {
    throw new Error('Module de scan Wi-Fi indisponible dans cette build Android.');
  }

  await ensureWifiScanPermissions();

  const results = await GatewayWifiScan.scanAvailableSsids();
  return Array.isArray(results) ? results : [];
}
