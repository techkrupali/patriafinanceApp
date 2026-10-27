import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtField } from '../../components/pt/PtField';
import { PtButton } from '../../components/pt/PtButton';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { useOnboardingCopy } from '../../lib/onboardingCopy';
import { formatYmd } from '../../lib/format';
import type { AuthScreenProps } from '../../navigation/types';
import { SIGNUP_STEPS } from './PhoneScreen';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADULT_AGE = 18;

/** ONB-05 "About you": name as on the BVN, email for statements, date of birth. */
export function DetailsScreen({ route, navigation }: AuthScreenProps<'Details'>) {
  const { phoneToken, serverErrors } = route.params;
  const copy = useOnboardingCopy();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState<string | null>(null);
  const [dobOpen, setDobOpen] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; dob?: string }>({});
  const lastRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);

  // The PIN step sends us back here when the server rejects a detail.
  useEffect(() => {
    if (serverErrors) setErrors(serverErrors);
  }, [serverErrors]);

  const thisYear = new Date().getFullYear();

  const submit = () => {
    const next: typeof errors = {};
    if (!first.trim() || !last.trim()) next.name = copy.details.nameRequired;
    if (!EMAIL_RE.test(email.trim())) next.email = copy.details.emailInvalid;
    if (!dob) next.dob = copy.details.dobRequired;
    setErrors(next);
    if (Object.keys(next).length || !dob) return;

    navigation.navigate('CreatePin', {
      phoneToken,
      details: {
        first_name: first.trim(),
        last_name: last.trim(),
        email: email.trim().toLowerCase(),
        date_of_birth: dob,
      },
    });
  };

  return (
    <PtStepScreen
      onBack={() => navigation.goBack()}
      step={copy.step(3, SIGNUP_STEPS)}
      title={copy.details.title}
      subtitle={copy.details.subtitle}
      gap={20}
      footer={<PtButton title={copy.continue} onPress={submit} />}
    >
      <View style={{ gap: 16 }}>
        <PtField
          label={copy.details.first}
          value={first}
          onChangeText={setFirst}
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          returnKeyType="next"
          onSubmitEditing={() => lastRef.current?.focus()}
          error={errors.name && (!first.trim() || serverErrors?.name) ? errors.name : null}
        />
        <PtField
          ref={lastRef}
          label={copy.details.last}
          value={last}
          onChangeText={setLast}
          autoCapitalize="words"
          autoComplete="family-name"
          textContentType="familyName"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          error={errors.name && first.trim() && !last.trim() ? errors.name : null}
        />
        <PtField
          ref={emailRef}
          label={copy.details.email}
          hint={copy.details.emailHint}
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
          }}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          error={errors.email}
        />
        <PtField
          label={copy.details.dob}
          value={dob ? formatYmd(dob) : ''}
          placeholder={copy.details.dobPlaceholder}
          onPressBox={() => setDobOpen(true)}
          error={errors.dob}
        />
      </View>

      <PtDateSheet
        visible={dobOpen}
        title={copy.details.dob}
        value={dob}
        maxYear={thisYear - ADULT_AGE}
        minYear={thisYear - 100}
        doneLabel={copy.continue}
        onDone={(ymd) => {
          setDob(ymd);
          setErrors((e) => ({ ...e, dob: undefined }));
          setDobOpen(false);
        }}
        onClose={() => setDobOpen(false)}
      />
    </PtStepScreen>
  );
}
