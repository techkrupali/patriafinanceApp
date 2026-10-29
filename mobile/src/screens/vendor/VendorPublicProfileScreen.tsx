import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont, ptRadius } from '../../theme';
import { useLogoutApi, useMyVendorProfile } from '../../api/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useAddPastWork, useRemovePastWork, useSaveBusiness, useUploadLogo, useVendorHome } from '../../api/projectFlow';
import { useAuth } from '../../store/auth';
import { PtTabScreen } from '../../components/pt/PtTabScreen';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtPills } from '../../components/pt/PtForm';
import { PtRow, PtSectionTitle } from '../../components/pt/PtList';
import { LoadingBlock, PhotoGrid, TextArea } from '../../components/project/ProjectUi';
import { pickFile } from '../../lib/upload';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { VendorTabScreenProps } from '../../navigation/types';

/** VDM-07 "Public profile · What families see": logo, name, about, services, past work, and the team. */
export function VendorPublicProfileScreen({ navigation }: VendorTabScreenProps<'VendorProfileTab'>) {
  const query = useMyVendorProfile();
  const home = useVendorHome();
  const save = useSaveBusiness();
  const logo = useUploadLogo();
  const addWork = useAddPastWork();
  const removeWork = useRemovePastWork();
  const setMode = useAuth((s) => s.setMode);
  const logoutLocal = useAuth((s) => s.logout);
  const logoutApi = useLogoutApi();
  const qc = useQueryClient();
  const p = query.data?.profile;
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [custom, setCustom] = useState('');

  useEffect(() => {
    if (!p) return;
    setName(p.business_name);
    setBio(p.bio ?? '');
    setServices(p.services);
  }, [p]);

  const toFamily = () => {
    void setMode('family');
    navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };

  // A team member sees the business they work for, not its settings.
  if (!p) {
    return (
      <PtTabScreen title="Profile">
        {query.isLoading ? (
          <LoadingBlock />
        ) : (
          <>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted }}>
              {home.data?.business ? `You're on the ${home.data.business.name} team.` : "You haven't set up a business account."}
            </Text>
            {!home.data?.business ? <PtButton title="Set up a business account" onPress={() => navigation.navigate('BusinessSetup', {})} /> : null}
            <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
              <PtRow title="Switch to family" subtitle="Your wallets, goals and family" chevron onPress={toFamily} last />
            </View>
          </>
        )}
      </PtTabScreen>
    );
  }

  const dirty = name.trim() !== p.business_name || bio.trim() !== (p.bio ?? '') || services.join('|') !== p.services.join('|');
  const options = Array.from(new Set([...p.services, ...services])).map((s) => ({ value: s, label: s }));
  const toggle = (s: string) => setServices((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const changeLogo = async () => {
    const asset = await pickFile('library');
    if (asset) logo.mutate(asset, { onError: (e) => showAlert('Could not upload', (e as Error).message) });
  };
  const addPhoto = async () => {
    const asset = await pickFile('library');
    if (asset) addWork.mutate({ asset }, { onError: (e) => showAlert('Could not upload', (e as Error).message) });
  };

  return (
    <PtTabScreen title="Public profile" refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted, marginTop: -10 }}>What families see</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <PtAvatar initials={p.initials} uri={p.logo_url} tone="gold" size={64} />
        <Pressable onPress={() => { selection(); void changeLogo(); }} accessibilityRole="button" disabled={logo.isPending}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>{logo.isPending ? 'Uploading…' : 'Change logo'}</Text>
        </Pressable>
      </View>
      <PtField label="Business name" value={name} onChangeText={setName} maxLength={100} />
      <TextArea label="About" value={bio} onChange={setBio} placeholder="Family builders since 2014. New homes, renovation and roofing across Enugu and Lagos." maxLength={1000} />
      <PtSectionTitle title="Services" />
      <PtPills options={options} value={services} onChange={toggle} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <PtField label="Add a service" value={custom} onChangeText={setCustom} placeholder="Tiling" maxLength={40} />
        </View>
        <PtButton title="Add" variant="secondary" size="sm" style={{ alignSelf: 'flex-end', marginBottom: 6 }} disabled={!custom.trim()} onPress={() => { toggle(custom.trim()); setCustom(''); }} />
      </View>
      {dirty ? (
        <PtButton
          title="Save changes"
          loading={save.isPending}
          onPress={() => save.mutate({ business_name: name.trim(), bio: bio.trim() || null, services }, { onError: (e) => showAlert('Could not save', (e as Error).message) })}
        />
      ) : null}
      <PtSectionTitle title="Past work" />
      <PhotoGrid
        photos={p.past_work.map((w, i) => ({ key: i, url: w.url, caption: w.caption }))}
        onAdd={p.past_work.length < 20 ? () => void addPhoto() : undefined}
        onRemove={(k) => removeWork.mutate(Number(k))}
        adding={addWork.isPending}
      />
      <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
        <PtRow title="Manage my team" subtitle="Site managers, foremen and accounts" chevron onPress={() => navigation.navigate('VendorTeam')} />
        <PtRow title="Verification" subtitle={p.verified ? 'Verified business' : 'Not verified yet'} chevron onPress={() => navigation.navigate('BusinessVerification')} />
        <PtRow title="See my public profile" subtitle="As families see it in the directory" chevron onPress={() => navigation.navigate('VendorProfile', { profileId: p.id })} />
        <PtRow title="Switch to family" subtitle="Your wallets, goals and family" chevron onPress={toFamily} />
        <PtRow
          title="Log out"
          chevron
          last
          onPress={() =>
            showAlert('Log out', 'You will need your phone number and PIN to log back in.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log out', style: 'destructive', onPress: () => logoutApi.mutate(undefined, { onSettled: async () => { await logoutLocal(); qc.clear(); } }) },
            ])
          }
        />
      </View>
    </PtTabScreen>
  );
}
