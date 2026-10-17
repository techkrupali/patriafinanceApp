import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface GuidedIntroProps {
  /** Pill above the headline, e.g. "Step 1 of 2". */
  step: string;
  icon?: IconName;
  title: string;
  subtitle: string;
}

/** Step pill + centered headline + explainer that opens every guided setup screen. */
export function GuidedIntro({ step, icon, title, subtitle }: GuidedIntroProps) {
  return (
    <View className="items-center">
      <View className="flex-row items-center rounded bg-lav px-3 py-1.5">
        {icon ? <Ionicons name={icon} size={12} color={colors.navy} style={{ marginRight: 5 }} /> : null}
        <Text className="text-[12px] font-bold text-navy">{step}</Text>
      </View>
      <Text className="mt-4 text-center text-[28px] font-extrabold leading-9 tracking-tight text-navy">{title}</Text>
      <Text className="mt-2 text-center text-[14px] leading-5 text-muted">{subtitle}</Text>
    </View>
  );
}
