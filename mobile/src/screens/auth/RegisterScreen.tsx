import React, { useEffect, useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/Screen';
import { Button } from '../../components/Button';
import { PinPad } from '../../components/PinPad';
import { ErrorText } from '../../components/ErrorText';
import { colors, shadow } from '../../theme';
import { useRegister } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { getBiometricSupport, runBiometricPrompt, saveTxnPin, type BiometricSupport } from '../../lib/biometrics';
import { notifyError, selection } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';

/**
 * Stitch "Create Account" (step 2 of 8): gold back arrow, centered title,
 * "STEP X OF N" + % over segmented gold progress bars, extrabold headline,
 * sentence-case semibold labels with tonal-fill inputs (12px radius, gold
 * focus), green lock trust line, gold CTA and the "Log in" alternative action.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\d{10,15}$/;

interface OtpParams {
  identifier: string;
  purpose: 'verify';
  sentTo?: string;
  debugOtp?: string;
}

/** Design-system field: sentence-case label, tonal fill, 12px radius, gold focus. */
function Field({
  label,
  secure,
  ...rest
}: TextInputProps & { label: string; secure?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);

  return (
    <View className="w-full">
      <Text className="mb-2 ml-1 text-sm font-semibold" style={{ color: '#4E4632' }}>
        {label}
      </Text>
      <View
        className="w-full flex-row items-center rounded-xl px-4"
        style={{
          minHeight: 54,
          backgroundColor: focused ? colors.white : colors.lavSoft, // surface-container-high
          borderWidth: 1.5,
          borderColor: focused ? colors.goldDeep : 'transparent',
        }}
      >
        <TextInput
          placeholderTextColor="#80765F"
          selectionColor={colors.goldDeep}
          cursorColor={colors.goldDeep}
          secureTextEntry={secure && !reveal}
          className="flex-1 py-3.5 text-base"
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[{ color: colors.ink, fontWeight: '500' }, rest.style]}
        />
        {secure ? (
          <Pressable onPress={() => setReveal((r) => !r)} hitSlop={10} className="pl-2">
            <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Segmented progress: "STEP X OF 3" + % over three pill bars (gold fill). */
function ProgressBar({ step }: { step: 1 | 2 | 3 }) {
  const pct = Math.round((step / 3) * 100);
  return (
    <View className="px-6 pt-2">
      <View className="mb-2 flex-row items-center justify-between">
        <Text
          className="text-[11px] font-medium uppercase"
          style={{ color: '#4B637E', letterSpacing: 1 }}
        >
          Step {step} of 3
        </Text>
        <Text className="text-[11px] font-bold" style={{ color: '#4B637E' }}>
          {pct}%
        </Text>
      </View>
      <View className="flex-row" style={{ gap: 6, height: 6 }}>
        {([1, 2, 3] as const).map((i) => (
          <View
            key={i}
            className="flex-1 rounded-full"
            style={{ backgroundColor: i <= step ? colors.goldDeep : colors.lav }}
          />
        ))}
      </View>
    </View>
  );
}

/** Tonal gold icon badge (primary-container/20 with gold glyph, per design). */
function IconBadge({ name }: { name: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <View
      className="h-20 w-20 items-center justify-center rounded-2xl"
      style={{ backgroundColor: 'rgba(255,204,0,0.18)' }}
    >
      <Ionicons name={name} size={38} color="#FFCC00" />
    </View>
  );
}

export function RegisterScreen({ navigation }: AuthScreenProps<'Register'>) {
  const [phase, setPhase] = useState<'form' | 'biometric'>('form');
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Step 2
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [confirming, setConfirming] = useState(false);

  // Step 3
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [support, setSupport] = useState<BiometricSupport | null>(null);
  const [bioBusy, setBioBusy] = useState(false);
  const [otpParams, setOtpParams] = useState<OtpParams | null>(null);

  const register = useRegister();
  const setPendingToken = useAuth((s) => s.setPendingToken);
  const setBiometricEnabled = useAuth((s) => s.setBiometricEnabled);

  useEffect(() => {
    void getBiometricSupport().then(setSupport);
  }, []);

  const goToOtp = (params?: OtpParams) => {
    const p = params ?? otpParams;
    if (p) navigation.navigate('Otp', p);
  };

  const back = () => {
    selection();
    setError(null);
    if (phase === 'biometric') {
      goToOtp();
      return;
    }
    if (step === 1) {
      navigation.goBack();
    } else if (step === 2) {
      setPin('');
      setPinConfirm('');
      setConfirming(false);
      setStep(1);
    } else {
      setStep(2);
    }
  };

  const continueStep1 = () => {
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter your first and last name.');
      return;
    }
    if (!PHONE_RE.test(phone.trim())) {
      setError('Phone number must be 10–15 digits.');
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setStep(2);
  };

  const onPinChange = (next: string) => {
    setError(null);
    if (!confirming) {
      setPin(next);
      if (next.length === 4) setConfirming(true);
    } else {
      setPinConfirm(next);
      if (next.length === 4) {
        if (next === pin) {
          setStep(3);
        } else {
          notifyError();
          setError('PINs do not match. Try again.');
          setPin('');
          setPinConfirm('');
          setConfirming(false);
        }
      }
    }
  };

  const submit = () => {
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Passwords do not match.');
      return;
    }
    register.mutate(
      {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
        pin,
      },
      {
        onSuccess: async (data) => {
          // Keep the token but stay guest until the email OTP is verified.
          await setPendingToken(data.token, data.user);
          const params: OtpParams = {
            identifier: data.user.email,
            purpose: 'verify',
            sentTo: data.otp_sent_to,
            debugOtp: data.debug_otp,
          };
          setOtpParams(params);
          if (support?.available) {
            setPhase('biometric');
          } else {
            goToOtp(params);
          }
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  const enableBiometric = async () => {
    setError(null);
    setBioBusy(true);
    try {
      const ok = await runBiometricPrompt(`Confirm to enable ${support?.label ?? 'biometrics'}`);
      if (ok) {
        // Cache the PIN behind the keychain so biometrics can authorize payments.
        await saveTxnPin(pin);
        await setBiometricEnabled(true);
        goToOtp();
      } else {
        setError('Could not confirm. You can enable this later in Profile.');
      }
    } finally {
      setBioBusy(false);
    }
  };

  return (
    <Screen withBottomInset>
      {/* Top bar: gold back arrow + centered title (design's fixed header) */}
      <View className="flex-row items-center px-5 py-2" style={{ minHeight: 56 }}>
        <View className="w-10">
          <Pressable
            onPress={back}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
          >
            <Ionicons name="arrow-back" size={22} color={colors.goldDeep} />
          </Pressable>
        </View>
        <Text className="flex-1 text-center text-lg font-bold text-ink">
          {phase === 'biometric' ? 'Almost Done' : 'Create Account'}
        </Text>
        <View className="w-10" />
      </View>

      {phase === 'form' ? <ProgressBar step={step} /> : null}

      <KeyboardAwareScrollView className="flex-1" contentContainerStyle={{ padding: 24, flexGrow: 1 }}>
        {phase === 'form' && step === 1 ? (
          <>
            <Text className="mt-4 text-3xl font-extrabold tracking-tight text-ink">
              Create Your Account
            </Text>
            <Text className="mt-3 text-base font-medium leading-6 text-muted">
              Tell us a little about yourself.
            </Text>

            <View className="mt-8" style={{ gap: 20 }}>
              <Field label="First name" value={firstName} onChangeText={setFirstName} placeholder="Ada" />
              <Field label="Last name" value={lastName} onChangeText={setLastName} placeholder="Obi" />
              <Field
                label="Phone number"
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ''))}
                placeholder="Enter your phone number"
                keyboardType="number-pad"
                maxLength={15}
              />
              <Field
                label="Email address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            {/* Trust reinforcement */}
            <View className="flex-row items-center justify-center py-2" style={{ gap: 8, marginTop: 20 }}>
              <Ionicons name="lock-closed" size={15} color={colors.brand} />
              <Text className="text-[13px] font-medium" style={{ color: '#4B637E' }}>
                Your information is secure and encrypted
              </Text>
            </View>

            <ErrorText message={error} className="mt-2" />
            <Button title="Continue" onPress={continueStep1} className="mt-4" />

            <View className="mt-6 flex-row justify-center">
              <Text className="text-[15px] font-medium text-muted">Already have an account? </Text>
              <Pressable
                onPress={() => {
                  selection();
                  navigation.navigate('Login');
                }}
                hitSlop={6}
              >
                <Text className="text-[15px] font-bold" style={{ color: colors.goldDeep }}>
                  Log in
                </Text>
              </Pressable>
            </View>

            <Text className="mt-auto pt-10 text-center text-xs leading-5" style={{ color: 'rgba(73,96,124,0.7)' }}>
              By continuing, you agree to our <Text className="font-medium underline">Terms</Text> &{' '}
              <Text className="font-medium underline">Privacy Policy</Text>
            </Text>
          </>
        ) : null}

        {phase === 'form' && step === 2 ? (
          <>
            <View className="items-center pt-2">
              <IconBadge name="shield-checkmark" />
              <Text className="mt-6 text-center text-3xl font-extrabold tracking-tight text-ink">
                Secure Your Vault
              </Text>
              <Text className="mt-3 text-center text-base font-medium leading-6 text-muted">
                {confirming
                  ? 'Confirm your 4-digit transaction PIN.'
                  : 'Create a 4-digit PIN to authorize transactions.'}
              </Text>
            </View>
            <ErrorText message={error} className="mt-4" />
            <View className="mt-8">
              <PinPad value={confirming ? pinConfirm : pin} onChange={onPinChange} />
            </View>
          </>
        ) : null}

        {phase === 'form' && step === 3 ? (
          <>
            <Text className="mt-4 text-3xl font-extrabold tracking-tight text-ink">Set a Password</Text>
            <Text className="mt-3 text-base font-medium leading-6 text-muted">
              At least 8 characters. You will use this to sign in.
            </Text>

            <View className="mt-8" style={{ gap: 20 }}>
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Create a password"
                secure
              />
              <Field
                label="Confirm password"
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                placeholder="Re-enter your password"
                secure
              />
            </View>

            <View className="flex-row items-center justify-center py-2" style={{ gap: 8, marginTop: 20 }}>
              <Ionicons name="lock-closed" size={15} color={colors.brand} />
              <Text className="text-[13px] font-medium" style={{ color: '#4B637E' }}>
                Your information is secure and encrypted
              </Text>
            </View>

            <ErrorText message={error} className="mt-2" />
            <Button
              title="Create Account"
              onPress={submit}
              loading={register.isPending}
              className="mt-4"
            />
          </>
        ) : null}

        {phase === 'biometric' ? (
          <View className="items-center pt-6">
            <View
              className="h-24 w-24 items-center justify-center rounded-full bg-success-soft"
              style={shadow.soft}
            >
              <Ionicons name={support?.icon ?? 'finger-print'} size={46} color={colors.brand} />
            </View>
            <Text className="mt-6 text-center text-3xl font-extrabold tracking-tight text-ink">
              Enable {support?.label}?
            </Text>
            <Text className="mt-3 text-center text-base font-medium leading-6 text-muted">
              Unlock Patriai and authorize payments with {support?.label} instead of typing your PIN
              every time. You can change this anytime in Profile.
            </Text>

            <View className="mt-8 w-full" style={{ gap: 12 }}>
              <Button
                title={`Enable ${support?.label}`}
                icon={support?.icon}
                iconPosition="left"
                onPress={() => void enableBiometric()}
                loading={bioBusy}
              />
              <Button title="Maybe later" variant="ghost" onPress={() => goToOtp()} />
            </View>
            <ErrorText message={error} className="mt-4" />
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  );
}
