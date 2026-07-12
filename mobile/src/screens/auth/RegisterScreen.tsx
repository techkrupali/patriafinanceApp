import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { PinPad } from '../../components/PinPad';
import { ErrorText } from '../../components/ErrorText';
import { useRegister } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import type { AuthScreenProps } from '../../navigation/types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\d{10,15}$/;

function ProgressBar({ step }: { step: 1 | 2 | 3 }) {
  return (
    <View className="px-6 pt-2">
      <View className="flex-row" style={{ gap: 6 }}>
        {[1, 2, 3].map((s) => (
          <View
            key={s}
            className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-brand' : 'bg-lav'}`}
            style={s <= step ? { backgroundColor: s === step ? '#006c49' : '#4edea3' } : undefined}
          />
        ))}
      </View>
      <Text className="mt-2 text-[11px] font-bold tracking-widest text-muted">STEP {step}/3</Text>
    </View>
  );
}

export function RegisterScreen({ navigation }: AuthScreenProps<'Register'>) {
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
  const register = useRegister();
  const setPendingToken = useAuth((s) => s.setPendingToken);

  const back = () => {
    setError(null);
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
      if (next.length === 4) {
        setConfirming(true);
      }
    } else {
      setPinConfirm(next);
      if (next.length === 4) {
        if (next === pin) {
          setStep(3);
        } else {
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
          navigation.navigate('Otp', {
            identifier: data.user.email,
            purpose: 'verify',
            sentTo: data.otp_sent_to,
            debugOtp: data.debug_otp,
          });
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <Screen withBottomInset>
      <View className="flex-row items-center px-5 py-3">
        <Pressable
          onPress={back}
          className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-white active:opacity-70"
        >
          <Text className="text-xl text-ink">‹</Text>
        </Pressable>
        <Text className="text-lg font-bold text-ink">Create account</Text>
      </View>

      <ProgressBar step={step} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 ? (
            <>
              <Text className="text-2xl font-bold text-ink">Personal Details</Text>
              <Text className="mt-1.5 text-sm text-muted">Tell us a little about yourself.</Text>
              <Card className="mt-5 p-5">
                <Input label="First name" value={firstName} onChangeText={setFirstName} placeholder="Ada" />
                <Input label="Last name" value={lastName} onChangeText={setLastName} placeholder="Obi" className="mt-4" />
                <Input
                  label="Phone number"
                  value={phone}
                  onChangeText={(t) => setPhone(t.replace(/[^0-9]/g, ''))}
                  placeholder="08012345678"
                  keyboardType="number-pad"
                  maxLength={15}
                  className="mt-4"
                />
                <Input
                  label="Email address"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  className="mt-4"
                />
                <ErrorText message={error} className="mt-3" />
                <Button title="Continue" onPress={continueStep1} className="mt-5" />
              </Card>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text className="text-2xl font-bold text-ink">Secure Your Vault</Text>
              <Text className="mt-1.5 text-sm text-muted">
                {confirming
                  ? 'Confirm your 4-digit transaction PIN.'
                  : 'Create a 4-digit PIN to authorize transactions.'}
              </Text>
              <ErrorText message={error} className="mt-3" />
              <View className="mt-8">
                <PinPad value={confirming ? pinConfirm : pin} onChange={onPinChange} />
              </View>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Text className="text-2xl font-bold text-ink">Set a password</Text>
              <Text className="mt-1.5 text-sm text-muted">
                At least 8 characters. You will use this to sign in.
              </Text>
              <Card className="mt-5 p-5">
                <Input
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                />
                <Input
                  label="Confirm password"
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  placeholder="••••••••"
                  secureTextEntry
                  className="mt-4"
                />
                <ErrorText message={error} className="mt-3" />
                <Button
                  title="Create Account"
                  onPress={submit}
                  loading={register.isPending}
                  className="mt-5"
                />
              </Card>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
