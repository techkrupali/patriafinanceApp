import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { pt } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtNote } from '../../components/pt/PtForm';
import { PtDateSheet } from '../../components/pt/PtDateSheet';
import { useUpdateWallet, useWallet } from '../../api/hooks';
import { formatYmd, groupAmountInput, sanitizeAmountInput, ymdMonthsFromNow } from '../../lib/format';
import { WALLET_COLOURS, WALLET_COLOUR_KEYS } from '../../lib/walletColours';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { UpdateWalletPayload, WalletColour } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

/**
 * WAL-06 "Name, colour and goal": what the wallet is called, its colour and,
 * for saving wallets, the goal and the date. Lowering the goal of a wallet
 * locked until the goal waits for the other owners' yes.
 */
export function WalletBasicsScreen({ navigation, route }: RootScreenProps<'WalletBasics'>) {
  const { walletId } = route.params;
  const detail = useWallet(walletId);
  const update = useUpdateWallet(walletId);
  const wallet = detail.data?.wallet;
  const isMain = wallet?.type === 'main';
  const hasGoal = wallet ? ['savings', 'goal', 'shared', 'emergency', 'child', 'project'].includes(wallet.type) || Boolean(wallet.target_amount) : false;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [colour, setColour] = useState<WalletColour | null>(null);
  const [target, setTarget] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!wallet || ready) return;
    setName(wallet.name);
    setDescription(wallet.description ?? '');
    setColour(wallet.colour ?? null);
    setTarget(wallet.target_amount ? String(Math.round(parseFloat(wallet.target_amount))) : '');
    setDate(wallet.target_date ?? null);
    setReady(true);
  }, [wallet, ready]);

  const save = () => {
    setError(null);
    if (!name.trim()) {
      setError('Give the wallet a name.');
      return;
    }
    const body: UpdateWalletPayload = { name: name.trim(), description: description.trim() || null };
    if (!isMain) body.colour = colour;
    if (hasGoal) {
      if (target && parseFloat(target) > 0) body.target_amount = target;
      body.target_date = date;
    }
    update.mutate(body, {
      onSuccess: (res) => {
        notifySuccess();
        if (res.pending_change) {
          showAlert('Sent for approval', `${(res.pending_change.approver_names ?? []).join(' and ') || 'The other owners'} must agree to the new goal while the wallet is locked until the goal.`);
        }
        navigation.goBack();
      },
      onError: (e) => setError(e.message),
    });
  };

  return (
    <PtPageScreen
      title={isMain ? 'Name' : 'Name, colour and goal'}
      subtitle={wallet?.name}
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Save" onPress={save} loading={update.isPending} disabled={!ready} />}
    >
      {!ready ? (
        <ActivityIndicator color={pt.brand} />
      ) : (
        <>
          <PtField label="Name" value={name} onChangeText={setName} maxLength={100} placeholder="School fees 2027" />
          <PtField label="Why it matters (optional)" value={description} onChangeText={setDescription} maxLength={200} placeholder="Tolu's JSS3 fees at Greenfield" hint="Shown to members on the wallet page." />
          {!isMain ? (
            <View style={{ gap: 12 }}>
              <PtGroupLabel>Colour</PtGroupLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {WALLET_COLOUR_KEYS.map((c) => {
                  const on = colour === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => {
                        selection();
                        setColour(c);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`Colour ${c}`}
                      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: on ? 2.5 : 0, borderColor: pt.brand, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <View style={{ width: on ? 34 : 40, height: on ? 34 : 40, borderRadius: 20, backgroundColor: WALLET_COLOURS[c] }} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          {hasGoal ? (
            <>
              <PtField
                label="Goal"
                prefix="₦"
                keyboardType="number-pad"
                value={groupAmountInput(target)}
                onChangeText={(t) => setTarget(sanitizeAmountInput(t))}
                placeholder="850,000"
              />
              <PtField label="By" value={date ? formatYmd(date) : ''} placeholder="Pick a date" editable={false} onPressBox={() => setPicking(true)} />
              {wallet?.lock?.locked && wallet.lock.mode === 'target' ? (
                <PtNote tone="warning" icon="lock">
                  The wallet is locked until the goal. A lower goal opens it sooner, so the other owners agree first.
                </PtNote>
              ) : null}
            </>
          ) : null}
          {error ? <PtNote tone="attention">{error}</PtNote> : null}
        </>
      )}
      <PtDateSheet
        visible={picking}
        title="Reach the goal by"
        value={date ?? ymdMonthsFromNow(3)}
        minYear={new Date().getFullYear()}
        maxYear={new Date().getFullYear() + 10}
        doneLabel="Done"
        onDone={(ymd) => {
          setDate(ymd);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </PtPageScreen>
  );
}
