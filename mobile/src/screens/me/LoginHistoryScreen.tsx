import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtChip } from '../../components/pt/PtChip';
import { PtNote, PtPanel } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { useLoginHistory, type LoginRow } from '../../api/account';
import type { RootScreenProps } from '../../navigation/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today, 7:02 pm" · "22 Oct, 9:15 pm". */
function when(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  const time = `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
  return d.toDateString() === new Date().toDateString() ? `Today, ${time}` : `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`;
}

const REASONS: Record<string, string> = {
  wrong_pin: 'wrong PIN',
  locked: 'PIN locked',
  wrong_bvn: 'wrong BVN',
  new_device: 'new device',
  pin_reset: 'PIN reset',
  sign_up: 'signed up',
};

/**
 * ME-10 Login history, the last 30 days: when, which device, OK or blocked,
 * and a warning when we blocked one ("If that wasn't you trying, change your
 * PIN"). Locations need a location service we don't have, so the device shows.
 */
export function LoginHistoryScreen({ navigation }: RootScreenProps<'LoginHistory'>) {
  const q = useLoginHistory();
  const rows: LoginRow[] = q.data?.logins ?? [];
  const warning = q.data?.warning;

  return (
    <PtPageScreen title="Login history" subtitle="Last 30 days" onBack={() => navigation.goBack()}>
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : q.error ? (
        <LoadError message={(q.error as Error).message} onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted, textAlign: 'center', paddingVertical: 24 }}>No sign-ins in the last 30 days.</Text>
      ) : (
        <>
          <PtPanel>
            {rows.map((r, i) => (
              <View key={r.id} style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{when(r.at)}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
                    {[r.device, r.new_device ? 'new device' : r.reason && r.status !== 'ok' ? REASONS[r.reason] ?? r.reason : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {r.status === 'ok' ? <PtChip label="OK" tone="success" icon="check" /> : <PtChip label="Blocked" tone="danger" icon="x" />}
              </View>
            ))}
          </PtPanel>
          {warning ? (
            <PtNote tone="attention" icon="alert-triangle">
              {`We blocked a sign-in from ${warning.device} ${when(warning.at).startsWith('Today') ? 'today' : `on ${when(warning.at).replace(/,.*/, '')}`} because ${warning.reason === 'locked' ? 'the PIN was locked' : warning.reason === 'wrong_bvn' ? 'the BVN was wrong' : 'the PIN was wrong'}. If that wasn't you trying, change your PIN.`}
            </PtNote>
          ) : null}
        </>
      )}
    </PtPageScreen>
  );
}
