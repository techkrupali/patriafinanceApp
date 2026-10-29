import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtAvatar } from '../../components/pt/PtAvatar';
import { PtField } from '../../components/pt/PtField';
import { PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { PtSheet } from '../../components/pt/PtSheet';
import { SettingsRow } from '../../components/wallet/WalletManageUi';
import { useUpdateAvatar, useUpdateProfile } from '../../api/hooks';
import { useConfirmEmailChange, useConfirmPhoneChange, useStartEmailChange, useStartPhoneChange } from '../../api/account';
import { useAuth } from '../../store/auth';
import { initials } from '../../lib/format';
import { formatE164 } from '../../lib/phone';
import { pickFile } from '../../lib/upload';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** Change the email (a code to the new address) or the phone (a code and a selfie). */
function ChangeContactSheet({ kind, onClose }: { kind: 'email' | 'phone' | null; onClose: () => void }) {
  const startEmail = useStartEmailChange();
  const confirmEmail = useConfirmEmailChange();
  const startPhone = useStartPhoneChange();
  const confirmPhone = useConfirmPhoneChange();
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<{ to: string; debug?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = startEmail.isPending || confirmEmail.isPending || startPhone.isPending || confirmPhone.isPending;

  const close = () => {
    setValue('');
    setCode('');
    setSent(null);
    setError(null);
    onClose();
  };

  const send = () => {
    setError(null);
    const start = kind === 'email' ? startEmail : startPhone;
    start.mutate(value.trim(), { onSuccess: (d) => setSent({ to: d.sent_to, debug: d.debug_otp }), onError: (e) => setError(e.message) });
  };

  const confirm = async () => {
    setError(null);
    if (kind === 'email') {
      confirmEmail.mutate({ email: value.trim(), code }, { onSuccess: () => { notifySuccess(); close(); }, onError: (e) => setError(e.message) });
      return;
    }
    // ME-02 "Changing it needs a selfie check".
    const selfie = await pickFile('camera');
    if (!selfie) return setError('Take a selfie to change your number.');
    confirmPhone.mutate({ phone: value.trim(), code, selfie }, { onSuccess: () => { notifySuccess(); close(); }, onError: (e) => setError(e.message) });
  };

  return (
    <PtSheet
      visible={kind !== null}
      title={kind === 'email' ? 'Change your email' : 'Change your phone number'}
      subtitle={sent ? `We sent a code to ${sent.to}.` : kind === 'phone' ? 'A code to the new number, then a selfie.' : 'We send a code to the new address.'}
      onClose={close}
      footer={<PtButton title={sent ? (kind === 'phone' ? 'Take selfie and save' : 'Save') : 'Send code'} onPress={sent ? () => void confirm() : send} loading={busy} />}
    >
      <View style={{ gap: 10 }}>
        <PtField
          label={kind === 'email' ? 'New email' : 'New phone number'}
          value={value}
          onChangeText={setValue}
          keyboardType={kind === 'email' ? 'email-address' : 'phone-pad'}
          autoCapitalize="none"
          placeholder={kind === 'email' ? 'name@email.com' : '+234 803 000 0000'}
          editable={!sent}
        />
        {sent ? <PtField label="Code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} placeholder="6 digits" hint={sent.debug ? `Test code: ${sent.debug}` : undefined} /> : null}
        {error ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.danger }}>{error}</Text> : null}
      </View>
    </PtSheet>
  );
}

/**
 * ME-02 Profile, how family sees you: photo, name (matches your BVN), @tag
 * people pay you with, phone (changing it needs a selfie check) and email;
 * then personal details and linked bank accounts.
 */
export function EditProfileScreen({ navigation }: RootScreenProps<'EditProfile'>) {
  const user = useAuth((s) => s.user);
  const update = useUpdateProfile();
  const avatar = useUpdateAvatar();
  const locked = (user?.kyc_tier ?? 0) >= 1;
  const [first, setFirst] = useState(user?.first_name ?? '');
  const [last, setLast] = useState(user?.last_name ?? '');
  const [tag, setTag] = useState(user?.username ?? '');
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState<'email' | 'phone' | null>(null);

  const changePhoto = async () => {
    selection();
    const photo = await pickFile('library');
    if (photo) avatar.mutate(photo, { onError: (e) => showAlert('Could not change photo', e.message) });
  };

  const save = () => {
    setError(null);
    const body: { first_name?: string; last_name?: string; username?: string } = {};
    if (tag.trim() && tag.trim() !== user?.username) body.username = tag.trim().replace(/^@/, '');
    if (!locked) {
      if (first.trim() !== user?.first_name) body.first_name = first.trim();
      if (last.trim() !== user?.last_name) body.last_name = last.trim();
    }
    if (!Object.keys(body).length) return navigation.goBack();
    update.mutate(body, {
      onSuccess: () => {
        notifySuccess();
        navigation.goBack();
      },
      onError: (e) => setError(e.message),
    });
  };

  return (
    <PtPageScreen title="Profile" subtitle="How family sees you" onBack={() => navigation.goBack()} footer={<PtButton title="Save" onPress={save} loading={update.isPending} />}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <PtAvatar initials={initials(user?.full_name)} uri={user?.avatar_url} size={80} />
        <Pressable onPress={() => void changePhoto()} accessibilityRole="button" hitSlop={8}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>{avatar.isPending ? 'Uploading…' : 'Change photo'}</Text>
        </Pressable>
      </View>

      {locked ? (
        <PtField label="Name" value={user?.full_name ?? ''} editable={false} hint="Matches your BVN. Contact support to change it." />
      ) : (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <PtField label="First name" value={first} onChangeText={setFirst} maxLength={100} />
          </View>
          <View style={{ flex: 1 }}>
            <PtField label="Last name" value={last} onChangeText={setLast} maxLength={100} />
          </View>
        </View>
      )}
      <PtField label="@tag" prefix="@" value={tag} onChangeText={(t) => setTag(t.replace(/[^a-zA-Z0-9_]/g, ''))} autoCapitalize="none" maxLength={30} hint="People can pay you with this" />

      <PtPanel>
        <PtReviewRow label="Phone" value={user?.phone ? formatE164(user.phone) : '—'} sub="Changing it needs a selfie check" onEdit={() => setContact('phone')} />
        <PtReviewRow label="Email" value={user?.email ?? 'Add an email'} sub={user?.email_verified ? 'Verified' : 'Not verified yet'} onEdit={() => setContact('email')} last />
      </PtPanel>

      <PtPanel>
        <SettingsRow icon="user" title="Personal details" sub="Date of birth, BVN, NIN, home address" onPress={() => navigation.navigate('PersonalDetails')} />
        <SettingsRow icon="credit-card" title="Linked bank accounts" sub="For withdrawals and top-ups" onPress={() => navigation.navigate('LinkedBanks')} last />
      </PtPanel>
      {error ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.danger }}>{error}</Text> : null}

      <ChangeContactSheet kind={contact} onClose={() => setContact(null)} />
    </PtPageScreen>
  );
}
