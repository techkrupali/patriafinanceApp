import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtNote, PtPanel, PtSwitchRow } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { scheduleLine } from '../../components/wallet/WalletManageUi';
import { useWallet, useWalletLock } from '../../api/hooks';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Spending hours (from WAL-06): money may only go out on the days and between
 * the times picked; outside them it waits. Money can always come in. Pausing
 * the whole wallet is on Wallet settings.
 */
export function WalletLockScreen({ navigation, route }: RootScreenProps<'WalletLock'>) {
  const { walletId } = route.params;
  const detail = useWallet(walletId);
  const { setSchedule } = useWalletLock(walletId);
  const wallet = detail.data?.wallet;
  const schedule = wallet?.access_schedule ?? null;

  const [restrict, setRestrict] = useState(false);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('20:00');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet) return;
    const s = wallet.access_schedule ?? null;
    setRestrict(Boolean(s));
    setDays(s?.days?.length ? [...s.days].sort((a, b) => a - b) : [1, 2, 3, 4, 5]);
    setStart(s?.start ?? '08:00');
    setEnd(s?.end ?? '20:00');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.access_schedule]);

  const toggleRestrict = (on: boolean) => {
    setRestrict(on);
    setError(null);
    // Off on a wallet that has hours clears them now.
    if (!on && schedule) {
      setSchedule.mutate(null, { onSuccess: () => notifySuccess(), onError: (e) => showAlert('Could not save', e.message) });
    }
  };

  const save = () => {
    setError(null);
    if (days.length === 0) return setError('Pick at least one day.');
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) return setError('Enter times as HH:MM, from 00:00 to 23:59.');
    if (start >= end) return setError('The start time must be before the end time.');
    setSchedule.mutate(
      { days, start, end },
      {
        onSuccess: () => {
          notifySuccess();
          navigation.goBack();
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <PtPageScreen
      title="Spending hours"
      subtitle={wallet?.name}
      onBack={() => navigation.goBack()}
      footer={restrict ? <PtButton title="Save hours" onPress={save} loading={setSchedule.isPending} /> : undefined}
    >
      {detail.isLoading || !wallet ? (
        detail.error ? <LoadError message={(detail.error as Error).message} onRetry={() => void detail.refetch()} /> : <ActivityIndicator color={pt.brand} />
      ) : (
        <>
          <PtPanel>
            <PtSwitchRow
              title="Only at certain times"
              subtitle={schedule ? `Now: ${scheduleLine(schedule)}` : 'Money can go out any time'}
              value={restrict}
              onChange={toggleRestrict}
            />
          </PtPanel>

          {restrict ? (
            <>
              <View style={{ gap: 10 }}>
                <PtGroupLabel>Days</PtGroupLabel>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {DAYS.map((label, i) => {
                    const value = i + 1;
                    const on = days.includes(value);
                    return (
                      <Pressable
                        key={label}
                        onPress={() => {
                          selection();
                          setError(null);
                          setDays((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort((a, b) => a - b)));
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 2 : 1.5, borderColor: on ? pt.brand : pt.lineStrong, backgroundColor: on ? pt.brandSoft : pt.raised }}
                      >
                        <Text style={{ fontFamily: on ? ptFont.bold : ptFont.medium, fontSize: 13, color: on ? pt.brand : pt.ink }}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <PtField label="From" value={start} onChangeText={setStart} placeholder="08:00" maxLength={5} keyboardType="numbers-and-punctuation" />
                </View>
                <View style={{ flex: 1 }}>
                  <PtField label="Until" value={end} onChangeText={setEnd} placeholder="20:00" maxLength={5} keyboardType="numbers-and-punctuation" />
                </View>
              </View>
              {error ? <PtNote tone="attention">{error}</PtNote> : null}
            </>
          ) : null}

          <PtNote tone="info" icon="clock">
            Outside these hours nobody can pay out of {wallet.name}, the owner included. Money can always come in.
          </PtNote>
        </>
      )}
    </PtPageScreen>
  );
}
