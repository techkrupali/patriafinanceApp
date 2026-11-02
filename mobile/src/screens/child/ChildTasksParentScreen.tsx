import React, { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtField } from '../../components/pt/PtField';
import { PtPanel } from '../../components/pt/PtForm';
import { PtSheet } from '../../components/pt/PtSheet';
import { LoadError } from '../../components/LoadError';
import { useChildView, useTaskActions, useWalletTasks, type ChildTask } from '../../api/child';
import { useWallets } from '../../api/hooks';
import { formatNaira, parseYmd } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** CHD-09 "Tasks and rewards": what's waiting to be checked (with the photo), what's to do, what's paid. */
export function ChildTasksParentScreen({ navigation, route }: RootScreenProps<'ChildTasksParent'>) {
  const { walletId } = route.params;
  const view = useChildView(walletId);
  const q = useWalletTasks(walletId);
  const wallets = useWallets();
  const { approve, sendBack, remove } = useTaskActions(walletId);
  const [back, setBack] = useState<ChildTask | null>(null);
  const [note, setNote] = useState('');
  const kid = view.data?.first_name ?? 'Your child';
  const main = (wallets.data ?? []).find((w) => w.type === 'main' && (w.my_role ?? 'owner') === 'owner');
  const tasks = q.data?.tasks ?? [];

  const pay = (t: ChildTask) =>
    approve.mutate(
      { id: t.id, from_wallet_id: main?.id },
      { onSuccess: () => { notifySuccess(); showAlert('Paid', `${formatNaira(t.reward)} is in ${kid}'s wallet.`); }, onError: (e) => showAlert('Not paid', e.message) },
    );

  return (
    <PtPageScreen title="Tasks and rewards" subtitle={q.data?.streak ? `${kid}: ${q.data.streak} week${q.data.streak === 1 ? '' : 's'} in a row` : kid} onBack={() => navigation.goBack()} footer={<PtButton title="New task" onPress={() => navigation.navigate('AssignTask', { walletId })} />}>
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : q.error ? (
        <LoadError message={(q.error as Error).message} onRetry={() => void q.refetch()} />
      ) : tasks.length === 0 ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted, textAlign: 'center', paddingVertical: 20 }}>{`No tasks yet. Set ${kid} one to earn.`}</Text>
      ) : (
        <PtPanel>
          {tasks.map((t, i) => {
            const d = parseYmd(t.due_on);
            return (
              <View key={t.id} style={{ paddingVertical: 14, gap: 8, borderBottomWidth: i === tasks.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{t.title}</Text>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>{`+${formatNaira(t.reward)}`}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {t.status === 'paid' ? <PtChip label="Paid" tone="success" icon="check" /> : t.status === 'submitted' ? <PtChip label="Check" tone="warning" icon="clock" /> : <PtChip label="To do" tone="neutral" icon="circle" />}
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>
                    {[d ? `By ${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}` : null, t.repeat_weekly ? 'every week' : null, t.needs_photo ? 'photo' : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {t.status === 'submitted' ? (
                  <>
                    {t.photo_url ? <Image source={{ uri: t.photo_url }} style={{ width: '100%', height: 180, borderRadius: ptRadius.md, backgroundColor: pt.sunken }} resizeMode="cover" accessibilityLabel={`${kid}'s photo of ${t.title}`} /> : null}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <PtButton title="Send back" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => setBack(t)} />
                      <PtButton title={`Pay ${formatNaira(t.reward)}`} size="sm" style={{ flex: 1 }} loading={approve.isPending && approve.variables?.id === t.id} onPress={() => pay(t)} />
                    </View>
                  </>
                ) : t.status === 'todo' ? (
                  <PtButton title="Remove" variant="ghost" size="sm" onPress={() => remove.mutate(t.id, { onError: (e) => showAlert('Not removed', e.message) })} />
                ) : null}
              </View>
            );
          })}
        </PtPanel>
      )}
      <PtSheet
        visible={back !== null}
        title="Send it back"
        subtitle={back ? `${back.title} · ${kid} tries again` : undefined}
        onClose={() => setBack(null)}
        footer={<PtButton title="Send back" loading={sendBack.isPending} onPress={() => back && sendBack.mutate({ id: back.id, note: note.trim() || undefined }, { onSuccess: () => { setBack(null); setNote(''); }, onError: (e) => showAlert('Not sent', e.message) })} />}
      >
        <PtField label="What's missing? (optional)" value={note} onChangeText={setNote} placeholder="The windows too, please" maxLength={200} />
      </PtSheet>
    </PtPageScreen>
  );
}
