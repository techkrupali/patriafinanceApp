import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtGroupLabel, PtPanel, PtPills, PtSwitchRow } from '../../components/pt/PtForm';
import { BankPicker } from '../../components/BankPicker';
import { useSaveAccount, useVerifyAccount } from '../../api/hooks';
import { notifySuccess } from '../../lib/haptics';
import type { Bank } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const CATEGORIES = [
  { value: 'family', label: 'Family' },
  { value: 'friends', label: 'Friends' },
  { value: 'institutions', label: 'Institutions' },
  { value: 'partners', label: 'Partners' },
  { value: 'new', label: '+ New' },
];

/**
 * GIV-07 "Add a recipient, save for later": account number and bank, checked
 * with the bank; saved under a nickname and category (and maybe a group) so it
 * can be used for transfers and rules too. Returns to the screen that opened it
 * with the new account.
 */
export function AddRecipientScreen({ navigation, route }: RootScreenProps<'AddRecipient'>) {
  const { context, returnTo } = route.params;
  const verify = useVerifyAccount();
  const save = useSaveAccount();

  const [accountNumber, setAccountNumber] = useState('');
  const [bank, setBank] = useState<Bank | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [checked, setChecked] = useState<{ account_name: string; bank_name: string } | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [keep, setKeep] = useState(true);
  const [nickname, setNickname] = useState('');
  const [category, setCategory] = useState('institutions');
  const [custom, setCustom] = useState('');
  const [grouped, setGrouped] = useState(false);
  const [group, setGroup] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Checked with the bank as soon as there's a bank and 10 digits.
  useEffect(() => {
    setChecked(null);
    setCheckError(null);
    if (!bank || accountNumber.length !== 10) return;
    verify.mutate(
      { account_number: accountNumber, bank_code: bank.bank_code },
      {
        onSuccess: (data) => {
          setChecked(data);
          setNickname((n) => n || data.account_name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
        },
        onError: (e) => setCheckError(e.message),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank?.bank_code, accountNumber]);

  const submit = () => {
    setError(null);
    if (!bank || !checked) {
      setError('Enter the account number and bank so we can check the name.');
      return;
    }
    if (category === 'new' && !custom.trim()) {
      setError('Name the new category.');
      return;
    }
    if (grouped && !group.trim()) {
      setError('Name the group.');
      return;
    }
    save.mutate(
      {
        account_number: accountNumber,
        bank_code: bank.bank_code,
        nickname: nickname.trim() || undefined,
        category: category === 'new' ? custom.trim() : category,
        listed: keep,
        group: grouped ? group.trim() : undefined,
      },
      {
        onSuccess: (res) => {
          notifySuccess();
          // Back to the setup that opened this (React Navigation 7: navigate would open a new one).
          navigation.popTo(returnTo, { addedAccountId: res.account.id }, { merge: true });
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <PtPageScreen
      title="Add a recipient"
      subtitle={context}
      onBack={() => navigation.goBack()}
      footer={
        <>
          {error ? (
            <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
              {error}
            </PtText>
          ) : null}
          <PtButton title="Add recipient" onPress={submit} loading={save.isPending} disabled={!checked} />
        </>
      }
    >
      <PtField
        label="Account number"
        value={accountNumber}
        onChangeText={(t) => setAccountNumber(t.replace(/\D/g, '').slice(0, 10))}
        placeholder="0123456789"
        keyboardType="number-pad"
        maxLength={10}
      />
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: ptFont.semibold, fontSize: 14, color: pt.ink }}>Bank</Text>
        <Pressable
          onPress={() => setBankOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Bank"
          style={{
            height: 56,
            borderRadius: ptRadius.md,
            borderWidth: 1.5,
            borderColor: pt.lineStrong,
            backgroundColor: pt.raised,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Text style={{ flex: 1, fontFamily: ptFont.medium, fontSize: 16, color: bank ? pt.ink : pt.inkSubtle }}>{bank?.bank_name ?? 'Choose the bank'}</Text>
          <Feather name="chevron-down" size={18} color={pt.inkMuted} />
        </Pressable>
      </View>

      {verify.isPending ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ActivityIndicator size="small" color={pt.brand} />
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>Checking with the bank…</Text>
        </View>
      ) : checked ? (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: pt.brandSoft, borderRadius: ptRadius.md, padding: 14 }}>
          <Feather name="check" size={16} color={pt.brand} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.ink }}>
            <Text style={{ fontFamily: ptFont.bold }}>{checked.account_name}</Text> · checked with the bank
          </Text>
        </View>
      ) : checkError ? (
        <PtText variant="caption" color={pt.danger}>
          {checkError}
        </PtText>
      ) : null}

      <PtPanel>
        <PtSwitchRow title="Save this account for later" subtitle="Use it for transfers and rules too" value={keep} onChange={setKeep} />
      </PtPanel>

      <PtField label="Nickname" value={nickname} onChangeText={setNickname} placeholder="Little Saints Orphanage" maxLength={80} />

      <View style={{ gap: 10 }}>
        <PtGroupLabel>Category</PtGroupLabel>
        <PtPills options={CATEGORIES} value={category} onChange={setCategory} />
        {category === 'new' ? <PtField label="New category" value={custom} onChangeText={setCustom} placeholder="Church projects" maxLength={40} /> : null}
      </View>

      <PtPanel>
        <PtSwitchRow title="Add to a group" subtitle={'Like "Charities we support"'} value={grouped} onChange={setGrouped} />
        {grouped ? (
          <View style={{ paddingBottom: 14 }}>
            <PtField label="Group name" value={group} onChangeText={setGroup} placeholder="Charities we support" maxLength={80} />
          </View>
        ) : null}
      </PtPanel>

      <BankPicker
        visible={bankOpen}
        selectedCode={bank?.bank_code}
        onSelect={(b) => {
          setBank(b);
          setBankOpen(false);
        }}
        onClose={() => setBankOpen(false)}
      />
    </PtPageScreen>
  );
}
