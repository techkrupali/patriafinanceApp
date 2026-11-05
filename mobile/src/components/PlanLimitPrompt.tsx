import React from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../theme';
import { PtSheet } from './pt/PtSheet';
import { PtButton } from './pt/PtButton';
import { usePlanPrompt } from '../store/planPrompt';
import { navigationRef } from '../navigation/ref';

/**
 * PLN-04 Pro feature prompt: "You've used your 2 free rules — Pro gives your
 * family unlimited rules… Try it free for 30 days." See Pro, or free one up
 * (replace a rule, close a wallet). Shown wherever the limit was hit.
 */
export function PlanLimitPrompt() {
  const limit = usePlanPrompt((s) => s.limit);
  const close = usePlanPrompt((s) => s.close);
  if (!limit) return null;

  const go = (fn: () => void) => {
    close();
    if (navigationRef.isReady()) fn();
  };
  const instead =
    limit.feature === 'rules'
      ? { title: 'Replace a rule instead', run: () => navigationRef.navigate('Automations') }
      : limit.feature === 'wallets'
        ? { title: 'Close a wallet instead', run: () => navigationRef.navigate('Tabs', { screen: 'Treasury' }) }
        : null;

  return (
    <PtSheet
      visible
      title=""
      onClose={close}
      footer={
        <View style={{ gap: 4 }}>
          {limit.upgrade ? <PtButton title="See Pro" onPress={() => go(() => navigationRef.navigate('Plans'))} /> : null}
          {instead ? <PtButton title={instead.title} variant={limit.upgrade ? 'ghost' : 'primary'} onPress={() => go(instead.run)} /> : null}
          {!limit.upgrade && !instead ? <PtButton title="OK" onPress={close} /> : null}
        </View>
      }
    >
      <View style={{ gap: 12, paddingBottom: 4 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: pt.gold100, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="star" size={24} color="#8F5400" />
        </View>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, lineHeight: 28, color: pt.ink }} accessibilityRole="header">
          {limit.title}
        </Text>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted }}>{limit.body}</Text>
      </View>
    </PtSheet>
  );
}
