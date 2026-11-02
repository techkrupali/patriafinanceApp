import React, { useState } from 'react';
import { Text } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtSheet } from '../../components/pt/PtSheet';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { PtPanel, PtReviewRow, PtSwitchRow } from '../../components/pt/PtForm';
import { formatNaira, formatYmd, groupAmountInput, sanitizeAmountInput, ymdMonthsFromNow } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

const LINES = [
  { key: 'hospital', name: 'Hospital and delivery', amount: 450_000 },
  { key: 'things', name: 'Baby things', amount: 250_000 },
  { key: 'omugwo', name: "Omugwo and mother's care", amount: 200_000 },
  { key: 'naming', name: 'Naming ceremony', amount: 300_000 },
];

/**
 * GOL-12 Newborn plan: the usual costs, ready to adjust, the due date, and
 * family invited with a link — then the goal wallet starts at its plan (GLW-03).
 */
export function NewbornPlanScreen({ navigation }: RootScreenProps<'NewbornPlan'>) {
  const [due, setDue] = useState(ymdMonthsFromNow(6));
  const [amounts, setAmounts] = useState<Record<string, number>>(Object.fromEntries(LINES.map((l) => [l.key, l.amount])));
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [invite, setInvite] = useState(true);
  const total = LINES.reduce((t, l) => t + (amounts[l.key] ?? 0), 0);
  const line = LINES.find((l) => l.key === editing);

  const use = () =>
    navigation.navigate('GoalWalletSetup', {
      template: {
        kind: 'baby',
        name: 'Welcoming our baby',
        forWhom: 'Hospital, baby things and the naming',
        target: String(total),
        dueDate: due,
        lines: LINES.map((l) => ({ name: l.name, amount: String(amounts[l.key] ?? 0) })),
        link: invite,
      },
    });

  return (
    <PtPageScreen title="Welcoming a baby" subtitle="Goal template" onBack={() => navigation.goBack()} footer={<PtButton title="Use this plan" disabled={total <= 0} onPress={use} />}>
      <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, lineHeight: 28, color: pt.ink }}>Get ready for the new arrival</Text>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.inkMuted }}>The usual costs, ready to adjust. Family abroad can chip in with a link.</Text>
      <PtField label="Due date" value={formatYmd(due)} onPressBox={() => setDateOpen(true)} />
      <PtPanel>
        {LINES.map((l) => (
          <PtReviewRow
            key={l.key}
            label={l.name}
            value={formatNaira(amounts[l.key] ?? 0)}
            onEdit={() => {
              setDraft(String(amounts[l.key] ?? 0));
              setEditing(l.key);
            }}
          />
        ))}
        <PtReviewRow label="Total" value={formatNaira(total)} last />
      </PtPanel>
      <PtPanel>
        <PtSwitchRow title="Invite family to contribute" subtitle="Grandparents, aunties and uncles, with a link" value={invite} onChange={setInvite} />
      </PtPanel>

      <PtSheet
        visible={editing !== null}
        title={line?.name ?? ''}
        onClose={() => setEditing(null)}
        footer={
          <PtButton
            title="Done"
            onPress={() => {
              if (editing) setAmounts((a) => ({ ...a, [editing]: Number(draft || 0) }));
              setEditing(null);
            }}
          />
        }
      >
        <PtField label="Amount" prefix="₦" value={groupAmountInput(draft)} onChangeText={(t) => setDraft(sanitizeAmountInput(t))} keyboardType="decimal-pad" placeholder="0" />
      </PtSheet>
      <PtDateSheet
        visible={dateOpen}
        title="Due date"
        value={due}
        minYear={new Date().getFullYear()}
        maxYear={new Date().getFullYear() + 2}
        doneLabel="Done"
        onDone={(ymd) => { setDue(ymd); setDateOpen(false); }}
        onClose={() => setDateOpen(false)}
      />
    </PtPageScreen>
  );
}
