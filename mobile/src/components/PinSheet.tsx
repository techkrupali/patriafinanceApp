import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinPad } from './PinPad';
import { ErrorText } from './ErrorText';

interface PinSheetProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  loading?: boolean;
  error?: string | null;
  onSubmit: (pin: string) => void;
  onClose: () => void;
}

/** Bottom sheet asking for the 4-digit transaction PIN. */
export function PinSheet({
  visible,
  title = 'Authorize transaction',
  subtitle = 'Enter your 4-digit transaction PIN',
  loading = false,
  error,
  onSubmit,
  onClose,
}: PinSheetProps) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (visible) setPin('');
  }, [visible]);

  useEffect(() => {
    // Reset the dots after a failed attempt.
    if (error) setPin('');
  }, [error]);

  const handleChange = (next: string) => {
    if (loading) return;
    setPin(next);
    if (next.length === 4) onSubmit(next);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View
          className="rounded-t-3xl bg-white px-6 pt-6"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <View className="mb-5 flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-lg font-bold text-ink">{title}</Text>
              <Text className="mt-1 text-sm text-muted">{subtitle}</Text>
            </View>
            <Pressable
              onPress={onClose}
              disabled={loading}
              className="h-9 w-9 items-center justify-center rounded-full bg-lav-faint active:opacity-70"
            >
              <Text className="text-base text-muted">✕</Text>
            </Pressable>
          </View>

          <ErrorText message={error} className="mb-3 text-center" />

          {loading ? (
            <View className="items-center py-14">
              <ActivityIndicator size="large" color="#001736" />
              <Text className="mt-4 text-sm text-muted">Processing…</Text>
            </View>
          ) : (
            <PinPad value={pin} onChange={handleChange} />
          )}
        </View>
      </View>
    </Modal>
  );
}
