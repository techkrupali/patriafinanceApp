import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../components/Screen';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { PinPad } from '../../components/PinPad';
import { ErrorText } from '../../components/ErrorText';
import { colors, gradients, shadow } from '../../theme';
import { useRegister } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { getBiometricSupport, runBiometricPrompt, saveTxnPin, type BiometricSupport } from '../../lib/biometrics';
import { notifyError, selection } from '../../lib/haptics';
import type { AuthScreenProps } from '../../navigation/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\d{10,15}$/;

interface OtpParams {
  identifier: string;
  purpose: 'verify';
  sentTo?: string;
  debugOtp?: string;
}

function ProgressBar({ step }: { step: 1 | 2 | 3 }) {
  return (
    <View className="px-6 pt-1">
      <View className="h-2 overflow-hidden rounded-full bg-lav">
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ height: '100%', width: `${(step / 3) * 100}%`, borderRadius: 999 }}
        />
      </View>
      <Text className="mt-2 text-[11px] font-bold uppercase tracking-widest text-muted">Step {step} / 3</Text>
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
      {/* Custom header preserves step-back behaviour */}
      <View className="flex-row items-center px-5 py-3" style={{ minHeight: 56 }}>
        <Pressable
          onPress={back}
          hitSlop={8}
          className="mr-3 h-11 w-11 items-center justify-center rounded-2xl bg-white active:opacity-70"
          style={shadow.soft}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text className="text-lg font-bold text-ink">
          {phase === 'biometric' ? 'Almost done' : 'Create account'}
        </Text>
      </View>

      {phase === 'form' ? <ProgressBar step={step} /> : null}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
          {phase === 'form' && step === 1 ? (
            <>
              <Text className="text-3xl font-extrabold tracking-tight text-ink">Personal details</Text>
              <Text className="mt-2 text-[15px] text-muted">Tell us a little about yourself.</Text>
              <View className="mt-6" style={{ gap: 16 }}>
                <Input label="First name" icon="person-outline" value={firstName} onChangeText={setFirstName} placeholder="Ada" />
                <Input label="Last name" icon="person-outline" value={lastName} onChangeText={setLastName} placeholder="Obi" />
                <Input
                  label="Phone number"
                  icon="call-outline"
                  value={phone}
                  onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ''))}
                  placeholder="08012345678"
                  keyboardType="number-pad"
                  maxLength={15}
                />
                <Input
                  label="Email address"
                  icon="mail-outline"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>
              <ErrorText message={error} className="mt-4" />
              <Button title="Continue" icon="arrow-forward" onPress={continueStep1} className="mt-6" />
            </>
          ) : null}

          {phase === 'form' && step === 2 ? (
            <>
              <View className="items-center">
                <View className="h-14 w-14 items-center justify-center rounded-3xl bg-navy" style={shadow.card}>
                  <Ionicons name="shield-checkmark" size={26} color={colors.brandGlow} />
                </View>
                <Text className="mt-4 text-3xl font-extrabold tracking-tight text-ink">Secure your vault</Text>
                <Text className="mt-2 text-center text-[15px] text-muted">
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
              <Text className="text-3xl font-extrabold tracking-tight text-ink">Set a password</Text>
              <Text className="mt-2 text-[15px] text-muted">
                At least 8 characters. You will use this to sign in.
              </Text>
              <View className="mt-6" style={{ gap: 16 }}>
                <Input
                  label="Password"
                  icon="lock-closed-outline"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Create a password"
                  secureTextEntry
                />
                <Input
                  label="Confirm password"
                  icon="lock-closed-outline"
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  placeholder="Re-enter your password"
                  secureTextEntry
                />
              </View>
              <ErrorText message={error} className="mt-4" />
              <Button
                title="Create Account"
                icon="checkmark"
                onPress={submit}
                loading={register.isPending}
                className="mt-6"
              />
            </>
          ) : null}

          {phase === 'biometric' ? (
            <View className="items-center pt-6">
              <View className="h-24 w-24 items-center justify-center rounded-full bg-success-soft">
                <Ionicons name={support?.icon ?? 'finger-print'} size={46} color={colors.brand} />
              </View>
              <Text className="mt-6 text-center text-3xl font-extrabold tracking-tight text-ink">
                Enable {support?.label}?
              </Text>
              <Text className="mt-3 text-center text-[15px] leading-6 text-muted">
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
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
