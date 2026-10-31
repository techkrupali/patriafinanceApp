import React from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../theme';
import { PtButton } from './pt/PtButton';

interface LoadErrorProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/** SYS-06 in a screen: the warning sign, "Something went wrong", why, and Try again. */
export function LoadError({ message, onRetry, className = '' }: LoadErrorProps) {
  return (
    <View className={className} style={{ alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40, gap: 12 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: pt.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="alert-triangle" size={26} color={pt.danger} />
      </View>
      <Text style={{ fontFamily: ptFont.extrabold, fontSize: 18, color: pt.ink, textAlign: 'center' }} accessibilityRole="header">
        Something went wrong
      </Text>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted, textAlign: 'center', maxWidth: 300 }}>
        {message ?? "That's on us, not you. Nothing was sent or changed. Try again in a moment."}
      </Text>
      {onRetry ? <PtButton title="Try again" variant="secondary" onPress={onRetry} style={{ alignSelf: 'stretch', marginTop: 4 }} /> : null}
    </View>
  );
}
