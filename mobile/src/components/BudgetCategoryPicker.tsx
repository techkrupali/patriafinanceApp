import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { pt, ptFont } from '../theme';
import { PtPills } from './pt/PtForm';
import { useBudget } from '../api/hooks';
import { formatNairaK } from '../lib/format';

/**
 * "What's it for?" when paying from a spending wallet (SPD-03): its categories
 * with what's left this period — only the ones this person may spend on.
 * Renders nothing for other wallets.
 */
export function BudgetCategoryPicker({
  walletId,
  enabled,
  value,
  onChange,
  className,
}: {
  walletId: number | undefined;
  enabled: boolean;
  value: number | null;
  onChange: (id: number | null) => void;
  className?: string;
}) {
  const budget = useBudget(walletId ?? 0, enabled && Boolean(walletId));
  const b = enabled ? budget.data : undefined;
  const mine = b?.me.categories ?? null;
  const options = (b?.categories ?? []).filter((c) => !mine || mine.includes(c.id));

  // One category to choose from: it's that one. A wallet change clears it.
  useEffect(() => {
    if (options.length === 1 && value !== options[0].id) onChange(options[0].id);
    else if (value !== null && !options.some((c) => c.id === value)) onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.map((c) => c.id).join(',')]);

  if (!options.length) return null;
  return (
    <View className={className} style={{ gap: 8 }}>
      <Text style={{ fontFamily: ptFont.semibold, fontSize: 13, color: pt.inkMuted }}>What's it for?</Text>
      <PtPills
        options={options.map((c) => ({ value: c.id, label: `${c.name} · ${formatNairaK(Math.max(0, parseFloat(c.limit) - parseFloat(c.spent)))} left` }))}
        value={value}
        onChange={(id) => onChange(id)}
      />
    </View>
  );
}
