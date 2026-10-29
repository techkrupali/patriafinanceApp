import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { pt } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { usePersonalDetails, useUpdateDetails } from '../../api/account';
import { formatYmd } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

/**
 * ME-03 Personal details, from your verification: date of birth, BVN and NIN
 * (masked, verified), and your home address — changing it may ask for a new
 * utility bill for Tier 3.
 */
export function PersonalDetailsScreen({ navigation }: RootScreenProps<'PersonalDetails'>) {
  const q = usePersonalDetails();
  const save = useUpdateDetails();
  const d = q.data;
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!d) return;
    setStreet(d.address ?? '');
    setCity(d.city ?? '');
    setState(d.state ?? '');
  }, [d]);

  return (
    <PtPageScreen
      title="Personal details"
      subtitle="From your verification"
      onBack={() => navigation.goBack()}
      footer={
        <PtButton
          title="Save"
          loading={save.isPending}
          onPress={() =>
            save.mutate(
              { address: street.trim() || null, city: city.trim() || null, state: state.trim() || null },
              { onSuccess: () => { notifySuccess(); navigation.goBack(); }, onError: (e) => setError(e.message) },
            )
          }
        />
      }
    >
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !d ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <PtPanel>
            <PtReviewRow label="Date of birth" value={d.date_of_birth ? formatYmd(d.date_of_birth) : '—'} />
            <PtReviewRow label="BVN" value={d.bvn ?? (d.bvn_pending ? 'Being checked' : 'Not added yet')} sub={d.bvn ? 'Verified' : d.bvn_pending ? 'Usually within a day' : 'Add it on Account level'} />
            <PtReviewRow label="NIN" value={d.nin ?? (d.nin_pending ? 'Being checked' : 'Not added yet')} sub={d.nin ? 'Verified' : d.nin_pending ? 'Usually within a day' : 'Add it on Account level'} last />
          </PtPanel>
          <View style={{ gap: 10 }}>
            <PtGroupLabel>Home address</PtGroupLabel>
            <PtField label="Street" value={street} onChangeText={setStreet} placeholder="14 Admiralty Way" maxLength={200} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <PtField label="City" value={city} onChangeText={setCity} placeholder="Lekki" maxLength={100} />
              </View>
              <View style={{ flex: 1 }}>
                <PtField label="State" value={state} onChangeText={setState} placeholder="Lagos" maxLength={100} />
              </View>
            </View>
          </View>
          <PtNote tone="info">Changing your address may ask for a new utility bill for Tier 3.</PtNote>
          {error ? <PtNote tone="attention">{error}</PtNote> : null}
        </>
      )}
    </PtPageScreen>
  );
}
