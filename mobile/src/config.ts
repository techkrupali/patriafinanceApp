import { Platform } from 'react-native';

const DEFAULT_API_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8001/api/v1' : 'http://localhost:8001/api/v1';

/** Keep in step with app.json "version" (SYS-02 compares it with the minimum). */
export const APP_VERSION = '1.0.0';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;

export const STORAGE_KEYS = {
  token: 'patriai.token',
  user: 'patriai.user',
  biometric: 'patriai.biometric',
  deviceId: 'patriai.device_id',
  /** Transaction PIN cached behind biometrics for Google-Pay style authorize. */
  txnPin: 'patriai.txn_pin',
  /** App language chosen on the phone-number screen: 'en' | 'pcm' (Pidgin). */
  language: 'patriai.language',
  /** Home tab preferences: hide balances on open, which sections show. */
  homePrefs: 'patriai.home_prefs',
  /** VDM-03: the app opens in family mode or business (vendor) mode. */
  mode: 'patriai.mode',
  /** ACC-01 → ACC-02: the secret this phone got when it was trusted; skips the code. */
  deviceSecret: 'patriai.device_secret',
  /** The phone number last signed in on this phone (ONB-02 vs ONB-01, ACC-01 prefill). */
  lastPhone: 'patriai.last_phone',
  /** ME-07 app lock and ME-13 appearance, kept on the phone. */
  appLock: 'patriai.app_lock',
  /** SYS-05: when the app was last left (ms), so a cold start after the lock time asks for the PIN. */
  lastSeen: 'patriai.last_seen',
  /** SYS-04: the last total balance seen and when, shown while offline. Cleared on log out. */
  lastBalance: 'patriai.last_balance',
  /** SYS-07: the notifications primer was shown on this phone. */
  permissionsAsked: 'patriai.permissions_asked',
} as const;
