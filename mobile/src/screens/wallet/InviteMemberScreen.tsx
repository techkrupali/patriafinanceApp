import React, { useState } from 'react';
import { Alert, Linking, Platform, Switch, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { PhoneInput } from '../../components/PhoneInput';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { SuccessReceipt } from '../../components/SuccessReceipt';
import { colors, shadow } from '../../theme';
import { useCreateInvitation, useWallets } from '../../api/hooks';
import { ROLE_OPTIONS, roleLabel } from '../../lib/governance';
import { DEFAULT_COUNTRY, toE164, isValidE164, type Country } from '../../lib/phone';
import { selection } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

type Channel = 'email' | 'sms' | 'whatsapp';

const CHANNELS: { key: Channel; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'email', label: 'Email', icon: 'mail-outline' },
  { key: 'sms', label: 'SMS', icon: 'chatbubble-outline' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp' },
];

export function InviteMemberScreen({ navigation, route }: RootScreenProps<'InviteMember'>) {
  const { walletId } = route.params;
  const wallets = useWallets();
  const walletName = (wallets.data ?? []).find((w) => w.id === walletId)?.name;

  const [channel, setChannel] = useState<Channel>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phoneNational, setPhoneNational] = useState('');
  const [role, setRole] = useState<string>('contributor');
  const [canApprove, setCanApprove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const invite = useCreateInvitation(walletId);

  const isPhone = channel !== 'email';
  const identifier = isPhone ? toE164(phoneCountry.dial, phoneNational) : email.trim().toLowerCase();

  /** Prefilled invite text for SMS / WhatsApp hand-off. */
  const inviteMessage = () =>
    `Hi${name.trim() ? ` ${name.trim()}` : ''}! I've invited you to join ${walletName ? `"${walletName}"` : 'my shared wallet'} on Patriai ` +
    `as a ${roleLabel(role)}. Download Patriai and sign up with this ${
      channel === 'whatsapp' ? 'WhatsApp number' : channel === 'sms' ? 'number' : 'email'
    } to accept.`;

  /** Open the device SMS / WhatsApp composer prefilled with the invite. */
  const openMessenger = async () => {
    const msg = encodeURIComponent(inviteMessage());
    // openURL (unlike canOpenURL) needs no iOS query-scheme declaration.
    if (channel === 'whatsapp') {
      const digits = identifier.replace(/\D/g, ''); // intl, no '+'
      try {
        await Linking.openURL(`whatsapp://send?phone=${digits}&text=${msg}`);
      } catch {
        Alert.alert(
          'WhatsApp not found',
          'The invitation is saved. Install WhatsApp to send the message, or share it another way.',
        );
      }
      return;
    }
    // SMS: iOS separates the body with '&', Android with '?'
    const sep = Platform.OS === 'ios' ? '&' : '?';
    try {
      await Linking.openURL(`sms:${identifier}${sep}body=${msg}`);
    } catch {
      // No SMS app available (e.g. tablet) — the in-app invitation still stands.
    }
  };

  const submit = () => {
    setError(null);
    if (channel === 'email') {
      if (!email.trim()) {
        setError('Enter an email address to invite.');
        return;
      }
    } else if (!isValidE164(identifier)) {
      setError('Enter a valid phone number for the selected country.');
      return;
    }
    invite.mutate(
      { identifier, role, can_approve: canApprove },
      {
        onSuccess: async () => {
          if (isPhone) await openMessenger();
          setSent(true);
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  if (sent) {
    const channelLabel = CHANNELS.find((c) => c.key === channel)?.label ?? 'Invite';
    return (
      <Screen withBottomInset>
        <SuccessReceipt
          title="Invitation sent"
          subtitle={
            isPhone
              ? `${identifier} will see this invite when they open Patriai. We also opened ${channelLabel} so you can message them.`
              : `${identifier} will see this invite when they open Patriai.`
          }
          rows={[
            { label: 'Invited', value: identifier },
            { label: 'Via', value: channelLabel },
            { label: 'Role', value: roleLabel(role) },
            { label: 'Can approve', value: canApprove ? 'Yes' : 'No' },
          ]}
          onDone={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  return (
    <Screen withBottomInset>
      <Header title="Invite member" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-[15px] leading-5 text-muted">
          Invite someone by email, SMS or WhatsApp. They'll get a pending invitation to accept in Patriai.
        </Text>

        <Input
          label="Name (optional)"
          icon="person-outline"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Ada"
          maxLength={100}
          containerClassName="mt-6"
        />

        {/* Channel selector */}
        <View className="mt-6 flex-row rounded-2xl bg-page-top p-1" style={{ gap: 4 }}>
          {CHANNELS.map((c) => {
            const active = channel === c.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => {
                  selection();
                  setChannel(c.key);
                  setError(null);
                }}
                className="flex-1 flex-row items-center justify-center rounded-xl py-2.5"
                style={active ? [{ backgroundColor: colors.white }, shadow.soft] : undefined}
              >
                <Ionicons
                  name={c.icon}
                  size={15}
                  color={active ? colors.goldDeep : colors.muted}
                  style={{ marginRight: 5 }}
                />
                <Text
                  className={`text-[13px] ${active ? 'font-bold' : 'font-medium'}`}
                  style={{ color: active ? colors.goldDeep : colors.muted }}
                >
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {channel === 'email' ? (
          <Input
            label="Email address"
            icon="at-outline"
            value={email}
            onChangeText={setEmail}
            placeholder="them@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            containerClassName="mt-5"
          />
        ) : (
          <View className="mt-5">
            <PhoneInput
              label={channel === 'whatsapp' ? 'WhatsApp number' : 'Phone number'}
              country={phoneCountry}
              onChangeCountry={setPhoneCountry}
              value={phoneNational}
              onChangeText={setPhoneNational}
            />
          </View>
        )}

        <Text className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-muted">Role</Text>
        <View className="mt-2" style={{ gap: 10 }}>
          {ROLE_OPTIONS.map((r) => {
            const active = role === r.value;
            return (
              <Pressable
                key={r.value}
                onPress={() => {
                  selection();
                  setRole(r.value);
                }}
                className={`flex-row items-center rounded-2xl border p-4 active:opacity-90 ${
                  active ? 'border-brand bg-success-soft' : 'border-border bg-white'
                }`}
              >
                <View className="flex-1 pr-2">
                  <Text className="text-[15px] font-bold text-ink">{r.label}</Text>
                  <Text className="mt-0.5 text-[13px] text-muted">{r.hint}</Text>
                </View>
                <Ionicons
                  name={active ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={active ? colors.brand : colors.faded}
                />
              </Pressable>
            );
          })}
        </View>

        <View className="mt-5 flex-row items-center rounded-2xl bg-lav-faint p-4">
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.navy} style={{ marginRight: 10 }} />
          <View className="flex-1 pr-2">
            <Text className="text-[15px] font-semibold text-ink">Can approve spends</Text>
            <Text className="mt-0.5 text-[13px] text-muted">
              Let this member approve withdrawals & transfers that need sign-off.
            </Text>
          </View>
          <Switch
            value={canApprove}
            onValueChange={setCanApprove}
            trackColor={{ false: colors.border, true: colors.brand }}
            thumbColor={colors.white}
          />
        </View>

        <ErrorText message={error} className="mt-4" />

        <Button
          title={channel === 'email' ? 'Send invitation' : `Invite via ${CHANNELS.find((c) => c.key === channel)?.label}`}
          icon={channel === 'whatsapp' ? 'logo-whatsapp' : 'paper-plane'}
          onPress={submit}
          loading={invite.isPending}
          className="mt-6"
        />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
