import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Header } from '../../components/Header';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { ErrorText } from '../../components/ErrorText';
import { colors, gradients } from '../../theme';
import { useSubmitKyc } from '../../api/hooks';
import { selection } from '../../lib/haptics';
import {
  ID_TYPE_OPTIONS,
  SOURCE_OF_FUNDS_OPTIONS,
  tierName,
} from '../../lib/kyc';
import type {
  KycIdType,
  KycSourceOfFunds,
  KycSubmission,
  SubmitKycPayload,
} from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** On-gold content colour (Curated Ledger on-primary-container). */
const ON_GOLD = '#3D2F00';
/** Metallic gold container fill (primary-container). */
const GOLD_CONTAINER = '#FFCC00';

const TIER_INTRO: Record<number, string> = {
  1: 'Confirm your identity with your BVN, NIN and a government-issued ID.',
  2: 'Add your residential address so we can verify where you live.',
  3: 'Tell us your source of funds and what you do.',
};

const TIER_HEADLINE: Record<number, string> = {
  1: 'Verify Your Identity',
  2: 'Verify Your Address',
  3: 'Your Source of Funds',
};

interface Option<T extends string> {
  value: T;
  label: string;
  icon: IconName;
}

function SelectGrid<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: Option<T>[];
  value: T | null;
  onSelect: (v: T) => void;
}) {
  return (
    <View className="mt-3 flex-row flex-wrap justify-between">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              selection();
              onSelect(o.value);
            }}
            style={[
              { width: '48%', marginBottom: 12 },
              active ? { borderColor: GOLD_CONTAINER } : undefined,
            ]}
            className={`flex-row items-center rounded-2xl bg-white px-3 py-3 active:opacity-90 ${
              active ? 'border-2' : 'border border-border'
            }`}
          >
            <View
              className="h-9 w-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: active ? GOLD_CONTAINER : colors.lavSoft }}
            >
              <Ionicons name={o.icon} size={18} color={active ? ON_GOLD : colors.navy} />
            </View>
            <Text
              className={`ml-2.5 flex-1 text-[13px] font-bold ${active ? 'text-gold-deep' : 'text-ink'}`}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mt-6 text-[11px] font-semibold uppercase tracking-wider text-muted">{children}</Text>
  );
}

/** Onboarding-style progress strip: "Tier x of 3" + gold bar (design language). */
function TierProgress({ tier }: { tier: number }) {
  const pct = Math.round((tier / 3) * 100);
  return (
    <View className="mb-7">
      <View className="mb-2 flex-row items-end justify-between">
        <Text className="text-[11px] font-bold uppercase tracking-widest text-muted">
          Tier {tier} of 3
        </Text>
        <Text className="text-xs font-bold text-gold-deep">{pct}%</Text>
      </View>
      <View className="h-1.5 w-full overflow-hidden rounded-full bg-lav-soft">
        <View
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: GOLD_CONTAINER }}
        />
      </View>
    </View>
  );
}

export function KycSubmitScreen({ navigation, route }: RootScreenProps<'KycSubmit'>) {
  const { targetTier } = route.params;
  const submit = useSubmitKyc();

  // Tier 1 — Identity
  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const [idType, setIdType] = useState<KycIdType | null>(null);
  const [idNumber, setIdNumber] = useState('');

  // Tier 2 — Address
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');

  // Tier 3 — Source of funds
  const [source, setSource] = useState<KycSourceOfFunds | null>(null);
  const [occupation, setOccupation] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KycSubmission | null>(null);

  const isBusiness = source === 'business';

  // ---- Per-tier validity ----
  let valid = false;
  if (targetTier === 1) {
    valid = bvn.length === 11 && nin.length === 11 && idType != null && idNumber.trim().length > 0;
  } else if (targetTier === 2) {
    valid = address.trim().length > 0 && city.trim().length > 0 && stateName.trim().length > 0;
  } else if (targetTier === 3) {
    const who = isBusiness ? businessName.trim() : occupation.trim();
    valid = source != null && who.length > 0;
  }

  const onSubmit = () => {
    setError(null);
    const payload: SubmitKycPayload = { target_tier: targetTier };

    if (targetTier === 1) {
      payload.bvn = bvn;
      payload.nin = nin;
      if (idType) payload.id_type = idType;
      payload.id_number = idNumber.trim();
    } else if (targetTier === 2) {
      payload.address = address.trim();
      payload.city = city.trim();
      payload.state = stateName.trim();
    } else if (targetTier === 3) {
      if (source) payload.source_of_funds = source;
      if (isBusiness) payload.business_name = businessName.trim();
      else payload.occupation = occupation.trim();
      const income = monthlyIncome.trim();
      if (income.length > 0) payload.monthly_income = income;
    }

    submit.mutate(payload, {
      onSuccess: (data) => setResult(data.submission),
      onError: (e) => setError(e.message),
    });
  };

  // ---- Success (submitted for review) ----
  if (result) {
    return (
      <Screen withBottomInset>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}
        >
          <View className="items-center">
            <View className="h-28 w-28 items-center justify-center rounded-full bg-gold-soft">
              <LinearGradient
                colors={gradients.gold}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ height: 84, width: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="hourglass-outline" size={42} color={ON_GOLD} />
              </LinearGradient>
            </View>
            <Text className="mt-6 text-3xl font-extrabold tracking-tight text-ink">Submitted for review</Text>
            <Text className="mt-2 text-center text-sm text-muted">
              Your Tier {result.target_tier} · {tierName(result.target_tier)} verification is being reviewed.
              We'll update your tier and limits once it's approved.
            </Text>
          </View>

          <Button
            title="Back to verification"
            icon="arrow-forward"
            onPress={() => navigation.goBack()}
            className="mt-8"
          />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen withBottomInset>
      <Header title="Verify Identity" />
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
          <TierProgress tier={targetTier} />

          {/* Editorial headline (design: Verify Your Identity) */}
          <Text className="text-[30px] font-extrabold leading-9 tracking-tight text-navy">
            {TIER_HEADLINE[targetTier] ?? `Verify Tier ${targetTier}`}
          </Text>
          <Text className="mt-2.5 text-[15px] leading-6 text-muted">
            {TIER_INTRO[targetTier] ?? 'Provide the details below to verify this tier.'} This helps
            keep your account secure and unlocks all features.
          </Text>

          {/* ---- Tier 1: Identity ---- */}
          {targetTier === 1 ? (
            <>
              <Input
                label="Bank Verification Number (BVN)"
                icon="finger-print-outline"
                value={bvn}
                onChangeText={(t) => setBvn(t.replace(/[^0-9]/g, '').slice(0, 11))}
                placeholder="11-digit BVN"
                keyboardType="number-pad"
                maxLength={11}
                containerClassName="mt-7"
                error={bvn.length > 0 && bvn.length !== 11 ? 'BVN must be 11 digits' : undefined}
              />
              <Input
                label="National Identity Number (NIN)"
                icon="id-card-outline"
                value={nin}
                onChangeText={(t) => setNin(t.replace(/[^0-9]/g, '').slice(0, 11))}
                placeholder="11-digit NIN"
                keyboardType="number-pad"
                maxLength={11}
                containerClassName="mt-4"
                error={nin.length > 0 && nin.length !== 11 ? 'NIN must be 11 digits' : undefined}
              />

              <FieldLabel>ID document</FieldLabel>
              <SelectGrid options={ID_TYPE_OPTIONS} value={idType} onSelect={setIdType} />

              <Input
                label="ID number"
                icon="document-text-outline"
                value={idNumber}
                onChangeText={setIdNumber}
                placeholder="Number on the selected ID"
                autoCapitalize="characters"
                maxLength={40}
                containerClassName="mt-2"
              />
            </>
          ) : null}

          {/* ---- Tier 2: Address ---- */}
          {targetTier === 2 ? (
            <>
              <Input
                label="Residential address"
                icon="home-outline"
                value={address}
                onChangeText={setAddress}
                placeholder="Street, house number"
                maxLength={120}
                containerClassName="mt-7"
              />
              <Input
                label="City"
                icon="location-outline"
                value={city}
                onChangeText={setCity}
                placeholder="City / town"
                maxLength={60}
                containerClassName="mt-4"
              />
              <Input
                label="State"
                icon="map-outline"
                value={stateName}
                onChangeText={setStateName}
                placeholder="State"
                maxLength={60}
                containerClassName="mt-4"
              />
            </>
          ) : null}

          {/* ---- Tier 3: Source of funds ---- */}
          {targetTier === 3 ? (
            <>
              <FieldLabel>Source of funds</FieldLabel>
              <SelectGrid options={SOURCE_OF_FUNDS_OPTIONS} value={source} onSelect={setSource} />

              {isBusiness ? (
                <Input
                  label="Business name"
                  icon="storefront-outline"
                  value={businessName}
                  onChangeText={setBusinessName}
                  placeholder="Your registered business name"
                  maxLength={80}
                  containerClassName="mt-2"
                />
              ) : (
                <Input
                  label="Occupation"
                  icon="briefcase-outline"
                  value={occupation}
                  onChangeText={setOccupation}
                  placeholder="What do you do?"
                  maxLength={80}
                  containerClassName="mt-2"
                />
              )}

              <Input
                label="Monthly income (optional)"
                icon="cash-outline"
                value={monthlyIncome}
                onChangeText={(t) => setMonthlyIncome(t.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                keyboardType="decimal-pad"
                containerClassName="mt-4"
              />
            </>
          ) : null}

          {/* Security reassurance (design: encrypted + never stored) */}
          <View className="mt-7 rounded-2xl bg-page-top p-4">
            <View className="flex-row items-start">
              <Ionicons name="lock-closed" size={18} color={colors.brand} style={{ marginRight: 10, marginTop: 1 }} />
              <Text className="flex-1 text-[12px] font-semibold leading-5 text-muted">
                Your information is encrypted and securely verified.
              </Text>
            </View>
            <Text className="mt-2 text-center text-[11px] leading-4 text-faded">
              {targetTier === 1
                ? 'We do not store your BVN/NIN details'
                : 'Your details are used only to verify your identity'}
            </Text>
          </View>

          <ErrorText message={error} className="mt-5" />

          <Button
            title="Verify & Continue"
            icon="arrow-forward"
            onPress={onSubmit}
            disabled={!valid}
            loading={submit.isPending}
            className="mt-5"
          />
      </KeyboardAwareScrollView>
    </Screen>
  );
}
