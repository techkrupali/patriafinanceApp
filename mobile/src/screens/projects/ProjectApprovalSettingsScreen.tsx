import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { useProject } from '../../api/hooks';
import { useSaveApprovalRules } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtChoiceCard, PtGroupLabel, PtNote, PtPanel, PtPills, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { LoadingBlock } from '../../components/project/ProjectUi';
import { formatNaira, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { namesList } from '../../lib/projects';
import { notifySuccess } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { ApprovalRuleMode } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Override = { milestone_id: number; approver_ids: number[]; needed: number };

const MODES: { value: ApprovalRuleMode; title: string; sub: string }[] = [
  { value: 'any', title: 'Any one approver', sub: 'The first yes releases the money' },
  { value: 'all', title: 'Everyone', sub: 'All approvers must say yes' },
  { value: 'count', title: 'A number of them', sub: 'Like 2 of 3' },
  { value: 'named', title: 'Named people', sub: 'Pick exactly who' },
];

/**
 * MLS-03 Approval settings: for all milestones — any one, everyone, a number
 * of them, or named people — the approvers, how many are needed, an override
 * for one milestone, and a site visit photo from an approver on big ones.
 */
export function ProjectApprovalSettingsScreen({ navigation, route }: RootScreenProps<'ProjectApprovalSettings'>) {
  const { projectId } = route.params;
  const query = useProject(projectId);
  const save = useSaveApprovalRules(projectId);
  const rules = query.data?.approval_rules ?? null;
  const [mode, setMode] = useState<ApprovalRuleMode>('any');
  const [ids, setIds] = useState<number[]>([]);
  const [needed, setNeeded] = useState(1);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [photo, setPhoto] = useState(false);
  const [photoOver, setPhotoOver] = useState('1500000');
  const [sheet, setSheet] = useState<null | 'people' | 'needed' | 'photo' | { override: number | null }>(null);
  const [draft, setDraft] = useState<Override | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rules) return;
    setMode(rules.mode);
    setIds(rules.approvers.map((a) => a.id));
    setNeeded(rules.needed);
    // Overrides for milestones already paid are done with.
    const open = new Set((query.data?.milestones ?? []).filter((m) => !['released', 'cancelled'].includes(m.status)).map((m) => m.id));
    setOverrides(rules.overrides.filter((o) => open.has(o.milestone_id)).map((o) => ({ milestone_id: o.milestone_id, approver_ids: o.approver_ids, needed: o.needed })));
    setPhoto(rules.site_photo_over !== null);
    if (rules.site_photo_over) setPhotoOver(String(Math.round(Number(rules.site_photo_over))));
  }, [rules]);

  if (!query.data || !rules) {
    return (
      <PtPageScreen title="Approval settings" onBack={() => navigation.goBack()}>
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      </PtPageScreen>
    );
  }

  const p = query.data.project;
  const people = rules.candidates;
  const nameOf = (id: number) => people.find((x) => x.id === id)?.first_name ?? '';
  const chosen = people.filter((x) => ids.includes(x.id));
  const open = query.data.milestones.filter((m) => !['released', 'cancelled', 'proposed'].includes(m.status));
  const neededNow = mode === 'any' ? 1 : mode === 'count' ? Math.min(needed, ids.length) : ids.length;
  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const submit = () => {
    setError(null);
    if (!ids.length) return setError('Pick at least one approver.');
    save.mutate(
      {
        mode,
        approver_ids: ids,
        needed: mode === 'count' ? neededNow : undefined,
        overrides,
        site_photo_over: photo ? photoOver : null,
      },
      {
        onSuccess: () => {
          notifySuccess();
          showAlert('Saved', `We told ${p.vendor?.name ?? 'the builder'} who approves each payment.`);
          navigation.goBack();
        },
        onError: (e) => setError((e as Error).message),
      },
    );
  };

  return (
    <PtPageScreen
      title="Approval settings"
      subtitle={p.title}
      onBack={() => navigation.goBack()}
      footer={<PtButton title={p.vendor ? 'Save, and tell the builder' : 'Save'} loading={save.isPending} onPress={submit} disabled={!query.data.can.invite_vendor} />}
    >
      <PtGroupLabel>For all milestones</PtGroupLabel>
      {MODES.map((x) => (
        <PtChoiceCard key={x.value} title={x.title} subtitle={x.sub} selected={mode === x.value} onPress={() => setMode(x.value)} />
      ))}

      <PtPanel>
        <PtReviewRow label="Approvers" value={namesList(chosen.map((x) => x.first_name)) || 'Nobody yet'} onEdit={() => setSheet('people')} />
        <PtReviewRow
          label="Needed"
          value={mode === 'any' ? `Any 1 of ${ids.length}` : `${neededNow} of ${ids.length}`}
          onEdit={mode === 'count' ? () => setSheet('needed') : undefined}
          last={!overrides.length && !open.length}
        />
        {overrides.map((o, i) => {
          const m = query.data!.milestones.find((x) => x.id === o.milestone_id);
          return (
            <PtReviewRow
              key={o.milestone_id}
              label={`Override for ${m?.title ?? 'a milestone'}`}
              value={o.approver_ids.length === 1 ? `${nameOf(o.approver_ids[0])} alone` : `${o.needed} of ${namesList(o.approver_ids.map(nameOf))}`}
              sub={m ? `${Number(m.amount) < Number(p.plan_total) / open.length ? 'Smaller milestone, ' : ''}${formatNaira(m.amount)}` : null}
              onEdit={() => {
                setDraft(o);
                setSheet({ override: i });
              }}
              last={i === overrides.length - 1 && open.length === overrides.length}
            />
          );
        })}
        {open.length > overrides.length ? (
          <PtReviewRow
            label="One milestone different?"
            value="Add an override"
            onEdit={() => {
              const free = open.find((m) => !overrides.some((o) => o.milestone_id === m.id));
              setDraft({ milestone_id: free!.id, approver_ids: ids.slice(0, 1), needed: 1 });
              setSheet({ override: null });
            }}
            last
          />
        ) : null}
      </PtPanel>

      <PtPanel>
        <PtSwitchRow
          title="Require a site visit photo from an approver"
          subtitle={photo ? `For milestones over ${formatNaira(photoOver)}` : 'An approver adds their own photo before the money goes'}
          value={photo}
          onChange={(v) => {
            setPhoto(v);
            if (v) setSheet('photo');
          }}
        />
      </PtPanel>
      {error ? <PtNote tone="attention">{error}</PtNote> : null}
      {!query.data.can.invite_vendor ? <PtNote>Only the project owner can change who approves.</PtNote> : null}

      <PtSheet visible={sheet === 'people'} title="Approvers" subtitle="People who put money in can approve. Viewers only see." onClose={() => setSheet(null)} footer={<PtButton title="Done" onPress={() => setSheet(null)} />}>
        {people.map((x) => (
          <PtChoiceCard key={x.id} kind="check" title={x.name} subtitle={x.role === 'owner' ? 'Owner' : x.role === 'co_owner' ? 'Co-owner' : 'Puts money in'} selected={ids.includes(x.id)} onPress={() => setIds((l) => toggle(l, x.id))} />
        ))}
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>To add someone, invite them to the project first.</Text>
      </PtSheet>

      <PtSheet visible={sheet === 'needed'} title="How many must say yes" onClose={() => setSheet(null)} footer={<PtButton title="Done" onPress={() => setSheet(null)} />}>
        <PtPills options={ids.map((_, i) => ({ value: i + 1, label: `${i + 1} of ${ids.length}` }))} value={neededNow} onChange={(v) => setNeeded(Number(v))} />
      </PtSheet>

      <PtSheet visible={sheet === 'photo'} title="Site visit photo" subtitle="For milestones over this amount, an approver adds their own photo first." onClose={() => setSheet(null)} footer={<PtButton title="Done" onPress={() => setSheet(null)} />}>
        <PtField label="Over" prefix="₦" value={groupAmountInput(photoOver)} onChangeText={(t) => setPhotoOver(sanitizeAmountInput(t))} keyboardType="decimal-pad" />
      </PtSheet>

      <PtSheet
        visible={typeof sheet === 'object' && sheet !== null}
        title="Override for one milestone"
        onClose={() => setSheet(null)}
        footer={
          <>
            <PtButton
              title="Done"
              disabled={!draft?.approver_ids.length}
              onPress={() => {
                if (!draft || typeof sheet !== 'object' || sheet === null) return;
                const d = { ...draft, needed: Math.min(draft.needed, draft.approver_ids.length) };
                setOverrides((l) => (sheet.override === null ? [...l, d] : l.map((o, i) => (i === sheet.override ? d : o))));
                setSheet(null);
              }}
            />
            {typeof sheet === 'object' && sheet !== null && sheet.override !== null ? (
              <PtButton
                title="Remove the override"
                variant="ghost"
                onPress={() => {
                  setOverrides((l) => l.filter((_, i) => i !== (sheet as { override: number }).override));
                  setSheet(null);
                }}
              />
            ) : null}
          </>
        }
      >
        {draft ? (
          <>
            <PtGroupLabel>Milestone</PtGroupLabel>
            <PtPills
              options={open.filter((m) => m.id === draft.milestone_id || !overrides.some((o) => o.milestone_id === m.id)).map((m) => ({ value: m.id, label: m.title }))}
              value={draft.milestone_id}
              onChange={(v) => setDraft({ ...draft, milestone_id: Number(v) })}
            />
            <PtGroupLabel>Who approves it</PtGroupLabel>
            {people.map((x) => (
              <PtChoiceCard key={x.id} kind="check" title={x.name} selected={draft.approver_ids.includes(x.id)} onPress={() => setDraft({ ...draft, approver_ids: toggle(draft.approver_ids, x.id) })} />
            ))}
            {draft.approver_ids.length > 1 ? (
              <PtPills options={draft.approver_ids.map((_, i) => ({ value: i + 1, label: `${i + 1} of ${draft.approver_ids.length}` }))} value={Math.min(draft.needed, draft.approver_ids.length)} onChange={(v) => setDraft({ ...draft, needed: Number(v) })} />
            ) : null}
          </>
        ) : null}
      </PtSheet>
    </PtPageScreen>
  );
}
