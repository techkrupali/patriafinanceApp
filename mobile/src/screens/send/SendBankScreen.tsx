import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtPanel, PtPills, PtSwitchRow } from '../../components/pt/PtForm';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { useBanks, useSaveAccount, useVerifyAccount } from '../../api/hooks';
import { useSendDraft } from '../../store/sendDraft';
import type { RootScreenProps } from '../../navigation/types';

export const PAYEE_CATEGORIES = [
  { value: 'family', label: 'Family' },
  { value: 'friends', label: 'Friends' },
  { value: 'institutions', label: 'Institutions' },
  { value: 'partners', label: 'Partners' },
];

/**
 * SND-04 Send to a bank account: account number and bank, the name checked
 * with the bank, and "Save this account for later" with a nickname and a
 * category — or send once without saving (SND-17 asks again after).
 */
export function SendBankScreen({ navigation, route }: RootScreenProps<'SendBank'>) {
  const banks = useBanks();
  const verify = useVerifyAccount();
  const saveAccount = useSaveAccount();
  const setRecipient = useSendDraft((s) => s.setRecipient);
  const [number, setNumber] = useState(route.params?.accountNumber ?? '');
  const [bank, setBank] = useState<{ code: string; name: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [checked, setChecked] = useState<{ account_name: string; bank_name: string } | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [save, setSave] = useState(true);
  const [nickname, setNickname] = useState('');
  const [category, setCategory] = useState('family');
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // "Name checked with the bank" as soon as both are in.
  useEffect(() => {
    setChecked(null);
    setCheckError(null);
    if (number.length !== 10 || !bank) return;
    verify.mutate(
      { account_number: number, bank_code: bank.code },
      {
        onSuccess: (d) => {
          setChecked(d);
          setNickname((n) => n || d.account_name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
        },
        onError: (e) => setCheckError(e.message),
      },
    );
  }, [number, bank?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (saved: boolean, savedId?: number) => {
    if (!checked || !bank) return;
    setRecipient({
      kind: 'bank',
      name: saved && nickname.trim() ? nickname.trim() : checked.account_name,
      bankCode: bank.code,
      bankName: checked.bank_name || bank.name,
      accountNumber: number,
      sub: `${checked.bank_name || bank.name} •••• ${number.slice(-4)}`,
      savedId,
      saved,
    });
    navigation.navigate('SendAmount');
  };

  const saveAndContinue = () => {
    if (!checked || !bank) return;
    setError(null);
    const cat = (newCategory ?? category).trim().toLowerCase() || 'family';
    saveAccount.mutate(
      { account_number: number, bank_code: bank.code, nickname: nickname.trim() || undefined, category: cat },
      { onSuccess: (d) => go(true, d.account.id), onError: (e) => setError(e.message) },
    );
  };

  return (
    <PtPageScreen
      title="Send to a bank account"
      subtitle="Any Nigerian bank"
      onBack={() => navigation.goBack()}
      footer={
        <View style={{ gap: 4 }}>
          {save ? <PtButton title="Save and continue" onPress={saveAndContinue} disabled={!checked} loading={saveAccount.isPending} /> : null}
          <PtButton title={save ? "Send once, don't save" : 'Continue'} variant={save ? 'ghost' : 'primary'} onPress={() => go(false)} disabled={!checked} />
        </View>
      }
    >
      <PtField label="Account number" value={number} onChangeText={(t) => setNumber(t.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" maxLength={10} placeholder="10 digits" />
      <PtField label="Bank" value={bank?.name ?? ''} editable={false} placeholder="Choose the bank" onPressBox={() => setPicking(true)} />

      {verify.isPending ? <ActivityIndicator color={pt.brand} /> : null}
      {checked ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, padding: 14 }}>
          <Feather name="check-circle" size={18} color={pt.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{checked.account_name}</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>Name checked with the bank</Text>
          </View>
        </View>
      ) : checkError ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.danger }}>{checkError}</Text>
      ) : null}

      <PtPanel>
        <PtSwitchRow title="Save this account for later" subtitle="For transfers, giving and rules" value={save} onChange={setSave} />
      </PtPanel>
      {save ? (
        <>
          <PtField label="Nickname" value={nickname} onChangeText={setNickname} placeholder="Greenfield School" maxLength={80} />
          <View style={{ gap: 10 }}>
            <PtGroupLabel>Category</PtGroupLabel>
            <PtPills
              compact
              options={[...PAYEE_CATEGORIES, { value: '__new', label: '+ New' }]}
              value={newCategory !== null ? '__new' : category}
              onChange={(v) => {
                if (v === '__new') setNewCategory('');
                else {
                  setNewCategory(null);
                  setCategory(v);
                }
              }}
            />
            {newCategory !== null ? <PtField label="New category" value={newCategory} onChangeText={setNewCategory} placeholder="Church" maxLength={40} /> : null}
          </View>
        </>
      ) : null}
      {error ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.danger }}>{error}</Text> : null}

      <PtOptionSheet
        visible={picking}
        title="Choose the bank"
        options={(banks.data ?? []).map((b) => ({ value: b.bank_code, label: b.bank_name }))}
        value={bank?.code ?? null}
        onPick={(code) => {
          setBank({ code, name: banks.data?.find((b) => b.bank_code === code)?.bank_name ?? code });
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </PtPageScreen>
  );
}
