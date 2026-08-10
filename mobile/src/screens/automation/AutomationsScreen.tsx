import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadError } from '../../components/LoadError';
import { AutomationCard } from '../../components/AutomationCard';
import { colors, shadow } from '../../theme';
import { useAutomations } from '../../api/hooks';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

export function AutomationsScreen({ navigation, route }: RootScreenProps<'Automations'>) {
  // Hosted both as the Rules tab (route 'Rules') and a stack screen ('Automations').
  const isTab = route?.name !== 'Automations';
  const { data, isLoading, error, refetch, isRefetching } = useAutomations();
  const rules = data ?? [];

  const addAction = (
    <Pressable
      onPress={() => {
        selection();
        navigation.navigate('CreateAutomation');
      }}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-2xl bg-white active:opacity-70"
      style={shadow.soft}
    >
      <Ionicons name="add" size={24} color={colors.navy} />
    </Pressable>
  );

  return (
    <Screen withBottomInset>
      <Header title="Rules" right={addAction} showBack={!isTab} />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : error ? (
        <LoadError message={(error as Error).message} onRetry={refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.navy} />
          }
        >
          <Text className="text-[15px] leading-5 text-muted">
            Move money automatically on a schedule — allowances, savings, auto-funding.
          </Text>

          {rules.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon="flash-outline"
              title="No automations yet"
              message="Create a rule to move money on a schedule."
              action={
                <Button
                  title="New automation"
                  icon="add"
                  onPress={() => navigation.navigate('CreateAutomation')}
                />
              }
            />
          ) : (
            rules.map((rule) => <AutomationCard key={rule.id} rule={rule} />)
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
