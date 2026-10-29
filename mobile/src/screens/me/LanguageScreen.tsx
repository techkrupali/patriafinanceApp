import React from 'react';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtChoiceCard, PtNote, PtPanel, PtSwitchRow } from '../../components/pt/PtForm';
import { SettingsRow } from '../../components/wallet/WalletManageUi';
import { useUpdateProfile } from '../../api/hooks';
import { useSecurity, useUpdateSettings } from '../../api/account';
import { useAuth } from '../../store/auth';
import { useLanguage } from '../../store/language';
import type { RootScreenProps } from '../../navigation/types';

/**
 * ME-14 Language for the app and Steward (English or Nigerian Pidgin, and
 * Steward answering in the language you use), with the rest of "Language,
 * apps and privacy": appearance, connected apps, privacy and data.
 */
export function LanguageScreen({ navigation }: RootScreenProps<'Language'>) {
  const name = useAuth((s) => s.user?.first_name ?? '');
  const lang = useLanguage((s) => s.lang);
  const setLang = useLanguage((s) => s.setLang);
  const profile = useUpdateProfile();
  const security = useSecurity();
  const update = useUpdateSettings();
  const pick = (l: 'en' | 'pcm') => {
    void setLang(l);
    profile.mutate({ language: l });
  };

  return (
    <PtPageScreen title="Language" subtitle="For the app and Steward" onBack={() => navigation.goBack()}>
      <PtChoiceCard title="English" subtitle={`Good evening, ${name}`} selected={lang === 'en'} onPress={() => pick('en')} />
      <PtChoiceCard title="Nigerian Pidgin" subtitle={`Good evening o, ${name}`} selected={lang === 'pcm'} onPress={() => pick('pcm')} />
      <PtPanel>
        <PtSwitchRow
          title="Steward answers in the language I use"
          subtitle="Ask in Pidgin, get Pidgin back"
          value={security.data?.settings.steward_matches_language ?? true}
          onChange={(v) => update.mutate({ steward_matches_language: v })}
        />
      </PtPanel>
      <PtNote tone="info">Yoruba, Igbo and Hausa are coming. Tell us which you want first.</PtNote>
      <PtPanel>
        <SettingsRow icon="sun" title="Appearance" sub="Light, bigger text, reduce motion" onPress={() => navigation.navigate('Appearance')} />
        <SettingsRow icon="grid" title="Connected apps" sub="Drive, Sheets, QuickBooks, WhatsApp" onPress={() => navigation.navigate('ConnectedApps')} />
        <SettingsRow icon="lock" title="Privacy and data" sub="What Steward reads, download your data" onPress={() => navigation.navigate('Privacy')} last />
      </PtPanel>
    </PtPageScreen>
  );
}
