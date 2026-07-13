import { Platform } from 'react-native';

const DEFAULT_API_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8001/api/v1' : 'http://localhost:8001/api/v1';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;

export const STORAGE_KEYS = {
  token: 'patriai.token',
  user: 'patriai.user',
  biometric: 'patriai.biometric',
  deviceId: 'patriai.device_id',
  /** Transaction PIN cached behind biometrics for Google-Pay style authorize. */
  txnPin: 'patriai.txn_pin',
} as const;
