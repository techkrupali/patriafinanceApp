import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { selection, notifySuccess } from '../../lib/haptics';
import type { DisputeCategory } from '../../api/types';
import { useRaiseDispute } from '../../api/hooks';
import type { RootScreenProps } from '../../navigation/types';

const CATEGORIES: { value: DisputeCategory; label: string }[] = [
  { value: 'transaction', label: 'Transaction' },
  { value: 'project', label: 'Project' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'account', label: 'Account' },
  { value: 'other', label: 'Other' },
];

export function RaiseDisputeScreen({ navigation, route }: RootScreenProps<'RaiseDispute'>) {
  const prefillCategory = route.params?.category as DisputeCategory | undefined;
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<DisputeCategory>(prefillCategory ?? 'transaction');
  const [reference, setReference] = useState(route.params?.reference ?? '');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const raise = useRaiseDispute();

  const submit = () => {
    setError(null);
    if (subject.trim().length < 4) {
      setError('Please add a short subject (at least 4 characters).');
      return;
    }
    if (description.trim().length < 10) {
      setError('Please describe what happened in a little more detail.');
      return;
    }
    raise.mutate(
      {
        subject: subject.trim(),
        category,
        reference: reference.trim() || null,
        description: description.trim(),
      },
      {
        onSuccess: () => {
          notifySuccess();
          navigation.goBack();
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="Raise a dispute" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-[15px] leading-5 text-muted">
          Tell us what went wrong. Include a reference if you have one — it helps us resolve faster.
        </Text>

        <Input
          label="Subject"
          icon="pricetag-outline"
          value={subject}
          onChangeText={setSubject}
          placeholder="e.g. Transfer not received"
          maxLength={150}
          containerClassName="mt-6"
        />

        <Text className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Category
        </Text>
        <View className="mt-2 flex-row flex-wrap" style={{ gap: 8 }}>
          {CATEGORIES.map((c) => {
            const active = category === c.value;
            return (
              <Pressable
                key={c.value}
                onPress={() => {
                  selection();
                  setCategory(c.value);
                }}
                className={`rounded-full px-4 py-2.5 active:opacity-90 ${
                  active ? 'bg-navy' : 'bg-lav'
                }`}
              >
                <Text
                  className={`text-[13px] font-semibold ${active ? 'text-white' : 'text-ink'}`}
                >
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Input
          label="Reference (optional)"
          icon="barcode-outline"
          value={reference}
          onChangeText={setReference}
          placeholder="Transaction ref or project ID"
          autoCapitalize="characters"
          containerClassName="mt-6"
        />

        <Input
          label="What happened?"
          icon="document-text-outline"
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the problem in detail…"
          multiline
          numberOfLines={5}
          maxLength={2000}
          style={{ minHeight: 120, textAlignVertical: 'top' }}
          containerClassName="mt-6"
        />

        <ErrorText message={error} className="mt-4" />

        <Button
          title="Submit dispute"
          icon="send"
          onPress={submit}
          loading={raise.isPending}
          className="mt-6"
        />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
