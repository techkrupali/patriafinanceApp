import React, { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtNote, PtPanel, PtPills } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { useFundingOptions, ussdCode } from '../../api/funding';
import { sanitizeAmountInput } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * ADD-05 Add money with USSD: no internet needed. Your bank's own transfer
 * code, filled in with the amount and this wallet's account number; dial it on
 * the phone linked to your bank, pick the bank and enter your bank PIN.
 */
export function UssdScreen({ navigation, route }: RootScreenProps<'Ussd'>) {
  const { walletId } = route.params;
  const q = useFundingOptions(walletId);
  const o = q.data;
  const [bank, setBank] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  if (q.isLoading) return <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />;
  if (!o) return <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />;

  const account = o.account;
  const chosen = bank ?? o.ussd[0]?.bank ?? 'Other';
  const template = o.ussd.find((b) => b.bank === chosen)?.code ?? null;
  const code = account && template ? ussdCode(template, account.number, amount) : null;
  const ready = Boolean(code && parseFloat(amount) > 0);

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    notifySuccess();
    showAlert('Copied', what);
  };

  const dial = async () => {
    if (!code) return;
    // iPhones don't let apps dial bank codes: copy it for the Phone app instead.
    if (Platform.OS !== 'android') return copy(code, 'Paste it in your Phone app and press call.');
    await Linking.openURL(`tel:${code.replace(/#/g, '%23')}`).catch(() => copy(code, 'Paste it in your Phone app and press call.'));
  };

  return (
    <PtPageScreen
      title="Add money with USSD"
      subtitle="No internet needed"
      onBack={() => navigation.goBack()}
      footer={
        code ? (
          <>
            <PtButton title={Platform.OS === 'android' ? 'Dial now' : 'Copy the code'} onPress={() => void dial()} disabled={!ready} />
            {Platform.OS === 'android' ? (
              <PtButton title="Copy the code" variant="ghost" onPress={() => void copy(code, 'Dial it on the phone linked to your bank.')} disabled={!ready} />
            ) : null}
          </>
        ) : account ? (
          <PtButton title="Copy the account number" onPress={() => void copy(account.number, `${account.bank} · ${account.name}`)} />
        ) : undefined
      }
    >
      {!account ? (
        <PtNote tone="attention">{"This wallet's account number isn't ready yet. Try again in a moment."}</PtNote>
      ) : (
        <>
          <View style={{ gap: 12 }}>
            <PtGroupLabel>Your bank</PtGroupLabel>
            <PtPills options={[...o.ussd.map((b) => ({ value: b.bank, label: b.bank })), { value: 'Other', label: 'Other' }]} value={chosen} onChange={setBank} />
          </View>

          {code ? (
            <>
              <PtField label="Amount" prefix="₦" value={amount} onChangeText={(t) => setAmount(sanitizeAmountInput(t).split('.')[0])} keyboardType="number-pad" placeholder="50,000" />
              <View style={{ backgroundColor: pt.emerald900, borderRadius: ptRadius.md, paddingVertical: 18, paddingHorizontal: 16, alignItems: 'center', gap: 8 }}>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.onDarkMuted }}>Dial on the phone linked to your bank</Text>
                <Text
                  selectable
                  style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 22, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' }}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.6}
                >
                  {code}
                </Text>
              </View>
              <PtPanel>
                {[
                  ['Step 1', 'Dial the code with the amount', null],
                  ['Step 2', 'Enter your bank PIN', `If your bank asks, pick ${account.bank}.`],
                  ['Step 3', `Money lands in ${o.wallet.name}`, 'Your bank may charge a small USSD fee'],
                ].map(([step, title, sub], i) => (
                  <View key={step} style={{ paddingVertical: 10, gap: 1, borderBottomWidth: i === 2 ? 0 : 1, borderBottomColor: pt.line }}>
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{step}</Text>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{title}</Text>
                    {sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{sub}</Text> : null}
                  </View>
                ))}
              </PtPanel>
            </>
          ) : (
            <PtPanel>
              <View style={{ paddingVertical: 12, gap: 6 }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{"Use your bank's own USSD menu"}</Text>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>
                  {`Dial your bank's code, choose Transfer, and send to ${account.number} at ${account.bank}. The name will show as ${account.name}.`}
                </Text>
              </View>
            </PtPanel>
          )}
        </>
      )}
    </PtPageScreen>
  );
}
