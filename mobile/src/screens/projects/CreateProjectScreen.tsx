import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { colors } from '../../theme';
import { useCreateProject } from '../../api/hooks';
import type { RootScreenProps } from '../../navigation/types';

function InfoRow({ icon, title, body }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string }) {
  return (
    <View className="flex-row items-start">
      <View className="mr-3 h-9 w-9 items-center justify-center rounded-2xl bg-white">
        <Ionicons name={icon} size={18} color={colors.navy} />
      </View>
      <View className="flex-1">
        <Text className="text-[14px] font-bold text-ink">{title}</Text>
        <Text className="mt-0.5 text-[13px] leading-5 text-muted">{body}</Text>
      </View>
    </View>
  );
}

export function CreateProjectScreen({ navigation }: RootScreenProps<'CreateProject'>) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateProject();

  const submit = () => {
    setError(null);
    if (!title.trim()) {
      setError('Give your project a title.');
      return;
    }
    create.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        budget: budget.trim() ? budget.trim() : undefined,
      },
      {
        onSuccess: (data) => navigation.replace('ProjectDetail', { projectId: data.project.id }),
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="New project" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingTop: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* How escrow works */}
          <View className="rounded-3xl bg-lav-faint p-5" style={{ gap: 16 }}>
            <InfoRow
              icon="lock-closed-outline"
              title="A dedicated escrow wallet"
              body="Creating a project opens its own wallet. Fund it, and the money is held safely until work is done."
            />
            <InfoRow
              icon="flag-outline"
              title="Pay against milestones"
              body="Break the work into milestones. Each reserves part of the escrow and pays your vendor only when you approve it."
            />
          </View>

          <Input
            label="Project title"
            icon="briefcase-outline"
            value={title}
            onChangeText={setTitle}
            placeholder="Office fit-out"
            maxLength={100}
            containerClassName="mt-6"
          />

          <Input
            label="Description (optional)"
            icon="document-text-outline"
            value={description}
            onChangeText={setDescription}
            placeholder="What's this project about?"
            maxLength={300}
            containerClassName="mt-5"
          />

          <Input
            label="Budget (optional)"
            icon="cash-outline"
            value={budget}
            onChangeText={(t) => setBudget(t.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            keyboardType="decimal-pad"
            containerClassName="mt-5"
          />
          <Text className="mt-2 text-[12px] leading-4 text-faded">
            A budget is just a target — you fund the escrow wallet separately after the project is created.
          </Text>

          <ErrorText message={error} className="mt-4" />

          <Button title="Create project" icon="checkmark" onPress={submit} loading={create.isPending} className="mt-6" />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
