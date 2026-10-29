import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { useProjects } from '../../api/hooks';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtChip } from '../../components/pt/PtChip';
import { PtPills } from '../../components/pt/PtForm';
import { PtText } from '../../components/pt/PtText';
import { LoadingBlock, ProgressLine } from '../../components/project/ProjectUi';
import { formatNaira } from '../../lib/format';
import { isVendorSide, projectChip, townOf } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import type { Project } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type Filter = 'all' | 'in_progress' | 'saving' | 'done';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function matches(p: Project, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'done') return p.phase === 'done';
  if (f === 'saving') return p.phase === 'saving' || p.phase === 'planning';
  return p.phase === 'in_progress' || p.phase === 'to_review';
}

/** "Nsukka · Adeyemi Builders", "Starts Nov · Adeyemi Builders". */
function subline(p: Project): string {
  const start = p.setup?.starts_on ? new Date(p.setup.starts_on) : null;
  const future = start && start.getTime() > Date.now();
  const where = future ? `Starts ${MONTHS[start.getMonth()]}` : townOf(p.setup?.location) || (p.setup?.kind ? p.setup.kind[0].toUpperCase() + p.setup.kind.slice(1) : 'Project');
  const who = p.vendor?.name ?? (p.vendor_status === 'declined' ? 'Builder needed' : p.setup?.vendor_invite ? 'Builder invited' : 'No builder yet');
  return `${where} · ${who}`;
}

/** "₦3,000,000 of ₦6,800,000 paid" once work has been paid, "₦1,200,000 saved of ₦19,425,000" before. */
function moneyLine(p: Project): { value: number; max: number; text: string } {
  const done = Number(p.done_amount);
  const total = Number(p.plan_total) || Number(p.budget);
  if (done > 0 || p.phase === 'in_progress' || p.phase === 'to_review' || p.phase === 'done') {
    return { value: done, max: total, text: `${formatNaira(done)} of ${formatNaira(total)} paid` };
  }
  const target = Number(p.target) || total;
  return { value: Number(p.in_wallet), max: target, text: `${formatNaira(p.in_wallet)} saved of ${formatNaira(target)}` };
}

/** PRJ-01 Projects: each project's chip, progress and money; a builder's projects open their own view. */
export function ProjectsScreen({ navigation }: RootScreenProps<'Projects'>) {
  const query = useProjects();
  const [filter, setFilter] = useState<Filter>('all');
  const projects = query.data ?? [];
  const shown = projects.filter((p) => matches(p, filter));

  const open = (p: Project) => {
    if (isVendorSide(p.my_role)) {
      navigation.navigate(p.vendor_status === 'invited' || p.vendor_status === 'changes_proposed' ? 'ProjectInvite' : 'VendorProject', { projectId: p.id });
      return;
    }
    navigation.navigate('ProjectDetail', { projectId: p.id });
  };

  return (
    <PtPageScreen
      title="Projects"
      subtitle={query.data ? `${projects.length} project${projects.length === 1 ? '' : 's'}` : null}
      onBack={() => navigation.goBack()}
      right={
        <Pressable onPress={() => { selection(); navigation.navigate('ProjectWalletSetup'); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="New project">
          <Feather name="plus" size={24} color={pt.ink} />
        </Pressable>
      }
      footer={<PtButton title="Start a project" onPress={() => navigation.navigate('ProjectWalletSetup')} />}
      gap={12}
    >
      <PtPills
        options={[
          { value: 'all', label: 'All' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'saving', label: 'Saving' },
          { value: 'done', label: 'Done' },
        ]}
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
        compact
      />
      {query.isLoading || query.error ? (
        <LoadingBlock error={query.error ? (query.error as Error).message : null} onRetry={() => void query.refetch()} />
      ) : shown.length === 0 ? (
        <View style={{ paddingVertical: 40, alignItems: 'center', gap: 6 }}>
          <PtText variant="subtitle">{projects.length === 0 ? 'No projects yet' : 'Nothing here'}</PtText>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center' }}>
            {projects.length === 0 ? 'Save for a build or an event, and pay the builder by milestone.' : 'Try another filter.'}
          </PtText>
        </View>
      ) : (
        shown.map((p) => {
          const chip = projectChip(p);
          const money = moneyLine(p);
          return (
            <Pressable
              key={p.id}
              onPress={() => { selection(); open(p); }}
              accessibilityRole="button"
              accessibilityLabel={p.title}
              style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 16, gap: 10 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }} numberOfLines={1}>
                    {isVendorSide(p.my_role) ? `${p.family ?? 'Family'} · you're the builder` : subline(p)}
                  </Text>
                </View>
                <PtChip label={chip.label} tone={chip.tone} icon={chip.icon} />
              </View>
              <ProgressLine value={money.value} max={money.max} />
              <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{money.text}</Text>
            </Pressable>
          );
        })
      )}
    </PtPageScreen>
  );
}
