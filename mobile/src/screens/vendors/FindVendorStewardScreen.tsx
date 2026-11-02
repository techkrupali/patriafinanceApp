import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { ApiError } from '../../api/client';
import { useAssistantChat } from '../../api/hooks';
import { useDirectory } from '../../api/projectFlow';
import { PtPageScreen } from '../../components/pt/PtPageScreen';
import { VendorListCard } from '../../components/VendorListCard';
import { tradePerson } from '../../lib/projects';
import { selection } from '../../lib/haptics';
import type { VendorListAction } from '../../api/types';
import type { RootScreenProps } from '../../navigation/types';

interface Msg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  vendors?: VendorListAction['vendors'];
}

/**
 * VND-03 "Find a vendor" with Steward, opened over the directory: it asks for
 * the trade and town, lists verified vendors as cards that open their
 * profiles, and reminds you to get a written quote. Steward answers in words
 * when the server has the AI configured; the list always comes from the
 * directory, so it works without it.
 */
export function FindVendorStewardScreen({ navigation, route }: RootScreenProps<'FindVendorSteward'>) {
  const { category, near = '', projectId } = route.params;
  const one = tradePerson(category);
  const many = tradePerson(category, true);
  const ask = `Find ${/^[aeiou]/.test(one) ? 'an' : 'a'} ${one}${near ? ` near ${near}` : ''}`;
  const chat = useAssistantChat();
  const directory = useDirectory('', category, near, true);
  const [messages, setMessages] = useState<Msg[]>([{ id: 1, role: 'user', text: ask }]);
  const [input, setInput] = useState('');
  const [offline, setOffline] = useState(false);
  const seq = useRef(2);
  const asked = useRef(false);

  const found: VendorListAction['vendors'] = (directory.data?.pages.flatMap((p) => p.vendors) ?? []).slice(0, 5).map((v) => ({
    vendor_profile_id: v.id,
    name: v.business_name,
    category: v.category,
    rating: v.rating,
    reviews: v.reviews,
    location: v.location,
    areas: v.areas,
    verified: v.verified,
    projects_completed: v.projects_completed,
  }));
  const local = () =>
    found.length
      ? `Here ${found.length === 1 ? 'is' : 'are'} ${found.length} verified ${found.length === 1 ? one : many}${near ? ` near ${near}` : ''}.`
      : `I couldn't find a verified ${one}${near ? ` near ${near}` : ''} yet. Try a nearby town, or invite your own ${one} to the project.`;

  const add = (m: Omit<Msg, 'id'>) => setMessages((prev) => [...prev, { ...m, id: seq.current++ }]);

  const send = (text: string, first = false) => {
    const q = text.trim();
    if (!q || chat.isPending) return;
    if (!first) add({ role: 'user', text: q });
    setInput('');
    if (offline) {
      add({ role: 'assistant', text: 'I can only list the directory right now. Change the trade or town in Find a vendor to search again.' });
      return;
    }
    const history = messages.map((m) => ({ role: m.role, content: m.text }));
    chat.mutate(
      { message: q, history: first ? [] : history },
      {
        onSuccess: (r) => add({ role: 'assistant', text: r.reply, vendors: r.action?.type === 'vendor_list' ? r.action.vendors : first ? found : undefined }),
        onError: (e) => {
          // No AI configured (503) or unreachable: answer from the directory.
          if (e instanceof ApiError && (e.statusCode === 503 || e.statusCode === 0)) setOffline(true);
          add({ role: 'assistant', text: first ? local() : 'Sorry, I could not answer that just now.', vendors: first ? found : undefined });
        },
      },
    );
  };

  // Ask once the directory has answered, so the cards are there to fall back on.
  useEffect(() => {
    if (asked.current || directory.isLoading) return;
    asked.current = true;
    send(ask, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directory.isLoading]);

  const open = (profileId: number) => navigation.navigate('VendorProfile', { profileId, projectId });

  return (
    <PtPageScreen
      title="Find a vendor"
      subtitle="Steward"
      onBack={() => navigation.goBack()}
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pt.raised, borderRadius: ptRadius.md, borderWidth: 1.5, borderColor: pt.lineStrong, paddingLeft: 14, paddingRight: 6, minHeight: 52 }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send(input)}
            placeholder={`Ask about ${many}…`}
            placeholderTextColor={pt.inkSubtle}
            accessibilityLabel="Ask Steward"
            returnKeyType="send"
            style={{ flex: 1, minWidth: 0, fontFamily: ptFont.regular, fontSize: 15, color: pt.ink, paddingVertical: 10 }}
          />
          <Pressable onPress={() => { selection(); send(input); }} disabled={!input.trim() || chat.isPending} accessibilityRole="button" accessibilityLabel="Send" hitSlop={8} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="send" size={20} color={input.trim() ? pt.brand : pt.lineStrong} />
          </Pressable>
        </View>
      }
    >
      {messages.map((m) =>
        m.role === 'user' ? (
          <View key={m.id} style={{ alignSelf: 'flex-end', maxWidth: 280, backgroundColor: pt.brand, borderRadius: 18, borderBottomRightRadius: 4, paddingVertical: 12, paddingHorizontal: 14 }}>
            <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.onBrand }}>{m.text}</Text>
          </View>
        ) : (
          <View key={m.id} style={{ gap: 10 }}>
            <View style={{ alignSelf: 'flex-start', maxWidth: 320, backgroundColor: pt.raised, borderRadius: 18, borderBottomLeftRadius: 4, padding: 14, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="shield-account-outline" size={16} color={pt.info} />
                <Text style={{ fontFamily: ptFont.bold, fontSize: 13, color: pt.info }}>Steward</Text>
              </View>
              <Text style={{ fontFamily: ptFont.regular, fontSize: 15, lineHeight: 22, color: pt.ink }}>{m.text}</Text>
            </View>
            {m.vendors?.length ? (
              <>
                <VendorListCard vendors={m.vendors} onOpen={open} />
                <View style={{ alignSelf: 'flex-start', maxWidth: 320, backgroundColor: pt.infoSoft, borderRadius: 18, padding: 14 }}>
                  <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: pt.ink }}>
                    Ask each for a written quote before you add them to a project. Patriai doesn't list prices.
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        ),
      )}
      {chat.isPending || (directory.isLoading && messages.length === 1) ? <ActivityIndicator color={pt.brand} style={{ alignSelf: 'flex-start', marginLeft: 8 }} /> : null}
    </PtPageScreen>
  );
}
