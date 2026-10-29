import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { pt, ptFont, ptRadius } from '../theme';
import { PtTabScreen } from '../components/pt/PtTabScreen';
import { PtCard, PtIconTile, PtRow, PtSectionTitle } from '../components/pt/PtList';
import { PtAvatar } from '../components/pt/PtAvatar';
import { PtChip } from '../components/pt/PtChip';
import { PtButton } from '../components/pt/PtButton';
import { PtSheet } from '../components/pt/PtSheet';
import { PtSwitchRow } from '../components/pt/PtForm';
import { useDevices, useHome, useLogoutApi, useMyVendorProfile } from '../api/hooks';
import { useTeamInvites, useVendorHome } from '../api/projectFlow';
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
  const home = useHome();
  const devices = useDevices();
  const logoutApi = useLogoutApi();
  const qc = useQueryClient();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [keepTrusted, setKeepTrusted] = useState(true);

  const tier = user?.kyc_tier ?? 0;
  const unread = home.data?.unread_notifications ?? 0;
  const deviceCount = devices.data?.length ?? 0;
  const contact = [user?.username ? `@${user.username}` : null, user?.phone ? formatE164(user.phone) : null].filter(Boolean).join(' · ');

  // ME-21 "Log out?" — and whether this phone stays trusted (skips the selfie next time).
  const doLogout = () =>
    logoutApi.mutate(
      { keep_trusted: keepTrusted },
      {
        onSettled: async () => {
          setLogoutOpen(false);
          await logoutLocal();
          qc.clear();
        },
      },
    );

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

      {/* VON-01 "You can add the other later from the same phone number": the business side. */}
      <BusinessEntry navigation={navigation} />

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
        <PtRow title="Account level" right={`Tier ${tier} · Free`} chevron minHeight={46} onPress={() => navigation.navigate('Kyc')} />
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
        <PtRow title="Language, apps and privacy" right={lang === 'pcm' ? 'Pidgin' : 'English'} chevron minHeight={46} onPress={() => navigation.navigate('Language')} />
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

      <PtButton title="Log out" variant="ghost" onPress={() => setLogoutOpen(true)} loading={logoutApi.isPending} />

      <PtSheet
        visible={logoutOpen}
        title="Log out?"
        subtitle="You'll need your phone number and PIN to log back in."
        onClose={() => setLogoutOpen(false)}
        footer={
          <View style={{ gap: 4 }}>
            <PtButton title="Log out" onPress={doLogout} loading={logoutApi.isPending} />
            <PtButton title="Cancel" variant="ghost" onPress={() => setLogoutOpen(false)} />
          </View>
        }
      >
        <PtSwitchRow title="Keep this phone trusted" subtitle="Skip the selfie check next time" value={keepTrusted} onChange={setKeepTrusted} />
      </PtSheet>
    </PtTabScreen>
  );
}

/** Switch to vendor mode, join a team you were invited to, or set up a business account. */
function BusinessEntry({ navigation }: { navigation: TabScreenProps<'More'>['navigation'] }) {
  const mine = useMyVendorProfile();
  const home = useVendorHome();
  const invites = useTeamInvites();
  const setMode = useAuth((s) => s.setMode);
  const business = mine.data?.profile;
  const team = !business ? home.data?.business : null;
  const invite = invites.data?.[0];

  const toBusiness = () => {
    void setMode('business');
    // The tabs live inside the root stack; vendor mode replaces them there.
    navigation.getParent()?.reset({ index: 0, routes: [{ name: 'VendorTabs' }] });
  };

  return (
    <PtCard>
      {invite ? (
        <PtRow
          title={`Join the ${invite.business?.name ?? ''} team`}
          subtitle={`${invite.business?.owner ?? 'The owner'} added you as ${invite.role_label.toLowerCase()}`}
          left={<PtAvatar initials={initials(invite.business?.name)} tone="gold" size={40} />}
          chevron
          onPress={() => navigation.navigate('TeamInvite', { memberId: invite.id })}
        />
      ) : null}
      {business || team ? (
        <PtRow
          title={business?.business_name ?? team?.name ?? 'Business'}
          subtitle={business && business.status !== 'verified' ? 'Switch to business · not verified yet' : 'Switch to business'}
          left={<PtAvatar initials={business?.initials ?? team?.initials ?? 'B'} uri={business?.logo_url ?? team?.logo_url} tone="gold" size={40} />}
          chevron
          onPress={toBusiness}
          last
        />
      ) : (
        <PtRow
          title="Get paid as a business"
          subtitle="Builders, schools, caterers: families pay you by milestone"
          left={<PtIconTile><Feather name="briefcase" size={18} color={pt.brand} /></PtIconTile>}
          chevron
          onPress={() => navigation.navigate('BusinessSetup', {})}
          last
        />
      )}
    </PtCard>
  );
}
