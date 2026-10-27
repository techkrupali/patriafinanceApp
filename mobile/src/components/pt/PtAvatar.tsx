import React from 'react';
import { Image, Text, View } from 'react-native';
import { pt, ptFont } from '../../theme';

/** `pt-av` colourways; `dashed` is a pending invite. */
export type PtAvatarTone = 'brand' | 'mint' | 'gold' | 'deep' | 'dashed';

const tones: Record<Exclude<PtAvatarTone, 'dashed'>, { bg: string; fg: string }> = {
  brand: { bg: pt.emerald700, fg: '#FFFFFF' },
  mint: { bg: pt.emerald100, fg: pt.emerald900 },
  gold: { bg: pt.gold500, fg: '#2A1B00' },
  deep: { bg: pt.emerald900, fg: pt.emerald50 },
};

/** Cycles colourways down a list of people, after the first (you) in brand. */
export const AVATAR_CYCLE: PtAvatarTone[] = ['mint', 'deep', 'gold', 'brand'];

export function PtAvatar({
  initials,
  size = 40,
  tone = 'brand',
  uri,
}: {
  initials: string;
  size?: number;
  tone?: PtAvatarTone;
  uri?: string | null;
}) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  const dashed = tone === 'dashed';
  const c = dashed ? { bg: 'transparent', fg: pt.inkMuted } : tones[tone];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.bg,
        alignItems: 'center',
        justifyContent: 'center',
        ...(dashed ? { borderWidth: 2, borderStyle: 'dashed', borderColor: pt.lineStrong } : null),
      }}
    >
      <Text style={{ fontFamily: ptFont.bold, fontSize: Math.round(size * 0.35), color: c.fg }}>{initials}</Text>
    </View>
  );
}
