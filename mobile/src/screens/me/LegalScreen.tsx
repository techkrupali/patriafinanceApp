import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtPanel } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { SettingsRow } from '../../components/wallet/WalletManageUi';
import { useLegal, useLegalDocument } from '../../api/account';
import type { RootScreenProps } from '../../navigation/types';

const ICONS: Record<string, React.ComponentProps<typeof SettingsRow>['icon']> = {
  terms: 'file-text',
  privacy: 'file-text',
  deposit_protection: 'shield',
  complaints: 'message-square',
  licences: 'file',
};

/** ME-19 Legal: terms, privacy, deposit protection, complaints, licences; who holds your money. */
export function LegalScreen({ navigation }: RootScreenProps<'Legal'>) {
  const q = useLegal();
  return (
    <PtPageScreen title="Legal" onBack={() => navigation.goBack()}>
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !q.data ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <PtPanel>
            {q.data.documents.map((d, i) => (
              <SettingsRow key={d.key} icon={ICONS[d.key] ?? 'file-text'} title={d.title} sub={d.sub} onPress={() => navigation.navigate('LegalDoc', { key: d.key })} last={i === q.data.documents.length - 1} />
            ))}
          </PtPanel>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 18, color: pt.inkMuted }}>{q.data.company}</Text>
        </>
      )}
    </PtPageScreen>
  );
}

/** One legal document. */
export function LegalDocScreen({ navigation, route }: RootScreenProps<'LegalDoc'>) {
  const q = useLegalDocument(route.params.key);
  return (
    <PtPageScreen title={q.data?.title ?? 'Legal'} subtitle={q.data?.sub} onBack={() => navigation.goBack()}>
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !q.data ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 23, color: pt.ink }}>{q.data.body}</Text>
      )}
    </PtPageScreen>
  );
}
