import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtPanel } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { SettingsRow } from '../../components/wallet/WalletManageUi';
import { useSecurity } from '../../api/account';
import { agoLabel, formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

const MONTH = 30 * 86_400_000;

/** "Changed 3 months ago" / "Changed today". */
function changedLabel(iso: string | null): string {
  if (!iso) return 'Not changed yet';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 86_400_000) return 'Changed today';
  if (ms < MONTH) return `Changed ${agoLabel(iso)}`;
  const months = Math.round(ms / MONTH);
  return `Changed ${months} month${months === 1 ? '' : 's'} ago`;
}

/** "today, 7:02 pm". */
function lastLabel(iso: string | null): string {
  if (!iso) return 'No sign-ins yet';
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  const time = `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'am' : 'pm'}`;
  return d.toDateString() === new Date().toDateString() ? `Last: today, ${time}` : `Last: ${d.getDate()}/${d.getMonth() + 1}, ${time}`;
}

/**
 * ME-05 Security centre: how protected the account is ("Strong · 4 of 5
 * done") and the one thing left, then PIN, Face ID and app lock, two-step,
 * devices, login history, account level, limits — and report fraud or freeze.
 */
export function SecurityCenterScreen({ navigation }: RootScreenProps<'SecurityCenter'>) {
  const q = useSecurity();
  const s = q.data;

  return (
    <PtPageScreen title="Security" subtitle={s ? `${s.score.label} · ${s.score.done} of ${s.score.total} done` : null} onBack={() => navigation.goBack()}>
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !s ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: s.frozen_at ? pt.dangerSoft : pt.brandSoft, borderRadius: ptRadius.md, padding: 16 }}>
            <Feather name={s.frozen_at ? 'alert-triangle' : 'shield'} size={20} color={s.frozen_at ? pt.danger : pt.brand} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>
                {s.frozen_at ? 'Your account is frozen' : s.score.done >= 4 ? 'Your account is well protected' : 'Your account needs a little more'}
              </Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>
                {s.frozen_at ? 'Nothing can leave your wallets. Unfreeze it with your PIN and a selfie.' : s.score.next ?? 'Everything is on.'}
              </Text>
            </View>
          </View>

          <PtPanel>
            <SettingsRow icon="key" title="Change PIN" sub={changedLabel(s.pin_changed_at)} onPress={() => navigation.navigate('ChangePin')} />
            <SettingsRow
              icon="smile"
              title="Face ID and app lock"
              sub={s.settings.app_lock ? `On · locks after ${s.settings.lock_after === 0 ? 'right away' : `${s.settings.lock_after} minute${s.settings.lock_after === 1 ? '' : 's'}`}` : 'Off'}
              onPress={() => navigation.navigate('AppLockSettings')}
            />
            <SettingsRow icon="shield" title="Two-step verification" sub={s.two_factor.on ? `On · ${s.two_factor.method === 'authenticator' ? 'authenticator app' : s.two_factor.method === 'sms' ? 'SMS code' : 'email code'}` : 'Off'} onPress={() => navigation.navigate('TwoStep')} />
            <SettingsRow icon="smartphone" title="Devices you're logged in on" sub={`${s.devices} device${s.devices === 1 ? '' : 's'} · log out any of them`} onPress={() => navigation.navigate('Devices')} />
            <SettingsRow icon="clock" title="Login history" sub={lastLabel(s.last_login_at)} onPress={() => navigation.navigate('LoginHistory')} />
            <SettingsRow icon="award" title="Account level" sub={`Tier ${s.tier} · Free plan`} onPress={() => navigation.navigate('Kyc')} />
            <SettingsRow icon="bar-chart-2" title="My limits" sub={`Tier ${s.tier} · ${formatNaira(s.daily_limit)} a day`} onPress={() => navigation.navigate('MyLimits')} last />
          </PtPanel>

          <PtPanel>
            <SettingsRow
              icon="alert-triangle"
              title={s.frozen_at ? 'Unfreeze my account' : 'Report fraud or freeze my account'}
              danger={!s.frozen_at}
              onPress={() => navigation.navigate('FreezeAccount')}
              last
            />
          </PtPanel>
        </>
      )}
    </PtPageScreen>
  );
}
