import React from 'react';
import { ActivityIndicator } from 'react-native';
import { pt } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtPanel, PtSwitchRow } from '../../components/pt/PtForm';
import { SettingsRow } from '../../components/wallet/WalletManageUi';
import { useExportData, useSecurity, useUpdateSettings } from '../../api/account';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/**
 * ME-12 Privacy and data, under the NDPA: what Steward may read, anonymous
 * product research, partner offers; download everything we hold; the privacy
 * policy; and closing the account.
 */
export function PrivacyScreen({ navigation }: RootScreenProps<'Privacy'>) {
  const q = useSecurity();
  const update = useUpdateSettings();
  const exportData = useExportData();
  const s = q.data?.settings;

  return (
    <PtPageScreen title="Privacy and data" subtitle="Under the NDPA" onBack={() => navigation.goBack()}>
      {!s ? (
        <ActivityIndicator color={pt.brand} />
      ) : (
        <>
          <PtPanel>
            <PtSwitchRow title="Steward can read my transactions" subtitle="To give suggestions. Never shared." value={s.steward_reads_transactions} onChange={(v) => update.mutate({ steward_reads_transactions: v })} />
            <PtSwitchRow title="Product research" subtitle="Anonymous usage to improve Patriai" value={s.product_research} onChange={(v) => update.mutate({ product_research: v })} />
            <PtSwitchRow title="Partner offers" subtitle="From [Partner bank] and others" value={s.partner_offers} onChange={(v) => update.mutate({ partner_offers: v })} />
          </PtPanel>
          <PtPanel>
            <SettingsRow
              icon="download"
              title="Download my data"
              sub="A file with everything we hold, within 72 hours"
              onPress={
                exportData.isPending
                  ? undefined
                  : () =>
                      exportData.mutate(undefined, {
                        onSuccess: (d) => {
                          notifySuccess();
                          showAlert('On its way', `We emailed your data to ${d.sent_to}.`);
                        },
                        onError: (e) => showAlert('Could not send', e.message),
                      })
              }
            />
            <SettingsRow icon="file-text" title="Privacy policy" sub="Updated 1 Oct 2026" onPress={() => navigation.navigate('LegalDoc', { key: 'privacy' })} last />
          </PtPanel>
          <PtPanel>
            <SettingsRow icon="trash-2" title="Close my account" sub="This can't be undone" danger onPress={() => navigation.navigate('CloseAccount')} last />
          </PtPanel>
        </>
      )}
    </PtPageScreen>
  );
}
