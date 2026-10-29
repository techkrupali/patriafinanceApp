import React, { useMemo, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtField } from '../../components/pt/PtField';
import { PtPanel } from '../../components/pt/PtForm';
import { PtSectionTitle } from '../../components/pt/PtList';
import { SettingsRow } from '../../components/wallet/WalletManageUi';
import { useAppStatus } from '../../api/account';
import { APP_VERSION } from '../../config';
import { selection } from '../../lib/haptics';
import { showAlert } from '../../lib/alert';
import type { RootScreenProps } from '../../navigation/types';

/** Answers in plain words, true to how the app works. */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do approvals work?',
    a: 'A shared wallet can ask for a yes before money goes out: over an amount you pick, from any one approver, everyone, most of them, or people you name. The person asking counts as the first yes. Requests expire after 24, 48 or 72 hours.',
  },
  {
    q: 'Is my money safe with Patriai?',
    a: 'Your money is held by our partner bank, licensed by the Central Bank of Nigeria, and insured by NDIC up to the legal limit. Every payment needs your PIN or Face ID, new phones wait 24 hours before they can send, and you can freeze your account any time.',
  },
  {
    q: 'How do family abroad send money?',
    a: "Share the wallet's contribution link or its account number. Money paid in lands instantly, with the sender's name.",
  },
  {
    q: 'What are the verification tiers?',
    a: 'Tier 1 (phone and BVN): send ₦50,000 a day and hold ₦300,000. Tier 2 (NIN and a selfie): ₦200,000 a day, hold ₦500,000, and shared wallets. Tier 3 (ID document and proof of address): ₦5,000,000 a day, no balance limit.',
  },
  {
    q: 'How do I get money back from a vendor?',
    a: 'Open a dispute from the milestone ("Something isn\'t right"). The builder answers with a fix or a refund; if you can\'t agree, you can ask Patriai to step in and decide. Money held back stays in the project wallet until then.',
  },
];

/**
 * ME-16 Help, in English and Pidgin: search, popular questions, your
 * disputes, legal, chat with us and call us.
 */
export function HelpFaqScreen({ navigation }: RootScreenProps<'HelpFaq'>) {
  const status = useAppStatus(APP_VERSION);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const phone = status.data?.support_phone ?? null;
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? FAQ.filter((f) => f.q.toLowerCase().includes(s) || f.a.toLowerCase().includes(s)) : FAQ;
  }, [search]);

  return (
    <PtPageScreen title="Help" subtitle="Answers in English and Pidgin" onBack={() => navigation.goBack()}>
      <PtField label="Search help" value={search} onChangeText={setSearch} placeholder="Search help" />
      <View style={{ gap: 10 }}>
        <PtSectionTitle title="Popular" />
        <PtPanel>
          {shown.length === 0 ? (
            <Text style={{ fontFamily: ptFont.regular, fontSize: 14, color: pt.inkMuted, paddingVertical: 14 }}>No answer for that yet. Ask us in the chat.</Text>
          ) : (
            shown.map((f, i) => {
              const isOpen = open === f.q;
              return (
                <Pressable
                  key={f.q}
                  onPress={() => {
                    selection();
                    setOpen(isOpen ? null : f.q);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  style={{ paddingVertical: 14, gap: 8, borderBottomWidth: i === shown.length - 1 ? 0 : 1, borderBottomColor: pt.line }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ flex: 1, fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }}>{f.q}</Text>
                    <Feather name={isOpen ? 'chevron-up' : 'chevron-right'} size={18} color={pt.inkSubtle} />
                  </View>
                  {isOpen ? <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.inkMuted }}>{f.a}</Text> : null}
                </Pressable>
              );
            })
          )}
        </PtPanel>
      </View>
      <PtPanel>
        <SettingsRow icon="alert-circle" title="My disputes" sub="A problem with a payment or a vendor" onPress={() => navigation.navigate('Disputes')} />
        <SettingsRow icon="file-text" title="Legal" sub="Terms, privacy, licences" onPress={() => navigation.navigate('Legal')} last />
      </PtPanel>
      <PtPanel>
        <SettingsRow icon="message-circle" title="Chat with us" sub="Usually replies in 5 minutes" onPress={() => navigation.navigate('SupportChat', {})} />
        <SettingsRow
          icon="phone"
          title="Call us"
          sub={phone ? `${phone} · 8 am to 8 pm, every day` : '8 am to 8 pm, every day'}
          onPress={() => (phone ? void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`) : showAlert('Call us', 'Our phone line opens soon. Chat with us meanwhile.'))}
        />
        <SettingsRow icon="info" title="About Patriai" sub={`Version ${APP_VERSION}`} onPress={() => navigation.navigate('About')} last />
      </PtPanel>
    </PtPageScreen>
  );
}
