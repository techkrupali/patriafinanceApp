import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { PtSheet } from './pt/PtSheet';
import { PtButton } from './pt/PtButton';
import { PtField } from './pt/PtField';
import { PtText } from './pt/PtText';
import { pt } from '../theme';
import { ApiError } from '../api/client';

export type TwoStepMethod = 'authenticator' | 'sms' | 'email';

/** The server asked for the two-step code (ME-08): data.code === 'two_factor_required'. */
export function twoStepAsked(e: unknown): { method: TwoStepMethod; sentTo: string | null } | null {
  if (!(e instanceof ApiError)) return null;
  const data = e.data as { code?: string; method?: TwoStepMethod; sent_to?: string | null } | undefined;
  return data?.code === 'two_factor_required' ? { method: data.method ?? 'authenticator', sentTo: data.sent_to ?? null } : null;
}

/**
 * ME-08 "An extra check for big changes": the 6-digit code from the
 * authenticator app, or the one just sent by SMS or email.
 */
export function TwoStepSheet({
  asked,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  asked: { method: TwoStepMethod; sentTo: string | null } | null;
  busy?: boolean;
  error?: string | null;
  onSubmit: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  useEffect(() => {
    if (asked) setCode('');
  }, [asked]);
  const where =
    asked?.method === 'authenticator'
      ? 'Open your authenticator app and enter the code for Patriai.'
      : `We sent a code ${asked?.method === 'sms' ? 'by SMS' : 'by email'}${asked?.sentTo ? ` to ${asked.sentTo}` : ''}.`;

  return (
    <PtSheet
      visible={asked !== null}
      title="Two-step check"
      subtitle={where}
      onClose={onClose}
      footer={<PtButton title="Confirm" onPress={() => onSubmit(code)} loading={busy} disabled={code.length !== 6} />}
    >
      <View style={{ gap: 10 }}>
        <PtField label="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} autoFocus placeholder="123456" />
        {error ? <PtText variant="caption" color={pt.danger}>{error}</PtText> : null}
      </View>
    </PtSheet>
  );
}
