import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pt, ptFont, ptRadius } from '../../theme';
import { useChats, type ChatRow } from '../../api/chats';
import { PtBackButton } from '../../components/pt/PtStepScreen';
import { PtNote, PtPanel, PtPills } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { clockTime } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

type Filter = 'all' | 'projects' | 'vendors' | 'family';

/** "4:12 pm" today, "Mon" this week, "28 Oct" before that. */
function when(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return clockTime(iso);
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * CHT-01 Chats: every project's chat, direct chats with builders and family,
 * and groups — All · Projects · Vendors · Family, newest first, with unread.
 */
export function ChatsScreen({ navigation }: RootScreenProps<'Chats'>) {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('all');
  const q = useChats(filter);
  const rows = q.data ?? [];

  const open = (r: ChatRow) => {
    selection();
    if (r.type === 'project') navigation.navigate('ProjectChat', { projectId: r.id });
    else navigation.navigate('Conversation', { conversationId: r.id });
  };

  return (
    <View style={{ flex: 1, backgroundColor: pt.surface, paddingTop: insets.top + 4 }}>
      <StatusBar style="dark" />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 56 }}>
        {navigation.canGoBack() ? <PtBackButton onPress={() => navigation.goBack()} /> : null}
        <Text style={{ flex: 1, fontFamily: ptFont.extrabold, fontSize: 30, letterSpacing: -0.6, color: pt.ink, paddingLeft: 8 }} accessibilityRole="header">
          Chats
        </Text>
        <Pressable onPress={() => { selection(); navigation.navigate('NewChat'); }} accessibilityRole="button" style={{ backgroundColor: pt.brandSoft, borderRadius: ptRadius.sm, paddingHorizontal: 16, paddingVertical: 10, marginRight: 8 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>New chat</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom + 32, gap: 16 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={pt.brand} />}
      >
        <PtPills
          options={[
            { value: 'all', label: 'All' },
            { value: 'projects', label: 'Projects' },
            { value: 'vendors', label: 'Vendors' },
            { value: 'family', label: 'Family' },
          ]}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
        />
        {q.isLoading ? (
          <ActivityIndicator color={pt.brand} style={{ marginTop: 40 }} />
        ) : q.error ? (
          <LoadError message={(q.error as Error).message} onRetry={() => void q.refetch()} />
        ) : rows.length === 0 ? (
          <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted, textAlign: 'center', paddingVertical: 30 }}>
            {filter === 'all' ? 'No chats yet. Start one with your family or a builder.' : 'Nothing here yet.'}
          </Text>
        ) : (
          <PtPanel>
            {rows.map((r, i) => (
              <Pressable key={`${r.type}-${r.id}`} onPress={() => open(r)} accessibilityRole="button" accessibilityLabel={`${r.title}. ${r.last}${r.unread ? `. ${r.unread} unread` : ''}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                  {r.initials ? (
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: pt.gold100, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: '#8F5400' }}>{r.initials}</Text>
                    </View>
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: ptRadius.sm, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name={r.type === 'project' ? 'tool' : 'users'} size={20} color={pt.brand} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }} numberOfLines={1}>{r.title}</Text>
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }} numberOfLines={1}>{r.last}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{when(r.at)}</Text>
                    {r.unread ? (
                      <View style={{ minWidth: 22, height: 22, borderRadius: 11, backgroundColor: r.muted ? pt.sunken : pt.gold500, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                        <Text style={{ fontFamily: ptFont.bold, fontSize: 12, color: pt.emerald900 }}>{r.unread}</Text>
                      </View>
                    ) : r.muted ? (
                      <Feather name="bell-off" size={14} color={pt.inkSubtle} />
                    ) : null}
                  </View>
                </View>
              </Pressable>
            ))}
          </PtPanel>
        )}
        <PtNote tone="info" icon="lock">Chats about money are kept with the project as a record. Nobody can delete messages once a milestone is paid.</PtNote>
      </ScrollView>
    </View>
  );
}
