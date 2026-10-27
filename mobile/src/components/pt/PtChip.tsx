import React from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';

export type PtChipTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<PtChipTone, { bg: string; fg: string }> = {
  neutral: { bg: pt.sunken, fg: pt.inkMuted },
  brand: { bg: pt.brandSoft, fg: pt.brand },
  success: { bg: '#DDF4E9', fg: '#127A55' },
  warning: { bg: '#FDEBC8', fg: '#8F5400' },
  danger: { bg: pt.dangerSoft, fg: pt.danger },
  info: { bg: pt.infoSoft, fg: pt.info },
};

/** `pt-chip`: 24pt pill, 12pt semibold, optional leading icon. */
export function PtChip({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: PtChipTone;
  icon?: React.ComponentProps<typeof Feather>['name'];
}) {
  const c = tones[tone];
  return (
    <View
      style={{
        height: 24,
        paddingLeft: icon ? 8 : 10,
        paddingRight: 10,
        borderRadius: 999,
        backgroundColor: c.bg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
      }}
    >
      {icon ? <Feather name={icon} size={12} color={c.fg} /> : null}
      <Text style={{ fontFamily: ptFont.semibold, fontSize: 12, lineHeight: 16, color: c.fg }}>{label}</Text>
    </View>
  );
}
