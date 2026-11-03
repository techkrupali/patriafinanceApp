import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';
import { PtStepScreen } from '../../components/pt/PtStepScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtNote } from '../../components/pt/PtForm';
import { PtText } from '../../components/pt/PtText';
import { PtRing } from '../../components/pt/PtRing';
import { PtKeypad, PtPinDots } from '../../components/pt/PtPinPad';
import { useChildLinkStart, useChildLinkStatus, useFinishChildLink } from '../../api/invites';
import { useAuth } from '../../store/auth';
import { getDeviceMeta } from '../../lib/device';
import { notifySuccess } from '../../lib/haptics';
import type { User } from '../../api/types';
import type { AuthScreenProps } from '../../navigation/types';

const PIN = 4;
const WEAK = /^(\d)\1{3}$|^(0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|3210)$/;

type Step = 'hello' | 'code' | 'waiting' | 'pin' | 'confirm' | 'welcome';
interface Welcome {
  first_name: string;
  allowance: string | null;
  goal: { name: string; percent: number; target: string; match: string | null } | null;
}

/**
 * The child's own phone (INV-CH1…CH5): "Hello! Is a grown-up with you?", the
 * code a parent shows (KMS-4821), a parent says yes on their phone (INV-CH3),
 * then a secret 4-number PIN, and "Welcome, Kamsi!".
 */
export function ChildLinkScreen({ navigation }: AuthScreenProps<'ChildLink'>) {
  const start = useChildLinkStart();
  const finishLink = useFinishChildLink();
  const setSession = useAuth((s) => s.setSession);
  const [step, setStep] = useState<Step>('hello');
  const [code, setCode] = useState('');
  const [pairing, setPairing] = useState<{ id: number; secret: string; child: string; parents: string[] } | null>(null);
  const [pin, setPin] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<{ user: User; token: string; welcome: Welcome | null } | null>(null);
  const status = useChildLinkStatus(step === 'waiting' ? pairing?.id ?? null : null, pairing?.secret ?? null);
  const clean = code.trim().toUpperCase().replace(/^([A-Z]{3})(\d{4})$/, '$1-$2');
  const looksLikeChildCode = /^[A-Z]{3}-?\d{4}$/i.test(code.trim());

  // INV-CH3: wait for "Yes, link Kamsi's phone".
  useEffect(() => {
    if (step !== 'waiting') return;
    if (status.data === 'approved') {
      setStep('pin');
      setError(null);
    } else if (status.data === 'denied' || status.data === 'expired') {
      setStep('code');
      setPairing(null);
      setError(status.data === 'denied' ? "A parent said this isn't you. Ask them to show a new code." : 'That took too long. Type the code again.');
    }
  }, [status.data, step]);

  const ask = async () => {
    setError(null);
    const device = await getDeviceMeta();
    start.mutate(
      { code: clean, device_name: device.device_name },
      {
        onSuccess: (d) => {
          setPairing({ id: d.request_id, secret: d.secret, child: d.child, parents: d.parents });
          setStep('waiting');
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  const finish = async (confirmed: string) => {
    if (!pairing) return;
    setError(null);
    const device = await getDeviceMeta();
    finishLink.mutate(
      { code: clean, pin: confirmed, device_name: device.device_name, request_id: pairing.id, secret: pairing.secret },
      {
        onSuccess: (d) => {
          notifySuccess();
          setLinked({ user: d.user, token: d.token, welcome: (d as { welcome?: Welcome }).welcome ?? null });
          setStep('welcome');
        },
        onError: (e) => {
          setValue('');
          setPin('');
          setStep('code');
          setPairing(null);
          setError(e.message);
        },
      },
    );
  };

  const onDigits = (next: string) => {
    setValue(next);
    if (next.length < PIN) return;
    if (step === 'pin') {
      if (WEAK.test(next)) {
        setError('Not your birthday, and not 1111 or 1234!');
        setValue('');
        return;
      }
      setError(null);
      setPin(next);
      setValue('');
      setStep('confirm');
      return;
    }
    if (next !== pin) {
      setError("They don't match. Try again.");
      setValue('');
      setPin('');
      setStep('pin');
      return;
    }
    void finish(next);
  };

  // ---------------------------------------------------------------- INV-CH5
  if (step === 'welcome' && linked) {
    const w = linked.welcome;
    // "Your wallet is ready. Mum sends ₦3,000 every Monday, and your goal is New bicycle."
    const rest = [w?.allowance ?? null, w?.goal ? `your goal is ${w.goal.name}` : null].filter((x): x is string => Boolean(x)).join(', and ');
    return (
      <PtStepScreen
        title={`Welcome, ${linked.user.first_name}!`}
        subtitle={rest ? `Your wallet is ready. ${rest.charAt(0).toUpperCase()}${rest.slice(1)}.` : 'Your wallet is ready.'}
        gap={20}
        footer={<PtButton title="Let's go" onPress={() => void setSession(linked.user, linked.token)} />}
      >
        {w?.goal ? (
          <View style={{ alignItems: 'center', gap: 8, paddingTop: 12 }}>
            <PtRing percent={w.goal.percent} size={120} stroke={10} />
            <Text style={{ fontFamily: ptFont.bold, fontSize: 18, color: pt.ink }}>{w.goal.name}</Text>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, textAlign: 'center' }}>
              {`₦${Math.round(parseFloat(w.goal.target)).toLocaleString('en-NG')}${w.goal.match ? ` · ${w.goal.match}` : ''}`}
            </Text>
          </View>
        ) : null}
      </PtStepScreen>
    );
  }

  // ---------------------------------------------------------------- INV-CH4
  if (step === 'pin' || step === 'confirm') {
    return (
      <PtStepScreen
        onBack={() => {
          setStep('pin');
          setValue('');
        }}
        title={step === 'pin' ? 'Make a secret PIN' : 'Type it again'}
        subtitle={step === 'pin' ? '4 numbers only you know. Not your birthday!' : 'To be sure.'}
        gap={44}
        scroll={false}
        footer={
          <>
            {error ? (
              <PtText variant="caption" color={pt.danger} style={{ textAlign: 'center' }}>
                {error}
              </PtText>
            ) : null}
            <PtKeypad value={value} onChange={onDigits} length={PIN} disabled={finishLink.isPending} />
          </>
        }
      >
        <PtPinDots length={PIN} filled={value.length} />
      </PtStepScreen>
    );
  }

  // ---------------------------------------------------------------- waiting for INV-CH3
  if (step === 'waiting' && pairing) {
    const who = pairing.parents.length ? pairing.parents.join(' or ') : 'your parent';
    return (
      <PtStepScreen
        onBack={() => {
          setStep('code');
          setPairing(null);
        }}
        title={`Ask ${who} to say yes`}
        subtitle={`${who} gets a message on their phone: "Link this phone to ${pairing.child}?"`}
        gap={24}
        footer={<PtButton title="Start again" variant="ghost" onPress={() => { setStep('code'); setPairing(null); }} />}
      >
        <View style={{ alignItems: 'center', paddingVertical: 24, gap: 12 }}>
          <ActivityIndicator color={pt.brand} size="large" />
          <Text style={{ fontFamily: ptFont.medium, fontSize: 15, color: pt.inkMuted }}>Waiting for a yes…</Text>
        </View>
      </PtStepScreen>
    );
  }

  // ---------------------------------------------------------------- INV-CH1
  if (step === 'hello') {
    return (
      <PtStepScreen
        onBack={() => navigation.goBack()}
        title="Hello!"
        subtitle="Is a grown-up with you? You need Mum or Dad to set this up."
        gap={14}
        footer={<PtButton title="Next" onPress={() => setStep('code')} />}
      >
        <PtNote tone="info">I have a code: Mum or Dad shows it on their phone.</PtNote>
        <PtButton
          title="I'm a grown-up"
          variant="secondary"
          onPress={() => {
            useAuth.getState().setPostAuthRoute('Invitations');
            navigation.navigate('Phone');
          }}
        />
        <PtText color={pt.inkMuted} style={{ textAlign: 'center' }}>Sign up or log in. A family wallet invite opens once you're in.</PtText>
      </PtStepScreen>
    );
  }

  // ---------------------------------------------------------------- INV-CH2
  return (
    <PtStepScreen
      onBack={() => setStep('hello')}
      title="Link to your family"
      subtitle="Ask Mum or Dad for the code. They see it on their phone, like KMS-4821."
      gap={18}
      footer={<PtButton title="Link my phone" disabled={!looksLikeChildCode} loading={start.isPending} onPress={() => void ask()} />}
    >
      <PtField label="Type the code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" placeholder="KMS-4821" maxLength={8} />
      {error ? <PtNote tone="attention">{error}</PtNote> : null}
    </PtStepScreen>
  );
}
