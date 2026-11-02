import React from 'react';
import { Image, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtButton } from '../pt/PtButton';
import { PtChip } from '../pt/PtChip';
import { formatNaira } from '../../lib/format';
import { clockTime } from '../../lib/projects';

/** The small round face beside someone else's message (Steward gets its shield). */
function Face({ initials, steward }: { initials: string | null; steward?: boolean }) {
  return (
    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: steward ? pt.emerald900 : pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
      {steward ? <Feather name="shield" size={15} color={pt.emerald300} /> : <Text style={{ fontFamily: ptFont.bold, fontSize: 12, color: pt.brand }}>{initials ?? '?'}</Text>}
    </View>
  );
}

/**
 * CHT-03/04 one message: yours on the right; others on the left with their face,
 * name and time; Steward's answer dark green; system lines centred.
 */
export function MessageItem({
  kind,
  mine,
  name,
  initials,
  label,
  at,
  body,
  children,
}: {
  kind: string;
  mine: boolean;
  name: string | null;
  initials: string | null;
  /** "Adeyemi" after the name for the builder's side. */
  label?: string | null;
  at: string | null;
  body: string | null;
  /** A card under the text (a milestone, a proposal). */
  children?: React.ReactNode;
}) {
  if (kind === 'system') {
    return <Text style={{ alignSelf: 'center', textAlign: 'center', maxWidth: '90%', fontFamily: ptFont.medium, fontSize: 12, lineHeight: 17, color: pt.inkSubtle }}>{body}</Text>;
  }
  const steward = kind === 'steward';
  const head = [mine ? 'You' : steward ? 'Steward' : name, label, clockTime(at)].filter(Boolean).join(' · ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      {mine ? null : <Face initials={initials} steward={steward} />}
      <View style={{ maxWidth: '84%', gap: 4, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        <Text style={{ fontFamily: ptFont.medium, fontSize: 11, color: pt.inkSubtle }}>{head}</Text>
        {body ? (
          <View
            style={{
              borderRadius: ptRadius.md,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: mine ? pt.brand : steward ? pt.emerald900 : pt.raised,
              borderTopRightRadius: mine ? 4 : ptRadius.md,
              borderTopLeftRadius: mine ? ptRadius.md : 4,
            }}
          >
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 21, color: mine || steward ? '#FFFFFF' : pt.ink }}>{body}</Text>
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}

/** CHT-03 "MILESTONE SUBMITTED · 1 of 2 · Tiling and plaster · ₦1,900,000 · photos · Review and approve". */
export function MilestoneCard({
  title,
  amount,
  photos,
  more,
  approvals,
  onReview,
}: {
  title: string;
  amount: string;
  photos: { url: string; caption: string | null; video: boolean }[];
  more: number;
  approvals: string | null;
  onReview?: () => void;
}) {
  return (
    <View style={{ width: 290, maxWidth: '100%', borderRadius: ptRadius.md, borderWidth: 1.5, borderColor: pt.lineStrong, backgroundColor: pt.raised, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontFamily: ptFont.bold, fontSize: 12, letterSpacing: 0.6, color: pt.brand }}>MILESTONE SUBMITTED</Text>
        {approvals ? <PtChip label={approvals} tone="warning" icon="clock" /> : null}
      </View>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{`${title} · ${formatNaira(amount)}`}</Text>
      {photos.length ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {photos.map((p, i) => (
            <View key={i} style={{ flex: 1, aspectRatio: 1, borderRadius: ptRadius.sm, overflow: 'hidden', backgroundColor: pt.sunken, alignItems: 'center', justifyContent: 'center' }}>
              {p.video ? <Feather name="video" size={22} color={pt.brand} /> : <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />}
              {p.caption ? (
                <View style={{ position: 'absolute', left: 4, bottom: 4, backgroundColor: 'rgba(14,26,22,0.6)', borderRadius: 6, paddingHorizontal: 5 }}>
                  <Text style={{ fontFamily: ptFont.semibold, fontSize: 10, color: '#FFFFFF' }} numberOfLines={1}>{p.caption}</Text>
                </View>
              ) : null}
            </View>
          ))}
          {more > 0 ? (
            <View style={{ flex: 1, aspectRatio: 1, borderRadius: ptRadius.sm, backgroundColor: pt.sunken, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{`+${more}`}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {onReview ? <PtButton title="Review and approve" size="sm" onPress={onReview} /> : null}
    </View>
  );
}

/** CHT-04 "PROPOSAL · Boys' quarters extension · ₦4,800,000 · 4 phases · View proposal". */
export function ProposalCard({ title, total, phases, onOpen }: { title: string; total: string; phases: number; onOpen?: () => void }) {
  return (
    <View style={{ width: 290, maxWidth: '100%', borderRadius: ptRadius.md, borderWidth: 1.5, borderColor: pt.lineStrong, backgroundColor: pt.raised, padding: 14, gap: 6 }}>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 12, letterSpacing: 0.6, color: pt.brand }}>PROPOSAL</Text>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{title}</Text>
      <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{`${formatNaira(total)} · ${phases} phase${phases === 1 ? '' : 's'}`}</Text>
      {onOpen ? <PtButton title="View proposal" size="sm" variant="secondary" onPress={onOpen} /> : null}
    </View>
  );
}

/** Day headers between messages: "Today", "Yesterday", "28 Oct". */
export function dayHeader(iso: string | null, last: { day: string }): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const day = d.toDateString();
  if (day === last.day) return null;
  last.day = day;
  const diff = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
