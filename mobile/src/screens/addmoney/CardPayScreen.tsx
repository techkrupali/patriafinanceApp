import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtCard } from '../../components/pt/PtList';
import { PtGroupLabel, PtNote } from '../../components/pt/PtForm';
import { PtRadio } from '../../components/pt/PtCheck';
import { PtChip } from '../../components/pt/PtChip';
import { LoadError } from '../../components/LoadError';
import { useFundingOptions, useStartCardPayment } from '../../api/funding';
import { formatNaira, sanitizeAmountInput } from '../../lib/format';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

/**
 * ADD-03 Pay with card: the amount and the fee on top, a saved card or "Add a
 * new card" (the payment partner's own page — Patriai never sees the number),
 * then Pay. The bank may ask for a code (ADD-04); then Money added (ADD-08) or
 * why not (ADD-09).
 */
export function CardPayScreen({ navigation, route }: RootScreenProps<'CardPay'>) {
  const { walletId } = route.params;
  const q = useFundingOptions(walletId);
  const start = useStartCardPayment();
  const o = q.data;
  const [amount, setAmount] = useState(route.params.amount ?? '');
  // undefined: not chosen yet (the newest saved card); null: a new card.
  const [cardId, setCardId] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cardId === undefined && o) setCardId(o.saved_cards[0]?.id ?? null);
  }, [o, cardId]);

  const n = parseFloat(amount) || 0;
  const pct = o?.card.fee_percent ?? 1.5;
  const cap = parseFloat(o?.card.fee_cap ?? '2000');
  const fee = Math.min(Math.round(n * pct) / 100, cap);
  const total = n + fee;
  const min = parseFloat(o?.card.min ?? '100');
  const max = parseFloat(o?.card.max ?? '1000000');
  const tooSmall = n > 0 && n < min;
  const tooBig = n > max;

  const pay = () => {
    setError(null);
    start.mutate(
      { wallet_id: walletId, amount: String(n), card_id: cardId ?? null },
      {
        onSuccess: async (p) => {
          if (p.status === 'otp') return navigation.replace('CardOtp', { reference: p.reference });
          if (p.status === 'pending' && p.checkout_url) {
            // The partner's page; on the web a new tab, on a phone an in-app browser that closes when it sends us back.
            if (Platform.OS === 'web') window.open(p.checkout_url, '_blank');
            else await WebBrowser.openAuthSessionAsync(p.checkout_url, 'patriai://fund/card').catch(() => undefined);
          }
          navigation.replace('CardResult', { reference: p.reference, walletId });
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  if (q.isLoading) return <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />;
  if (!o) return <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />;

  return (
    <PtPageScreen
      title="Pay with card"
      subtitle={`To ${o.wallet.name}`}
      onBack={() => navigation.goBack()}
      footer={
        <PtButton
          title={n > 0 ? `Pay ${formatNaira(total)}` : 'Pay'}
          onPress={pay}
          loading={start.isPending}
          disabled={!o.card.enabled || n <= 0 || tooSmall || tooBig || cardId === undefined}
        />
      }
    >
      {!o.card.enabled ? <PtNote tone="attention">Paying by card is coming soon. Use a bank transfer for now.</PtNote> : null}
      {o.card.test_mode ? <PtChip label="Test mode · test cards only, no real money" tone="warning" icon="alert-triangle" /> : null}

      <PtField
        label="Amount"
        prefix="₦"
        value={amount}
        onChangeText={(t) => {
          setError(null);
          setAmount(sanitizeAmountInput(t));
        }}
        keyboardType="decimal-pad"
        placeholder="50,000"
        error={tooSmall ? `At least ${formatNaira(min)}` : tooBig ? `Up to ${formatNaira(max)} at a time` : null}
        hint={n > 0 && !tooSmall && !tooBig ? `Fee ${formatNaira(fee)} (${pct}%) · you pay ${formatNaira(total)}` : `A ${pct}% fee is added`}
      />

      {o.saved_cards.length ? (
        <View style={{ gap: 10 }}>
          <PtGroupLabel>Saved cards</PtGroupLabel>
          <PtCard>
            {o.saved_cards.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => {
                  selection();
                  setCardId(c.id);
                }}
                // "button" + selected: RNGH's Pressable ignores taps on radio roles on web.
                accessibilityRole="button"
                accessibilityState={{ selected: cardId === c.id }}
                accessibilityLabel={c.label}
              >
                <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === o.saved_cards.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 16, lineHeight: 22, color: pt.ink }}>{c.label}</Text>
                    {c.expiry ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{`Expires ${c.expiry}`}</Text> : null}
                  </View>
                  <PtRadio checked={cardId === c.id} />
                </View>
              </Pressable>
            ))}
          </PtCard>
        </View>
      ) : null}

      <Pressable
        onPress={() => {
          selection();
          setCardId(null);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: cardId === null }}
        style={{ alignSelf: 'flex-start' }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
          <Feather name={cardId === null ? 'check-circle' : 'plus'} size={20} color={pt.brand} />
          <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>{cardId === null && o.saved_cards.length ? 'A new card' : 'Add a new card'}</Text>
        </View>
      </Pressable>

      <PtNote tone="info" icon="lock">
        Card details are held by our payment partner. Patriai never sees your full card number.
      </PtNote>
      {error ? <Text style={{ fontFamily: ptFont.medium, fontSize: 14, color: pt.danger }}>{error}</Text> : null}
    </PtPageScreen>
  );
}
