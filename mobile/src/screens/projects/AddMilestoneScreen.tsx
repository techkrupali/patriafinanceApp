import React, { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { LoadError } from '../../components/LoadError';
import { colors } from '../../theme';
import { useAddMilestone, useProject } from '../../api/hooks';
import { formatMoney, groupAmountInput, sanitizeAmountInput } from '../../lib/format';
import type { RootScreenProps } from '../../navigation/types';

export function AddMilestoneScreen({ navigation, route }: RootScreenProps<'AddMilestone'>) {
  const { projectId } = route.params;
  const query = useProject(projectId);
  const add = useAddMilestone(projectId);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const dueDateValid = !dueDate || /^\d{4}-\d{2}-\d{2}$/.test(dueDate);

  const available = parseFloat(query.data?.project.available ?? query.data?.available ?? '0');
  const amountNum = parseFloat(amount);
  const overAvailable = Number.isFinite(amountNum) && amountNum > available + 0.001;
  const amountOk = Number.isFinite(amountNum) && amountNum > 0 && !overAvailable;
  const canAdd = Boolean(title.trim() && amountOk && dueDateValid);

  const submit = () => {
    setError(null);
    if (!title.trim()) {
      setError('Give this milestone a title.');
      return;
    }
    if (!amountOk) {
      setError(overAvailable ? `Amount exceeds the ${formatMoney(available)} available in escrow.` : 'Enter a valid amount.');
      return;
    }
    if (!dueDateValid) {
      setError('Enter the due date as YYYY-MM-DD, or leave it empty.');
      return;
    }
    add.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        amount,
        due_date: dueDate || undefined,
      },
      {
        onSuccess: () => navigation.goBack(),
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="Add milestone" />

      {query.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : query.error ? (
        <LoadError message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : (
        <KeyboardAwareScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 24, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
        >
            <Text className="text-[15px] leading-5 text-muted">
              A milestone reserves part of the escrow. It stays locked until you approve the vendor’s work, then
              pays out automatically.
            </Text>

            {/* Amount */}
            <Text className="mt-7 text-[13px] font-semibold text-muted">Amount</Text>
            <View className="mt-2 items-center rounded bg-lav-faint py-7">
              <View className="flex-row items-center justify-center">
                <Text className="text-4xl font-extrabold text-faded">₦</Text>
                <TextInput
                  value={groupAmountInput(amount)}
                  onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
                  placeholder="0.00"
                  placeholderTextColor={colors.faded}
                  keyboardType="decimal-pad"
                  className="ml-1 min-w-[120px] text-center text-5xl font-extrabold text-ink"
                />
              </View>
              <Text className={`mt-2 text-xs ${overAvailable ? 'font-semibold text-danger' : 'text-faded'}`}>
                {overAvailable
                  ? `Only ${formatMoney(available)} available in escrow`
                  : `${formatMoney(available)} available in escrow`}
              </Text>
            </View>

            <Input
              label="Milestone Title"
              icon="flag-outline"
              value={title}
              onChangeText={setTitle}
              placeholder="Phase 1 — demolition"
              maxLength={100}
              containerClassName="mt-7"
            />

            <Input
              label="Description (Optional)"
              icon="document-text-outline"
              value={description}
              onChangeText={setDescription}
              placeholder="What must the vendor deliver?"
              maxLength={300}
              containerClassName="mt-5"
            />

            <Input
              label="Due Date (Optional)"
              icon="calendar-outline"
              value={dueDate}
              onChangeText={(t) => setDueDate(t.replace(/[^0-9-]/g, '').slice(0, 10))}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              containerClassName="mt-5"
            />

            <ErrorText message={error} className="mt-4" />

            <Button
              title="Add milestone"
              icon="checkmark"
              onPress={submit}
              loading={add.isPending}
              disabled={!canAdd}
              className="mt-6"
            />
        </KeyboardAwareScrollView>
      )}
    </Screen>
  );
}
