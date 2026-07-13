import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { STORAGE_KEYS } from '../config';

/**
 * Biometric helpers implementing the Google-Pay style unlock + authorize flow.
 *
 * The transaction PIN is what the backend actually requires to authorize money
 * movement. To let a fingerprint / face scan stand in for typing that PIN, we
 * capture the PIN once (only ever right after a successful biometric enrol) and
 * keep it in the secure keychain under `patriai.txn_pin`. Biometric authorize
 * then unlocks that PIN behind a fresh `authenticateAsync` prompt and submits it
 * to the API. If the key is absent we simply fall back to asking for the PIN.
 */

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'generic';

export interface BiometricSupport {
  available: boolean;
  kind: BiometricKind;
  /** Human label, e.g. "Face ID" / "Fingerprint". */
  label: string;
  /** Ionicons glyph name matching the kind. */
  icon: 'scan-outline' | 'finger-print' | 'eye-outline' | 'lock-closed';
}

const KIND_META: Record<BiometricKind, { label: string; icon: BiometricSupport['icon'] }> = {
  face: { label: 'Face ID', icon: 'scan-outline' },
  fingerprint: { label: 'Fingerprint', icon: 'finger-print' },
  iris: { label: 'Iris', icon: 'eye-outline' },
  generic: { label: 'Biometric unlock', icon: 'lock-closed' },
};

/** Detect whether biometrics are usable and which modality to present. */
export async function getBiometricSupport(): Promise<BiometricSupport> {
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const available = hasHardware && enrolled;
    let kind: BiometricKind = 'generic';
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      kind = 'face';
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      kind = 'fingerprint';
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      kind = 'iris';
    }
    return { available, kind, ...KIND_META[kind] };
  } catch {
    return { available: false, kind: 'generic', ...KIND_META.generic };
  }
}

/** Run the OS biometric prompt. Returns true only on a successful match. */
export async function runBiometricPrompt(promptMessage: string): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return res.success;
  } catch {
    return false;
  }
}

/** Persist the transaction PIN behind the keychain (call only after a biometric enrol). */
export async function saveTxnPin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.txnPin, pin);
}

/** Retrieve the stored transaction PIN, or null if it was never captured. */
export async function getTxnPin(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(STORAGE_KEYS.txnPin);
  } catch {
    return null;
  }
}

export async function hasTxnPin(): Promise<boolean> {
  return (await getTxnPin()) !== null;
}

export async function clearTxnPin(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.txnPin);
}
