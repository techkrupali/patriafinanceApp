import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtAmountBox } from '../../components/pt/PtAmountBox';
import { PtChoiceCard, PtGroupLabel, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { useSaveStewardSettings, useStewardSettings, type StewardSettings } from '../../api/steward';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * AIS-05 "What Steward can do — you're always in charge": suggest only,
 * prepare for my OK (your PIN), or act within limits (moves between your own
 * wallets up to a limit, without asking). And what Steward never does.
 */
export function StewardPermissionsScreen({ navigation }: RootScreenProps<'StewardPermissions'>) {
  const q = useStewardSettings();
  const save = useSaveStewardSettings();
  const [mode, setMode] = useState<StewardSettings['mode']>('prepare');
  const [limit, setLimit] = useState('20000');

  useEffect(() => {
    if (!q.data) return;
    setMode(q.data.mode);
    setLimit(String(q.data.limit / 100));
  }, [q.data]);

  if (!q.data) {
    return (
      <PtPageScreen title="What Steward can do" onBack={() => navigation.goBack()}>
        <LoadingBlock error={q.error ? (q.error as Error).message : null} onRetry={() => void q.refetch()} />
      </PtPageScreen>
    );
  }
  const shown = `₦${Number(limit || 0).toLocaleString('en-NG')}`;

  return (
    <PtPageScreen
      title="What Steward can do"
      subtitle="You're always in charge"
      onBack={() => navigation.goBack()}
      footer={
        <PtButton
          title="Save"
          loading={save.isPending}
          onPress={() => save.mutate({ mode, ...(mode === 'act' ? { limit: Number(limit || 0) } : {}) }, { onSuccess: () => { notifySuccess(); navigation.goBack(); }, onError: (e) => showAlert('Not saved', e.message) })}
        />
      }
    >
      <View style={{ gap: 10 }}>
        <PtChoiceCard title="Suggest only" subtitle="Steward tells you things. You do everything yourself." selected={mode === 'suggest'} onPress={() => setMode('suggest')} />
        <PtChoiceCard title="Prepare for my OK" subtitle="Steward sets things up. You confirm with your PIN." selected={mode === 'prepare'} onPress={() => setMode('prepare')} />
        <PtChoiceCard title="Act within limits" subtitle={`Moves between your own wallets, up to ${shown}, without asking.`} selected={mode === 'act'} onPress={() => setMode('act')} />
        {mode === 'act' ? <PtAmountBox value={limit} onChange={setLimit} label="Limit" /> : null}
      </View>
      <PtGroupLabel>Steward never</PtGroupLabel>
      <PtPanel>
        <PtReviewRow label="" value="Sends money outside your wallets without your PIN" />
        <PtReviewRow label="" value="Changes approval rules or who is in your family" />
        <PtReviewRow label="" value="Shares your balances with anyone" last />
      </PtPanel>
      <Text onPress={() => navigation.navigate('StewardLog')} style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>See what Steward did</Text>
    </PtPageScreen>
  );
}
