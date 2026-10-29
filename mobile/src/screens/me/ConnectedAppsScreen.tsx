import React from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtChip } from '../../components/pt/PtChip';
import { PtNote, PtPanel } from '../../components/pt/PtForm';
import type { RootScreenProps } from '../../navigation/types';

const APPS = [
  { code: 'GD', name: 'Google Drive', sub: 'Project documents, statements' },
  { code: 'GS', name: 'Google Sheets', sub: 'Live sync, a sheet per wallet' },
  { code: 'QB', name: 'QuickBooks', sub: 'Project accounts' },
  { code: 'ZP', name: 'Zapier', sub: 'Connect 5,000+ apps' },
  { code: 'WA', name: 'WhatsApp', sub: 'Approve and get alerts in chat' },
];

/**
 * ME-15 Connected apps. None can be connected yet — each needs its own
 * partner set-up — so each shows "Coming soon" rather than a Connect that
 * does nothing.
 */
export function ConnectedAppsScreen({ navigation }: RootScreenProps<'ConnectedApps'>) {
  return (
    <PtPageScreen title="Connected apps" subtitle="None connected yet" onBack={() => navigation.goBack()}>
      <PtPanel>
        {APPS.map((a, i) => (
          <View key={a.code} style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i === APPS.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: pt.gold100, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 12, color: '#8F5400' }}>{a.code}</Text>
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{a.name}</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{a.sub}</Text>
            </View>
            <PtChip label="Coming soon" tone="neutral" />
          </View>
        ))}
      </PtPanel>
      <PtNote tone="info" icon="lock">Connected apps never get your PIN, and can't move money unless you approve each payment.</PtNote>
    </PtPageScreen>
  );
}
