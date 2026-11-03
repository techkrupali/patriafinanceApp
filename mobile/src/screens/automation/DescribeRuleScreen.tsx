import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtPills } from '../../components/pt/PtForm';
import { useParseRule, type RuleDraft, type RulePreview } from '../../api/rules';
import { RuleWordCard } from './RuleBuilderScreen';
import type { RootScreenProps } from '../../navigation/types';

/**
 * AUT-07 "Describe your rule — Steward turns it into a rule". English or
 * Pidgin ("Anytime Household money drop below 30k, abeg move 50k from my main
 * wallet…"); the phone keyboard's mic types what you say. Then "Review rule".
 */
export function DescribeRuleScreen({ navigation }: RootScreenProps<'DescribeRule'>) {
  const parse = useParseRule();
  const [text, setText] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>([]);

  const send = () => {
    const t = text.trim();
    if (t.length < 5) return;
    setSaid(t);
    setText('');
    parse.mutate(t, {
      onSuccess: (r) => {
        setDraft(r.draft);
        setPreview(r.preview);
        setExtra([]);
        setReply(
          r.draft
            ? "Got it. Here's the rule I'll set up. Check it before I turn it on:"
            : r.missing.includes('when')
              ? 'When should it run? Say something like "when Household falls below 30k" or "every Monday".'
              : r.missing.includes('then')
                ? 'What should it do? Say something like "move 50k from Main".'
                : r.missing[0] ?? "I didn't catch that. Try again in your own words.",
        );
      },
      onError: (e) => setReply(e.message),
    });
  };

  const tweaks = [
    { value: 'right', label: 'Looks right' },
    ...(draft?.trigger === 'balance' && !draft.before_day ? [{ value: 'before', label: 'Only before the 20th' }] : []),
  ];

  const finalDraft = (): RuleDraft | null => (draft ? { ...draft, ...(extra.includes('before') ? { before_day: 20 } : {}) } : null);

  return (
    <PtPageScreen
      title="Describe your rule"
      subtitle="Steward turns it into a rule"
      onBack={() => navigation.goBack()}
      footer={
        draft ? (
          <PtButton
            title="Review rule"
            onPress={() => {
              const d = finalDraft();
              const naira = (k?: number | null) => (k ? k / 100 : k);
              if (d) navigation.navigate('RuleBuilder', { preset: { ...d, threshold: naira(d.threshold) ?? undefined, amount: naira(d.amount) ?? undefined, min_balance: naira(d.min_balance) ?? null }, step: 3 });
            }}
          />
        ) : (
          <View style={{ gap: 8 }}>
            <PtField label="Your rule, in your own words" value={text} onChangeText={setText} placeholder="Top up Household when it falls below 30k" multiline returnKeyType="send" onSubmitEditing={send} />
            <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>
              <Feather name="mic" size={12} color={pt.inkMuted} /> Tap the mic on your keyboard to say it.
            </Text>
            <PtButton title="Send" loading={parse.isPending} disabled={text.trim().length < 5} onPress={send} />
          </View>
        )
      }
    >
      {said ? (
        <View style={{ alignSelf: 'flex-end', maxWidth: '88%', backgroundColor: pt.brand, borderRadius: ptRadius.md, padding: 14 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: '#fff' }}>{said}</Text>
        </View>
      ) : (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted }}>
          Say when it should run and what it should do. English or Pidgin is fine.
        </Text>
      )}
      {reply ? (
        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: ptFont.medium, fontSize: 13, color: pt.inkMuted }}>Steward</Text>
          <View style={{ alignSelf: 'flex-start', maxWidth: '92%', backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 14 }}>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: pt.ink }}>{reply}</Text>
          </View>
        </View>
      ) : null}
      {preview ? (
        <View style={{ gap: 12 }}>
          <RuleWordCard tag="WHEN" text={preview.words.when} />
          {preview.words.if || extra.includes('before') ? <RuleWordCard tag="IF" text={[preview.words.if, extra.includes('before') ? 'before the 20th' : null].filter(Boolean).join(', ')} /> : null}
          <RuleWordCard tag="THEN" text={preview.words.then} />
          <PtPills options={tweaks} value={['right', ...extra]} onChange={(v) => v !== 'right' && setExtra((x) => (x.includes(v) ? x.filter((y) => y !== v) : [...x, v]))} />
          {!draft ? null : (
            <Text onPress={() => { setDraft(null); setPreview(null); setReply(null); setSaid(null); }} style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>
              Say it differently
            </Text>
          )}
        </View>
      ) : null}
    </PtPageScreen>
  );
}
