import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChoiceCard, PtGroupLabel, PtNote } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { useWallet } from '../../api/hooks';
import { useCloseWallet, useClosePreview } from '../../api/walletManage';
import { formatNaira } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const join = (n: string[]) => (n.length <= 1 ? n[0] ?? '' : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);

/**
 * WAL-13 Close or archive: archive (read only, history and statements kept)
 * or close for good (history kept 6 years), and where what's left goes —
 * back to each person by what they put in, another wallet, or Main. With
 * co-owners, they confirm first.
 */
export function CloseWalletScreen({ navigation, route }: RootScreenProps<'CloseWallet'>) {
  const { walletId } = route.params;
  const detail = useWallet(walletId);
  const preview = useClosePreview(walletId);
  const close = useCloseWallet(walletId);
  const p = preview.data;
  const wallet = detail.data?.wallet;

  const [mode, setMode] = useState<'archive' | 'close'>('archive');
  const [moveTo, setMoveTo] = useState<string>('each');

  const left = p ? parseFloat(p.balance) : 0;
  const moveOptions = p
    ? [
        ...(p.each.length > 1 ? [{ key: 'each', title: 'Back to each person', sub: p.each.map((e) => `${e.name} ${formatNaira(e.amount)}`).join(' · ') }] : []),
        ...p.wallets.slice(0, 4).map((w) => ({ key: `wallet:${w.id}`, title: `To ${w.name}`, sub: undefined as string | undefined })),
        ...(p.main ? [{ key: 'main', title: 'To my Main wallet', sub: undefined as string | undefined }] : []),
      ]
    : [];
  const chosen = moveOptions.find((o) => o.key === moveTo) ?? moveOptions[0];

  const submit = () => {
    if (!chosen && left > 0) return;
    const [kind, id] = (chosen?.key ?? 'main').split(':');
    const run = () =>
      close.mutate(
        { mode, move_to: left > 0 ? (kind as 'each' | 'wallet' | 'main') : null, wallet_id: id ? Number(id) : null },
        {
          onSuccess: (res) => {
            notifySuccess();
            if (res.done) {
              navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'WalletDetail', params: { walletId } }] });
            } else {
              showAlert('Sent to confirm', `${join(res.approval?.approver_names ?? p?.needs ?? [])} will see it in their approvals. It happens once they say yes.`);
              navigation.goBack();
            }
          },
          onError: (e) => showAlert('Could not close', e.message),
        },
      );
    if (mode === 'close') {
      showAlert('Close for good?', `${wallet?.name ?? 'This wallet'} can't be opened again. Its history is kept for 6 years.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close for good', style: 'destructive', onPress: run },
      ]);
    } else run();
  };

  return (
    <PtPageScreen
      title="Close or archive"
      subtitle={wallet?.name}
      onBack={() => navigation.goBack()}
      footer={
        p && !p.blocked ? (
          <PtButton title={p.needs.length ? `Ask ${join(p.needs)} to confirm` : mode === 'close' ? 'Close wallet' : 'Archive wallet'} onPress={submit} loading={close.isPending} />
        ) : undefined
      }
    >
      {preview.isLoading || !p ? (
        preview.error ? <LoadError message={(preview.error as Error).message} onRetry={() => void preview.refetch()} /> : <ActivityIndicator color={pt.brand} />
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 28, lineHeight: 34, color: pt.ink }} accessibilityRole="header">
              {p.goal_reached ? 'Goal reached. What now?' : `Close ${wallet?.name ?? 'this wallet'}?`}
            </Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 16, lineHeight: 23, color: pt.inkMuted }}>
              {p.paid_to ? `${p.paid_to} has been paid. ` : ''}
              {left > 0 ? `${formatNaira(left)} is left.` : 'Nothing is left in it.'}
            </Text>
          </View>

          {p.blocked ? (
            <PtNote tone="attention">{p.blocked}</PtNote>
          ) : (
            <>
              <PtChoiceCard title="Archive" subtitle="Keeps the history and statements. Read only." selected={mode === 'archive'} onPress={() => setMode('archive')} />
              <PtChoiceCard title="Close for good" subtitle="History is kept for 6 years, then deleted." selected={mode === 'close'} onPress={() => setMode('close')} />

              {left > 0 ? (
                <View style={{ gap: 10 }}>
                  <PtGroupLabel>{`Move what's left (${formatNaira(left)})`}</PtGroupLabel>
                  {moveOptions.map((o) => (
                    <PtChoiceCard key={o.key} title={o.title} subtitle={o.sub} selected={chosen?.key === o.key} onPress={() => setMoveTo(o.key)} />
                  ))}
                </View>
              ) : null}

              {p.needs.length ? (
                <PtNote tone="info" icon="users">
                  {join(p.needs)} {p.needs.length === 1 ? 'holds' : 'hold'} this wallet with you, so {p.needs.length === 1 ? 'they confirm' : 'they all confirm'} before it closes. Waiting payments are cancelled when it does.
                </PtNote>
              ) : null}
            </>
          )}
        </>
      )}
    </PtPageScreen>
  );
}
