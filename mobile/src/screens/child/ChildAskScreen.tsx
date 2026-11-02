import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { pt, ptFont } from '../../theme';
import { PtTabScreen } from '../../components/pt/PtTabScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtHeroAmount } from '../../components/pt/PtHeroAmount';
import { PtGroupLabel, PtNote, PtPills, PtReviewRow, PtPanel } from '../../components/pt/PtForm';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PinSheet } from '../../components/PinSheet';
import { useBanks, useVerifyAccount } from '../../api/hooks';
import { useChildAsk, useChildHome } from '../../api/child';
import { formatMoney, formatNaira } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { ASK_FOR, parentsLine } from './ChildUi';
import type { ChildStackParamList } from '../../navigation/types';

/**
 * CHD-04 Ask for money: how much, what it's for, more about it, and who gets
 * the money (a bank account, or a friend on Patriai when that's allowed).
 * Under the auto-approve amount it goes straight through; otherwise a parent
 * sees it straight away.
 */
export function ChildAskScreen() {
  const navigation = useNavigation<NavigationProp<ChildStackParamList>>();
  const home = useChildHome();
  const h = home.data;
  const ask = useChildAsk(h?.wallet.id ?? 0);
  const banks = useBanks();
  const verify = useVerifyAccount();
  const [amount, setAmount] = useState('');
  const [what, setWhat] = useState<string | null>(null);
  const [more, setMore] = useState('');
  const [to, setTo] = useState<'bank' | 'friend'>('bank');
  const [number, setNumber] = useState('');
  const [bank, setBank] = useState<{ code: string; name: string } | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const [tag, setTag] = useState('');
  const [picking, setPicking] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = parseFloat(amount) || 0;
  const auto = parseFloat(h?.auto_limit ?? '0');
  const parents = parentsLine(h?.parents ?? []);
  const friends = Boolean(h?.controls.friends);

  useEffect(() => {
    setChecked(null);
    if (number.length !== 10 || !bank) return;
    verify.mutate({ account_number: number, bank_code: bank.code }, { onSuccess: (d) => setChecked(d.account_name), onError: (e) => setError(e.message) });
  }, [number, bank?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = ASK_FOR.find((a) => a.value === what)?.label;
  const description = more.trim() || label || '';
  const ready = n > 0 && what && (!h?.reason_required || description) && (to === 'bank' ? Boolean(checked && bank) : tag.trim().length > 1);

  const send = (pin: string) => {
    if (!h || !what) return;
    setError(null);
    ask.mutate(
      {
        amount: String(n),
        pin,
        description,
        category: what,
        destination: to === 'bank' && bank && checked ? { kind: 'bank', bank_code: bank.code, account_number: number, account_name: checked, bank_name: bank.name } : { kind: 'user', identifier: tag.trim().startsWith('@') ? tag.trim() : `@${tag.trim()}` },
      },
      {
        onSuccess: () => {
          notifySuccess();
          setPinOpen(false);
          setAmount('');
          setMore('');
          setWhat(null);
          navigation.navigate('ChildRequests');
        },
        onError: (e) => {
          setPinOpen(false);
          setError(e.message);
        },
      },
    );
  };

  return (
    <PtTabScreen title="Ask for money">
      <Text style={{ marginTop: -10, fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>{`${parents} will see it straight away`}</Text>
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <PtHeroAmount value={amount} onChange={setAmount} label="How much" />
      </View>
      <View style={{ gap: 10 }}>
        <PtGroupLabel>What is it for?</PtGroupLabel>
        <PtPills options={ASK_FOR} value={what} onChange={setWhat} />
      </View>
      <PtField label="Tell them more" value={more} onChangeText={setMore} placeholder="Ola's birthday on Saturday" maxLength={200} />

      <View style={{ gap: 10 }}>
        <PtGroupLabel>Who gets the money?</PtGroupLabel>
        {friends ? (
          <PtPills
            options={[
              { value: 'bank', label: 'A bank account' },
              { value: 'friend', label: 'A friend on Patriai' },
            ]}
            value={to}
            onChange={(v) => setTo(v as 'bank' | 'friend')}
          />
        ) : null}
        {to === 'bank' ? (
          <>
            <PtPanel>
              <PtReviewRow label="Bank" value={bank?.name ?? 'Choose the bank'} onEdit={() => setPicking(true)} last />
            </PtPanel>
            <PtField label="Account number" value={number} onChangeText={(t) => setNumber(t.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" placeholder="0123456789" hint={checked ? `✓ ${checked}` : verify.isPending ? 'Checking the name…' : undefined} />
          </>
        ) : (
          <PtField label="Their @tag" value={tag} onChangeText={setTag} autoCapitalize="none" placeholder="@ola" />
        )}
      </View>

      {n > 0 ? (
        <PtNote tone="info">{auto > 0 && n <= auto ? `Under ${formatNaira(auto)} is approved straight away, up to a few times a week.` : `${auto > 0 ? `Under ${formatNaira(auto)} is approved straight away. ` : ''}This one goes to ${parents}.`}</PtNote>
      ) : null}
      {error ? <PtNote tone="attention">{error}</PtNote> : null}

      <PtButton title="Send request" disabled={!ready} loading={ask.isPending} onPress={() => setPinOpen(true)} />

      <PtOptionSheet
        visible={picking}
        title="Choose the bank"
        options={(banks.data ?? []).map((b) => ({ value: b.bank_code, label: b.bank_name }))}
        value={bank?.code ?? null}
        onPick={(code) => {
          const b = (banks.data ?? []).find((x) => x.bank_code === code);
          if (b) setBank({ code: b.bank_code, name: b.bank_name });
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
      <PinSheet visible={pinOpen} title="Enter your PIN" subtitle={`Ask for ${formatNaira(n)}${label ? ` · ${label}` : ''}`} amount={formatMoney(String(n))} loading={ask.isPending} error={null} onSubmit={send} onClose={() => setPinOpen(false)} />
    </PtTabScreen>
  );
}
