import { Platform, PermissionsAndroid } from 'react-native';
import { BleManager, State } from 'react-native-ble-plx';
import { encode as btoa, decode as atob } from 'base-64';
import CryptoJS from 'crypto-js';
import * as ExpoCrypto from 'expo-crypto';
import { HARDWARE_API_URL, isHardwareApiConfigured, maskToken } from './hardwareClient';
import { getAuthToken } from './tokenStore';

const BLE_SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab';
const BLE_RX_UUID = '12345678-1234-1234-1234-1234567890ac';
const BLE_TX_UUID = '12345678-1234-1234-1234-1234567890ad';
const DEFAULT_SCAN_MS = 12000;
const ACK_TIMEOUT_MS = 25000;
const BLE_SINGLE_WRITE_LIMIT = 420;
const BLE_CHUNK_DATA_SIZE = 220;

const bleManager = new BleManager();

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseGatewayName(device) {
  const name = device?.name || device?.localName || '';
  if (!name.startsWith('GW-')) return null;

  let hardwareIdPart, displayNamePart;
  if (name.includes('|')) {
    [hardwareIdPart, displayNamePart] = name.split('|');
  } else {
    const spaceIdx = name.indexOf(' ');
    if (spaceIdx !== -1) {
      hardwareIdPart = name.substring(0, spaceIdx);
      displayNamePart = name.substring(spaceIdx + 1);
    } else {
      hardwareIdPart = name;
      displayNamePart = name;
    }
  }

  const gatewayHardwareId = hardwareIdPart?.trim() || '';
  if (!gatewayHardwareId.startsWith('GW-')) return null;

  return {
    gatewayHardwareId,
    gatewayName: displayNamePart?.trim() || gatewayHardwareId,
    advertisedName: name,
  };
}

function decodeCharacteristicValue(base64Value) {
  if (!base64Value) return '';
  try {
    return atob(base64Value);
  } catch {
    return '';
  }
}

function parseJsonSafely(raw, fallbackMessage) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(fallbackMessage);
  }
}

function readCurrentTxPayload(device) {
  return device.readCharacteristicForService(BLE_SERVICE_UUID, BLE_TX_UUID);
}

function buildMacMessage({ gatewayHardwareId, challenge, sessionId, iv, ciphertext }) {
  return `gwprov:v2|${gatewayHardwareId}|${challenge}|${sessionId}|${iv}|${ciphertext}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isBleCancellationError(error) {
  return error?.errorCode === 2 || error?.message === 'Operation was cancelled';
}

async function requestLargeMtuIfSupported(device) {
  if (Platform.OS !== 'android' || typeof device.requestMTU !== 'function') {
    return device;
  }

  try {
    return await device.requestMTU(512);
  } catch (error) {
    console.log('[BLE][MTU][WARN]', {
      message: error?.message || 'MTU request failed',
    });
    return device;
  }
}

async function writeBleText(device, text) {
  const encoded = btoa(text);
  try {
    await device.writeCharacteristicWithResponseForService(BLE_SERVICE_UUID, BLE_RX_UUID, encoded);
  } catch (writeError) {
    if (writeError?.message !== 'Operation was rejected') {
      throw writeError;
    }
    await device.writeCharacteristicWithoutResponseForService(BLE_SERVICE_UUID, BLE_RX_UUID, encoded);
  }
}

async function writeProvisioningPayload(device, payload) {
  const payloadJson = JSON.stringify(payload);
  if (payloadJson.length <= BLE_SINGLE_WRITE_LIMIT) {
    await writeBleText(device, payloadJson);
    return;
  }

  const chunks = [];
  for (let offset = 0; offset < payloadJson.length; offset += BLE_CHUNK_DATA_SIZE) {
    chunks.push(payloadJson.slice(offset, offset + BLE_CHUNK_DATA_SIZE));
  }

  for (let index = 0; index < chunks.length; index += 1) {
    const chunkEnvelope = JSON.stringify({
      type: 'chunk',
      transferId: payload.sessionId,
      index,
      total: chunks.length,
      totalLength: payloadJson.length,
      data: chunks[index],
    });
    await writeBleText(device, chunkEnvelope);
    await wait(80);
  }
}

function mapProvisioningBackendError(error, gatewayHardwareId) {
  const status = error?.response?.status || null;
  const backendMessage =
    error?.response?.data?.message ||
    error?.response?.data?.error?.message ||
    '';

  if (!status && error?.message === 'Network Error') {
    return 'Impossible de contacter le backend Hardware API. Vérifiez la connexion réseau et réessayez.';
  }

  if (
    status === 404 &&
    typeof backendMessage === 'string' &&
    backendMessage.toLowerCase().includes('not pre-registered')
  ) {
    return `La passerelle ${gatewayHardwareId} ne figure pas dans notre base de données. Veuillez la pré-enregistrer avant le provisioning.`;
  }

  if (status === 403) {
    return `Accès refusé pendant le provisioning de la passerelle ${gatewayHardwareId}. Vérifiez les droits du compte et la configuration backend.`;
  }

  if (status === 409) {
    return backendMessage || `La passerelle ${gatewayHardwareId} est déjà liée ou incomplète côté backend.`;
  }

  if (status === 503) {
    return 'Le backend est temporairement indisponible. Réessayez dans quelques secondes.';
  }

  return error?.message || 'Provisioning BLE échoué.';
}

async function requestProvisioningSession({ gatewayHardwareId, challenge }) {
  const token = getAuthToken();
  const url = `${HARDWARE_API_URL.replace(/\/+$/, '')}/gateways/provisioning/session`;
  const body = JSON.stringify({ gatewayHardwareId, challenge });

  console.log('[HardwareAPI][FETCH_REQ]', {
    method: 'POST',
    url,
    token: maskToken(token),
    body,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'okhttp/4.12.0',
      Authorization: token ? `Bearer ${maskToken(token)}` : '<missing>',
    },
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'okhttp/4.12.0',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });

  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }
  }

  console.log(response.ok ? '[HardwareAPI][FETCH_RES]' : '[HardwareAPI][FETCH_ERR]', {
    method: 'POST',
    url,
    status: response.status,
    responseHeaders: Object.fromEntries(response.headers.entries()),
    data,
  });

  if (!response.ok) {
    const error = new Error(`Request failed with status code ${response.status}`);
    error.response = { status: response.status, data };
    throw error;
  }

  return { data, status: response.status };
}

function createEncryptedProvisioningEnvelope({
  gatewayHardwareId,
  challenge,
  sessionId,
  serverProof,
  encKeyHex,
  macKeyHex,
  provisioningToken,
  ssid,
  password,
  gatewayName,
}) {
  const plaintext = JSON.stringify({
    ssid: ssid.trim(),
    password: password.trim(),
    token: provisioningToken,
    gatewayName: gatewayName?.trim() || `Passerelle ${gatewayHardwareId.slice(-4)}`,
  });

  const iv = CryptoJS.enc.Hex.parse(bytesToHex(ExpoCrypto.getRandomBytes(16)));
  const encKey = CryptoJS.enc.Hex.parse(encKeyHex);
  const macKey = CryptoJS.enc.Hex.parse(macKeyHex);
  const encrypted = CryptoJS.AES.encrypt(plaintext, encKey, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const ivBase64 = CryptoJS.enc.Base64.stringify(iv);
  const ciphertextBase64 = CryptoJS.enc.Base64.stringify(encrypted.ciphertext);
  const mac = CryptoJS.HmacSHA256(
    buildMacMessage({
      gatewayHardwareId,
      challenge,
      sessionId,
      iv: ivBase64,
      ciphertext: ciphertextBase64,
    }),
    macKey
  ).toString(CryptoJS.enc.Hex);

  return {
    version: 2,
    gatewayHardwareId,
    challenge,
    sessionId,
    serverProof,
    iv: ivBase64,
    ciphertext: ciphertextBase64,
    mac,
  };
}

async function ensureBleReady() {
  if (Platform.OS !== 'android') return;

  if (Platform.Version >= 31) {
    const statuses = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);

    const denied = Object.values(statuses).some((status) => status !== PermissionsAndroid.RESULTS.GRANTED);
    if (denied) {
      throw new Error('Permissions Bluetooth refusees.');
    }
    return;
  }

  const status = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  if (status !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('Permission localisation refusee (requise pour BLE scan).');
  }
}

async function waitForAdapterPoweredOn() {
  const currentState = await bleManager.state();
  if (currentState === State.PoweredOn) return;

  await new Promise((resolve, reject) => {
    const subscription = bleManager.onStateChange((state) => {
      if (state === State.PoweredOn) {
        subscription.remove();
        resolve();
      }
    }, true);

    setTimeout(() => {
      subscription.remove();
      reject(new Error('Bluetooth desactive.'));
    }, 8000);
  });
}

export async function startGatewayScan({
  onGateway,
  onError,
  scanDurationMs = DEFAULT_SCAN_MS,
}) {
  await ensureBleReady();
  await waitForAdapterPoweredOn();

  const seenById = new Map();
  bleManager.stopDeviceScan();

  bleManager.startDeviceScan([BLE_SERVICE_UUID], { allowDuplicates: true }, (error, device) => {
    if (error) {
      onError?.(error.message || 'Erreur scan BLE');
      return;
    }

    if (!device) return;
    const parsedIdentity = parseGatewayName(device);
    if (!parsedIdentity) return;

    const item = {
      id: device.id,
      gatewayHardwareId: parsedIdentity.gatewayHardwareId,
      gatewayName: parsedIdentity.gatewayName,
      rssi: typeof device.rssi === 'number' ? device.rssi : -100,
      localName: device.localName || device.name || parsedIdentity.advertisedName,
    };

    const previous = seenById.get(device.id);
    if (!previous || item.rssi > previous.rssi) {
      seenById.set(device.id, item);
      onGateway?.(item);
    }
  });

  const timer = setTimeout(() => {
    bleManager.stopDeviceScan();
  }, scanDurationMs);

  return () => {
    clearTimeout(timer);
    bleManager.stopDeviceScan();
  };
}

export async function provisionGatewayOverBle({
  deviceId,
  gatewayHardwareId,
  ssid,
  password,
  gatewayName,
}) {
  if (!deviceId) throw new Error('Device BLE introuvable.');
  if (!gatewayHardwareId) throw new Error('Gateway ID introuvable.');
  if (!ssid?.trim()) throw new Error('SSID obligatoire.');
  if (!password?.trim()) throw new Error('Mot de passe WiFi obligatoire.');

  let device;
  let subscription;
  let ackTimer;
  let ackSettled = false;
  let lastBleStatus = null;

  try {
    bleManager.stopDeviceScan();
    await wait(250);

    device = await bleManager.connectToDevice(deviceId, { timeout: 15000 });
    device = await requestLargeMtuIfSupported(device);
    await device.discoverAllServicesAndCharacteristics();

    const helloCharacteristic = await readCurrentTxPayload(device);
    const helloRaw = decodeCharacteristicValue(helloCharacteristic?.value);
    const hello = parseJsonSafely(helloRaw, 'Handshake BLE invalide.');

    if (hello?.type !== 'hello' || hello?.version !== 2) {
      throw new Error('Passerelle BLE incompatible ou non securisee.');
    }
    if (hello?.gatewayHardwareId !== gatewayHardwareId) {
      throw new Error('Gateway ID incoherent pendant le handshake BLE.');
    }
    if (!hello?.challenge) {
      throw new Error('Challenge BLE manquant.');
    }

    const resolvedGatewayName = hello?.gatewayName?.trim() || gatewayName?.trim() || `Passerelle ${gatewayHardwareId.slice(-4)}`;

    if (!isHardwareApiConfigured()) {
      throw new Error('Hardware API non configurée pour la session de provisioning sécurisée.');
    }

    const sessionResponse = await requestProvisioningSession({
      gatewayHardwareId,
      challenge: hello.challenge,
    });
    const session = sessionResponse?.data?.data;
    if (!session?.sessionId || !session?.provisioningToken || !session?.encKeyHex || !session?.macKeyHex || !session?.serverProof) {
      throw new Error('Session de provisioning sécurisée incomplète.');
    }

    const payload = createEncryptedProvisioningEnvelope({
      gatewayHardwareId,
      challenge: hello.challenge,
      sessionId: session.sessionId,
      serverProof: session.serverProof,
      encKeyHex: session.encKeyHex,
      macKeyHex: session.macKeyHex,
      provisioningToken: session.provisioningToken,
      ssid,
      password,
      gatewayName: resolvedGatewayName,
    });

    const ackPromise = new Promise((resolve, reject) => {
      const settleOnce = (handler, payload) => {
        if (ackSettled) return;
        ackSettled = true;
        handler(payload);
      };

      subscription = device.monitorCharacteristicForService(
        BLE_SERVICE_UUID,
        BLE_TX_UUID,
        (error, characteristic) => {
          if (error) {
            if (isBleCancellationError(error)) {
              return;
            }
            settleOnce(reject, new Error(error.message || 'Erreur notification BLE'));
            return;
          }

          const raw = decodeCharacteristicValue(characteristic?.value);
          if (!raw) return;

          try {
            const parsed = JSON.parse(raw);
            lastBleStatus = parsed;
            if (parsed?.final === false) {
              console.log('[BLE][Provisioning][STATUS]', parsed);
              return;
            }
            settleOnce(resolve, parsed);
          } catch {
            settleOnce(resolve, { success: false, message: raw });
          }
        }
      );

      ackTimer = setTimeout(() => {
        settleOnce(reject, new Error('Aucune confirmation BLE reçue.'));
      }, ACK_TIMEOUT_MS);
    });

    const payloadJson = JSON.stringify(payload);
    console.log('[BLE][Provisioning][WRITE]', {
      gatewayHardwareId,
      payloadJsonBytes: payloadJson.length,
      encodedBytes: btoa(payloadJson).length,
      chunked: payloadJson.length > BLE_SINGLE_WRITE_LIMIT,
    });
    await wait(250);
    await writeProvisioningPayload(device, payload);

    const ack = await ackPromise;
    if (!ack?.success) {
      throw new Error(ack?.message || 'Provisioning BLE refusé par la passerelle.');
    }

    return ack;
  } catch (error) {
    if (isBleCancellationError(error)) {
      if (lastBleStatus?.final === true) {
        throw new Error(lastBleStatus.message || 'Provisioning BLE terminé.');
      }
      throw new Error('Connexion BLE interrompue. Arrêtez le scan puis réessayez.');
    }

    console.log('[BLE][Provisioning][ERR]', {
      gatewayHardwareId,
      deviceId,
      status: error.response?.status || null,
      data: error.response?.data || null,
      message: error.message,
    });
    throw new Error(mapProvisioningBackendError(error, gatewayHardwareId));
  } finally {
    if (ackTimer) clearTimeout(ackTimer);
    if (subscription) subscription.remove();
    if (device) {
      try {
        await device.cancelConnection();
      } catch {
        // ignore disconnect errors
      }
    }
    await wait(300);
  }
}
