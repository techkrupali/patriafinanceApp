import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { pt, ptFont } from '../../theme';
import { PtTabScreen } from '../../components/pt/PtTabScreen';
import { PtPanel } from '../../components/pt/PtForm';
import { useNotifications } from '../../api/hooks';

/** The child's notifications: pocket money landed, a gift, a task paid, a note. */
export function ChildNotificationsScreen() {
  const navigation = useNavigation();
  const q = useNotifications();
  const list = q.data?.pages.flatMap((p) => p.notifications) ?? [];
  return (
    <PtTabScreen title="Notifications" onBack={() => navigation.goBack()} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {q.isLoading ? (
        <ActivityIndicator color={pt.brand} />
      ) : list.length === 0 ? (
        <Text style={{ fontFamily: ptFont.regular, fontSize: 15, color: pt.inkMuted, textAlign: 'center', paddingVertical: 20 }}>Nothing yet.</Text>
      ) : (
        <PtPanel>
          {list.map((n, i) => (
            <View key={n.id} style={{ paddingVertical: 12, gap: 2, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: pt.line }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{n.title}</Text>
              {n.body ? <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted }}>{n.body}</Text> : null}
            </View>
          ))}
        </PtPanel>
      )}
    </PtTabScreen>
  );
}
