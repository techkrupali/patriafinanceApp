import React, { useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtNote } from '../../components/pt/PtForm';
import { PtRadio } from '../../components/pt/PtCheck';
import { useWallets } from '../../api/hooks';
import { useSendOptions } from '../../api/payments';
import { useSendDraft } from '../../store/sendDraft';
import { canSendFrom, feeFor, lockedReason, needsApproval, spendable } from '../../lib/sendRules';
import { formatNaira } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { Wallet } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

/** RNGH's Pressable ignores taps on role=radio elements on web; native keeps the radio role. */
const RADIO_ROLE = Platform.OS === 'web' ? 'button' : 'radio';

/** Spending wallets first (budgets), then Main, then the rest. */
const ORDER: Record<string, number> = { spending: 0, main: 1 };

/**
 * SND-02 Pay from: every wallet you can send from, what it has and what would
 * stop or slow the payment (locked, needs approval, not enough) — and which
 * one fits best.
 */
export function SendFromScreen({ navigation }: RootScreenProps<'SendFrom'>) {
  const wallets = useWallets();
  const options = useSendOptions();
  const { recipient, amount, fromWalletId, setFrom } = useSendDraft();
  const n = parseFloat(amount) || 0;
  const fee = feeFor(recipient, parseFloat(options.data?.bank_fee ?? '20'));

  const rows = useMemo(() => {
    const status = (w: Wallet): { text: string; ok: boolean; slow: boolean } => {
      const locked = lockedReason(w);
      if (locked) return { text: locked, ok: false, slow: false };
      if (n > 0 && n + fee > spendable(w)) return { text: 'Not enough for this', ok: false, slow: false };
      if (n > 0 && needsApproval(w, n)) return { text: `Needs approval over ${formatNaira(w.approval_threshold ?? '0')}`, ok: true, slow: true };
      return { text: 'No approval needed', ok: true, slow: false };
    };
    return (wallets.data ?? [])
      .filter(canSendFrom)
      .map((w) => ({ w, s: status(w) }))
      .sort((a, b) => Number(b.s.ok) - Number(a.s.ok) || (ORDER[a.w.type] ?? 9) - (ORDER[b.w.type] ?? 9));
  }, [wallets.data, n, fee]);

  const best = rows.find((r) => r.s.ok && !r.s.slow) ?? rows.find((r) => r.s.ok);
  const [picked, setPicked] = useState<number | null>(fromWalletId ?? best?.w.id ?? null);
  const chosen = rows.find((r) => r.w.id === picked);

  return (
    <PtPageScreen
      title="Pay from"
      subtitle={recipient && n ? `${formatNaira(String(n))} to ${recipient.name.split(' ')[0]}` : 'Choose a wallet'}
      onBack={() => navigation.goBack()}
      footer={
        <PtButton
          title={chosen ? `Use ${chosen.w.name}` : 'Choose a wallet'}
          disabled={!chosen?.s.ok}
          onPress={() => {
            if (!chosen) return;
            setFrom(chosen.w.id);
            navigation.goBack();
          }}
        />
      }
    >
      <View style={{ gap: 10 }}>
        {rows.map(({ w, s }) => {
          const on = w.id === picked;
          return (
            <Pressable
              key={w.id}
              onPress={() => {
                selection();
                setPicked(w.id);
              }}
              accessibilityRole={RADIO_ROLE}
              accessibilityState={{ checked: on, disabled: !s.ok }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 14, borderWidth: 1.5, borderColor: on ? pt.brand : 'transparent', opacity: s.ok ? 1 : 0.6 }}
            >
              <PtRadio checked={on} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }} numberOfLines={1}>{w.name}</Text>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: s.ok ? pt.inkMuted : pt.danger }}>{s.text}</Text>
              </View>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{formatNaira(w.balance)}</Text>
            </Pressable>
          );
        })}
      </View>
      {best ? (
        <PtNote tone="success">{`${best.w.name} fits best: ${best.s.slow ? 'it has enough, though it needs an approval first.' : 'it has enough and no approval is needed.'}`}</PtNote>
      ) : (
        <PtNote tone="attention">None of your wallets can cover this right now. Add money or send less.</PtNote>
      )}
    </PtPageScreen>
  );
}
