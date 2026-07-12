import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../config';
import type { DeviceMeta } from '../api/types';

function randomId(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  );
}

export async function getDeviceMeta(): Promise<DeviceMeta> {
  let deviceId = await SecureStore.getItemAsync(STORAGE_KEYS.deviceId);
  if (!deviceId) {
    deviceId = randomId();
    await SecureStore.setItemAsync(STORAGE_KEYS.deviceId, deviceId);
  }

  const platform: DeviceMeta['platform'] =
    Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';

  return {
    device_id: deviceId,
    device_name: `Patriai ${platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'Web'} App`,
    platform,
  };
}
