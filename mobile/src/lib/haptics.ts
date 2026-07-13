import * as Haptics from 'expo-haptics';

/**
 * Thin, crash-safe wrappers around expo-haptics. Haptics are a nicety — on
 * devices / platforms without a taptic engine the calls reject, so every helper
 * swallows errors and never blocks the UI.
 */

export function tapLight(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function tapMedium(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function selection(): void {
  Haptics.selectionAsync().catch(() => {});
}

export function notifySuccess(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function notifyError(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}
