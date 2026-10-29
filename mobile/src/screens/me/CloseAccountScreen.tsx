import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PinSheet } from '../../components/PinSheet';
import { LoadError } from '../../components/LoadError';
import { useCloseAccount, useCloseChecklist } from '../../api/account';
import { useAuth } from '../../store/auth';
import type { RootScreenProps } from '../../navigation/types';

/**
 * ME-22 Close my account — this can't be undone. "Before you go": Main's
 * money, wallets you own, a joint wallet, a subscription; each with Edit.
 * Records are kept 6 years, as the law requires; everything else goes.
 */
export function CloseAccountScreen({ navigation }: RootScreenProps<'CloseAccount'>) {
  const q = useCloseChecklist();
  const close = useCloseAccount();
  const logout = useAuth((s) => s.logout);
  const qc = useQueryClient();
  const [askPin, setAskPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = q.data?.items ?? [];

  const edit = (key: string) => {
    if (key === 'main') navigation.navigate('Transfer', undefined);
    else if (key === 'wallets') navigation.navigate('AllWallets');
    else if (key === 'joint') navigation.navigate('AllWallets');
  };

  return (
    <PtPageScreen
      title="Close my account"
      subtitle="This can't be undone"
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Continue when ready" disabled={!q.data?.ready} onPress={() => setAskPin(true)} style={q.data?.ready ? { backgroundColor: pt.danger } : undefined} />}
    >
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !q.data ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <View style={{ gap: 4 }}>
            <Text style={{ fontFamily: ptFont.extrabold, fontSize: 24, color: pt.ink }} accessibilityRole="header">Before you go</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>{q.data.ready ? 'Everything is sorted.' : 'We need to sort these first:'}</Text>
          </View>
          <PtPanel>
            {items.map((it, i) => (
              <PtReviewRow
                key={it.key}
                label={it.title}
                value={it.value}
                sub={it.sub}
                onEdit={!it.done && it.key !== 'subscription' ? () => edit(it.key) : undefined}
                right={it.done ? <Feather name="check-circle" size={18} color={pt.brand} /> : null}
                last={i === items.length - 1}
              />
            ))}
          </PtPanel>
          <PtNote tone="info" icon="lock">We keep transaction records for 6 years, as the law requires. Everything else is deleted within 30 days.</PtNote>
        </>
      )}
      <PinSheet
        visible={askPin}
        title="Close your account?"
        subtitle="Enter your PIN. You'll be signed out."
        allowBiometric={false}
        loading={close.isPending}
        error={error}
        onSubmit={(pin) =>
          close.mutate(pin, {
            onSuccess: async () => {
              setAskPin(false);
              await logout();
              qc.clear();
            },
            onError: (e) => setError(e.message),
          })
        }
        onClose={() => setAskPin(false)}
      />
    </PtPageScreen>
  );
}
