import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtAvatar, AVATAR_CYCLE, type PtAvatarTone } from '../pt/PtAvatar';
import { PtCheckbox } from '../pt/PtCheck';
import { PtField } from '../pt/PtField';
import { PtOptionSheet } from '../pt/PtOptionSheet';
import { PtAddRow, PtNewPersonForm } from '../pt/PtPeople';
import { PtDivider, PtGroupLabel, PtNote, PtPanel, PtPills, PtReviewRow, PtSegmented, PtSwitchRow } from '../pt/PtForm';
import { RecipientSheet } from '../RecipientSheet';
import { selection } from '../../lib/haptics';
import { formatNaira, initials } from '../../lib/format';
import { maskPhone } from '../../lib/phone';
import {
  EMERGENCY_FOR,
  EXPIRY_HOURS,
  FAST_EVERY_DAYS,
  FAST_LIMITS,
  MAX_BENEFICIARIES,
  MAX_TRUSTED_CONTACTS,
  beneficiaryRank,
  rankBeneficiaries,
  requiredYeses,
  type EmergencyPins,
  type EmergencyRulesState,
} from '../../lib/emergencyRules';
import type { EmergencyPurpose } from '../../api/types';

type Change = (patch: Partial<EmergencyRulesState>) => void;

/** One person line: avatar, name, a line, and something on the right. */
function PersonLine({
  initialsText,
  tone,
  name,
  sub,
  right,
  onPress,
  selected,
}: {
  initialsText: string;
  tone: PtAvatarTone;
  name: string;
  sub?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  selected?: boolean;
}) {
  const body = (
    <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <PtAvatar initials={initialsText} tone={tone} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
          {name}
        </Text>
        {sub ? (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={selected === undefined ? undefined : { selected }}
      accessibilityLabel={name}
    >
      {body}
    </Pressable>
  );
}

/** EMG-01 checklist: what the fund is for. */
export function PurposesChecklist({ value, onChange }: { value: EmergencyPurpose[]; onChange: (v: EmergencyPurpose[]) => void }) {
  return (
    <PtPanel>
      {EMERGENCY_FOR.map((p, i) => {
        const on = value.includes(p.value);
        return (
          <View key={p.value} style={{ borderBottomWidth: i === EMERGENCY_FOR.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
            <Pressable
              onPress={() => {
                selection();
                onChange(on ? value.filter((v) => v !== p.value) : [...value, p.value]);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <Text style={{ flex: 1, fontFamily: ptFont.medium, fontSize: 16, color: pt.ink }}>{p.label}</Text>
              <PtCheckbox checked={on} />
            </Pressable>
          </View>
        );
      })}
    </PtPanel>
  );
}

export interface KeyholderCandidate {
  /** A Patriai account… */
  id?: number;
  /** …or someone invited by phone, who holds a key once they join. */
  phone?: string;
  name: string;
  avatar?: string | null;
  /** "Contributor" when they put money in. */
  contributes?: boolean;
}

/** EMG-03 "Who agrees to release money?" — keyholders, approvals needed, paying the bill directly, expiry. */
export function KeyholdersSection({
  value,
  onChange,
  candidates,
  me,
  invited = [],
  onInvited,
}: {
  value: EmergencyRulesState;
  onChange: Change;
  candidates: KeyholderCandidate[];
  me: { name: string; initials: string };
  /** Phones of candidates invited by phone who are keyholders. */
  invited?: string[];
  onInvited?: (phones: string[]) => void;
}) {
  const [expiryOpen, setExpiryOpen] = useState(false);
  const n = value.keyholders.length + invited.length + 1;
  const required = requiredYeses(value, invited.length);

  const toggle = (c: KeyholderCandidate) => {
    if (c.id !== undefined) {
      const on = value.keyholders.includes(c.id);
      onChange({ keyholders: on ? value.keyholders.filter((id) => id !== c.id) : [...value.keyholders, c.id] });
    } else if (c.phone && onInvited) {
      onInvited(invited.includes(c.phone) ? invited.filter((p) => p !== c.phone) : [...invited, c.phone]);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <PtPanel>
        <PersonLine initialsText={me.initials} tone="brand" name={`${me.name} (you)`} sub="Keyholder" right={<PtCheckbox checked />} />
        {candidates.map((c, i) => {
          const on = c.id !== undefined ? value.keyholders.includes(c.id) : invited.includes(c.phone ?? '');
          return (
            <React.Fragment key={c.id ?? c.phone}>
              <PtDivider />
              <PersonLine
                initialsText={c.avatar || initials(c.name)}
                tone={c.phone ? 'gold' : AVATAR_CYCLE[i % AVATAR_CYCLE.length]}
                name={c.name}
                sub={
                  on
                    ? c.phone
                      ? 'Keyholder · joins with their phone number'
                      : 'Keyholder'
                    : c.contributes
                      ? 'Contributor only'
                      : 'Not a keyholder'
                }
                selected={on}
                onPress={() => toggle(c)}
                right={<PtCheckbox checked={on} />}
              />
            </React.Fragment>
          );
        })}
      </PtPanel>

      <View style={{ gap: 10 }}>
        <PtGroupLabel>Approvals needed</PtGroupLabel>
        {n > 1 ? (
          <>
            <PtSegmented
              options={Array.from({ length: n }, (_, i) => ({ value: i + 1, label: i + 1 === n ? `All ${n}` : `${i + 1} of ${n}` }))}
              value={required}
              onChange={(v) => onChange({ required: v })}
            />
            {n === 2 && required === 2 ? (
              <Text style={{ fontFamily: ptFont.medium, fontSize: 13, color: pt.brand, paddingHorizontal: 4 }}>Dual approval — both of you must agree.</Text>
            ) : null}
          </>
        ) : (
          <PtNote>Pick another keyholder so someone else can agree when you can't — two of you is dual approval.</PtNote>
        )}
      </View>

      <PtPanel>
        <PtSwitchRow
          title="Pay the hospital directly"
          subtitle="Money goes to the bill, not a person"
          value={value.payDirectly}
          onChange={(v) => onChange({ payDirectly: v })}
        />
        <PtDivider />
        <PtReviewRow
          label="Requests expire after"
          value={`${value.expiryHours} hours`}
          sub="If not enough keyholders answer"
          onEdit={() => setExpiryOpen(true)}
          last
        />
      </PtPanel>

      <PtOptionSheet
        visible={expiryOpen}
        title="Requests expire after"
        options={EXPIRY_HOURS.map((h) => ({ value: h, label: `${h} hours` }))}
        value={value.expiryHours}
        onPick={(h) => {
          onChange({ expiryHours: h });
          setExpiryOpen(false);
        }}
        onClose={() => setExpiryOpen(false)}
      />
    </View>
  );
}

/** EMG-04 "When every minute counts" — fast release with proof. */
export function FastReleaseSection({ value, onChange }: { value: EmergencyRulesState; onChange: Change }) {
  const [everyOpen, setEveryOpen] = useState(false);
  return (
    <View style={{ gap: 14 }}>
      <PtPanel>
        <PtSwitchRow title="Allow fast release" subtitle="No waiting for approvals" value={value.fastOn} onChange={(v) => onChange({ fastOn: v })} />
      </PtPanel>
      {value.fastOn ? (
        <>
          <View style={{ gap: 10 }}>
            <PtGroupLabel>Up to</PtGroupLabel>
            <PtPills options={FAST_LIMITS.map((l) => ({ value: l, label: formatNaira(l) }))} value={value.fastLimit} onChange={(l) => onChange({ fastLimit: l })} />
          </View>
          <PtPanel>
            <PtReviewRow label="Proof needed" value="Photo of the bill or doctor's note" />
            <PtReviewRow label="How often" value={`Once every ${value.fastEvery} days`} onEdit={() => setEveryOpen(true)} />
            <PtReviewRow label="Review" value="Keyholders check within 48 hours" sub="They can flag it if something looks wrong" last />
          </PtPanel>
          <View style={{ flexDirection: 'row', gap: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: pt.lineStrong, borderRadius: ptRadius.md, padding: 14 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="upload" size={16} color={pt.brand} />
            </View>
            <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 13, lineHeight: 19, color: pt.inkMuted }}>
              In an emergency, keyholders tap <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>Release now</Text>, snap the bill, and the money goes{' '}
              {value.payDirectly ? "straight to the hospital or clinic's bank account." : 'to their Main wallet.'}
            </Text>
          </View>
        </>
      ) : null}
      <PtOptionSheet
        visible={everyOpen}
        title="How often"
        options={FAST_EVERY_DAYS.map((d) => ({ value: d, label: `Once every ${d} days` }))}
        value={value.fastEvery}
        onPick={(d) => {
          onChange({ fastEvery: d });
          setEveryOpen(false);
        }}
        onClose={() => setEveryOpen(false)}
      />
    </View>
  );
}

/** The client's "Manual unlock with custom PIN" and the high-balance override. */
export function UnlockYourselfSection({
  value,
  onChange,
  pins,
  onPins,
  hasCustomPin = false,
}: {
  value: EmergencyRulesState;
  onChange: Change;
  pins: EmergencyPins;
  onPins: (p: EmergencyPins) => void;
  hasCustomPin?: boolean;
}) {
  return (
    <View style={{ gap: 10 }}>
      <PtGroupLabel>Open it yourself</PtGroupLabel>
      <PtPanel>
        <PtSwitchRow
          title="Unlock with your custom PIN"
          subtitle="Open it straight away, with a reason everyone sees"
          value={value.manual}
          onChange={(v) => onChange({ manual: v })}
        />
        {value.manual ? (
          <View style={{ gap: 14, paddingBottom: 14 }}>
            <PtField label="When you'd use it" value={value.reason} onChangeText={(t) => onChange({ reason: t })} placeholder="Hospital bills" maxLength={150} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <PtField
                  label={hasCustomPin ? 'New PIN (optional)' : 'Custom PIN'}
                  value={pins.pin}
                  onChangeText={(t) => onPins({ ...pins, pin: t.replace(/\D/g, '').slice(0, 4) })}
                  placeholder="••••"
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                />
              </View>
              <View style={{ flex: 1 }}>
                <PtField
                  label="Confirm PIN"
                  value={pins.pinConfirm}
                  onChangeText={(t) => onPins({ ...pins, pinConfirm: t.replace(/\D/g, '').slice(0, 4) })}
                  placeholder="••••"
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                />
              </View>
            </View>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>
              {hasCustomPin ? 'Leave empty to keep your current custom PIN.' : '4 digits, different from your transaction PIN.'}
            </Text>
          </View>
        ) : null}
        <PtDivider />
        <PtSwitchRow
          title="Override when it's over ₦1M"
          subtitle="Open it with your transaction PIN while it holds more than ₦1,000,000"
          value={value.highBalance}
          onChange={(v) => onChange({ highBalance: v })}
        />
      </PtPanel>
    </View>
  );
}

/** One trusted contact or beneficiary line with Remove. */
function RemovableLine({ name, sub, tone, onPress, onRemove }: { name: string; sub: string; tone: PtAvatarTone; onPress?: () => void; onRemove: () => void }) {
  return (
    <PersonLine
      initialsText={initials(name)}
      tone={tone}
      name={name}
      sub={sub}
      onPress={onPress}
      right={
        <Pressable
          onPress={() => {
            selection();
            onRemove();
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name}`}
        >
          <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>Remove</Text>
        </Pressable>
      }
    />
  );
}

/** A checkbox line ("Can upload proof"). */
function CheckLine({ label, checked, onToggle, last }: { label: string; checked: boolean; onToggle: () => void; last?: boolean }) {
  return (
    <View style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>
      <Pressable
        onPress={() => {
          selection();
          onToggle();
        }}
        // RNGH Pressable on web only exposes the button role.
        accessibilityRole="button"
        accessibilityState={{ selected: checked }}
        accessibilityLabel={label}
        style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <Text style={{ flex: 1, fontFamily: ptFont.medium, fontSize: 16, color: pt.ink }}>{label}</Text>
        <PtCheckbox checked={checked} />
      </Pressable>
    </View>
  );
}

/**
 * EMG-05 "If you can't ask yourself": trusted contacts without the app (an SMS
 * link) and what they may do; then the client's beneficiaries in order (1st,
 * 2nd fallback, 3rd), death emergency unlock and the crisis override.
 */
export function TrustedSection({ value, onChange, ownPhone }: { value: EmergencyRulesState; onChange: Change; ownPhone?: string | null }) {
  const [sheet, setSheet] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [adding, setAdding] = useState(false);
  const editing = sheet.index < value.beneficiaries.length ? value.beneficiaries[sheet.index] : null;
  const setList = (list: typeof value.beneficiaries) => onChange({ beneficiaries: rankBeneficiaries(list) });
  const contacts = value.trustedContacts;

  return (
    <View style={{ gap: 14 }}>
      <PtGroupLabel>Trusted contacts</PtGroupLabel>
      {contacts.length > 0 || adding ? (
        <PtPanel>
          {contacts.map((c, i) => (
            <React.Fragment key={c.phone}>
              {i > 0 ? <PtDivider /> : null}
              <RemovableLine
                name={c.name}
                sub={[c.relation, maskPhone(c.phone)].filter(Boolean).join(' · ')}
                tone={AVATAR_CYCLE[(i + 2) % AVATAR_CYCLE.length]}
                onRemove={() => onChange({ trustedContacts: contacts.filter((x) => x.phone !== c.phone) })}
              />
            </React.Fragment>
          ))}
          {adding ? (
            <>
              {contacts.length > 0 ? <PtDivider /> : null}
              <PtNewPersonForm
                withRelation
                nameRequired
                taken={[...contacts.map((c) => c.phone), ownPhone ?? '']}
                onCancel={() => setAdding(false)}
                onAdd={(p) => {
                  onChange({ trustedContacts: [...contacts, { name: p.name, phone: p.phone, relation: p.relation ?? '' }] });
                  setAdding(false);
                }}
              />
            </>
          ) : null}
        </PtPanel>
      ) : null}
      {!adding && contacts.length < MAX_TRUSTED_CONTACTS ? <PtAddRow label="Add a trusted contact" onPress={() => setAdding(true)} /> : null}

      <PtPanel>
        <CheckLine label="Can start a release request" checked={value.trustedCanRequest} onToggle={() => onChange({ trustedCanRequest: !value.trustedCanRequest })} />
        <CheckLine label="Can upload proof" checked={value.trustedCanUpload} onToggle={() => onChange({ trustedCanUpload: !value.trustedCanUpload })} />
        <CheckLine
          label="Can see the balance"
          checked={value.trustedCanSeeBalance}
          onToggle={() => onChange({ trustedCanSeeBalance: !value.trustedCanSeeBalance })}
          last
        />
      </PtPanel>
      <PtNote>They get an SMS with a secure link. They don't need the app.</PtNote>

      <View style={{ gap: 10, marginTop: 8 }}>
        <PtGroupLabel>Who receives the money</PtGroupLabel>
        <PtPanel>
          {value.beneficiaries.map((b, i) => {
            const rank = beneficiaryRank(i);
            return (
              <React.Fragment key={b.user.id}>
                <RemovableLine
                  name={b.user.full_name}
                  sub={[rank.title + (rank.isFallback ? ' · fallback' : ''), b.relationship].filter(Boolean).join(' · ')}
                  tone={AVATAR_CYCLE[i % AVATAR_CYCLE.length]}
                  onPress={() => setSheet({ open: true, index: i })}
                  onRemove={() => setList(value.beneficiaries.filter((x) => x.user.id !== b.user.id))}
                />
                <PtDivider />
              </React.Fragment>
            );
          })}
          {value.beneficiaries.length < MAX_BENEFICIARIES ? (
            <PtAddRow
              label={value.beneficiaries.length === 0 ? 'Add a beneficiary' : `Add a ${value.beneficiaries.length === 1 ? 'second' : 'third'} (fallback)`}
              onPress={() => setSheet({ open: true, index: value.beneficiaries.length })}
            />
          ) : null}
        </PtPanel>
        <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted, paddingHorizontal: 4 }}>
          Beneficiaries have a Patriai account. They can ask the keyholders for a release and upload a death certificate.
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        <PtGroupLabel>If you pass away</PtGroupLabel>
        <PtPanel>
          <PtSwitchRow
            title="Death emergency unlock"
            subtitle="A beneficiary uploads the death certificate or legal notice; once Patriai verifies it, the fund opens for them"
            value={value.docUnlock}
            onChange={(v) => onChange({ docUnlock: v })}
          />
          <PtDivider />
          <PtSwitchRow
            title="Allow a national-crisis override"
            subtitle="Patriai may open it during a declared national emergency"
            value={value.crisis}
            onChange={(v) => onChange({ crisis: v })}
          />
        </PtPanel>
      </View>

      <PtField
        label="Message for your beneficiaries (optional)"
        value={value.note}
        onChangeText={(t) => onChange({ note: t })}
        placeholder="They see it when the fund opens"
        maxLength={1000}
      />

      <RecipientSheet
        visible={sheet.open}
        position={sheet.index}
        initial={editing}
        excludeIds={value.beneficiaries.filter((_, i) => i !== sheet.index).map((r) => r.user.id)}
        onSave={(r) => {
          const list = [...value.beneficiaries];
          list[sheet.index] = r;
          setList(list);
          setSheet({ open: false, index: 0 });
        }}
        onClose={() => setSheet({ open: false, index: 0 })}
      />
    </View>
  );
}
