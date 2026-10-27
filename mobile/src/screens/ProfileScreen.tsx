import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { pt, ptFont, ptRadius } from '../theme';
import { PtTabScreen } from '../components/pt/PtTabScreen';
import { PtCard, PtRow, PtSectionTitle } from '../components/pt/PtList';
import { PtAvatar } from '../components/pt/PtAvatar';
import { PtChip } from '../components/pt/PtChip';
import { PtButton } from '../components/pt/PtButton';
import { LanguageSheet } from '../components/LanguageSheet';
import { useDevices, useHome, useLogoutApi, useUpdateProfile } from '../api/hooks';
import { useAuth } from '../store/auth';
import { useLanguage } from '../store/language';
import { initials } from '../lib/format';
import { formatE164 } from '../lib/phone';
import { selection } from '../lib/haptics';
import type { TabScreenProps } from '../navigation/types';

/** 2×2 tile: icon in a mint circle, bold label; "Soon" when not built yet. */
function Tile({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress?: () => void }) {
  const soon = !onPress;
  return (
    <Pressable
      onPress={() => {
        if (!onPress) return;
        selection();
        onPress();
      }}
      disabled={soon}
      accessibilityRole="button"
      accessibilityState={{ disabled: soon }}
      style={{ flex: 1, minHeight: 92, backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 14, gap: 10 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </View>
        {soon ? <PtChip label="Soon" /> : null}
      </View>
      <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: soon ? pt.inkMuted : pt.ink }}>{label}</Text>
    </Pressable>
  );
}

/**
 * More tab (prototype ME-01): who you are and your level, records, settings,
 * then every family-money tool that lives outside the other tabs, and Log out.
 */
export function ProfileScreen({ navigation }: TabScreenProps<'More'>) {
  const user = useAuth((s) => s.user);
  const logoutLocal = useAuth((s) => s.logout);
  const lang = useLanguage((s) => s.lang);
  const setLang = useLanguage((s) => s.setLang);
  const home = useHome();
  const devices = useDevices();
  const logoutApi = useLogoutApi();
  const updateProfile = useUpdateProfile();
  const qc = useQueryClient();
  const [langOpen, setLangOpen] = useState(false);

  const tier = user?.kyc_tier ?? 0;
  const unread = home.data?.unread_notifications ?? 0;
  const deviceCount = devices.data?.length ?? 0;
  const contact = [user?.username ? `@${user.username}` : null, user?.phone ? formatE164(user.phone) : null].filter(Boolean).join(' · ');

  const confirmLogout = () => {
    Alert.alert('Log out', 'You will need your phone number and PIN to log back in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () =>
          logoutApi.mutate(undefined, {
            onSettled: async () => {
              await logoutLocal();
              qc.clear();
            },
          }),
      },
    ]);
  };

  return (
    <PtTabScreen title="More">
      {/* Profile */}
      <Pressable
        onPress={() => {
          selection();
          navigation.navigate('EditProfile');
        }}
        accessibilityRole="button"
        style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}
      >
        <PtAvatar initials={initials(user?.full_name)} uri={user?.avatar_url} size={52} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontFamily: ptFont.bold, fontSize: 17, lineHeight: 22, color: pt.ink }} numberOfLines={1}>
            {user?.full_name}
          </Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 13, color: pt.inkMuted }} numberOfLines={1}>
            {contact}
          </Text>
        </View>
        <PtChip label={`Tier ${tier}`} tone="success" icon="check" />
      </Pressable>

      {/* Records */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile label="Insights" icon={<Feather name="trending-up" size={18} color={pt.brand} />} />
          <Tile
            label="Transactions"
            icon={<MaterialCommunityIcons name="swap-vertical" size={19} color={pt.brand} />}
            onPress={() => navigation.navigate('Activity')}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Tile label="Statements" icon={<Feather name="file-text" size={18} color={pt.brand} />} />
          <Tile label="Chats" icon={<Feather name="message-square" size={18} color={pt.brand} />} />
        </View>
      </View>

      {/* Settings */}
      <PtCard>
        <PtRow title="Account level" right={`Tier ${tier}`} chevron minHeight={46} onPress={() => navigation.navigate('Kyc')} />
        <PtRow title="Security" right="PIN, Face ID" chevron minHeight={46} onPress={() => navigation.navigate('SecurityCenter')} />
        <PtRow
          title="Notifications"
          right={unread > 0 ? `${unread} unread` : 'All read'}
          chevron
          minHeight={46}
          onPress={() => navigation.navigate('Notifications')}
        />
        <PtRow
          title="Devices you're logged in on"
          right={deviceCount ? String(deviceCount) : ''}
          chevron
          minHeight={46}
          onPress={() => navigation.navigate('Devices')}
        />
        <PtRow title="Refer and earn" right="Invite families" chevron minHeight={46} onPress={() => navigation.navigate('Referral')} />
        <PtRow title="Language" right={lang === 'pcm' ? 'Pidgin' : 'English'} chevron minHeight={46} onPress={() => setLangOpen(true)} />
        <PtRow title="Help, disputes and legal" chevron minHeight={46} last onPress={() => navigation.navigate('HelpFaq')} />
      </PtCard>

      {/* Everything else for family money */}
      <View style={{ gap: 8 }}>
        <PtSectionTitle title="Family money" />
        <PtCard>
          <PtRow title="Approvals" subtitle="Payments waiting for a yes" chevron onPress={() => navigation.navigate('Approvals')} />
          <PtRow title="Invitations" subtitle="Wallets you've been invited to" chevron onPress={() => navigation.navigate('Invitations')} />
          <PtRow title="Goals" subtitle="Targets and auto-save" chevron onPress={() => navigation.navigate('Goals')} />
          <PtRow title="Projects" subtitle="Pay builders by milestone" chevron onPress={() => navigation.navigate('Projects')} />
          <PtRow title="Vendors" subtitle="Find verified vendors" chevron onPress={() => navigation.navigate('VendorDirectory')} />
          <PtRow title="Loans" subtitle="Borrow and repay" chevron onPress={() => navigation.navigate('Loans')} />
          <PtRow title="Spousal sync" subtitle="Share finances with a partner" chevron onPress={() => navigation.navigate('SpousalSync')} />
          <PtRow title="Disputes" subtitle="A problem with a payment" chevron last onPress={() => navigation.navigate('Disputes')} />
        </PtCard>
      </View>

      <PtButton title="Log out" variant="ghost" onPress={confirmLogout} loading={logoutApi.isPending} />

      <LanguageSheet
        visible={langOpen}
        value={lang}
        onClose={() => setLangOpen(false)}
        onPick={(l) => {
          setLangOpen(false);
          void setLang(l);
          updateProfile.mutate({ language: l });
        }}
      />
    </PtTabScreen>
  );
}
