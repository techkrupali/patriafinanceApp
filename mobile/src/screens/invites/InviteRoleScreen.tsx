import React, { useMemo, useState } from 'react';
import { Linking, Share, View } from 'react-native';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtText } from '../../components/pt/PtText';
import { PtPhoneField } from '../../components/pt/PtPhoneField';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtChoiceCard, PtGroupLabel, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { useCreateInvitation, useFamily, useWallets } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { DEFAULT_COUNTRY, isValidE164, toE164 } from '../../lib/phone';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import { pt } from '../../theme';
import type { Wallet } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

export type InviteRoleKey = 'co_owner' | 'contributor' | 'child' | 'keyholder' | 'accountant' | 'vendor';

/** FAM-03 "What will they do?" */
export const INVITE_ROLES: { key: InviteRoleKey; title: string; line: string; icon: 'user-check' | 'users' | 'smile' | 'key' | 'file-text' | 'tool' }[] = [
  { key: 'co_owner', title: 'Co-owner', line: 'Spouse or partner. Sends, approves and sets rules.', icon: 'user-check' },
  { key: 'contributor', title: 'Contributor', line: 'Relatives at home or abroad. Add money and see progress.', icon: 'users' },
  { key: 'child', title: 'Child', line: 'Under 18. Asks for money; you approve.', icon: 'smile' },
  { key: 'keyholder', title: 'Keyholder', line: 'Trusted relative. Agrees when an emergency fund is used.', icon: 'key' },
  { key: 'accountant', title: 'Accountant', line: 'View-only, with statements and exports.', icon: 'file-text' },
  { key: 'vendor', title: 'Vendor', line: 'Builders, schools, suppliers. Paid by milestone.', icon: 'tool' },
];

/** The wallets a role can be invited into (in one circle when one is given; null = your own family). */
export function walletsFor(role: InviteRoleKey, all: Wallet[], circleId?: number | null): Wallet[] {
  const wallets = circleId === undefined ? all : all.filter((w) => (w.circle_id ?? null) === circleId);
  const mine = wallets.filter((w) => w.my_role === 'owner' && w.status === 'active' && !['main', 'ajo', 'child'].includes(w.type));
  switch (role) {
    case 'keyholder':
      return mine.filter((w) => w.type === 'emergency');
    case 'accountant':
      return wallets.filter((w) => w.my_role === 'owner' && w.status === 'active' && !['ajo', 'child'].includes(w.type));
    case 'co_owner':
      return mine.filter((w) => w.type !== 'joint' && w.type !== 'emergency');
    default:
      return mine;
  }
}

/**
 * FAM-03 "Invite to Okafor family": what will they do, their number, and
 * "Send invite on WhatsApp" — or "Other ways: link, QR, contacts" (FAM-04).
 */
export function InviteRoleScreen({ navigation, route }: RootScreenProps<'InviteRole'>) {
  const me = useAuth((s) => s.user);
  const wallets = useWallets();
  const [role, setRole] = useState<InviteRoleKey>('contributor');
  const [walletId, setWalletId] = useState<number | null>(route.params?.walletId ?? null);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const circleId = route.params?.circleId;
  const family = useFamily({ circle: circleId ?? null });
  const options = useMemo(() => walletsFor(role, wallets.data ?? [], circleId), [role, wallets.data, circleId]);
  const wallet = options.find((w) => w.id === walletId) ?? options[0] ?? null;
  const create = useCreateInvitation(wallet?.id ?? 0);
  const surname = (me?.last_name || me?.full_name?.split(' ').slice(-1)[0] || 'your').trim();
  const e164 = toE164(country.dial, phone);
  const needsWallet = role !== 'child' && role !== 'vendor';

  const pick = (key: InviteRoleKey) => {
    setRole(key);
    setError(null);
  };

  const next = () => {
    setError(null);
    if (role === 'child') {
      // CHW-01: a child gets their own wallet, then a code for their phone.
      navigation.navigate('ChildWalletSetup');
      return;
    }
    if (role === 'vendor') {
      navigation.navigate('VendorDirectory');
      return;
    }
    if (!wallet) {
      setError(role === 'keyholder' ? 'Keyholders guard an emergency fund. Make one first.' : circleId ? 'Move a wallet into this circle first, from the Family tab.' : 'Make a wallet to invite them into first.');
      return;
    }
    if (role === 'accountant') {
      navigation.navigate('InviteHow', { role, walletIds: [wallet.id], phone, dial: country.dial });
      return;
    }
    if (!isValidE164(e164)) {
      setError('Enter their phone number. It works with numbers outside Nigeria too.');
      return;
    }
    // "Send invite on WhatsApp": the invite is made, then WhatsApp opens with the message.
    create.mutate(
      { identifier: e164, role: role === 'keyholder' ? 'contributor' : role, can_approve: role === 'co_owner', ...(role === 'keyholder' ? { keyholder: true } : {}) },
      {
        onSuccess: async (res) => {
          notifySuccess();
          const text = res.share_message ?? res.link ?? '';
          const url = `https://wa.me/${e164.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
          const opened = await Linking.openURL(url).then(() => true).catch(() => false);
          if (!opened) await Share.share({ message: text }).catch(() => undefined);
          navigation.replace('Invites');
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <PtPageScreen
      title={`Invite to ${family.data?.circle?.name ?? `${surname} family`}`}
      subtitle="What will they do?"
      onBack={() => navigation.goBack()}
      footer={
        <>
          {error ? <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>{error}</PtText> : null}
          <PtButton
            title={role === 'child' ? 'Set up their wallet' : role === 'vendor' ? 'Find a vendor' : role === 'accountant' ? 'Continue' : 'Send invite on WhatsApp'}
            loading={create.isPending}
            onPress={next}
          />
          {needsWallet && role !== 'accountant' ? (
            <PtButton
              title="Other ways: link, QR, contacts"
              variant="ghost"
              onPress={() => (wallet ? navigation.navigate('InviteHow', { role: role as 'co_owner' | 'contributor' | 'keyholder', walletIds: [wallet.id], phone, dial: country.dial }) : setError('Make a wallet to invite them into first.'))}
            />
          ) : null}
        </>
      }
    >
      <View style={{ gap: 10 }}>
        {INVITE_ROLES.map((r) => (
          <PtChoiceCard key={r.key} title={r.title} subtitle={r.line} icon={r.icon} selected={role === r.key} onPress={() => pick(r.key)} />
        ))}
      </View>
      {needsWallet ? (
        <>
          <PtGroupLabel>Into</PtGroupLabel>
          <PtPanel>
            <PtReviewRow
              label={role === 'keyholder' ? 'Emergency fund' : role === 'accountant' ? 'Statements for' : 'Wallet'}
              value={wallet?.name ?? (role === 'keyholder' ? 'No emergency fund yet' : 'No wallet yet')}
              onEdit={options.length > 1 ? () => setPicking(true) : undefined}
              last
            />
          </PtPanel>
        </>
      ) : null}
      {needsWallet && role !== 'accountant' ? <PtPhoneField label="Their phone number" country={country} onChangeCountry={setCountry} value={phone} onChange={setPhone} layout="inline" /> : null}

      <PtOptionSheet
        visible={picking}
        title="Into which wallet?"
        options={options.map((w) => ({ value: w.id, label: w.name }))}
        value={wallet?.id ?? null}
        onPick={(id) => {
          setWalletId(id);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </PtPageScreen>
  );
}
