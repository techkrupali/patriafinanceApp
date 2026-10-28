import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtAvatar, AVATAR_CYCLE, type PtAvatarTone } from '../pt/PtAvatar';
import { PtCheckbox } from '../pt/PtCheck';
import { PtField } from '../pt/PtField';
import { PtOptionSheet } from '../pt/PtOptionSheet';
import { PtAddRow } from '../pt/PtPeople';
import { PtDivider, PtGroupLabel, PtNote, PtPanel, PtPills, PtReviewRow, PtSegmented, PtSwitchRow } from '../pt/PtForm';
import { RecipientSheet } from '../RecipientSheet';
import { selection } from '../../lib/haptics';
import { formatNaira, initials } from '../../lib/format';
import {
  EMERGENCY_FOR,
  EXPIRY_HOURS,
  FAST_EVERY_DAYS,
  FAST_LIMITS,
  MAX_BENEFICIARIES,
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
  id: number;
  name: string;
  avatar?: string | null;
  /** "Contributor" when they put money in. */
  contributes?: boolean;
}

/** EMG-03 "Who agrees to release money?" — keyholders, approvals needed, expiry. */
export function KeyholdersSection({
  value,
  onChange,
  candidates,
  me,
}: {
  value: EmergencyRulesState;
  onChange: Change;
  candidates: KeyholderCandidate[];
  me: { name: string; initials: string };
}) {
  const [expiryOpen, setExpiryOpen] = useState(false);
  const n = value.keyholders.length + 1;
  const required = requiredYeses(value);

  return (
    <View style={{ gap: 14 }}>
      <PtPanel>
        <PersonLine initialsText={me.initials} tone="brand" name={`${me.name} (you)`} sub="Keyholder" right={<PtCheckbox checked />} />
        {candidates.map((c, i) => {
          const on = value.keyholders.includes(c.id);
          return (
            <React.Fragment key={c.id}>
              <PtDivider />
              <PersonLine
                initialsText={c.avatar || initials(c.name)}
                tone={AVATAR_CYCLE[i % AVATAR_CYCLE.length]}
                name={c.name}
                sub={on ? 'Keyholder' : c.contributes ? 'Contributor only' : 'Not a keyholder'}
                selected={on}
                onPress={() => onChange({ keyholders: on ? value.keyholders.filter((id) => id !== c.id) : [...value.keyholders, c.id] })}
                right={<PtCheckbox checked={on} />}
              />
            </React.Fragment>
          );
        })}
      </PtPanel>

      <View style={{ gap: 10 }}>
        <PtGroupLabel>Approvals needed</PtGroupLabel>
        {n > 1 ? (
          <PtSegmented
            options={Array.from({ length: n }, (_, i) => ({ value: i + 1, label: i + 1 === n ? `All ${n}` : `${i + 1} of ${n}` }))}
            value={required}
            onChange={(v) => onChange({ required: v })}
          />
        ) : (
          <PtNote>Pick another keyholder so someone else can agree when you can't — two of you is dual approval.</PtNote>
        )}
      </View>

      <PtPanel>
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
              In an emergency, keyholders tap <Text style={{ fontFamily: ptFont.bold, color: pt.ink }}>Release now</Text>, snap the bill, and the money goes to their
              Main wallet.
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

/** EMG-05 "If you can't ask yourself" — beneficiaries in order, death unlock, crisis override. */
export function TrustedSection({ value, onChange }: { value: EmergencyRulesState; onChange: Change }) {
  const [sheet, setSheet] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const editing = sheet.index < value.beneficiaries.length ? value.beneficiaries[sheet.index] : null;
  const setList = (list: typeof value.beneficiaries) => onChange({ beneficiaries: rankBeneficiaries(list) });

  return (
    <View style={{ gap: 14 }}>
      <PtPanel>
        {value.beneficiaries.map((b, i) => {
          const rank = beneficiaryRank(i);
          return (
            <React.Fragment key={b.user.id}>
              <PersonLine
                initialsText={initials(b.user.full_name)}
                tone={AVATAR_CYCLE[i % AVATAR_CYCLE.length]}
                name={b.user.full_name}
                sub={[rank.title + (rank.isFallback ? ' · fallback' : ''), b.relationship].filter(Boolean).join(' · ')}
                onPress={() => setSheet({ open: true, index: i })}
                right={
                  <Pressable
                    onPress={() => {
                      selection();
                      setList(value.beneficiaries.filter((x) => x.user.id !== b.user.id));
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${b.user.full_name}`}
                  >
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>Remove</Text>
                  </Pressable>
                }
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

      <PtPanel>
        {['Can start a release request', 'Can upload proof, like a death certificate', 'Can see the balance'].map((t, i) => (
          <View key={t} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i === 2 ? 0 : 1, borderBottomColor: pt.line }}>
            <Text style={{ flex: 1, fontFamily: ptFont.medium, fontSize: 15, color: pt.ink }}>{t}</Text>
            <Feather name="check" size={18} color={pt.brand} />
          </View>
        ))}
      </PtPanel>

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
