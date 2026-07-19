import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { Screen } from '../../components/Screen';
import { Header } from '../../components/Header';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { LoadError } from '../../components/LoadError';
import { colors, gradients, shadow } from '../../theme';
import { useReferrals, useApplyReferral } from '../../api/hooks';
import { formatMoney, dayLabel } from '../../lib/format';
import { selection, notifySuccess } from '../../lib/haptics';
import type { RootScreenProps } from '../../navigation/types';

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View className="flex-1 rounded-2xl bg-white p-4" style={shadow.soft}>
      <Text className="text-[22px] font-extrabold leading-tight text-ink" numberOfLines={1}>
        {value}
      </Text>
      <Text className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">{label}</Text>
    </View>
  );
}

export function ReferralScreen(_props: RootScreenProps<'Referral'>) {
  const q = useReferrals();
  const apply = useApplyReferral();
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const data = q.data;

  const copy = async () => {
    if (!data?.code) return;
    selection();
    await Clipboard.setStringAsync(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const share = async () => {
    if (!data) return;
    selection();
    try {
      await Share.share({
        message: `Join me on Patriai — smart family finance. Use my code ${data.code} when you sign up: ${data.share_url}`,
      });
    } catch {
      // user dismissed the share sheet — no-op
    }
  };

  const submitCode = () => {
    setApplyError(null);
    if (!code.trim()) {
      setApplyError('Enter a referral code.');
      return;
    }
    apply.mutate(
      { code: code.trim().toUpperCase() },
      {
        onSuccess: () => {
          notifySuccess();
          setApplied(true);
          setCode('');
        },
        onError: (e) => setApplyError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <Header title="Refer & earn" />

      {q.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.navy} />
        </View>
      ) : q.error || !data ? (
        <LoadError message={(q.error as Error)?.message} onRetry={q.refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.navy} />
          }
        >
          {/* Rewards hero */}
          <LinearGradient
            colors={gradients.navy}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[{ borderRadius: 28, padding: 24 }, shadow.hero]}
          >
            <View className="flex-row items-center">
              <View className="mr-2.5 h-8 w-8 items-center justify-center rounded-xl bg-white/15">
                <Ionicons name="gift" size={16} color={colors.gold} />
              </View>
              <Text className="text-[11px] font-bold uppercase tracking-widest text-white/60">
                Rewards earned
              </Text>
            </View>
            <Text className="mt-3 text-[40px] font-extrabold leading-tight tracking-tight text-white">
              {formatMoney(data.stats.rewards_earned)}
            </Text>
            <Text className="mt-1 text-[13px] text-white/70">
              Earn {formatMoney(data.stats.reward_per_referral)} for every friend who joins and verifies.
            </Text>
          </LinearGradient>

          {/* Referral code */}
          <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">Your code</Text>
          <Card className="mt-3 items-center py-6">
            <Text className="text-[30px] font-extrabold tracking-[6px] text-ink">{data.code}</Text>
            <View className="mt-4 flex-row" style={{ gap: 10 }}>
              <Pressable
                onPress={() => void copy()}
                className="flex-row items-center rounded-full bg-lav px-5 py-2.5 active:opacity-80"
              >
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy-outline'}
                  size={16}
                  color={copied ? colors.brand : colors.navy}
                  style={{ marginRight: 6 }}
                />
                <Text className="text-[13px] font-bold text-navy">{copied ? 'Copied' : 'Copy'}</Text>
              </Pressable>
              <Pressable
                onPress={() => void share()}
                className="flex-row items-center rounded-full bg-navy px-5 py-2.5 active:opacity-90"
                style={shadow.soft}
              >
                <Ionicons name="share-social-outline" size={16} color={colors.white} style={{ marginRight: 6 }} />
                <Text className="text-[13px] font-bold text-white">Share</Text>
              </Pressable>
            </View>
          </Card>

          {/* Stats */}
          <View className="mt-4 flex-row" style={{ gap: 10 }}>
            <Stat value={data.stats.total_referred} label="Referred" />
            <Stat value={data.stats.verified_referred} label="Verified" />
            <Stat value={formatMoney(data.stats.rewards_earned)} label="Earned" />
          </View>

          {/* Apply a code */}
          {!applied ? (
            <>
              <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">
                Have a friend's code?
              </Text>
              <Card className="mt-3">
                <Input
                  label="Referral code"
                  icon="ticket-outline"
                  value={code}
                  onChangeText={(t) => setCode(t.toUpperCase())}
                  placeholder="ABCD123"
                  autoCapitalize="characters"
                  maxLength={16}
                />
                <ErrorText message={applyError} className="mt-3" />
                <Button
                  title="Apply code"
                  icon="checkmark"
                  onPress={submitCode}
                  loading={apply.isPending}
                  className="mt-4"
                />
                <Text className="mt-2 text-center text-[12px] text-faded">
                  You can only apply one code, and not your own.
                </Text>
              </Card>
            </>
          ) : (
            <View className="mt-6 flex-row items-center rounded-2xl bg-success-soft p-4">
              <Ionicons name="checkmark-circle" size={20} color={colors.brand} style={{ marginRight: 10 }} />
              <Text className="flex-1 text-[14px] font-semibold text-brand">
                Referral code applied — welcome aboard!
              </Text>
            </View>
          )}

          {/* Referred people */}
          <Text className="mt-7 text-[11px] font-bold uppercase tracking-wider text-muted">
            People you've referred
          </Text>
          {data.referred.length > 0 ? (
            <Card className="mt-3 py-1">
              {data.referred.map((p, i) => (
                <View key={`${p.name}-${i}`}>
                  <View className="flex-row items-center py-3">
                    <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-lav-soft">
                      <Ionicons name="person" size={18} color={colors.navy} />
                    </View>
                    <View className="flex-1 pr-2">
                      <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text className="text-xs text-faded">Joined {dayLabel(p.joined_at)}</Text>
                    </View>
                    <View
                      className={`flex-row items-center rounded-full px-2.5 py-1 ${
                        p.verified ? 'bg-success-soft' : 'bg-lav-faint'
                      }`}
                    >
                      <Ionicons
                        name={p.verified ? 'shield-checkmark' : 'hourglass-outline'}
                        size={12}
                        color={p.verified ? colors.brand : colors.muted}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        className={`text-[10px] font-bold uppercase tracking-wider ${
                          p.verified ? 'text-brand' : 'text-muted'
                        }`}
                      >
                        {p.verified ? 'Verified' : 'Pending'}
                      </Text>
                    </View>
                  </View>
                  {i < data.referred.length - 1 ? (
                    <View style={{ height: 1, backgroundColor: colors.border }} />
                  ) : null}
                </View>
              ))}
            </Card>
          ) : (
            <Card className="mt-3 items-center py-8">
              <View className="mb-3 h-14 w-14 items-center justify-center rounded-3xl bg-lav-soft">
                <Ionicons name="people-outline" size={24} color={colors.navy} />
              </View>
              <Text className="text-base font-bold text-ink">No referrals yet</Text>
              <Text className="mt-1 text-center text-sm text-muted">
                Share your code — you'll earn {formatMoney(data.stats.reward_per_referral)} for each friend who verifies.
              </Text>
            </Card>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
