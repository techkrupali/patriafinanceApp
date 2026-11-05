import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { selection } from '../../lib/haptics';
import type { HomeSetup, HomeSetupStep } from '../../api/types';

const STEPS: Record<HomeSetupStep, { title: string; sub?: string }> = {
  main_wallet: { title: 'Get your main wallet' },
  verify: { title: 'Verify your identity', sub: 'NIN and a selfie · 3 minutes' },
  family: { title: 'Invite your family', sub: 'Spouse, children, relatives' },
  shared_wallet: { title: 'Create your first shared wallet', sub: 'School fees, rent, a project' },
};

/**
 * HOM-03 "Get set up · 1 of 4 done": a gold bar, the main wallet ticked and
 * crossed out, then verify, invite family and a first shared wallet.
 */
export function SetupCard({ setup, onStep, onHide }: { setup: HomeSetup; onStep: (key: HomeSetupStep) => void; onHide?: () => void }) {
  const pct = setup.total ? (setup.done / setup.total) * 100 : 0;
  return (
    <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }} accessibilityRole="header">
          Get set up
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{`${setup.done} of ${setup.total} done`}</Text>
          {onHide ? (
            <Pressable
              onPress={() => {
                selection();
                onHide();
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Hide Get set up"
            >
              <Feather name="x" size={16} color={pt.inkSubtle} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: pt.sunken, overflow: 'hidden' }} accessibilityLabel={`${setup.done} of ${setup.total} done`}>
        <View style={{ width: `${pct}%`, height: 6, backgroundColor: pt.gold500 }} />
      </View>
      {setup.steps.map((s, i) => {
        const step = STEPS[s.key];
        if (!step) return null;
        const row = (
          <View style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: i === setup.steps.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
            {s.done ? (
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: pt.brand, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="check" size={14} color="#FFFFFF" />
              </View>
            ) : (
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: pt.lineStrong }} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: s.done ? pt.inkMuted : pt.ink, textDecorationLine: s.done ? 'line-through' : 'none' }}>{step.title}</Text>
              {!s.done && step.sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{step.sub}</Text> : null}
            </View>
            {!s.done ? <Feather name="chevron-right" size={18} color={pt.inkSubtle} /> : null}
          </View>
        );
        return s.done ? (
          <View key={s.key}>{row}</View>
        ) : (
          <Pressable
            key={s.key}
            onPress={() => {
              selection();
              onStep(s.key);
            }}
            accessibilityRole="button"
            accessibilityLabel={step.sub ? `${step.title}. ${step.sub}` : step.title}
          >
            {row}
          </Pressable>
        );
      })}
    </View>
  );
}
