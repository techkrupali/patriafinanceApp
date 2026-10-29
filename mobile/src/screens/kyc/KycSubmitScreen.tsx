import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtField } from '../../components/pt/PtField';
import { PtGroupLabel, PtNote, PtPills } from '../../components/pt/PtForm';
import { useSubmitTier } from '../../api/account';
import { pickFile, type PickedFile } from '../../lib/upload';
import { notifySuccess, selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

const ID_TYPES = [
  { value: 'passport', label: 'International passport' },
  { value: 'drivers_licence', label: "Driver's licence" },
  { value: 'voters_card', label: "Voter's card" },
  { value: 'national_id', label: 'National ID card' },
];

/** A photo slot: take a photo or pick one; shows what was added. */
function PhotoSlot({ title, sub, file, onPick, camera = true }: { title: string; sub: string; file: PickedFile | null; onPick: (f: PickedFile) => void; camera?: boolean }) {
  const choose = async (source: 'camera' | 'library') => {
    selection();
    const f = await pickFile(source);
    if (f) onPick(f);
  };
  return (
    <View style={{ borderRadius: ptRadius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: file ? pt.brand : pt.lineStrong, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {file ? (
          <Image source={{ uri: file.uri }} style={{ width: 52, height: 52, borderRadius: 8 }} />
        ) : (
          <View style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="image" size={20} color={pt.brand} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{title}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{file ? 'Added' : sub}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {camera ? <PtButton title="Take photo" size="sm" variant="mint" style={{ flex: 1 }} onPress={() => void choose('camera')} /> : null}
        <PtButton title="Upload file" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => void choose('library')} />
      </View>
    </View>
  );
}

/**
 * Verify to the next tier: Tier 1 the BVN (KYC-02), Tier 2 the NIN and a
 * selfie (KYC-03/05), Tier 3 an ID document and proof of address (KYC-07/08).
 * Our team checks it (KYC-09) and you're told when it's done.
 */
export function KycSubmitScreen({ navigation, route }: RootScreenProps<'KycSubmit'>) {
  const tier = route.params.targetTier;
  const submit = useSubmitTier();
  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const [selfie, setSelfie] = useState<PickedFile | null>(null);
  const [idType, setIdType] = useState('passport');
  const [idPhoto, setIdPhoto] = useState<PickedFile | null>(null);
  const [idBack, setIdBack] = useState<PickedFile | null>(null);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Lagos');
  const [proof, setProof] = useState<PickedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    setError(null);
    let fields: Record<string, string> = {};
    let files: Record<string, PickedFile | null> = {};
    if (tier === 1) {
      if (!/^\d{11}$/.test(bvn)) return setError('Your BVN has 11 digits. Forgot it? Dial *565*0# from the number linked to your bank.');
      fields = { bvn };
    } else if (tier === 2) {
      if (!/^\d{11}$/.test(nin)) return setError('Your NIN has 11 digits. It\'s on your NIN slip, or dial *346#.');
      if (!selfie) return setError('Take a quick selfie.');
      fields = { nin };
      files = { selfie };
    } else {
      if (!idPhoto) return setError('Add the photo page of your ID.');
      if (!address.trim() || !city.trim() || !state.trim()) return setError('Fill in your address.');
      if (!proof) return setError('Add your proof of address.');
      fields = { id_type: idType, address: address.trim(), city: city.trim(), state: state.trim() };
      files = { id_photo: idPhoto, id_back: idBack, proof };
    }
    submit.mutate(
      { target_tier: tier, fields, files },
      {
        onSuccess: () => {
          notifySuccess();
          showAlert('Checking your details', 'Our team checks it, usually within a day. You can keep using Patriai and we\'ll let you know.');
          navigation.goBack();
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <PtPageScreen
      title={tier === 1 ? 'Enter your BVN' : tier === 2 ? 'NIN and a selfie' : 'ID and address'}
      subtitle={`Tier ${tier}`}
      onBack={() => navigation.goBack()}
      footer={<PtButton title={tier === 3 ? 'Submit for review' : tier === 2 ? 'Check NIN and selfie' : 'Check BVN'} onPress={send} loading={submit.isPending} />}
    >
      {tier === 1 ? (
        <>
          <PtField label="BVN" value={bvn} onChangeText={(t) => setBvn(t.replace(/\D/g, '').slice(0, 11))} keyboardType="number-pad" placeholder="11 digits" maxLength={11} hint="Your Bank Verification Number has 11 digits. Forgot it? Dial *565*0#." />
          <PtNote tone="info" icon="lock">Your BVN is safe. We only use it to confirm your name, date of birth and phone number. It doesn't let anyone see your bank balances or move your money.</PtNote>
        </>
      ) : tier === 2 ? (
        <>
          <PtField label="NIN" value={nin} onChangeText={(t) => setNin(t.replace(/\D/g, '').slice(0, 11))} keyboardType="number-pad" placeholder="11 digits" maxLength={11} hint="On your NIN slip or in the NIMC app. You can also dial *346#." />
          <PhotoSlot title="Take a quick selfie" sub="Good light, no glasses or cap, your face in the frame" file={selfie} onPick={setSelfie} />
          <PtNote tone="info">Tier 2 unlocks sending up to ₦200,000 a day, holding ₦500,000, and shared wallets.</PtNote>
        </>
      ) : (
        <>
          <View style={{ gap: 10 }}>
            <PtGroupLabel>ID document</PtGroupLabel>
            <PtPills compact options={ID_TYPES} value={idType} onChange={setIdType} />
          </View>
          <PhotoSlot title="Photo page" sub="Clear and readable, all four corners in view" file={idPhoto} onPick={setIdPhoto} />
          <PhotoSlot title="The page with your signature" sub="Optional" file={idBack} onPick={setIdBack} />
          <PtField label="House number and street" value={address} onChangeText={setAddress} placeholder="14 Admiralty Way" maxLength={200} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <PtField label="Area" value={city} onChangeText={setCity} placeholder="Lekki" maxLength={100} />
            </View>
            <View style={{ flex: 1 }}>
              <PtField label="State" value={state} onChangeText={setState} placeholder="Lagos" maxLength={100} />
            </View>
          </View>
          <PhotoSlot title="Proof of address" sub="A utility bill, bank statement or tenancy agreement from the last 3 months" file={proof} onPick={setProof} />
          <PtNote tone="info">The name must match your BVN. Tier 3 unlocks sending up to ₦5,000,000 a day and no balance limit.</PtNote>
        </>
      )}
      {error ? <PtNote tone="attention">{error}</PtNote> : null}
    </PtPageScreen>
  );
}
