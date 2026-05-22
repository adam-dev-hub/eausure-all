import AsyncStorage from '@react-native-async-storage/async-storage';

const UPDATE_TRACKING_KEY = 'eausure_firmware_update_tracking';

export async function loadUpdateTrackingSessions() {
  try {
    const raw = await AsyncStorage.getItem(UPDATE_TRACKING_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.log('[UpdateTrackingStorage][LOAD_ERR]', error?.message || error);
    return {};
  }
}

export async function saveUpdateTrackingSessions(sessions) {
  try {
    await AsyncStorage.setItem(UPDATE_TRACKING_KEY, JSON.stringify(sessions || {}));
  } catch (error) {
    console.log('[UpdateTrackingStorage][SAVE_ERR]', error?.message || error);
  }
}

export async function clearUpdateTrackingSessions() {
  try {
    await AsyncStorage.removeItem(UPDATE_TRACKING_KEY);
  } catch (error) {
    console.log('[UpdateTrackingStorage][CLEAR_ERR]', error?.message || error);
  }
}
