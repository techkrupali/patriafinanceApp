import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtField } from '../../components/pt/PtField';
import { PtNote, PtPanel } from '../../components/pt/PtForm';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { LoadError } from '../../components/LoadError';
import { AddLink } from '../../components/wallet/WalletManageUi';
import { useBankActions, useLinkBank, useLinkedBanks } from '../../api/account';
import { useBanks } from '../../api/hooks';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * ME-04 Linked bank accounts, for withdrawals and top-ups: your default and
 * the others (Remove), and linking another — only accounts in your own name.
 */
export function LinkedBanksScreen({ navigation }: RootScreenProps<'LinkedBanks'>) {
  const q = useLinkedBanks();
  const banks = useBanks();
  const link = useLinkBank();
  const { makeDefault, remove } = useBankActions();
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [bank, setBank] = useState<{ code: string; name: string } | null>(null);
  const [number, setNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const accounts = q.data ?? [];

  const confirmRemove = (id: number, label: string) =>
    showAlert(`Remove ${label}?`, 'You can link it again later.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(id, { onError: (e) => showAlert('Could not remove', e.message) }) },
    ]);

  return (
    <PtPageScreen title="Linked bank accounts" subtitle="For withdrawals and top-ups" onBack={() => navigation.goBack()}>
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : q.error ? (
        <LoadError message={(q.error as Error).message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          {accounts.length ? (
            <PtPanel>
              {accounts.map((a, i) => (
                <View key={a.id} style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === accounts.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 12, color: pt.brand }}>{`B${i + 1}`}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>{`${a.bank_name} ${a.masked}`}</Text>
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>{a.account_name}</Text>
                  </View>
                  {a.default ? (
                    <PtChip label="Default" tone="brand" icon="check" />
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Pressable onPress={() => { selection(); makeDefault.mutate(a.id); }} accessibilityRole="button" hitSlop={8}>
                        <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: pt.brand }}>Make default</Text>
                      </Pressable>
                      <Pressable onPress={() => confirmRemove(a.id, `${a.bank_name} ${a.masked}`)} accessibilityRole="button" hitSlop={8}>
                        <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: pt.danger }}>Remove</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))}
            </PtPanel>
          ) : (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>No bank accounts linked yet.</Text>
          )}
          <AddLink label="Link a bank account" onPress={() => setAdding(true)} />
          <PtNote tone="info" icon="lock">You can only withdraw to accounts in your own name.</PtNote>
        </>
      )}

      <PtSheet
        visible={adding}
        title="Link a bank account"
        subtitle="An account in your own name. We check the name with the bank."
        onClose={() => setAdding(false)}
        footer={
          <PtButton
            title="Link account"
            loading={link.isPending}
            disabled={!bank || number.length !== 10}
            onPress={() =>
              bank &&
              link.mutate(
                { bank_code: bank.code, account_number: number },
                {
                  onSuccess: () => {
                    notifySuccess();
                    setAdding(false);
                    setNumber('');
                    setBank(null);
                    setError(null);
                  },
                  onError: (e) => setError(e.message),
                },
              )
            }
          />
        }
      >
        <View style={{ gap: 10 }}>
          <PtField label="Bank" value={bank?.name ?? ''} editable={false} placeholder="Choose your bank" onPressBox={() => setPicking(true)} />
          <PtField label="Account number" value={number} onChangeText={(t) => setNumber(t.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" maxLength={10} placeholder="10 digits" />
          {error ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.danger }}>{error}</Text> : null}
        </View>
      </PtSheet>
      <PtOptionSheet
        visible={picking}
        title="Your bank"
        options={(banks.data ?? []).map((b) => ({ value: b.bank_code, label: b.bank_name }))}
        value={bank?.code ?? null}
        onClose={() => setPicking(false)}
        onPick={(code) => {
          setBank({ code, name: banks.data?.find((b) => b.bank_code === code)?.bank_name ?? code });
          setPicking(false);
        }}
      />
    </PtPageScreen>
  );
}
