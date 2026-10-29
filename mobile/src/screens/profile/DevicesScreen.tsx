import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtNote, PtPanel, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { PtSheet } from '../../components/pt/PtSheet';
import { LoadError } from '../../components/LoadError';
import { useLogoutDevice, useLogoutOthers, useSecurityDevices, type DeviceRow } from '../../api/account';
import { agoLabel } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const icon = (d: DeviceRow): React.ComponentProps<typeof Feather>['name'] => (d.platform === 'web' ? 'monitor' : d.platform === 'ios' && /ipad/i.test(d.name) ? 'tablet' : 'smartphone');

function activeLabel(d: DeviceRow): string {
  if (d.this_device) return 'This phone · active now';
  if (!d.last_active_at) return 'Not used yet';
  const days = Math.round((Date.now() - new Date(d.last_active_at).getTime()) / 86_400_000);
  return days === 1 ? 'Last active yesterday' : `Last active ${agoLabel(d.last_active_at)}`;
}

/**
 * ME-09 Devices you're logged in on: this phone, the others with Log out, and
 * Log out of all other devices. ME-24 asks before logging one out, and can
 * stop trusting it so its next sign-in counts as a new device.
 */
export function DevicesScreen({ navigation }: RootScreenProps<'Devices'>) {
  const q = useSecurityDevices();
  const logout = useLogoutDevice();
  const others = useLogoutOthers();
  const [target, setTarget] = useState<DeviceRow | null>(null);
  const [forget, setForget] = useState(true);
  const devices = q.data ?? [];

  const confirmOthers = () =>
    showAlert('Log out of all other devices?', 'They will need your phone number, PIN and a selfie to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out others',
        style: 'destructive',
        onPress: () => others.mutate(undefined, { onSuccess: () => notifySuccess(), onError: (e) => showAlert('Could not log out', e.message) }),
      },
    ]);

  return (
    <PtPageScreen title="Devices" subtitle={q.data ? `${devices.length} signed in` : null} onBack={() => navigation.goBack()}>
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : q.error ? (
        <LoadError message={(q.error as Error).message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <PtPanel>
            {devices.map((d, i) => (
              <View key={d.id} style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === devices.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={icon(d)} size={17} color={pt.brand} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>{d.name}</Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>
                    {activeLabel(d)}
                    {d.send_after ? ' · sends after 24 hours' : ''}
                  </Text>
                </View>
                {d.this_device ? (
                  <PtChip label="This device" tone="brand" icon="check" />
                ) : (
                  <Pressable
                    onPress={() => {
                      selection();
                      setForget(true);
                      setTarget(d);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Log out ${d.name}`}
                    style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: pt.brandSoft, justifyContent: 'center' }}
                  >
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: pt.brand }}>Log out</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </PtPanel>
          {devices.length > 1 ? <PtButton title="Log out of all other devices" variant="secondary" onPress={confirmOthers} loading={others.isPending} style={{ backgroundColor: pt.danger }} /> : null}
          <PtNote tone="info" icon="lock">
            New devices need your PIN and a selfie. For 24 hours after, they can receive money but not send it.
          </PtNote>
        </>
      )}

      <PtSheet
        visible={target !== null}
        title={target ? `Log out of ${target.name}?` : ''}
        subtitle="It will need your phone number, PIN and a selfie to sign in again."
        onClose={() => setTarget(null)}
        footer={
          <View style={{ gap: 6 }}>
            <PtButton
              title={target ? `Log out ${target.name}` : 'Log out'}
              style={{ backgroundColor: pt.danger }}
              loading={logout.isPending}
              onPress={() =>
                target &&
                logout.mutate(
                  { id: target.id, forget },
                  {
                    onSuccess: () => {
                      notifySuccess();
                      setTarget(null);
                    },
                    onError: (e) => showAlert('Could not log out', e.message),
                  },
                )
              }
            />
            <PtButton
              title="I don't recognise this device"
              variant="ghost"
              onPress={() => {
                setTarget(null);
                navigation.navigate('FreezeAccount');
              }}
            />
          </View>
        }
      >
        {target ? (
          <PtPanel>
            <PtReviewRow label="Device" value={target.name} />
            <PtReviewRow label="Last active" value={target.last_active_at ? agoLabel(target.last_active_at) : 'Not used yet'} last />
          </PtPanel>
        ) : null}
        <PtSwitchRow title="Also stop trusting this device" subtitle="Next sign-in counts as a new device" value={forget} onChange={setForget} />
      </PtSheet>
    </PtPageScreen>
  );
}
