import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtGroupLabel, PtPanel } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useRulesHelp, useSaveRuleOrder } from '../../api/rules';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * AUT-10 "Rules need your help": a rule that didn't run (Move money myself /
 * Change the rule), and "Salary day: which goes first?" — the order rules run
 * in when salary is short. Move one up or down, then Save order.
 */
export function RulesHelpScreen({ navigation }: RootScreenProps<'RulesHelp'>) {
  const q = useRulesHelp();
  const save = useSaveRuleOrder();
  const [order, setOrder] = useState<number[]>([]);
  const d = q.data;

  useEffect(() => {
    if (d?.salary_day) setOrder(d.salary_day.rules.map((r) => r.rule_id));
  }, [d]);

  if (!d) {
    return (
      <PtPageScreen title="Rules need your help" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }

  const rows = order.map((id) => d.salary_day?.rules.find((r) => r.rule_id === id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
  const move = (i: number, by: number) => {
    selection();
    setOrder((o) => {
      const n = [...o];
      const j = i + by;
      if (j < 0 || j >= n.length) return o;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  };
  const changed = d.salary_day ? order.join() !== d.salary_day.rules.map((r) => r.rule_id).join() : false;
  const parts = [d.failed.length ? `${d.failed.length} failed` : null, d.salary_day ? '1 clash' : null].filter(Boolean).join(', ');

  return (
    <PtPageScreen
      title="Rules need your help"
      subtitle={parts || 'All good'}
      onBack={() => navigation.goBack()}
      footer={d.salary_day ? <PtButton title="Save order" disabled={!changed} loading={save.isPending} onPress={() => save.mutate(order, { onSuccess: () => { notifySuccess(); showAlert('Order saved', 'On salary day the top ones run first.'); } })} /> : undefined}
    >
      {d.failed.map((f) => (
        <View key={f.rule_id} style={{ backgroundColor: '#FBE3DE', borderRadius: ptRadius.md, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Feather name="alert-triangle" size={22} color={pt.danger} />
            <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 17, color: pt.ink }}>{f.title}</Text>
          </View>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted }}>{f.body}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <PtButton title="Move money myself" variant="secondary" size="sm" onPress={() => navigation.navigate('MoveMoney', { fromWalletId: f.from_wallet_id, toWalletId: f.to_wallet_id })} />
            </View>
            <View style={{ flex: 1 }}>
              <PtButton title="Change the rule" size="sm" onPress={() => navigation.navigate('RuleBuilder', { ruleId: f.rule_id })} />
            </View>
          </View>
        </View>
      ))}

      {d.salary_day ? (
        <>
          <PtGroupLabel>Salary day: which goes first?</PtGroupLabel>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted }}>{d.salary_day.line}</Text>
          <PtPanel>
            {rows.map((r, i) => (
              <View key={r.rule_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                <Text style={{ width: 18, fontFamily: ptFont.bold, fontSize: 18, color: pt.inkMuted }}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{r.name}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{r.line}</Text>
                </View>
                <Pressable onPress={() => move(i, -1)} disabled={i === 0} accessibilityRole="button" accessibilityLabel={`Move ${r.name} up`} hitSlop={6} style={{ padding: 4, opacity: i === 0 ? 0.3 : 1 }}>
                  <Feather name="chevron-up" size={22} color={pt.inkMuted} />
                </Pressable>
                <Pressable onPress={() => move(i, 1)} disabled={i === rows.length - 1} accessibilityRole="button" accessibilityLabel={`Move ${r.name} down`} hitSlop={6} style={{ padding: 4, opacity: i === rows.length - 1 ? 0.3 : 1 }}>
                  <Feather name="chevron-down" size={22} color={pt.inkMuted} />
                </Pressable>
              </View>
            ))}
          </PtPanel>
        </>
      ) : null}

      {!d.failed.length && !d.salary_day ? <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>Every rule ran as planned.</Text> : null}
    </PtPageScreen>
  );
}
