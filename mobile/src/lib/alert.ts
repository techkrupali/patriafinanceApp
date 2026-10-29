import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Alert.alert on phones. React Native Web's Alert does nothing, so on web a
 * question with an action ("Invite Adeyemi Builders?") becomes the browser's
 * confirm, running the last non-cancel button when accepted; a plain message
 * becomes the browser's alert.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  if (actions.length === 0) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  if (window.confirm(text)) actions[actions.length - 1].onPress?.();
  else buttons?.find((b) => b.style === 'cancel')?.onPress?.();
}
