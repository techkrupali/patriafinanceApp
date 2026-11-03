import React, { useMemo, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtQrCode } from '../../components/pt/PtQrCode';
import { PtCard, PtRow } from '../../components/pt/PtList';
import { PtPhoneField } from '../../components/pt/PtPhoneField';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtChoiceCard, PtGroupLabel, PtNote, PtPanel, PtReviewRow } from '../../components/pt/PtForm';
import { useCreateInvitation, useWallets } from '../../api/hooks';
import { useAccountantInvite } from '../../api/invites';
import { COUNTRIES, DEFAULT_COUNTRY, formatE164, isValidE164, toE164 } from '../../lib/phone';
import { formatYmd, toYmd } from '../../lib/format';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import { INVITE_ROLES, walletsFor } from './InviteRoleScreen';
import type { RootScreenProps } from '../../navigation/types';

const EXPIRY = [1, 3, 7, 14, 30];

/**
 * FAM-04 "Invite by phone, link or QR": their number, then send it, share the
 * link (WhatsApp, SMS, email) or show a QR for someone standing next to you.
 * "Invite links only work for the person they were sent to", so the number
 * comes first. An accountant gets several wallets and an end date (INV-A1).
 */
export function InviteHowScreen({ navigation, route }: RootScreenProps<'InviteHow'>) {
  const { role } = route.params;
  const wallets = useWallets();
  const [country, setCountry] = useState(COUNTRIES.find((c) => c.dial === route.params.dial) ?? DEFAULT_COUNTRY);
  const [phone, setPhone] = useState(route.params.phone ?? '');
  const [days, setDays] = useState(7);
  const [note, setNote] = useState('');
  const [chosen, setChosen] = useState<number[]>(route.params.walletIds);
  const [until, setUntil] = useState(route.params.accessUntil ?? toYmd(new Date(new Date().getFullYear() + 1, 2, 31)));
  const [sheet, setSheet] = useState<null | 'expiry' | 'until' | 'qr'>(null);
  const [made, setMade] = useState<{ link: string | null; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = useMemo(() => walletsFor(role, wallets.data ?? []), [role, wallets.data]);
  const single = options.find((w) => w.id === chosen[0]);
  const create = useCreateInvitation(chosen[0] ?? 0);
  const accountant = useAccountantInvite();
  const e164 = toE164(country.dial, phone);
  const info = INVITE_ROLES.find((r) => r.key === role);
  const names = options.filter((w) => chosen.includes(w.id)).map((w) => w.name);

  /** Make the invite once; every way of sending uses the same one. */
  const make = (then: (m: { link: string | null; text: string }) => void) => {
    setError(null);
    if (made) return then(made);
    if (!isValidE164(e164)) {
      setError('Enter their phone number first. The link only opens for that number.');
      return;
    }
    if (role === 'accountant') {
      if (!chosen.length) return setError('Choose at least one wallet.');
      accountant.mutate(
        { wallet_ids: chosen, identifier: e164, access_until: until, message: note.trim() || undefined },
        {
          onSuccess: (res) => {
            const m = { link: res.link, text: res.share_message };
            setMade(m);
            then(m);
          },
          onError: (e) => setError(e.message),
        },
      );
      return;
    }
    create.mutate(
      { identifier: e164, role: role === 'keyholder' ? 'contributor' : role, can_approve: role === 'co_owner', message: note.trim() || undefined, expires_in_days: days, ...(role === 'keyholder' ? { keyholder: true } : {}) },
      {
        onSuccess: (res) => {
          const m = { link: res.link ?? null, text: res.share_message ?? res.link ?? '' };
          setMade(m);
          then(m);
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  const done = () => {
    notifySuccess();
    navigation.navigate('Invites');
  };

  return (
    <PtPageScreen
      title={phone ? `Invite ${formatE164(toE164(country.dial, phone))}` : 'Invite someone'}
      subtitle={`${info?.title ?? ''}${names.length ? ` · ${names.join(', ')}` : ''}`}
      onBack={() => navigation.goBack()}
      footer={
        <>
          {error ? <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>{error}</PtText> : null}
          <PtButton
            title={made ? 'Done' : 'Send invite'}
            loading={create.isPending || accountant.isPending}
            onPress={() => (made ? done() : make(() => { showAlert('Invite sent', 'They get it by SMS, or in the app if they have Patriai.'); done(); }))}
          />
        </>
      }
    >
      <PtPhoneField label="Phone number" country={country} onChangeCountry={setCountry} value={phone} onChange={(v) => { setPhone(v); setMade(null); }} layout="inline" />
      <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted, marginTop: -6 }}>Works with numbers outside Nigeria too</Text>

      {role === 'accountant' ? (
        <>
          <PtGroupLabel>Statements for</PtGroupLabel>
          <View style={{ gap: 8 }}>
            {options.map((w) => (
              <PtChoiceCard
                key={w.id}
                kind="check"
                title={w.name}
                selected={chosen.includes(w.id)}
                onPress={() => { setMade(null); setChosen((c) => (c.includes(w.id) ? c.filter((x) => x !== w.id) : [...c, w.id])); }}
              />
            ))}
          </View>
          <PtNote>Children's wallets stay hidden.</PtNote>
        </>
      ) : null}

      <PtGroupLabel>Or</PtGroupLabel>
      <PtCard>
        <PtRow
          title="Share an invite link"
          subtitle="WhatsApp, SMS, email"
          chevron
          onPress={() => make((m) => void Share.share({ message: m.text }).then(done).catch(() => undefined))}
        />
        <PtRow title="Show a QR code" subtitle="For someone standing next to you" chevron last onPress={() => make(() => setSheet('qr'))} />
      </PtCard>

      <PtPanel>
        <PtReviewRow label="They can" value={role === 'accountant' ? 'See and download statements' : role === 'keyholder' ? 'Agree when the fund is used' : role === 'co_owner' ? 'Send, approve and set rules' : 'Add money, see progress'} onEdit={() => navigation.goBack()} />
        {role === 'accountant' ? (
          <PtReviewRow label="Access ends" value={formatYmd(until)} sub="You can end it any time" onEdit={() => setSheet('until')} last />
        ) : (
          <PtReviewRow label="Invite expires" value={`In ${days} day${days === 1 ? '' : 's'}`} onEdit={() => setSheet('expiry')} last />
        )}
      </PtPanel>
      <PtField label="A note (optional)" value={note} onChangeText={(t) => { setNote(t); setMade(null); }} maxLength={300} placeholder="I've added you so you can chip in. No pressure!" />

      <PtOptionSheet
        visible={sheet === 'expiry'}
        title="Invite expires"
        options={EXPIRY.map((d) => ({ value: d, label: `In ${d} day${d === 1 ? '' : 's'}` }))}
        value={days}
        onPick={(d) => { setDays(d); setMade(null); setSheet(null); }}
        onClose={() => setSheet(null)}
      />
      <PtDateSheet
        visible={sheet === 'until'}
        title="Access ends"
        value={until}
        minYear={new Date().getFullYear()}
        maxYear={new Date().getFullYear() + 3}
        doneLabel="Done"
        onDone={(v) => { setUntil(v); setMade(null); setSheet(null); }}
        onClose={() => setSheet(null)}
      />
      <PtSheet visible={sheet === 'qr'} title="Scan to join" subtitle={single?.name ?? names.join(', ')} onClose={() => setSheet(null)} footer={<PtButton title="Done" onPress={() => { setSheet(null); done(); }} />}>
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
          {made?.link ? <PtQrCode value={made.link} size={220} /> : null}
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 14, color: pt.inkMuted }} selectable>{made?.link?.replace(/^https?:\/\//, '')}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted, textAlign: 'center' }}>It only opens for the number you entered.</Text>
        </View>
      </PtSheet>
    </PtPageScreen>
  );
}
