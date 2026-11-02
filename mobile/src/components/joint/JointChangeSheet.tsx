import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { PtSheet } from '../pt/PtSheet';
import { PtButton } from '../pt/PtButton';
import { PtField } from '../pt/PtField';
import { PtChoiceCard, PtGroupLabel, PtPills } from '../pt/PtForm';
import { formatNaira, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import { ordinal } from '../../lib/goalPlan';
import { JOINT_SPLITS } from '../../lib/joint';
import type { JointChanges, JointSplit, JointSummary } from '../../api/types';

export type JointPart = 'contribution' | 'spend' | 'leave';

const PER_PAYMENT = [20_000, 30_000, 50_000, 75_000, 80_000, 100_000, 150_000, 200_000];
const PER_DAY = [50_000, 100_000, 150_000, 200_000, 300_000, 500_000];
const EXPIRY = [24, 48, 72];
const DAYS = [1, 5, 15, 25, 26, 28];
const NOTICE = [0, 7, 14, 30, 60, 90];

const TITLES: Record<JointPart, string> = { contribution: 'Contributions', spend: 'Spend alone', leave: 'If one leaves' };

/**
 * WAL-19 "Edit" on Contributions, Spend alone or If one leaves, and INV-O1
 * "Suggest a change": the new values, sent as only what changed. `viewerIsPartner`
 * maps "your amount" to the partner's share.
 */
export function JointChangeSheet({
  part,
  joint,
  viewerIsPartner,
  otherName,
  submitTitle,
  onSubmit,
  onClose,
}: {
  part: JointPart | null;
  joint: JointSummary;
  viewerIsPartner: boolean;
  otherName: string;
  submitTitle: string;
  onSubmit: (changes: JointChanges) => void;
  onClose: () => void;
}) {
  const yoursNow = Number(viewerIsPartner ? joint.contribution.partner : joint.contribution.mine);
  const theirsNow = Number(viewerIsPartner ? joint.contribution.mine : joint.contribution.partner);
  const [yours, setYours] = useState(String(yoursNow));
  const [theirs, setTheirs] = useState(String(theirsNow));
  const [day, setDay] = useState(joint.contribution.day);
  const [perPayment, setPerPayment] = useState(Number(joint.limits.per_payment));
  const [perDay, setPerDay] = useState(Number(joint.limits.per_day));
  const [expiry, setExpiry] = useState(joint.expiry_hours);
  const [split, setSplit] = useState<JointSplit>(joint.leave.split);
  const [notice, setNotice] = useState(joint.leave.notice_days);

  // Start from the rules as they are each time it opens.
  useEffect(() => {
    if (!part) return;
    setYours(String(yoursNow));
    setTheirs(String(theirsNow));
    setDay(joint.contribution.day);
    setPerPayment(Number(joint.limits.per_payment));
    setPerDay(Number(joint.limits.per_day));
    setExpiry(joint.expiry_hours);
    setSplit(joint.leave.split);
    setNotice(joint.leave.notice_days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part]);

  const changes: JointChanges = {};
  if (part === 'contribution') {
    const [mine, partner] = viewerIsPartner ? [theirs, yours] : [yours, theirs];
    if (Number(mine) !== Number(joint.contribution.mine)) changes.mine = mine || '0';
    if (Number(partner) !== Number(joint.contribution.partner)) changes.partner = partner || '0';
    if (day !== joint.contribution.day) changes.day = day;
  } else if (part === 'spend') {
    if (perPayment !== Number(joint.limits.per_payment)) changes.per_payment = String(perPayment);
    if (perDay !== Number(joint.limits.per_day)) changes.per_day = String(perDay);
    if (expiry !== joint.expiry_hours) changes.expiry_hours = expiry;
  } else if (part === 'leave') {
    if (split !== joint.leave.split) changes.split = split;
    if (notice !== joint.leave.notice_days) changes.notice_days = notice;
  }
  const changed = Object.keys(changes).length > 0;
  const tooLow = part === 'spend' && perDay < perPayment;

  return (
    <PtSheet
      visible={part !== null}
      title={part ? TITLES[part] : ''}
      subtitle={`${otherName} agrees first. Nothing changes until they do.`}
      onClose={onClose}
      footer={<PtButton title={submitTitle} disabled={!changed || tooLow} onPress={() => onSubmit(changes)} />}
    >
      {part === 'contribution' ? (
        <View style={{ gap: 12 }}>
          <PtField label="You put in each month" prefix="₦" value={groupAmountInput(yours)} onChangeText={(t) => setYours(sanitizeAmountInput(t))} keyboardType="decimal-pad" placeholder="0" />
          <PtField label={`${otherName} puts in each month`} prefix="₦" value={groupAmountInput(theirs)} onChangeText={(t) => setTheirs(sanitizeAmountInput(t))} keyboardType="decimal-pad" placeholder="0" />
          <PtGroupLabel>Pay in on</PtGroupLabel>
          <PtPills options={DAYS.map((d) => ({ value: d, label: `The ${ordinal(d)}` }))} value={day} onChange={setDay} />
        </View>
      ) : null}
      {part === 'spend' ? (
        <View style={{ gap: 12 }}>
          <PtGroupLabel>Per payment, alone</PtGroupLabel>
          <PtPills options={PER_PAYMENT.map((v) => ({ value: v, label: formatNaira(v) }))} value={perPayment} onChange={setPerPayment} />
          <PtGroupLabel>Alone, each day</PtGroupLabel>
          <PtPills options={PER_DAY.map((v) => ({ value: v, label: formatNaira(v) }))} value={perDay} onChange={setPerDay} />
          <PtGroupLabel>Above that, the other person has</PtGroupLabel>
          <PtPills options={EXPIRY.map((v) => ({ value: v, label: `${v} hours` }))} value={expiry} onChange={setExpiry} />
        </View>
      ) : null}
      {part === 'leave' ? (
        <View style={{ gap: 10 }}>
          {JOINT_SPLITS.map((s) => (
            <PtChoiceCard key={s.value} title={s.title} subtitle={s.subtitle} selected={split === s.value} onPress={() => setSplit(s.value)} />
          ))}
          <PtGroupLabel>Notice to leave</PtGroupLabel>
          <PtPills options={NOTICE.map((d) => ({ value: d, label: d === 0 ? 'None' : `${d} days` }))} value={notice} onChange={setNotice} />
        </View>
      ) : null}
    </PtSheet>
  );
}
