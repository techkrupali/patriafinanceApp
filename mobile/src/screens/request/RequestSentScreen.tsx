import React, { useState } from 'react';
import { ActivityIndicator, Share, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtNote } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { useMoneyRequest, type MoneyRequest } from '../../api/requests';
import { formatNaira, parseYmd, toYmd } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

/** "Your half of the bill" → "your half of the bill", to follow "for"; "NEPA bill" stays. */
export const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** "₦45,000 for Mama's hospital bill, due Friday. We'll remind Chidi on Thursday." */
export function requestSummary(r: MoneyRequest): string {
  const first = (r.payer.name ?? 'them').split(' ')[0];
  const due = parseYmd(r.due_on);
  const day = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long' });
  const before = due ? new Date(due.getFullYear(), due.getMonth(), due.getDate() - 1) : null;
  const what = `${formatNaira(r.left)}${r.note ? ` for ${lowerFirst(r.note)}` : ''}${due ? `, due ${day(due)}` : ''}.`;
  // The reminder goes the morning before it's due; too late for one due today or tomorrow.
  const remind = before && toYmd(before) > toYmd(new Date()) ? ` We'll remind ${first} on ${day(before)}.` : '';
  const texted = r.payer.on_patriai ? '' : ` We texted ${first} the link.`;
  return what + remind + texted;
}

/** "patriai.app/r/N3V8" */
export const shortLink = (link: string) => link.replace(/^https?:\/\//, '');

/** REQ-02 Request sent: the link to copy or share; anyone can pay with it, even without the app. */
export function RequestSentScreen({ navigation, route }: RootScreenProps<'RequestSent'>) {
  const q = useMoneyRequest(route.params.code);
  const [copied, setCopied] = useState(false);
  const r = q.data;
  const first = (r?.payer.name ?? '').split(' ')[0];

  const copy = async () => {
    if (!r) return;
    await Clipboard.setStringAsync(r.link);
    notifySuccess();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <PtStepScreen
      footer={
        <View style={{ gap: 4 }}>
          <PtButton
            title="Share the link"
            disabled={!r}
            onPress={() => r && void Share.share({ message: `${r.requester.first_name} asked you for ${formatNaira(r.left)}${r.note ? ` for ${lowerFirst(r.note)}` : ''}. Pay here: ${r.link}` })}
          />
          <PtButton title="Done" variant="ghost" onPress={() => navigation.popToTop()} />
        </View>
      }
    >
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />
      ) : !r ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: 12, paddingTop: 24 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="send" size={32} color={pt.brand} />
            </View>
            <PtText variant="headline" style={{ fontSize: 26, textAlign: 'center' }} accessibilityRole="header">{`Request sent to ${first}`}</PtText>
            <PtText color={pt.inkMuted} style={{ textAlign: 'center', maxWidth: 340 }}>{requestSummary(r)}</PtText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16, paddingVertical: 16 }}>
            <Feather name="link" size={18} color={pt.brand} />
            <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }} numberOfLines={1} selectable>{shortLink(r.link)}</Text>
            <Pressable onPress={() => void copy()} accessibilityRole="button" accessibilityLabel="Copy the link" hitSlop={8}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
          </View>
          <PtNote tone="info">Anyone can pay with this link, even without the app, by bank transfer.</PtNote>
        </>
      )}
    </PtStepScreen>
  );
}
