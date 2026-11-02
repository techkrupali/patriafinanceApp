import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useMyVendorProfile, useUserSearch } from '../../api/hooks';
import { useSendProposal, type ProposalDraft } from '../../api/proposals';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtPhoneField } from '../../components/pt/PtPhoneField';
import { PtChoiceCard, PtGroupLabel, PtNote, PtPanel, PtPills, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { FileRow, PersonRow, TextArea } from '../../components/project/ProjectUi';
import { formatNaira, groupAmountInput, initials, sanitizeAmountInput } from '../../lib/format';
import { DEFAULT_COUNTRY, toE164 } from '../../lib/phone';
import { pickFile, type PickedFile } from '../../lib/upload';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const KINDS: { value: ProposalDraft['kind']; label: string }[] = [
  { value: 'building', label: 'New building' },
  { value: 'extension', label: 'Extension' },
  { value: 'renovation', label: 'Renovation' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
];

/**
 * VPJ-01…04 New project, from the builder: who it's for (a family on Patriai,
 * or someone not on it yet), the quote with its files, phases by percent with
 * the proof for each, and the payment terms — "Send proposal to Ngozi".
 */
export function NewProposalScreen({ navigation }: RootScreenProps<'NewProposal'>) {
  const business = useMyVendorProfile().data?.profile?.business_name ?? 'Your business';
  const send = useSendProposal();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  // 1 · who
  const [query, setQuery] = useState('');
  const search = useUserSearch(query);
  const [family, setFamily] = useState<{ id: number; name: string } | null>(null);
  const [outside, setOutside] = useState(false);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [site, setSite] = useState('');
  const [kind, setKind] = useState<ProposalDraft['kind']>('building');
  // 2 · quote
  const [lines, setLines] = useState([{ label: 'Labour', amount: '' }, { label: 'Materials', amount: '' }]);
  const [files, setFiles] = useState<{ file: PickedFile; kind: 'quote' | 'drawing' }[]>([]);
  const [scope, setScope] = useState('');
  // 3 · phases
  const [phases, setPhases] = useState([
    { title: 'Mobilisation', percent: '20', proof: 'Materials on site' },
    { title: 'Main work', percent: '55', proof: 'Photos of the work' },
    { title: 'Finishing and handover', percent: '25', proof: 'Walk-through video, keys handed over' },
  ]);
  // 4 · terms
  const [upfront, setUpfront] = useState(true);
  const [held, setHeld] = useState(5);
  const [months, setMonths] = useState(3);
  const [start, setStart] = useState(7);
  const [show, setShow] = useState(true);

  const total = lines.reduce((t, l) => t + (Number(l.amount) || 0), 0);
  const percent = phases.reduce((t, p) => t + (Number(p.percent) || 0), 0);
  const who = family ? family.name.split(' ')[0] : outside && phone ? 'them' : 'the family';
  const share = (p: string) => Math.floor((total * (Number(p) || 0)) / 100);

  const next = () => {
    setError(null);
    if (step === 1) {
      if (!family && !(outside && phone.length >= 7)) return setError('Choose the family, or add their phone number.');
      if (!title.trim()) return setError('Give the project a name.');
    }
    if (step === 2 && (total <= 0 || lines.some((l) => !l.label.trim() || !(Number(l.amount) > 0)))) return setError('Add each part of the quote with its amount.');
    if (step === 3) {
      if (phases.some((p) => !p.title.trim() || !(Number(p.percent) > 0))) return setError('Name each phase and give it a share.');
      if (percent !== 100) return setError(`Percentages must add up to 100% — they add up to ${percent}%.`);
    }
    if (step < 4) return setStep(step + 1);
    const draft: ProposalDraft = {
      family_user_id: family?.id ?? null,
      invite_phone: family ? null : toE164(country.dial, phone),
      title: title.trim(),
      kind,
      location: site.trim() || undefined,
      lines: lines.map((l) => ({ label: l.label.trim(), amount: l.amount })),
      scope: scope.trim() || undefined,
      phases: phases.map((p) => ({ title: p.title.trim(), percent: Number(p.percent), proof: p.proof.trim() || undefined })),
      terms: { upfront, retention_percent: held, retention_months: months, start_within_days: start, show_on_profile: show },
    };
    send.mutate(
      { draft, files },
      {
        onSuccess: (r) => {
          showAlert('Proposal sent', family ? `${who} can accept, ask for changes or decline. You'll chat in the project room either way.` : `We texted ${phone} a link to see it.`);
          navigation.goBack();
          void r;
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  };

  const attach = async (k: 'quote' | 'drawing') => {
    const f = await pickFile('library', 'images');
    if (f) setFiles((l) => [...l, { file: f, kind: k }]);
  };

  return (
    <PtStepScreen
      onBack={() => (step === 1 ? navigation.goBack() : setStep(step - 1))}
      flow={{ title: 'New project', step, total: 4 }}
      title={step === 1 ? 'Who is it for?' : step === 2 ? 'Your quote' : step === 3 ? 'Split it into phases' : 'Payment terms'}
      subtitle={step === 3 ? 'Each phase is paid when the family approves your proof. Percentages must add up to 100%.' : `${business} · step ${step} of 4`}
      gap={20}
      footer={<PtButton title={step === 4 ? (family ? `Send proposal to ${who}` : 'Send proposal') : 'Continue'} loading={send.isPending} onPress={next} />}
    >
      {step === 1 ? (
        <>
          <PtChoiceCard icon="users" title="A family on Patriai" subtitle="Search by name, phone or @tag" selected={!outside} onPress={() => setOutside(false)} />
          {!outside ? (
            family ? (
              <PtPanel>
                <PersonRow initials={initials(family.name)} tone="brand" name={family.name} sub="Gets the proposal in the app" chip={{ label: 'Change', tone: 'neutral', icon: 'edit-2' }} onPress={() => setFamily(null)} last />
              </PtPanel>
            ) : (
              <>
                <PtField label="Search" value={query} onChangeText={setQuery} placeholder="Ngozi or @ngozi" autoCapitalize="none" />
                {(search.data ?? []).slice(0, 5).map((u) => (
                  <PtPanel key={u.id}>
                    <PersonRow initials={initials(u.full_name)} tone="brand" name={u.full_name} sub={u.username ? `@${u.username}` : 'On Patriai'} onPress={() => { setFamily({ id: u.id, name: u.full_name }); setQuery(''); }} last />
                  </PtPanel>
                ))}
              </>
            )
          ) : null}
          <PtChoiceCard icon="phone" title="Someone not on Patriai yet" subtitle="We send them an invite with your proposal" selected={outside} onPress={() => { setOutside(true); setFamily(null); }} />
          {outside ? <PtPhoneField label="Their phone number" country={country} onChangeCountry={setCountry} value={phone} onChange={setPhone} /> : null}
          <PtField label="Project name" value={title} onChangeText={setTitle} placeholder="Boys' quarters extension" maxLength={120} />
          <PtField label="Site" value={site} onChangeText={setSite} placeholder="Lekki, Lagos" maxLength={200} />
          <View style={{ gap: 10 }}>
            <PtGroupLabel>Type</PtGroupLabel>
            <PtPills options={KINDS} value={kind} onChange={(v) => setKind(v as ProposalDraft['kind'])} />
          </View>
        </>
      ) : step === 2 ? (
        <>
          <PtPanel>
            {lines.map((l, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: pt.line }}>
                <TextInput value={l.label} onChangeText={(t) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, label: t } : x)))} placeholder="What it's for" placeholderTextColor={pt.inkSubtle} accessibilityLabel={`Quote line ${i + 1}`} style={{ flex: 1, minWidth: 0, fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink, paddingVertical: 8 }} />
                <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.inkMuted }}>₦</Text>
                <TextInput value={groupAmountInput(l.amount)} onChangeText={(t) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, amount: sanitizeAmountInput(t) } : x)))} placeholder="0" keyboardType="decimal-pad" placeholderTextColor={pt.inkSubtle} accessibilityLabel={`Amount ${i + 1}`} style={{ width: 120, textAlign: 'right', fontFamily: ptFont.bold, fontSize: 15, color: pt.ink, paddingVertical: 8 }} />
                {lines.length > 1 ? (
                  <Pressable onPress={() => { selection(); setLines((ls) => ls.filter((_, j) => j !== i)); }} accessibilityRole="button" accessibilityLabel="Remove line" hitSlop={8}>
                    <Feather name="x" size={18} color={pt.inkMuted} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            <PtReviewRow label="Total" value={formatNaira(total)} onEdit={() => setLines((ls) => [...ls, { label: '', amount: '' }])} last />
          </PtPanel>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted, marginTop: -8 }}>Edit adds a line.</Text>
          <PtPanel>
            {files.map((f, i) => (
              <FileRow key={i} title={f.file.fileName ?? (f.kind === 'quote' ? 'Bill of quantities' : 'Site drawing')} sub={f.kind === 'quote' ? 'Attached · quote' : 'Attached · drawing'} right={<Pressable onPress={() => setFiles((l) => l.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel="Remove file" hitSlop={8}><Feather name="x" size={18} color={pt.inkMuted} /></Pressable>} />
            ))}
            <FileRow title="Add the bill of quantities" sub="A photo or scan" icon="plus" onPress={() => void attach('quote')} />
            <FileRow title="Add site drawings" sub="Photos of the plan" icon="plus" onPress={() => void attach('drawing')} last />
          </PtPanel>
          <TextArea label="Scope of work" value={scope} onChange={setScope} placeholder="Two rooms and a toilet, roofed with aluminium sheets…" maxLength={3000} />
        </>
      ) : step === 3 ? (
        <>
          <PtPanel>
            {phases.map((p, i) => (
              <View key={i} style={{ paddingVertical: 12, gap: 6, borderBottomWidth: i === phases.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ width: 18, fontFamily: ptFont.semibold, fontSize: 15, color: pt.inkMuted }}>{i + 1}</Text>
                  <TextInput value={p.title} onChangeText={(t) => setPhases((ps) => ps.map((x, j) => (j === i ? { ...x, title: t } : x)))} placeholder="Phase" placeholderTextColor={pt.inkSubtle} accessibilityLabel={`Phase ${i + 1}`} style={{ flex: 1, minWidth: 0, fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: pt.lineStrong, borderRadius: ptRadius.sm, paddingHorizontal: 6, height: 40 }}>
                    <TextInput value={p.percent} onChangeText={(t) => setPhases((ps) => ps.map((x, j) => (j === i ? { ...x, percent: t.replace(/\D/g, '').slice(0, 3) } : x)))} keyboardType="number-pad" accessibilityLabel={`Percent ${i + 1}`} style={{ width: 28, textAlign: 'right', fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }} />
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>%</Text>
                  </View>
                  <Text style={{ width: 92, textAlign: 'right', fontFamily: ptFont.bold, fontSize: 13, color: pt.ink }} numberOfLines={1} adjustsFontSizeToFit>{formatNaira(share(p.percent))}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 28 }}>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Proof:</Text>
                  <TextInput value={p.proof} onChangeText={(t) => setPhases((ps) => ps.map((x, j) => (j === i ? { ...x, proof: t } : x)))} placeholder="What you'll show" placeholderTextColor={pt.inkSubtle} accessibilityLabel={`Proof ${i + 1}`} style={{ flex: 1, minWidth: 0, fontFamily: ptFont.regular, fontSize: 13, color: pt.ink }} />
                  {phases.length > 1 ? (
                    <Pressable onPress={() => setPhases((ps) => ps.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel="Remove phase" hitSlop={8}>
                      <Feather name="x" size={16} color={pt.inkMuted} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </PtPanel>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: percent === 100 ? pt.brand : pt.danger }}>{`${percent}% · ${formatNaira(total)}`}</Text>
            <Pressable onPress={() => { selection(); setPhases((ps) => [...ps, { title: '', percent: '', proof: '' }]); }} accessibilityRole="button">
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>+ Add a phase</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <PtPanel>
            <PtSwitchRow title={`Paid upfront: ${phases[0]?.title || 'the first phase'}, ${phases[0]?.percent ?? 0}%`} subtitle="When the family accepts and funds it" value={upfront} onChange={setUpfront} />
            <PtReviewRow label="After that" value="Each approved phase unlocks the next" />
            <PtReviewRow label="Held back" value={held ? `${held}% until ${months} months after handover` : 'Nothing held back'} sub={held ? formatNaira(Math.floor((total * held) / 100)) : null} />
            <View style={{ paddingVertical: 10, gap: 8 }}>
              <PtPills options={[0, 5, 10].map((v) => ({ value: v, label: `${v}%` }))} value={held} onChange={(v) => setHeld(Number(v))} />
              {held ? <PtPills options={[3, 6].map((v) => ({ value: v, label: `${v} months` }))} value={months} onChange={(v) => setMonths(Number(v))} /> : null}
            </View>
            <PtReviewRow label="Start" value={`Within ${start} days of funding`} />
            <View style={{ paddingVertical: 10 }}>
              <PtPills options={[7, 14, 30].map((v) => ({ value: v, label: `${v} days` }))} value={start} onChange={(v) => setStart(Number(v))} />
            </View>
            <PtSwitchRow title="Show this project on my profile when done" subtitle="With photos, no prices" value={show} onChange={setShow} />
          </PtPanel>
          <PtNote>{`${family ? family.name.split(' ')[0] : 'The family'} can accept, ask for changes or decline. You'll chat in the project room either way.`}</PtNote>
        </>
      )}
      {error ? <PtNote tone="attention">{error}</PtNote> : null}
    </PtStepScreen>
  );
}
