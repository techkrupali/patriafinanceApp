import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtNote, PtSegmented } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { usePlans, type Plan, type PlanInterval } from '../../api/plans';
import { formatNaira } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

/**
 * PLN-01 Plans: "You're on Free", Monthly or Yearly · 2 months free, the two
 * plans side by side and what each gives — all set in admin — then "Try Pro
 * free for 30 days".
 */
export function PlansScreen({ navigation, route }: RootScreenProps<'Plans'>) {
  const q = usePlans();
  const d = q.data;
  const [interval, setInterval] = useState<PlanInterval>(route.params?.interval ?? 'yearly');

  if (q.isLoading) return <ActivityIndicator color={pt.brand} style={{ marginTop: 80 }} />;
  if (!d) return <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />;

  const current = d.plans.find((p) => p.slug === d.current) ?? d.plans[0];
  const paid = d.plans.find((p) => !p.is_free && p.active);
  const sub = d.subscription;
  const months = paid?.yearly_saves_months ?? 0;
  const status = sub ? (sub.status === 'trialing' ? `${sub.plan.name} · free trial` : sub.cancel_at_period_end ? `${sub.plan.name} · ending` : sub.plan.name) : current?.name ?? 'Free';

  const price = (p: Plan) => (p.is_free ? '₦0' : formatNaira(interval === 'yearly' ? p.yearly_price : p.monthly_price));
  const per = (p: Plan) => (p.is_free ? (p.slug === current?.slug ? 'Current plan' : 'Always free') : `a ${interval === 'yearly' ? 'year' : 'month'}${p.covers ? `, ${p.covers}` : ''}`);

  return (
    <PtPageScreen
      title="Plans"
      subtitle={`You're on ${status}`}
      onBack={() => navigation.goBack()}
      footer={
        sub ? (
          <PtButton title="Manage subscription" onPress={() => navigation.navigate('Subscription')} />
        ) : paid ? (
          <PtButton
            title={d.trial_available && paid.trial_days > 0 ? `Try ${paid.name} free for ${paid.trial_days} days` : `Upgrade to ${paid.name}`}
            onPress={() => navigation.navigate('PlanUpgrade', { plan: paid.slug, interval })}
          />
        ) : undefined
      }
    >
      {paid ? (
        <PtSegmented
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: months > 0 ? `Yearly · ${months} month${months === 1 ? '' : 's'} free` : 'Yearly' },
          ]}
          value={interval}
          onChange={setInterval}
        />
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {d.plans.map((p) => {
          const highlight = !p.is_free;
          return (
            <View
              key={p.slug}
              style={{
                flex: 1,
                borderRadius: ptRadius.sm,
                padding: 14,
                gap: 2,
                backgroundColor: highlight ? pt.brandSoft : pt.raised,
                borderWidth: highlight ? 2 : 0,
                borderColor: pt.brand,
              }}
            >
              <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: highlight ? pt.brand : pt.ink }}>{p.name}</Text>
              <Text style={{ fontFamily: ptFont.extrabold, fontSize: 22, color: pt.ink }} numberOfLines={1} adjustsFontSizeToFit>
                {p.active || p.is_free ? price(p) : 'Soon'}
              </Text>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{per(p)}</Text>
            </View>
          );
        })}
      </View>

      {d.features.length ? (
        <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 16, paddingVertical: 6 }} accessibilityLabel="What each plan gives">
          <View style={{ flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: pt.line }}>
            <View style={{ flex: 1.1 }} />
            {d.plans.map((p) => (
              <Text key={p.slug} style={{ flex: 1, textAlign: 'center', fontFamily: ptFont.semibold, fontSize: 13, color: p.is_free ? pt.ink : pt.brand }}>
                {p.name}
              </Text>
            ))}
          </View>
          {d.features.map((f, i) => (
            <View key={f.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: i === d.features.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
              <Text style={{ flex: 1.1, fontFamily: ptFont.semibold, fontSize: 14, color: pt.ink }}>{f.label}</Text>
              {d.plans.map((p) => (
                <Text
                  key={p.slug}
                  style={{ flex: 1, textAlign: 'center', fontFamily: p.is_free ? ptFont.regular : ptFont.bold, fontSize: 13, lineHeight: 18, color: p.is_free ? pt.inkMuted : pt.brand }}
                >
                  {f.values[p.slug] || '—'}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {!paid ? <PtNote tone="info">Pro is coming soon. Everything you use today stays free.</PtNote> : null}
      {sub && !sub.mine ? <PtNote tone="info">{`${sub.payer} pays for your family's ${sub.plan.name}.`}</PtNote> : null}
    </PtPageScreen>
  );
}
