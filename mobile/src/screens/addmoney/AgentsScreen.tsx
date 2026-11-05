import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Location from 'expo-location';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { pt, ptRadius } from '../../theme';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { PtButton } from '../../components/pt/PtButton';
import { PtCard, PtIconTile, PtRow } from '../../components/pt/PtList';
import { PtNote } from '../../components/pt/PtForm';
import { LoadError } from '../../components/LoadError';
import { distanceLabel, useAgents, type Agent } from '../../api/funding';
import type { RootScreenProps } from '../../navigation/types';

type Here = { lat: number; lng: number };

/**
 * ADD-06 Cash at an agent: the Patriai agents nearest you (with your
 * permission to use your location), how far, when they're open and whether
 * they pay out too. Show the agent your account details; count your cash.
 */
export function AgentsScreen({ navigation, route }: RootScreenProps<'Agents'>) {
  const { walletId } = route.params;
  const [here, setHere] = useState<Here | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [asked, setAsked] = useState<'asking' | 'granted' | 'denied'>('asking');

  const locate = async () => {
    setAsked('asking');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return setAsked('denied');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setAsked('granted');
      const g = (await Location.reverseGeocodeAsync(pos.coords).catch(() => []))[0];
      if (g) setPlace([g.district ?? g.subregion ?? g.name, g.city ?? g.region].filter(Boolean).join(', ') || null);
    } catch {
      setAsked('denied');
    }
  };
  useEffect(() => {
    void locate();
  }, []);

  const q = useAgents(here, asked !== 'asking');
  const agents = q.data?.agents ?? [];

  const openMap = (a: Agent) => {
    if (a.lat === null || a.lng === null) return;
    const label = encodeURIComponent(a.name);
    const url =
      Platform.OS === 'ios' ? `maps:?q=${label}&ll=${a.lat},${a.lng}` : Platform.OS === 'android' ? `geo:${a.lat},${a.lng}?q=${a.lat},${a.lng}(${label})` : `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`;
    void Linking.openURL(url);
  };

  const line = (a: Agent) =>
    [distanceLabel(a.distance_m) ?? [a.area, a.city].filter(Boolean).join(', '), a.hours?.toLowerCase(), 'Agent', a.cash_out ? 'cash in and out' : 'cash in only'].filter(Boolean).join(' · ');

  return (
    <PtPageScreen
      title="Cash at an agent"
      subtitle={asked === 'granted' ? (place ? `Near ${place}` : 'Near you') : asked === 'denied' ? 'All agents' : null}
      onBack={() => navigation.goBack()}
      footer={<PtButton title="Show the agent my account details" variant="secondary" onPress={() => navigation.navigate('WalletAccount', { walletId })} />}
    >
      {asked === 'asking' || q.isLoading ? (
        <ActivityIndicator color={pt.brand} style={{ marginTop: 24 }} />
      ) : q.error ? (
        <LoadError message={(q.error as Error).message} onRetry={() => void q.refetch()} />
      ) : (
        <>
          {asked === 'denied' ? (
            <PtNote tone="attention" icon="map-pin">
              Turn on location to see the agents nearest you and how far they are.
            </PtNote>
          ) : null}
          {here && agents.some((a) => a.lat !== null) ? <AgentMap here={here} agents={agents.slice(0, 5)} /> : null}
          {agents.length ? (
            <PtCard>
              {agents.map((a, i) => (
                <PtRow
                  key={a.id}
                  title={a.name}
                  subtitle={line(a)}
                  left={<PtIconTile><Feather name="map-pin" size={18} color={pt.brand} /></PtIconTile>}
                  chevron={a.lat !== null}
                  last={i === agents.length - 1}
                  onPress={a.lat !== null ? () => openMap(a) : undefined}
                />
              ))}
            </PtCard>
          ) : (
            <PtNote tone="info" icon="map-pin">
              {asked === 'granted' ? 'No Patriai agents near you yet. Add money by bank transfer instead — it’s free and instant.' : 'No Patriai agents yet. Add money by bank transfer instead — it’s free and instant.'}
            </PtNote>
          )}
          {asked === 'denied' ? <PtButton title="Use my location" variant="ghost" onPress={() => void locate()} /> : null}
          <PtNote tone="info">Show the agent your Patriai account number or tell them your phone number. Count your cash before you leave.</PtNote>
        </>
      )}
    </PtPageScreen>
  );
}

/** A small sketch of the streets around you: you in blue, the agents as pins. */
function AgentMap({ here, agents }: { here: Here; agents: Agent[] }) {
  const [w, setW] = useState(0);
  const h = 200;
  const pts = agents.filter((a) => a.lat !== null && a.lng !== null) as (Agent & { lat: number; lng: number })[];
  const span = Math.max(0.002, ...pts.map((a) => Math.max(Math.abs(a.lat - here.lat), Math.abs(a.lng - here.lng))));
  const pad = 28;
  const place = (lat: number, lng: number) => ({
    x: w / 2 + ((lng - here.lng) / span) * (w / 2 - pad),
    y: h / 2 - ((lat - here.lat) / span) * (h / 2 - pad),
  });

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: h, borderRadius: ptRadius.md, backgroundColor: pt.sunken, overflow: 'hidden' }} accessibilityLabel="Map of agents near you">
      {w > 0 ? (
        <>
          <Svg width={w} height={h} style={{ position: 'absolute' }}>
            <Path d={`M0 ${h * 0.3} L${w} ${h * 0.38}`} stroke="#FFFFFF" strokeWidth={12} />
            <Path d={`M${w * 0.36} 0 L${w * 0.4} ${h}`} stroke="#FFFFFF" strokeWidth={12} />
            <Path d={`M0 ${h * 0.75} C${w * 0.3} ${h * 0.55} ${w * 0.6} ${h * 0.9} ${w} ${h * 0.6}`} stroke="#FFFFFF" strokeWidth={14} fill="none" />
          </Svg>
          {pts.map((a) => {
            const p = place(a.lat, a.lng);
            return (
              <View key={a.id} style={{ position: 'absolute', left: p.x - 16, top: p.y - 30 }}>
                <MaterialCommunityIcons name="map-marker" size={32} color={pt.emerald700} />
              </View>
            );
          })}
          <View style={{ position: 'absolute', left: w / 2 - 12, top: h / 2 - 12, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(29,95,168,0.25)', alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: pt.info, borderWidth: 2, borderColor: '#FFFFFF' }} />
          </View>
        </>
      ) : null}
    </View>
  );
}
