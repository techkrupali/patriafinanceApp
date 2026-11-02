import React from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtTabScreen } from '../../components/pt/PtTabScreen';
import { PtChip } from '../../components/pt/PtChip';
import { PtPanel } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { useChildTasks, useTaskDone, type ChildTask } from '../../api/child';
import { pickFile } from '../../lib/upload';
import { formatNaira, parseYmd } from '../../lib/format';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';

/** "By Friday" · "Saturday" · "Last Sunday" */
function when(t: ChildTask): string {
  if (t.status === 'paid' && t.paid_at) return `Paid ${new Date(t.paid_at).toLocaleDateString('en-GB', { weekday: 'long' })}`;
  if (t.status === 'submitted') return `Photo sent · ${t.by ?? 'a parent'} will check`;
  const d = parseYmd(t.due_on);
  return d ? `By ${d.toLocaleDateString('en-GB', { weekday: 'long' })}` : t.repeat_weekly ? 'Every week' : 'Any time';
}

/** CHD-07 Tasks: earn money by helping out — "4 weeks in a row of tasks done", each task and "Done". */
export function ChildTasksScreen() {
  const q = useChildTasks();
  const done = useTaskDone();
  const d = q.data;

  const finish = async (t: ChildTask) => {
    selection();
    // A photo straight from the camera on a phone; from files on the web.
    const photo = t.needs_photo ? await pickFile(Platform.OS === 'web' ? 'library' : 'camera').catch(() => null) : null;
    if (t.needs_photo && !photo) return showAlert('Add a photo', `${t.by ?? 'A parent'} asked for a photo of it done.`);
    done.mutate({ id: t.id, photo }, { onSuccess: () => notifySuccess(), onError: (e) => showAlert('Not sent', e.message) });
  };

  return (
    <PtTabScreen title="Tasks" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Text style={{ marginTop: -10, fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted }}>Earn money by helping out</Text>
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : !d ? (
        <LoadError message={(q.error as Error | null)?.message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          {d.streak > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: pt.gold100, borderRadius: ptRadius.md, padding: 18 }}>
              <Text style={{ fontFamily: ptFont.extrabold, fontSize: 34, color: pt.ink }}>{d.streak}</Text>
              <Text style={{ flex: 1, fontFamily: ptFont.regular, fontSize: 15, lineHeight: 21, color: pt.ink }}>
                {`${d.streak === 1 ? 'week' : 'weeks in a row'} of tasks done. `}
                <Text style={{ fontFamily: ptFont.bold }}>Keep going!</Text>
              </Text>
            </View>
          ) : null}
          {d.tasks.length === 0 ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted, textAlign: 'center', paddingVertical: 20 }}>No tasks yet. A parent can set one for you.</Text>
          ) : (
            <PtPanel>
              {d.tasks.map((t, i) => (
                <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: i === d.tasks.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
                  <View style={{ width: 44, height: 44, borderRadius: ptRadius.sm, backgroundColor: pt.gold100, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="star" size={20} color="#8F5400" />
                  </View>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.ink }}>{t.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {t.status === 'paid' ? <PtChip label="Paid" tone="success" icon="check" /> : t.status === 'submitted' ? <PtChip label="Check" tone="warning" icon="clock" /> : <PtChip label="To do" tone="neutral" icon="circle" />}
                      <Text style={{ flexShrink: 1, fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }}>{when(t)}</Text>
                    </View>
                    {t.note && t.status === 'todo' ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: '#8F5400' }}>{`"${t.note}"`}</Text> : null}
                    {t.status === 'todo' ? (
                      <Pressable onPress={() => void finish(t)} accessibilityRole="button" style={{ alignSelf: 'flex-start' }} hitSlop={6}>
                        <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>{t.needs_photo ? 'Done · add a photo' : 'Done'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <Text style={{ fontFamily: ptFont.bold, fontSize: 16, color: pt.brand }}>{`+${formatNaira(t.reward)}`}</Text>
                </View>
              ))}
            </PtPanel>
          )}
        </>
      )}
    </PtTabScreen>
  );
}
