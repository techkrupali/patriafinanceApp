import React from 'react';
import { Text } from 'react-native';
import { pt, ptFont } from '../../theme';
import { useVendorDisputes } from '../../api/projectFlow';
import { PtTabScreen } from '../../components/pt/PtTabScreen';
import { PtNote } from '../../components/pt/PtForm';
import { PtSectionTitle } from '../../components/pt/PtList';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { ClosedDisputes, OpenDisputeCard } from '../disputes/DisputesScreen';
import type { VendorTabScreenProps } from '../../navigation/types';

/** VDM-08 disputes about this business: reply within 3 days, and what was closed. */
export function VendorDisputesScreen({ navigation }: VendorTabScreenProps<'VendorDisputes'>) {
  const query = useVendorDisputes();
  const list = query.data ?? [];
  const open = list.filter((d) => d.active);
  const closed = list.filter((d) => !d.active);

  return (
    <PtTabScreen title="Disputes" refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      {query.isLoading || query.error ? (
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {open.length === 0 ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>No open disputes. Keep sending clear photos with every milestone.</Text>
          ) : (
            open.map((d) => (
              <OpenDisputeCard key={d.id} d={d} onPress={() => navigation.navigate(d.status === 'open' ? 'DisputeRespond' : 'DisputeDetail', { disputeId: d.id })} />
            ))
          )}
          {closed.length ? (
            <>
              <PtSectionTitle title="Closed" />
              <ClosedDisputes list={closed} onOpen={(d) => navigation.navigate('DisputeDetail', { disputeId: d.id })} />
            </>
          ) : null}
          <PtNote tone="attention">Answer within 3 days. If you don't, Patriai may decide using the family's evidence.</PtNote>
        </>
      )}
    </PtTabScreen>
  );
}
