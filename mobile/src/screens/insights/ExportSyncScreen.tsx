import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtCard, PtIconTile, PtRow, PtSectionTitle } from '../../components/pt/PtList';
import { PtChip } from '../../components/pt/PtChip';
import { PtNote } from '../../components/pt/PtForm';
import { useStatementBatchLink, useStatementWallets } from '../../api/insights';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';
import { openDownload } from './parts';

/** Two letters in a coloured circle: GS, QB, GD. */
function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: fg }}>{text}</Text>
    </View>
  );
}

/**
 * INS-08 Export and sync: a spreadsheet of every transaction this year, free,
 * now; live sync to Google Sheets, QuickBooks and Drive comes with Pro.
 */
export function ExportSyncScreen({ navigation }: RootScreenProps<'ExportSync'>) {
  const wallets = useStatementWallets();
  const link = useStatementBatchLink();
  const ids = (wallets.data?.wallets ?? []).map((w) => w.id);

  const everything = () =>
    link.mutate(
      { wallet_ids: ids, period: 'this_year', combined: true, format: 'csv' },
      {
        onSuccess: ({ url }) => {
          notifySuccess();
          openDownload(url);
        },
        onError: (e) => showAlert('Could not download', e.message),
      },
    );

  return (
    <PtPageScreen title="Export and sync" subtitle="Send your records elsewhere" onBack={() => navigation.goBack()}>
      <View style={{ gap: 8 }}>
        <PtSectionTitle title="Download a copy" />
        <PtCard>
          <PtRow
            title="Every transaction this year"
            subtitle="One spreadsheet (CSV), all your wallets"
            left={<PtIconTile><Feather name="download" size={18} color={pt.brand} /></PtIconTile>}
            right={link.isPending ? <ActivityIndicator color={pt.brand} /> : undefined}
            chevron={!link.isPending}
            disabled={ids.length === 0 || link.isPending}
            onPress={everything}
          />
          <PtRow
            title="Statements"
            subtitle="By month, PDF, Excel or CSV"
            left={<PtIconTile><Feather name="file-text" size={18} color={pt.brand} /></PtIconTile>}
            chevron
            last
            onPress={() => navigation.navigate('StatementsPick')}
          />
        </PtCard>
      </View>

      <View style={{ gap: 8 }}>
        <PtSectionTitle title="Live sync" />
        <PtCard>
          <PtRow title="Google Sheets" subtitle="Every transaction, updated daily" left={<Badge text="GS" bg={pt.brandSoft} fg={pt.brand} />} right={<PtChip label="Soon" />} />
          <PtRow title="QuickBooks" subtitle="For a project's accounts" left={<Badge text="QB" bg={pt.infoSoft} fg={pt.info} />} right={<PtChip label="Soon" />} />
          <PtRow title="Google Drive" subtitle="Monthly PDF statements" left={<Badge text="GD" bg={pt.gold100} fg="#8F5400" />} right={<PtChip label="Soon" />} last />
        </PtCard>
      </View>

      <PtNote tone="info">Live sync is coming with Patriai Pro. One-off downloads are free.</PtNote>
    </PtPageScreen>
  );
}
