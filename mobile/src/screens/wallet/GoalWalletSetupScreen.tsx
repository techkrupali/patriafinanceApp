import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtText } from '../../components/pt/PtText';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { PtPhoneField } from '../../components/pt/PtPhoneField';
import { PtAvatar, AVATAR_CYCLE, type PtAvatarTone } from '../../components/pt/PtAvatar';
import { PtCheckbox, PtRadio } from '../../components/pt/PtCheck';
import { PtOptionSheet } from '../../components/pt/PtOptionSheet';
import { PtSwitch } from '../../components/pt/PtTabScreen';
import { useCreateWallet, useFamily } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { formatNaira, formatYmd, groupAmountInput, initials, parseYmd, sanitizeAmountInput, ymdMonthsFromNow } from '../../lib/format';
import { DEFAULT_COUNTRY, formatE164, isValidE164, toE164, type Country } from '../../lib/phone';
import {
  EXPIRY_HOURS,
  NEW_MEMBER_ROLES,
  THRESHOLDS,
  approvalSummary,
  joinNames,
  monthlyPlan,
  ordinal,
  roleName,
  targetLabel,
  type NewMemberRole,
} from '../../lib/goalPlan';
import { confirmLeaveSetup, useDraft, useDraftAutosave } from '../../lib/drafts';
import { notifySuccess, selection } from '../../lib/haptics';
import type { ApprovalMode, FamilyMember, WalletDraft } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Step = 'name' | 'members' | 'approvals' | 'review';

/** Someone invited by phone number who isn't in the family circle yet. */
interface NewPerson {
  key: string;
  phone: string;
  name: string;
  role: NewMemberRole;
}

/** Everything the flow holds — saved as the draft's data. */
interface GoalForm {
  mode: 'private' | 'shared';
  target: string;
  targetDate: string | null;
  /** Family members ticked, by user id. */
  picked: number[];
  /** Role chosen per family member (ticked or not). */
  roles: Record<number, NewMemberRole>;
  newPeople: NewPerson[];
  threshold: number | null;
  approvalMode: ApprovalMode;
  lockUntilGoal: boolean;
  expiryHours: number;
  remind: boolean;
}

const EMPTY: GoalForm = {
  mode: 'shared',
  target: '',
  targetDate: null,
  picked: [],
  roles: {},
  newPeople: [],
  threshold: 50000,
  approvalMode: 'all',
  lockUntilGoal: true,
  expiryHours: 48,
  remind: true,
};

const REMIND_DAY = 25;
const LEAD_ROLES = ['owner', 'co_owner', 'admin'];

/** A child (only in child wallets) watches; partners co-own; everyone else contributes. */
function defaultRole(m: FamilyMember): NewMemberRole {
  if (m.memberships.length > 0 && m.memberships.every((ms) => ms.wallet_type === 'child')) return 'viewer';
  return LEAD_ROLES.includes(m.role) ? 'co_owner' : 'contributor';
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Outlined "Co-owner ▾" pill that opens the role sheet. */
function RoleButton({ role, onPress, label }: { role: NewMemberRole; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Role for ${label}: ${roleName(role)}`}
      style={{
        height: 40,
        paddingHorizontal: 10,
        borderRadius: ptRadius.sm,
        borderWidth: 1.5,
        borderColor: pt.lineStrong,
        backgroundColor: pt.raised,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Text style={{ fontFamily: ptFont.medium, fontSize: 14, color: pt.ink }}>{roleName(role)}</Text>
      <Feather name="chevron-down" size={16} color={pt.ink} />
    </Pressable>
  );
}

/** Raised card with hairlines between its children. */
function Card({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
  return (
    <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: padded ? 16 : 0, paddingVertical: padded ? 4 : 0 }}>
      {children}
    </View>
  );
}

const Divider = () => <View style={{ height: 1, backgroundColor: pt.line }} />;

/**
 * Goal wallet creation from the client prototype: WCR-02 name and who it's for
 * → WCR-08 who's in it → WCR-09 when money needs a yes → WCR-11 check and
 * create → WCR-12. Private goals skip the people steps. Auto-saved as a draft.
 */
export function GoalWalletSetupScreen(props: RootScreenProps<'GoalWalletSetup'>) {
  const { draft, loading } = useDraft(props.route.params?.draftId);
  if (props.route.params?.draftId && loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: pt.surface }}>
        <ActivityIndicator color={pt.brand} />
      </View>
    );
  }
  return <GoalWalletForm {...props} draft={draft} />;
}

function GoalWalletForm({ navigation, draft }: RootScreenProps<'GoalWalletSetup'> & { draft: WalletDraft | null }) {
  const me = useAuth((s) => s.user);
  const family = useFamily();
  const create = useCreateWallet();

  const saved = (draft?.data ?? {}) as Partial<GoalForm>;
  const [name, setName] = useState(draft?.name ?? '');
  const [form, setForm] = useState<GoalForm>({ ...EMPTY, ...saved });
  const set = (patch: Partial<GoalForm>) => setForm((f) => ({ ...f, ...patch }));

  const steps: Step[] = form.mode === 'shared' ? ['name', 'members', 'approvals', 'review'] : ['name', 'review'];
  const [stepIndex, setStepIndex] = useState(() => Math.min(Math.max((draft?.step ?? 2) - 2, 0), steps.length - 1));
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  const [error, setError] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [roleFor, setRoleFor] = useState<number | string | null>(null);
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<NewMemberRole>('contributor');

  const autosave = useDraftAutosave({
    initialDraftId: draft?.id,
    type: 'goal',
    name,
    // Step 1 is choosing the type (WCR-01), so this flow saves steps 2–5.
    step: stepIndex + 2,
    totalSteps: steps.length + 1,
    data: form as unknown as Record<string, unknown>,
    enabled: Boolean(name.trim() || form.target),
  });

  // Hardware back / swipe walks back through the steps before leaving.
  const leaving = useRef(false);
  const stepRef = useRef(stepIndex);
  stepRef.current = stepIndex;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (leaving.current || stepRef.current === 0) return;
        e.preventDefault();
        setError(null);
        setStepIndex(stepRef.current - 1);
      }),
    [navigation],
  );

  const leave = (go: () => void) => {
    leaving.current = true;
    go();
  };

  const back = () => {
    setError(null);
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
      return;
    }
    confirmLeaveSetup(
      Boolean(autosave.draftId),
      () => leave(() => navigation.goBack()),
      () => void autosave.discard().then(() => leave(() => navigation.goBack())),
    );
  };

  // ---- people
  // Vendors are paid through projects; they aren't offered as family here.
  const members = (family.data?.members ?? []).filter((m) => m.role !== 'vendor');
  const roleOf = (m: FamilyMember) => form.roles[m.id] ?? defaultRole(m);
  const pickedFamily = members.filter((m) => form.picked.includes(m.id));
  const people = [
    ...pickedFamily.map((m) => ({ name: firstName(m.name), role: roleOf(m) })),
    ...form.newPeople.map((p) => ({ name: p.name.trim() ? firstName(p.name) : formatE164(p.phone), role: p.role })),
  ];
  const shared = form.mode === 'shared';
  const myFirst = me?.first_name || firstName(me?.full_name ?? 'You');
  const approvers = shared ? [myFirst, ...people.filter((p) => p.role === 'co_owner').map((p) => p.name)] : [myFirst];
  const savers = 1 + (shared ? people.filter((p) => p.role !== 'viewer').length : 0);
  const target = Number(form.target) || 0;
  const plan = monthlyPlan(target, form.targetDate, savers);

  // A rule that no longer fits the people (e.g. the co-owner was unticked) falls back.
  const modes: { value: ApprovalMode; label: string }[] =
    approvers.length <= 1
      ? [{ value: 'any', label: 'Only you' }]
      : [
          { value: 'any', label: 'Any one co-owner' },
          { value: 'all', label: approvers.length === 2 ? `Both ${joinNames(approvers)}` : `All of ${joinNames(approvers)}` },
          ...(approvers.length >= 3
            ? [{ value: 'majority' as const, label: `Most of you, ${Math.floor(approvers.length / 2) + 1} of ${approvers.length}` }]
            : []),
        ];
  const approvalMode = modes.some((m) => m.value === form.approvalMode) ? form.approvalMode : modes[modes.length - 1].value;

  const validate = (s: Step): string | null => {
    if (s === 'name') {
      if (!name.trim()) return 'Give your goal a name.';
      if (!(target > 0)) return 'Enter how much you need.';
      const d = parseYmd(form.targetDate);
      if (d && d.getTime() <= Date.now()) return 'Pick a date after today.';
    }
    return null;
  };

  const next = () => {
    const problem = validate(step);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStepIndex(stepIndex + 1);
  };

  const addNewPerson = () => {
    const phone = toE164(country.dial, newPhone);
    if (!isValidE164(phone)) {
      setError('Enter a valid phone number.');
      return;
    }
    if (form.newPeople.some((p) => p.phone === phone) || phone === me?.phone) {
      setError("They're already on the list.");
      return;
    }
    setError(null);
    set({ newPeople: [...form.newPeople, { key: phone, phone, name: newName.trim(), role: newRole }] });
    setNewPhone('');
    setNewName('');
    setNewRole('contributor');
    setAdding(false);
  };

  const submit = () => {
    setError(null);
    // No draft saves while creating: the server deletes the draft with the wallet.
    autosave.stop();
    create.mutate(
      {
        type: 'goal',
        name: name.trim(),
        mode: form.mode,
        target_amount: form.target,
        target_date: form.targetDate ?? undefined,
        members: shared
          ? [
              ...pickedFamily.map((m) => ({ user_id: m.id, role: roleOf(m) })),
              ...form.newPeople.map((p) => ({ identifier: p.phone, role: p.role })),
            ]
          : undefined,
        approval: shared
          ? {
              threshold: form.threshold !== null ? String(form.threshold) : null,
              mode: approvalMode,
              lock_until_goal: form.lockUntilGoal,
              expiry_hours: form.expiryHours,
            }
          : undefined,
        reminder_day: form.remind ? REMIND_DAY : undefined,
        draft_id: autosave.draftId ?? undefined,
      },
      {
        onSuccess: (data) => {
          notifySuccess();
          leave(() => {
            navigation.popToTop();
            navigation.navigate('WalletCreated', { walletId: data.wallet.id, invited: shared ? people.map((p) => p.name) : [] });
          });
        },
        onError: (e) => {
          autosave.resume();
          setError(e.message);
        },
      },
    );
  };

  const errorText = error ? (
    <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
      {error}
    </PtText>
  ) : null;

  const progress = { step: stepIndex + 2, total: steps.length + 1 };

  // ------------------------------------------------------------ WCR-02
  if (step === 'name') {
    const modeCard = (value: 'private' | 'shared', title: string, body: string) => {
      const on = form.mode === value;
      return (
        <Pressable
          onPress={() => {
            selection();
            set({ mode: value });
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: on }}
          style={{
            flexDirection: 'row',
            gap: 14,
            padding: 16,
            borderRadius: ptRadius.md,
            borderWidth: 2,
            borderColor: on ? pt.brand : 'transparent',
            backgroundColor: on ? pt.brandSoft : pt.raised,
          }}
        >
          <View style={{ paddingTop: 2 }}>
            <PtRadio checked={on} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: on ? pt.brand : pt.ink }}>{title}</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 19, color: pt.inkMuted }}>{body}</Text>
          </View>
        </Pressable>
      );
    };

    return (
      <PtStepScreen
        onBack={back}
        progress={progress}
        title="Name your goal and who it's for"
        gap={20}
        footer={
          <>
            {errorText}
            <PtButton title="Continue" onPress={next} />
          </>
        }
      >
        <View style={{ gap: 12 }}>
          {modeCard('private', 'Private', "Just you. Funded from your main wallet. Others can't see it.")}
          {modeCard('shared', 'Shared', 'Gets its own account number. Family can add money and everyone sees every naira.')}
        </View>
        <PtField
          label="Wallet name"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          placeholder="School fees 2027"
          maxLength={100}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <PtField
              label="Target"
              prefix="₦"
              value={groupAmountInput(form.target)}
              onChangeText={(t) => {
                set({ target: sanitizeAmountInput(t) });
                setError(null);
              }}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <PtField
              label="Needed by"
              value={form.targetDate ? formatYmd(form.targetDate) : ''}
              placeholder="Pick a date"
              onPressBox={() => setDateOpen(true)}
            />
          </View>
        </View>
        <PtDateSheet
          visible={dateOpen}
          title="Needed by"
          value={form.targetDate ?? ymdMonthsFromNow(3)}
          minYear={new Date().getFullYear()}
          maxYear={new Date().getFullYear() + 10}
          doneLabel="Done"
          onDone={(ymd) => {
            setDateOpen(false);
            setError(null);
            set({ targetDate: ymd });
          }}
          onClose={() => setDateOpen(false)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ WCR-08
  if (step === 'members') {
    const count = 1 + people.length;
    const roleTarget = typeof roleFor === 'number' ? members.find((m) => m.id === roleFor) : null;
    return (
      <PtStepScreen
        onBack={back}
        progress={progress}
        title="Who's in this wallet?"
        subtitle="Pick from your family circle and choose what each person can do."
        gap={20}
        footer={
          <>
            {errorText}
            <PtButton title={count === 1 ? 'Continue with just you' : `Continue with ${count} people`} onPress={next} />
          </>
        }
      >
        <Card>
          <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <PtAvatar initials={initials(me?.full_name)} uri={me?.avatar_url} tone="brand" />
            <View>
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 16, color: pt.ink }}>You</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Owner</Text>
            </View>
          </View>

          {family.isLoading ? <ActivityIndicator color={pt.brand} style={{ marginVertical: 16 }} /> : null}

          {members.map((m, i) => {
            const on = form.picked.includes(m.id);
            return (
              <React.Fragment key={m.id}>
                <Divider />
                <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                  <Pressable
                    onPress={() => {
                      selection();
                      set({ picked: on ? form.picked.filter((id) => id !== m.id) : [...form.picked, m.id] });
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Add ${m.name}`}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  >
                    <PtCheckbox checked={on} />
                    <PtAvatar initials={m.avatar || initials(m.name)} tone={AVATAR_CYCLE[i % AVATAR_CYCLE.length] as PtAvatarTone} />
                    <Text style={{ flex: 1, fontFamily: ptFont.medium, fontSize: 15, color: pt.ink }} numberOfLines={1}>
                      {m.name}
                    </Text>
                  </Pressable>
                  <RoleButton role={roleOf(m)} label={m.name} onPress={() => setRoleFor(m.id)} />
                </View>
              </React.Fragment>
            );
          })}

          {form.newPeople.map((p) => (
            <React.Fragment key={p.key}>
              <Divider />
              <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                <Pressable
                  onPress={() => {
                    selection();
                    set({ newPeople: form.newPeople.filter((x) => x.key !== p.key) });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${p.name || p.phone}`}
                >
                  <PtCheckbox checked />
                </Pressable>
                <PtAvatar initials={p.name ? initials(p.name) : '+'} tone="dashed" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: ptFont.medium, fontSize: 16, color: pt.ink }} numberOfLines={1}>
                    {p.name || formatE164(p.phone)}
                  </Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
                    {p.name ? `${formatE164(p.phone)} · ` : ''}gets an invite by SMS
                  </Text>
                </View>
                <RoleButton role={p.role} label={p.name || p.phone} onPress={() => setRoleFor(p.key)} />
              </View>
            </React.Fragment>
          ))}

          <Divider />
          {adding ? (
            <View style={{ paddingVertical: 14, gap: 14 }}>
              <PtPhoneField label="Their phone number" country={country} onChangeCountry={setCountry} value={newPhone} onChange={setNewPhone} autoFocus />
              <PtField label="Their name (optional)" value={newName} onChangeText={setNewName} placeholder="Chidi" maxLength={60} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {NEW_MEMBER_ROLES.map((r) => {
                  const on = r.value === newRole;
                  return (
                    <Pressable
                      key={r.value}
                      onPress={() => {
                        selection();
                        setNewRole(r.value);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={{
                        flex: 1,
                        height: 40,
                        borderRadius: ptRadius.sm,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: on ? 2 : 1.5,
                        borderColor: on ? pt.brand : pt.lineStrong,
                        backgroundColor: on ? pt.brandSoft : pt.raised,
                      }}
                    >
                      <Text style={{ fontFamily: on ? ptFont.bold : ptFont.medium, fontSize: 14, color: on ? pt.brand : pt.ink }}>{r.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <PtButton title="Cancel" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => setAdding(false)} />
                <PtButton title="Add" size="sm" style={{ flex: 1 }} onPress={addNewPerson} />
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                selection();
                setError(null);
                setAdding(true);
              }}
              accessibilityRole="button"
              style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: pt.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="plus" size={18} color={pt.brand} />
              </View>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>Invite someone new</Text>
            </Pressable>
          )}
        </Card>

        <View style={{ backgroundColor: pt.sunken, borderRadius: ptRadius.md, padding: 16 }}>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>
            <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>Co-owner</Text> can send, approve and change rules.{' '}
            <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>Contributor</Text> can add money and see activity, but can't take money out.
          </Text>
        </View>

        <PtOptionSheet
          visible={roleFor !== null}
          title={`Role for ${roleTarget?.name ?? form.newPeople.find((p) => p.key === roleFor)?.name ?? 'this person'}`}
          options={NEW_MEMBER_ROLES.map((r) => ({ value: r.value, label: r.label, hint: r.hint }))}
          value={
            roleTarget ? roleOf(roleTarget) : form.newPeople.find((p) => p.key === roleFor)?.role ?? null
          }
          onPick={(role) => {
            if (typeof roleFor === 'number') set({ roles: { ...form.roles, [roleFor]: role } });
            else set({ newPeople: form.newPeople.map((p) => (p.key === roleFor ? { ...p, role } : p)) });
            setRoleFor(null);
          }}
          onClose={() => setRoleFor(null)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ WCR-09
  if (step === 'approvals') {
    return (
      <PtStepScreen
        onBack={back}
        progress={progress}
        title="When does money need a yes?"
        subtitle="Approvals protect everyone's contributions."
        gap={20}
        footer={
          <>
            {errorText}
            <PtButton title="Continue" onPress={next} />
          </>
        }
      >
        <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 14 }}>
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 14, color: pt.ink }}>Payments from this wallet over</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {THRESHOLDS.map((t) => {
              const on = t.value === form.threshold;
              return (
                <Pressable
                  key={t.label}
                  onPress={() => {
                    selection();
                    set({ threshold: t.value });
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t.value ? `Over ${t.label}` : 'Any amount'}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: ptRadius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: on ? 2 : 1.5,
                    borderColor: on ? pt.brand : pt.lineStrong,
                    backgroundColor: on ? pt.brandSoft : pt.raised,
                  }}
                >
                  <Text style={{ fontFamily: on ? ptFont.bold : ptFont.semibold, fontSize: 14, color: on ? pt.brand : pt.ink }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Divider />
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 14, color: pt.ink }}>Who needs to approve</Text>
          <View>
            {modes.map((m) => {
              const on = m.value === approvalMode;
              return (
                <Pressable
                  key={m.value}
                  onPress={() => {
                    selection();
                    set({ approvalMode: m.value });
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14 }}
                >
                  <PtRadio checked={on} />
                  <Text style={{ flex: 1, fontFamily: on ? ptFont.semibold : ptFont.regular, fontSize: 16, color: pt.ink }}>{m.label}</Text>
                </Pressable>
              );
            })}
            {approvers.length <= 1 ? (
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted, marginBottom: 6 }}>
                Make someone a co-owner to share the decision.
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16 }}>
          <View style={{ minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>Lock until goal is reached</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>Early withdrawal needs everyone's yes</Text>
            </View>
            <PtSwitch value={form.lockUntilGoal} onChange={(v) => set({ lockUntilGoal: v })} label="Lock until goal is reached" />
          </View>
          <Divider />
          <Pressable
            onPress={() => {
              selection();
              setExpiryOpen(true);
            }}
            accessibilityRole="button"
            style={{ minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>Requests expire after</Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>If no one answers</Text>
            </View>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{form.expiryHours} hours</Text>
          </Pressable>
        </View>

        <PtOptionSheet
          visible={expiryOpen}
          title="Requests expire after"
          options={EXPIRY_HOURS.map((h) => ({ value: h, label: `${h} hours` }))}
          value={form.expiryHours}
          onPick={(h) => {
            set({ expiryHours: h });
            setExpiryOpen(false);
          }}
          onClose={() => setExpiryOpen(false)}
        />
      </PtStepScreen>
    );
  }

  // ------------------------------------------------------------ WCR-11
  const goTo = (s: Step) => {
    setError(null);
    setStepIndex(steps.indexOf(s));
  };
  const reviewRow = (label: string, value: React.ReactNode, onEdit: () => void, last = false) => (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 16 }}>
        <Text style={{ width: 92, fontFamily: ptFont.regular, fontSize: 14, lineHeight: 22, color: pt.inkMuted }}>{label}</Text>
        <View style={{ flex: 1 }}>
          {typeof value === 'string' ? (
            <Text style={{ fontFamily: ptFont.medium, fontSize: 16, lineHeight: 22, color: pt.ink }}>{value}</Text>
          ) : (
            value
          )}
        </View>
        <Pressable
          onPress={() => {
            selection();
            onEdit();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${label.toLowerCase()}`}
        >
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, lineHeight: 22, color: pt.brand }}>Edit</Text>
        </Pressable>
      </View>
      {last ? null : <Divider />}
    </>
  );

  const everyone = ['You', ...people.map((p) => p.name)];
  const avatars = [
    { key: 'me', initials: initials(me?.full_name), tone: 'brand' as PtAvatarTone },
    ...people.slice(0, 2).map((p, i) => ({ key: `${p.name}-${i}`, initials: initials(p.name), tone: AVATAR_CYCLE[i % AVATAR_CYCLE.length] as PtAvatarTone })),
  ];

  return (
    <PtStepScreen
      onBack={back}
      progress={progress}
      title="Check and create"
      gap={20}
      footer={
        <>
          {errorText}
          <PtButton title="Create wallet" onPress={submit} loading={create.isPending} />
        </>
      }
    >
      <Card>
        {reviewRow('Type', `Goal · ${shared ? 'Shared' : 'Private'}`, () => leave(() => navigation.goBack()))}
        {reviewRow('Name', name.trim(), () => goTo('name'))}
        {reviewRow('Target', targetLabel(target, form.targetDate), () => goTo('name'), !shared)}
        {shared
          ? reviewRow(
              'Approvals',
              approvalSummary({ mode: approvalMode, threshold: form.threshold, approvers, lockUntilGoal: form.lockUntilGoal }),
              () => goTo('approvals'),
            )
          : null}
        {shared
          ? reviewRow(
              'Members',
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row' }}>
                  {avatars.map((a, i) => (
                    <View key={a.key} style={{ marginLeft: i === 0 ? 0 : -10, borderRadius: 20, borderWidth: 2, borderColor: pt.raised }}>
                      <PtAvatar initials={a.initials} tone={a.tone} size={36} />
                    </View>
                  ))}
                </View>
                <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 19, color: pt.inkMuted }}>{joinNames(everyone, true)}</Text>
              </View>,
              () => goTo('members'),
              true,
            )
          : null}
      </Card>

      <View style={{ backgroundColor: pt.infoSoft, borderRadius: ptRadius.md, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <MaterialCommunityIcons name="star-four-points-outline" size={16} color={pt.info} />
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 14, color: pt.info }}>Steward</Text>
        </View>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.ink }}>
          {plan ? (
            <>
              To reach {formatNaira(target)} by {formatYmd(form.targetDate).replace(/ \d{4}$/, '')}, save about{' '}
              <Text style={{ fontFamily: ptFont.bold }}>{formatNaira(plan.monthly)} a month</Text>
              {savers > 1 ? `, which is ${formatNaira(plan.each)} each` : ''}.{' '}
              {savers > 1 ? 'Want a monthly reminder for everyone?' : 'Want a monthly reminder?'}
            </>
          ) : (
            `Add a date to see how much to save each month. Want a monthly reminder${savers > 1 ? ' for everyone' : ''}?`
          )}
        </Text>
        <Pressable
          onPress={() => {
            selection();
            set({ remind: !form.remind });
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: form.remind }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 }}
        >
          <PtCheckbox checked={form.remind} />
          <Text style={{ fontFamily: ptFont.medium, fontSize: 15, color: pt.ink }}>
            Remind {savers > 1 ? 'members' : 'me'} on the {ordinal(REMIND_DAY)}
          </Text>
        </Pressable>
      </View>
    </PtStepScreen>
  );
}

