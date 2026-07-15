import React, { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { colors, gradients, shadow } from '../../theme';
import { useProjects } from '../../api/hooks';
import { formatMoney } from '../../lib/format';
import { selection } from '../../lib/haptics';
import { projectRoleLabel, projectStatusVisual } from '../../lib/projects';
import type { Project } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

function RoleBadge({ role }: { role: 'owner' | 'vendor' }) {
  const owner = role === 'owner';
  return (
    <View className={`flex-row items-center rounded-full px-2.5 py-1 ${owner ? 'bg-navy' : 'bg-lav'}`}>
      <Ionicons
        name={owner ? 'person-circle-outline' : 'construct-outline'}
        size={12}
        color={owner ? colors.brandGlow : colors.navy}
        style={{ marginRight: 4 }}
      />
      <Text className={`text-[10px] font-bold uppercase tracking-wider ${owner ? 'text-white' : 'text-navy'}`}>
        {projectRoleLabel(role)}
      </Text>
    </View>
  );
}

function ProjectCard({ project, onPress }: { project: Project; onPress: () => void }) {
  const status = projectStatusVisual(project.status);
  const total = project.milestones_total;
  const released = project.milestones_released;
  const pct = total > 0 ? (released / total) * 100 : 0;

  const subtitle =
    project.my_role === 'owner'
      ? project.vendor
        ? `Vendor · ${project.vendor.name}`
        : 'No vendor assigned yet'
      : project.owner
        ? `Owner · ${project.owner.name}`
        : 'Project';

  return (
    <Pressable
      onPress={() => {
        selection();
        onPress();
      }}
      className="rounded-3xl bg-white p-4 active:opacity-90"
      style={shadow.soft}
    >
      <View className="flex-row items-center">
        <View className="mr-3.5 h-11 w-11 items-center justify-center rounded-2xl bg-lav">
          <Ionicons name="briefcase-outline" size={22} color={colors.navy} />
        </View>
        <View className="flex-1 pr-2">
          <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
            {project.title}
          </Text>
          <Text className="mt-0.5 text-xs text-faded" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-[15px] font-extrabold text-ink">{formatMoney(project.wallet_balance)}</Text>
          <Text className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-faded">In escrow</Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-center justify-between">
        <View className="flex-row items-center" style={{ gap: 6 }}>
          {project.my_role ? <RoleBadge role={project.my_role} /> : null}
          <View className={`flex-row items-center rounded-full px-2.5 py-1 ${status.bg}`}>
            <Ionicons name={status.icon} size={12} color={colors.muted} style={{ marginRight: 4 }} />
            <Text className={`text-[10px] font-bold uppercase tracking-wider ${status.text}`}>{status.label}</Text>
          </View>
        </View>
        <Text className="text-xs font-semibold text-muted">
          {released}/{total} released
        </Text>
      </View>

      {total > 0 ? (
        <View className="mt-3 h-2 overflow-hidden rounded-full bg-lav-faint">
          <View className="h-2 rounded-full bg-brand" style={{ width: `${Math.max(pct, 2)}%` }} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function ProjectsScreen({ navigation }: RootScreenProps<'Projects'>) {
  const query = useProjects();
  const projects = query.data ?? [];

  const escrowTotal = useMemo(
    () => projects.reduce((sum, p) => sum + parseFloat(p.wallet_balance || '0'), 0),
    [projects],
  );

  return (
    <Screen withBottomInset>
      <Header title="Projects" />

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.navy} />
        }
      >
        {query.isLoading ? (
          <View className="items-center py-24">
            <ActivityIndicator size="large" color={colors.navy} />
          </View>
        ) : query.error ? (
          <LoadError message={(query.error as Error).message} onRetry={() => query.refetch()} />
        ) : (
          <>
            {/* Escrow summary hero */}
            <LinearGradient
              colors={gradients.navy}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[{ borderRadius: 28, padding: 24 }, shadow.hero]}
            >
              <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                Held in escrow
              </Text>
              <Text className="mt-2 text-[38px] font-extrabold leading-tight tracking-tight text-white">
                {formatMoney(escrowTotal)}
              </Text>
              <View className="mt-4 flex-row items-center">
                <Ionicons name="briefcase-outline" size={15} color={colors.brandGlow} style={{ marginRight: 6 }} />
                <Text className="text-[13px] text-white/70">
                  {projects.length} project{projects.length === 1 ? '' : 's'} · milestone-backed payments
                </Text>
              </View>
            </LinearGradient>

            {/* New project CTA */}
            <View className="mt-5">
              <Button
                title="New project"
                icon="add"
                iconPosition="left"
                onPress={() => navigation.navigate('CreateProject')}
              />
            </View>

            {/* Projects list */}
            <Text className="mt-8 text-lg font-bold text-ink">Your projects</Text>
            <View className="mt-3" style={{ gap: 12 }}>
              {projects.length === 0 ? (
                <EmptyState
                  title="No projects yet"
                  message="Create a project to fund an escrow wallet and pay a vendor as they hit milestones."
                  icon="briefcase-outline"
                />
              ) : (
                projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    onPress={() => navigation.navigate('ProjectDetail', { projectId: p.id })}
                  />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
