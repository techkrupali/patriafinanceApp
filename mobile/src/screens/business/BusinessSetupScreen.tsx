import React, { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useMyVendorProfile } from '../../api/hooks';
import {
  useAddDirector,
  useAddPastWork,
  useRemoveDirector,
  useRemovePastWork,
  useSaveBusiness,
  useSaveBusinessAddress,
  useSaveBusinessBank,
  useSaveOwner,
  useSubmitBusiness,
  useUploadBusinessDocument,
} from '../../api/projectFlow';
import { ApiError } from '../../api/client';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtPhoneField } from '../../components/pt/PtPhoneField';
import { PtGroupLabel, PtNote, PtPanel, PtPills } from '../../components/pt/PtForm';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtRow } from '../../components/pt/PtList';
import { BankPicker } from '../../components/BankPicker';
import { LoadingBlock, PersonRow, PhotoGrid, UploadBox } from '../../components/project/ProjectUi';
import { pickFile } from '../../lib/upload';
import { TRADES } from '../../lib/projects';
import { DEFAULT_COUNTRY, isValidE164, toE164, type Country } from '../../lib/phone';
import { initials } from '../../lib/format';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { Bank, MyVendorProfile } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

const TOTAL = 9;
const ID_TYPES = [
  { value: 'passport', label: "Int'l passport", side: 'passport' },
  { value: 'drivers_licence', label: "Driver's licence", side: 'licence' },
  { value: 'voters_card', label: "Voter's card", side: 'card' },
  { value: 'national_id', label: 'National ID', side: 'ID card' },
] as const;
const SERVICES = ['New buildings', 'Extensions', 'Renovation', 'Roofing', 'Tiling', 'Plumbing', 'Electrical', 'Painting'];

const errorText = (e: unknown) => {
  const err = e as ApiError;
  return err.errors ? Object.values(err.errors)[0]?.[0] ?? err.message : err.message;
};

/**
 * VDM-01 → VON-08 "Business account · Step n of 9": business details, the
 * owner, their ID, CAC papers, directors, address, the business bank account,
 * and what families see — then "Submit for review" (VON-09 is step 9).
 */
export function BusinessSetupScreen({ navigation, route }: RootScreenProps<'BusinessSetup'>) {
  const profileQuery = useMyVendorProfile();
  const profile = profileQuery.data?.profile ?? null;
  const [step, setStep] = useState(route.params?.step ?? 1);

  // Someone who already has a business skips the details they've given.
  useEffect(() => {
    if (route.params?.step) setStep(route.params.step);
  }, [route.params?.step]);

  if (profileQuery.isLoading) {
    return (
      <PtStepScreen onBack={() => navigation.goBack()} flow={{ title: 'Business account', step, total: TOTAL }}>
        <LoadingBlock />
      </PtStepScreen>
    );
  }

  // Opened for one item (a redo from VON-09, the payout account from VDM-06): back to where it came from.
  const next = () => (route.params?.step ? navigation.goBack() : step < 8 ? setStep(step + 1) : navigation.replace('BusinessVerification'));
  const back = () => (step > 1 && !route.params?.step ? setStep(step - 1) : navigation.goBack());
  const props = { profile, next, back, step };

  switch (step) {
    case 1:
      return <Details {...props} />;
    case 2:
      return <Owner {...props} />;
    case 3:
      return <IdDocument {...props} />;
    case 4:
      return <Cac {...props} />;
    case 5:
      return <Directors {...props} />;
    case 6:
      return <Address {...props} />;
    case 7:
      return <BankStep {...props} />;
    default:
      return <PublicProfile {...props} done={() => navigation.replace('BusinessVerification')} />;
  }
}

interface StepProps {
  profile: MyVendorProfile | null;
  next: () => void;
  back: () => void;
  step: number;
}

/** An upload handler for one verification item, with its own busy state. */
function useItemUpload() {
  const upload = useUploadBusinessDocument();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (item: string, source: 'camera' | 'library') => {
    const asset = await pickFile(source);
    if (!asset) return;
    setBusy(item);
    upload.mutate(
      { item, asset },
      {
        onError: (e) => showAlert('Could not upload', errorText(e)),
        onSettled: () => setBusy(null),
      },
    );
  };
  return { run, busy };
}

function docName(p: MyVendorProfile | null, item: string): string | null {
  return p?.verification.documents.find((d) => d.item === item)?.name ?? null;
}

/** VDM-01 Business name, CAC number, what you do, where you work. */
function Details({ profile, next, back, step }: StepProps) {
  const save = useSaveBusiness();
  const [name, setName] = useState(profile?.business_name ?? '');
  const [rc, setRc] = useState(profile?.rc_number ?? '');
  // Older "construction" profiles show as Building.
  const [trade, setTrade] = useState<string>(profile && TRADES.some((t) => t.value === profile.category) ? profile.category : 'building');
  const [where, setWhere] = useState(profile?.location ?? '');
  const ok = name.trim().length > 1 && where.trim().length > 1;

  const go = () =>
    save.mutate(
      { business_name: name.trim(), rc_number: rc.trim() || null, category: trade, location: where.trim() },
      { onSuccess: next, onError: (e) => showAlert('Could not save', errorText(e)) },
    );

  return (
    <PtStepScreen onBack={back} flow={{ title: 'Business account', step, total: TOTAL }} footer={<PtButton title="Continue" onPress={go} disabled={!ok} loading={save.isPending} />} gap={18}>
      <PtField label="Business name" value={name} onChangeText={setName} placeholder="Adeyemi Builders Ltd" maxLength={100} autoCapitalize="words" />
      <PtField label="CAC registration number" value={rc} onChangeText={setRc} placeholder="RC 1234567" maxLength={30} autoCapitalize="characters" hint="Business names (BN) are fine too" />
      <PtGroupLabel>What you do</PtGroupLabel>
      <PtPills options={TRADES} value={trade} onChange={setTrade} />
      <PtField label="Where you work" value={where} onChangeText={setWhere} placeholder="Enugu, Lagos" maxLength={120} />
    </PtStepScreen>
  );
}

/** VON-02 "Verify yourself first": BVN, NIN and a selfie. */
function Owner({ profile, next, back, step }: StepProps) {
  const save = useSaveOwner();
  const { run, busy } = useItemUpload();
  const has = profile?.verification.has;
  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const bvnOk = bvn.length === 11 || (!bvn && has?.bvn);
  const ninOk = nin.length === 11 || (!nin && has?.nin);
  const ok = Boolean(bvnOk && ninOk && has?.selfie);

  const go = () => {
    if (!bvn && !nin) return next();
    save.mutate({ ...(bvn ? { bvn } : {}), ...(nin ? { nin } : {}) }, { onSuccess: next, onError: (e) => showAlert('Could not save', errorText(e)) });
  };

  return (
    <PtStepScreen
      onBack={back}
      flow={{ title: 'Business account', step, total: TOTAL }}
      title="Verify yourself first"
      subtitle="The person running the business must be verified, like any Patriai user."
      footer={<PtButton title="Continue" onPress={go} disabled={!ok} loading={save.isPending} />}
      gap={18}
    >
      <PtField label="Your BVN" value={bvn} onChangeText={(t) => setBvn(t.replace(/\D/g, '').slice(0, 11))} keyboardType="number-pad" placeholder={has?.bvn ? 'Saved · enter again to change' : '11 digits'} />
      <PtField label="Your NIN" value={nin} onChangeText={(t) => setNin(t.replace(/\D/g, '').slice(0, 11))} keyboardType="number-pad" placeholder={has?.nin ? 'Saved · enter again to change' : '11 digits'} />
      {has?.bvn && has?.nin ? <PtNote tone="success">Your BVN and NIN are saved. Patriai checks them with your selfie.</PtNote> : null}
      <PtPanel>
        <PtRow
          left={<Feather name="camera" size={20} color={pt.brand} />}
          title={has?.selfie ? 'Selfie added' : 'Take a selfie'}
          subtitle={has?.selfie ? 'Tap to take it again' : 'To match your BVN photo'}
          right={busy === 'selfie' ? 'Uploading…' : undefined}
          chevron
          onPress={() => void run('selfie', 'camera')}
          last
        />
      </PtPanel>
    </PtStepScreen>
  );
}

/** VON-03 "Your ID document": which ID, front and back. */
function IdDocument({ profile, next, back, step }: StepProps) {
  const save = useSaveOwner();
  const { run, busy } = useItemUpload();
  const [type, setType] = useState<string>(profile?.id_type ?? 'drivers_licence');
  const t = ID_TYPES.find((x) => x.value === type) ?? ID_TYPES[1];
  const needsBack = type !== 'passport';
  const front = docName(profile, 'id_front');
  const backDoc = docName(profile, 'id_back');
  const ok = Boolean(front && (!needsBack || backDoc));

  const choose = (v: string) => {
    setType(v);
    save.mutate({ id_type: v }, { onError: (e) => showAlert('Could not save', errorText(e)) });
  };

  return (
    <PtStepScreen
      onBack={back}
      flow={{ title: 'Business account', step, total: TOTAL }}
      title="Your ID document"
      subtitle="Any of these. The name must match your BVN."
      footer={<PtButton title="Continue" onPress={() => (profile?.id_type === type ? next() : save.mutate({ id_type: type }, { onSuccess: next }))} disabled={!ok} loading={save.isPending} />}
      gap={16}
    >
      <PtPills options={ID_TYPES.map((x) => ({ value: x.value, label: x.label }))} value={type} onChange={choose} />
      <UploadBox
        title={`Front of ${t.side}`}
        hint="Clear, all four corners, no glare"
        busy={busy === 'id_front'}
        onTake={() => void run('id_front', 'camera')}
        onUpload={() => void run('id_front', 'library')}
        done={front ? { name: front, sub: 'Clear, all four corners, no glare', onReplace: () => void run('id_front', 'library') } : null}
      />
      {needsBack ? (
        <UploadBox
          title={`Back of ${t.side}`}
          hint="JPG, PNG or PDF, up to 10 MB"
          busy={busy === 'id_back'}
          onTake={() => void run('id_back', 'camera')}
          onUpload={() => void run('id_back', 'library')}
          done={backDoc ? { name: backDoc, onReplace: () => void run('id_back', 'library') } : null}
        />
      ) : null}
    </PtStepScreen>
  );
}

/** VON-04 "Business registration": the RC or BN number, certificate, status report, memorandum. */
function Cac({ profile, next, back, step }: StepProps) {
  const save = useSaveBusiness();
  const { run, busy } = useItemUpload();
  const [rc, setRc] = useState(profile?.rc_number ?? '');
  const cert = docName(profile, 'cac_certificate');
  const report = docName(profile, 'cac_status_report');
  const memo = docName(profile, 'memorandum');
  const ok = rc.trim().length > 2 && Boolean(cert && report);
  const go = () => (rc.trim().toUpperCase().replace(/\s+/g, '') === profile?.rc_number ? next() : save.mutate({ rc_number: rc.trim() }, { onSuccess: next, onError: (e) => showAlert('Could not save', errorText(e)) }));

  const box = (item: string, title: string, hint: string, name: string | null) => (
    <UploadBox title={title} hint={hint} busy={busy === item} onTake={() => void run(item, 'camera')} onUpload={() => void run(item, 'library')} done={name ? { name, sub: `${name} · we check it with CAC`, onReplace: () => void run(item, 'library') } : null} />
  );

  return (
    <PtStepScreen
      onBack={back}
      flow={{ title: 'Business account', step, total: TOTAL }}
      title="Business registration"
      subtitle="We check these against CAC records."
      footer={<PtButton title="Continue" onPress={go} disabled={!ok} loading={save.isPending} />}
      gap={16}
    >
      <PtField label="RC or BN number" value={rc} onChangeText={setRc} placeholder="RC 1234567" maxLength={30} autoCapitalize="characters" />
      {box('cac_certificate', 'Certificate of incorporation', 'Or your business name certificate', cert)}
      {box('cac_status_report', 'CAC status report (form CAC 1.1)', 'Shows the directors and shareholders', report)}
      {box('memorandum', 'Memorandum and articles (optional)', 'Helps if you have several directors', memo)}
    </PtStepScreen>
  );
}

/** VON-05 "Directors and owners": everyone with 25% or more; others verify from an SMS link. */
function Directors({ profile, next, back, step }: StepProps) {
  const add = useAddDirector();
  const remove = useRemoveDirector();
  const owner = useSaveOwner();
  const directors = profile?.verification.directors ?? [];
  const me = directors.find((d) => d.is_owner);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [share, setShare] = useState('');
  const [myShare, setMyShare] = useState(me?.share_percent ? String(me.share_percent) : '');
  const e164 = toE164(country.dial, phone);
  const others = directors.filter((d) => !d.is_owner);
  const has = profile?.verification.has;
  const ownerReady = Boolean(has?.bvn && has?.nin && has?.selfie);

  const chip = (s: string) =>
    s === 'verified' ? { label: 'Verified', tone: 'success' as const, icon: 'check' as const } : s === 'submitted' ? { label: 'Checking', tone: 'info' as const, icon: 'clock' as const } : { label: 'Waiting', tone: 'warning' as const, icon: 'clock' as const };

  const invite = () =>
    add.mutate(
      { name: name.trim(), phone: e164, share_percent: share ? Number(share) : null },
      {
        onSuccess: () => { setOpen(false); setName(''); setPhone(''); setShare(''); },
        onError: (e) => showAlert('Could not add', errorText(e)),
      },
    );

  const go = () => {
    const n = myShare ? Number(myShare) : null;
    if (n === (me?.share_percent ?? null)) return next();
    owner.mutate({ share_percent: n }, { onSuccess: next, onError: (e) => showAlert('Could not save', errorText(e)) });
  };

  return (
    <PtStepScreen
      onBack={back}
      flow={{ title: 'Business account', step, total: TOTAL }}
      title="Directors and owners"
      subtitle="Everyone with 25% or more, and every director, must be verified."
      footer={<PtButton title="Continue" onPress={go} loading={owner.isPending} />}
      gap={16}
    >
      <PtPanel>
        {directors.map((d, i) => (
          <PersonRow
            key={d.id}
            initials={initials(d.name)}
            tone={d.is_owner ? 'gold' : 'mint'}
            name={d.name}
            sub={`Director${d.share_percent ? ` · ${d.share_percent}%` : ''}${d.is_owner ? ' · you' : d.status === 'waiting' ? ' · invited to verify' : ''}`}
            // The owner's own details are in once BVN, NIN and a selfie are: Patriai is checking them.
            chip={chip(d.is_owner && d.status === 'waiting' && ownerReady ? 'submitted' : d.status)}
            onPress={!d.is_owner && d.status === 'waiting' ? () => showAlert(`Remove ${d.name}?`, 'They will no longer be asked to verify.', [{ text: 'Keep', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(d.id) }]) : undefined}
            last={i === directors.length - 1}
          />
        ))}
      </PtPanel>
      <PtField label="Your share (%)" value={myShare} onChangeText={(t) => setMyShare(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="70" hint="Leave empty if you're a director without shares." />
      <Pressable onPress={() => { selection(); setOpen(true); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
        <Feather name="plus" size={18} color={pt.brand} />
        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Add a director or owner</Text>
      </Pressable>
      {others.some((d) => d.status === 'waiting') ? (
        <PtNote icon="users">{`We've sent ${others.filter((d) => d.status === 'waiting').map((d) => d.name.split(' ')[0]).join(' and ')} a link to verify with their BVN and a selfie. You can carry on meanwhile.`}</PtNote>
      ) : null}

      <PtSheet visible={open} title="Add a director or owner" subtitle="We'll text them a link to verify. No app needed." onClose={() => setOpen(false)}
        footer={<PtButton title="Send the link" onPress={invite} disabled={!name.trim() || !isValidE164(e164)} loading={add.isPending} />}
      >
        <PtField label="Full name" value={name} onChangeText={setName} placeholder="Funke Adeyemi" maxLength={120} autoCapitalize="words" />
        <PtPhoneField label="Phone number" country={country} onChangeCountry={setCountry} value={phone} onChange={setPhone} layout="inline" />
        <PtField label="Share (%)" value={share} onChangeText={(t) => setShare(t.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" placeholder="30" />
      </PtSheet>
    </PtStepScreen>
  );
}

/** VON-06 "Where you work from": address, proof of address, a photo of the office or yard. */
function Address({ profile, next, back, step }: StepProps) {
  const save = useSaveBusinessAddress();
  const { run, busy } = useItemUpload();
  const [address, setAddress] = useState(profile?.address ?? '');
  const proof = docName(profile, 'address_proof');
  const office = docName(profile, 'office_photo');
  const redo = profile?.verification.items.find((i) => i.item === 'address' && i.status === 'redo');
  const ok = address.trim().length > 4 && Boolean(proof);
  const go = () => (address.trim() === profile?.address ? next() : save.mutate(address.trim(), { onSuccess: next, onError: (e) => showAlert('Could not save', errorText(e)) }));

  return (
    <PtStepScreen
      onBack={back}
      flow={{ title: 'Business account', step, total: TOTAL }}
      title="Where you work from"
      subtitle="Families see the city, not your full address."
      footer={<PtButton title="Continue" onPress={go} disabled={!ok} loading={save.isPending} />}
      gap={16}
    >
      <PtField label="Business address" value={address} onChangeText={setAddress} placeholder="22 Ogui Road, Enugu" maxLength={200} />
      {redo?.note ? <PtNote tone="attention">{`Patriai asked for a new one: ${redo.note}`}</PtNote> : null}
      <UploadBox
        title="Proof of address"
        hint="Utility bill, lease or bank statement, under 3 months old"
        busy={busy === 'address_proof'}
        onTake={() => void run('address_proof', 'camera')}
        onUpload={() => void run('address_proof', 'library')}
        done={proof && !redo ? { name: proof, onReplace: () => void run('address_proof', 'library') } : null}
      />
      <UploadBox
        title="Photo of your office or yard (optional)"
        hint="Builds trust with families"
        busy={busy === 'office_photo'}
        onTake={() => void run('office_photo', 'camera')}
        onUpload={() => void run('office_photo', 'library')}
        done={office ? { name: office, onReplace: () => void run('office_photo', 'library') } : null}
      />
    </PtStepScreen>
  );
}

/** VON-07 "Where we pay you": the business account, checked with the bank; TIN optional. */
function BankStep({ profile, next, back, step }: StepProps) {
  const save = useSaveBusinessBank();
  const { run, busy } = useItemUpload();
  const [account, setAccount] = useState('');
  const [bank, setBank] = useState<Bank | null>(profile?.bank?.bank_code ? { bank_code: profile.bank.bank_code, bank_name: profile.bank.bank_name ?? 'Bank' } : null);
  const [picker, setPicker] = useState(false);
  const [tin, setTin] = useState(profile?.tin ?? '');
  const tinDoc = docName(profile, 'tin_certificate');
  const bankCheck = profile?.verification.items.find((i) => i.item === 'bank');
  const saved = profile?.bank;
  const changing = account.length > 0;
  const ok = changing ? account.length === 10 && Boolean(bank) : Boolean(saved);

  const verify = () =>
    save.mutate(
      { account_number: account, bank_code: bank!.bank_code, tin: tin.trim() || null },
      { onSuccess: () => setAccount(''), onError: (e) => showAlert('Account not found', errorText(e)) },
    );

  return (
    <PtStepScreen
      onBack={back}
      flow={{ title: 'Business account', step, total: TOTAL }}
      title="Where we pay you"
      subtitle="It must be in the business name."
      footer={changing ? <PtButton title="Check account" onPress={verify} disabled={!ok} loading={save.isPending} /> : <PtButton title="Continue" onPress={next} disabled={!ok} />}
      gap={16}
    >
      <PtField label="Account number" value={account} onChangeText={(t) => setAccount(t.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" placeholder={saved ? `•••• ${saved.last4}` : '10 digits'} />
      <PtField label="Bank" value={bank?.bank_name ?? ''} placeholder="Choose your bank" onPressBox={() => setPicker(true)} />
      {saved && !changing ? (
        <PtNote tone={bankCheck?.status === 'approved' ? 'success' : 'attention'}>
          {bankCheck?.status === 'approved' ? `${saved.account_name} · name matches the business` : `${saved.account_name} · Patriai will check the name matches the business`}
        </PtNote>
      ) : null}
      <PtField label="TIN (optional)" value={tin} onChangeText={setTin} placeholder="Tax ID" maxLength={30} />
      <UploadBox
        title="TIN certificate (optional)"
        hint={'Shows a "Tax registered" badge on your profile'}
        busy={busy === 'tin_certificate'}
        onTake={() => void run('tin_certificate', 'camera')}
        onUpload={() => void run('tin_certificate', 'library')}
        done={tinDoc ? { name: tinDoc, onReplace: () => void run('tin_certificate', 'library') } : null}
      />
      <BankPicker visible={picker} selectedCode={bank?.bank_code} onSelect={(b) => { setBank(b); setPicker(false); }} onClose={() => setPicker(false)} />
    </PtStepScreen>
  );
}

/** VON-08 "What families will see": services, areas, team size, past work — then submit. */
function PublicProfile({ profile, back, step, done }: StepProps & { done: () => void }) {
  const save = useSaveBusiness();
  const submit = useSubmitBusiness();
  const addWork = useAddPastWork();
  const removeWork = useRemovePastWork();
  const [services, setServices] = useState<string[]>(profile?.services ?? []);
  const [custom, setCustom] = useState('');
  const [areas, setAreas] = useState(profile?.areas ?? profile?.location ?? '');
  const [team, setTeam] = useState(profile?.team_size ?? '');
  const options = Array.from(new Set([...SERVICES, ...services])).map((s) => ({ value: s, label: s }));

  const toggle = (s: string) => setServices((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const photo = async (source: 'camera' | 'library') => {
    const asset = await pickFile(source);
    if (asset) addWork.mutate({ asset }, { onError: (e) => showAlert('Could not upload', errorText(e)) });
  };

  const go = () =>
    save.mutate(
      { services, areas: areas.trim() || null, team_size: team.trim() || null },
      {
        onSuccess: () =>
          submit.mutate(undefined, {
            onSuccess: done,
            onError: (e) => showAlert('Not ready yet', errorText(e)),
          }),
        onError: (e) => showAlert('Could not save', errorText(e)),
      },
    );

  return (
    <PtStepScreen
      onBack={back}
      flow={{ title: 'Business account', step, total: TOTAL }}
      title="What families will see"
      footer={<PtButton title={profile?.status === 'verified' ? 'Save' : 'Submit for review'} onPress={profile?.status === 'verified' ? () => save.mutate({ services, areas: areas.trim() || null, team_size: team.trim() || null }, { onSuccess: done }) : go} loading={save.isPending || submit.isPending} />}
      gap={16}
    >
      <PtGroupLabel>Services</PtGroupLabel>
      <PtPills options={options} value={services} onChange={toggle} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, borderRadius: ptRadius.sm, borderWidth: 1.5, borderColor: pt.line, paddingHorizontal: 12, backgroundColor: pt.raised }}>
        <TextInput value={custom} onChangeText={setCustom} placeholder="+ Add a service" placeholderTextColor={pt.inkSubtle} maxLength={40} accessibilityLabel="Add a service" style={{ flex: 1, minWidth: 0, fontFamily: ptFont.medium, fontSize: 15, color: pt.ink }}
          onSubmitEditing={() => { if (custom.trim()) { toggle(custom.trim()); setCustom(''); } }}
        />
        <Pressable onPress={() => { if (custom.trim()) { selection(); toggle(custom.trim()); setCustom(''); } }} accessibilityRole="button" accessibilityLabel="Add service" hitSlop={8}>
          <Feather name="plus-circle" size={20} color={custom.trim() ? pt.brand : pt.lineStrong} />
        </Pressable>
      </View>
      <PtField label="Areas you cover" value={areas} onChangeText={setAreas} placeholder="Enugu, Anambra, Lagos" maxLength={200} />
      <PtField label="Team size" value={team} onChangeText={setTeam} placeholder="12 to 20 people" maxLength={20} />
      {profile?.past_work.length ? <PhotoGrid photos={profile.past_work.map((w, i) => ({ key: i, url: w.url, caption: w.caption }))} onRemove={(k) => removeWork.mutate(Number(k))} onAdd={profile.past_work.length < 20 ? () => void photo('library') : undefined} adding={addWork.isPending} /> : null}
      {!profile?.past_work.length ? (
        <UploadBox title="Past work photos" hint="Up to 20. You can add verified Patriai projects later." busy={addWork.isPending} onTake={() => void photo('camera')} onUpload={() => void photo('library')} />
      ) : null}
    </PtStepScreen>
  );
}
