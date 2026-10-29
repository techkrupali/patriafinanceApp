import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { LoadError } from '../../components/LoadError';
import { useSavedAccounts, useWallet } from '../../api/hooks';
import { useAskToUnlock } from '../../api/walletManage';
import { useAuth } from '../../store/auth';
import { formatNaira, formatYmd, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { pickFile, type PickedFile } from '../../lib/upload';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const join = (n: string[]) => (n.length <= 1 ? n[0] ?? '' : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);

/**
 * WAL-11 Ask to unlock: how much, what it's for, proof if there is some, who
 * gets paid, and who approves — the asker counts as the first yes. It goes to
 * the approvers' inbox.
 */
export function AskToUnlockScreen({ navigation, route }: RootScreenProps<'AskToUnlock'>) {
  const { walletId } = route.params;
  const me = useAuth((s) => s.user);
  const detail = useWallet(walletId);
  const saved = useSavedAccounts();
  const ask = useAskToUnlock(walletId);
  const d = detail.data;
  const wallet = d?.wallet;
  const payee = wallet?.goal?.payout?.to ?? null;

  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [proof, setProof] = useState<PickedFile | null>(null);
  const [payTo, setPayTo] = useState<string>(payee ? 'payee' : 'main');
  const [payOpen, setPayOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approverRows = d?.governance?.approvers ?? [];
  const deciders = (wallet?.approval_mode === 'named' ? approverRows.filter((a) => wallet.approver_ids?.includes(a.user_id)) : approverRows)
    .filter((a) => a.user_id !== me?.id)
    .map((a) => a.name);
  const fee = wallet?.lock?.fee_percent ?? 0;
  const available = parseFloat(wallet?.available ?? wallet?.balance ?? '0');
  const accounts = saved.data?.accounts ?? [];
  const options = [
    ...(payee ? [{ value: 'payee', label: payee, hint: "The goal's payee" }] : []),
    { value: 'main', label: 'My Main wallet', hint: 'Into your own Main' },
    ...accounts.filter((a) => a.nickname !== payee).map((a) => ({ value: `saved:${a.id}`, label: a.nickname, hint: `${a.bank_name} · ${a.masked_number}` })),
  ];
  const chosen = options.find((o) => o.value === payTo) ?? options[0];
  const lockedLine = wallet?.lock?.mode === 'date' && wallet.lock.until ? `locked until ${formatYmd(wallet.lock.until).replace(/ \d{4}$/, '')}` : 'locked';

  const attach = async () => {
    selection();
    const file = await pickFile('library');
    if (file) setProof(file);
  };

  const send = () => {
    setError(null);
    const n = parseFloat(amount);
    if (!(n > 0)) return setError('Enter how much you need.');
    if (n > available) return setError(`The wallet has ${formatNaira(available)} free.`);
    if (!purpose.trim()) return setError('Say what it is for.');
    const [kind, id] = payTo.split(':');
    ask.mutate(
      { amount, purpose: purpose.trim(), pay_to: kind as 'payee' | 'main' | 'saved', saved_account_id: id ? Number(id) : null, proof },
      {
        onSuccess: () => {
          notifySuccess();
          navigation.replace('Approvals', { scope: 'mine' });
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <PtPageScreen
      title="Ask to unlock"
      subtitle={wallet ? `${wallet.name} · ${lockedLine}` : null}
      onBack={() => navigation.goBack()}
      footer={wallet ? <PtButton title={deciders.length ? `Send to ${join(deciders)}` : 'Send'} onPress={send} loading={ask.isPending} disabled={!deciders.length} /> : undefined}
    >
      {detail.isLoading || !wallet ? (
        detail.error ? <LoadError message={(detail.error as Error).message} onRetry={() => void detail.refetch()} /> : <ActivityIndicator color={pt.brand} />
      ) : (
        <>
          <PtField
            label="How much do you need?"
            prefix="₦"
            keyboardType="number-pad"
            value={groupAmountInput(amount)}
            onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
            placeholder="35,000"
            hint={`${formatNaira(wallet.balance)} in the wallet`}
          />
          <PtField label="What is it for?" value={purpose} onChangeText={setPurpose} placeholder="Tolu's BECE registration fee" maxLength={160} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: ptRadius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: pt.lineStrong }}>
            <Pressable
              onPress={() => void attach()}
              accessibilityRole="button"
              accessibilityLabel={proof ? 'Change proof' : 'Attach proof, optional'}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={proof ? 'file' : 'paperclip'} size={18} color={pt.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
                  {proof ? proof.fileName || 'Photo attached' : 'Attach proof'}
                </Text>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{proof ? 'Proof attached · optional' : 'A photo of the bill or notice · optional'}</Text>
              </View>
            </Pressable>
            {proof ? (
              <Pressable onPress={() => setProof(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove proof">
                <Feather name="x" size={18} color={pt.inkMuted} />
              </Pressable>
            ) : null}
          </View>

          <PtPanel>
            <PtReviewRow label="Who approves" value={join(deciders) || 'Nobody else yet'} sub="You count as the first yes" />
            <PtReviewRow label="Pays to" value={chosen?.label ?? 'My Main wallet'} sub={chosen?.hint} onEdit={() => setPayOpen(true)} />
            <PtReviewRow label="Early unlock fee" value={fee > 0 ? `${fee}% of what comes out` : wallet.type === 'goal' ? 'None for goal wallets' : 'None'} last />
          </PtPanel>

          {!deciders.length ? <PtNote tone="attention">Only you hold this wallet. It opens on its own date or at the goal.</PtNote> : null}
          {error ? <PtNote tone="attention">{error}</PtNote> : null}
        </>
      )}

      <PtOptionSheet
        visible={payOpen}
        title="Pay to"
        options={options}
        value={payTo}
        onClose={() => setPayOpen(false)}
        onPick={(v) => {
          setPayTo(v);
          setPayOpen(false);
        }}
      />
    </PtPageScreen>
  );
}
