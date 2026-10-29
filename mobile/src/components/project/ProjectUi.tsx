import React from 'react';
import { ActivityIndicator, Image, Text, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { pt, ptFont, ptRadius } from '../../theme';
import { selection } from '../../lib/haptics';
import { PtCheckbox } from '../pt/PtCheck';
import { PtAvatar, type PtAvatarTone } from '../pt/PtAvatar';
import { PtChip, type PtChipTone } from '../pt/PtChip';
import { PtText } from '../pt/PtText';

/**
 * Pieces shared by the project, vendor and dispute screens of the client
 * sheet "Projects, vendors, disputes".
 */

type FeatherName = React.ComponentProps<typeof Feather>['name'];

/** "In the wallet ₦2,200,000 | Paid so far ₦2,700,000": a dark tile and a white one. */
export function MoneyTiles({
  left,
  right,
  onPress,
}: {
  left: { label: string; value: string };
  right: { label: string; value: string };
  onPress?: () => void;
}) {
  const body = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1, backgroundColor: pt.emerald900, borderRadius: ptRadius.md, paddingHorizontal: 14, paddingVertical: 12, gap: 2 }}>
        <Text style={{ fontFamily: ptFont.medium, fontSize: 12, color: pt.onDarkMuted }}>{left.label}</Text>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 19, color: '#FFFFFF' }} numberOfLines={1} adjustsFontSizeToFit>
          {left.value}
        </Text>
      </View>
      <View style={{ flex: 1, backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingHorizontal: 14, paddingVertical: 12, gap: 2 }}>
        <Text style={{ fontFamily: ptFont.medium, fontSize: 12, color: pt.inkMuted }}>{right.label}</Text>
        <Text style={{ fontFamily: ptFont.extrabold, fontSize: 19, color: pt.ink }} numberOfLines={1} adjustsFontSizeToFit>
          {right.value}
        </Text>
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={() => { selection(); onPress(); }} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

/** Thin brand bar on a sunken track. */
export function ProgressLine({ value, max, height = 6 }: { value: number; max: number; height?: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: pt.sunken, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height, borderRadius: height / 2, backgroundColor: pt.brand }} />
    </View>
  );
}

const CARD_TONES = {
  gold: { bg: '#FDEBC8', title: pt.ink, sub: pt.inkMuted },
  danger: { bg: pt.dangerSoft, title: pt.ink, sub: pt.inkMuted },
  info: { bg: pt.infoSoft, title: pt.ink, sub: pt.inkMuted },
  mint: { bg: pt.brandSoft, title: pt.brand, sub: pt.inkMuted },
};

/** "Adeyemi Builders finished tiling — Check the photos and release ₦1,710,000 ›" */
export function AttentionCard({
  title,
  sub,
  onPress,
  tone = 'gold',
  right,
}: {
  title: string;
  sub?: string;
  onPress?: () => void;
  tone?: keyof typeof CARD_TONES;
  right?: React.ReactNode;
}) {
  const t = CARD_TONES[tone];
  const body = (
    <View style={{ backgroundColor: t.bg, borderRadius: ptRadius.md, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, lineHeight: 21, color: t.title }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 14, lineHeight: 20, color: t.sub }}>{sub}</Text> : null}
      </View>
      {right ?? (onPress ? <Feather name="chevron-right" size={20} color={pt.inkMuted} /> : null)}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={() => { selection(); onPress(); }} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

export type TimelineState = 'done' | 'now' | 'todo';

/** PRJ-04 / VDM-04 / DSP-05: ticked circles, an orange dot for now, open circles after. */
export function Timeline({
  items,
}: {
  items: { key: string | number; state: TimelineState; title: string; sub?: string; meta?: string; onPress?: () => void }[];
}) {
  return (
    <View>
      {items.map((it, i) => {
        const last = i === items.length - 1;
        const dot =
          it.state === 'done' ? (
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: pt.brand, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="check" size={14} color="#FFFFFF" />
            </View>
          ) : it.state === 'now' ? (
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: pt.gold500 }} />
          ) : (
            <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: pt.lineStrong, backgroundColor: pt.surface }} />
          );
        const row = (
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ alignItems: 'center', width: 24 }}>
              {dot}
              {!last ? <View style={{ flex: 1, width: 2, backgroundColor: it.state === 'done' ? pt.brand : pt.line, marginVertical: 2 }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 18, gap: 2 }}>
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, lineHeight: 21, color: pt.ink }}>{it.title}</Text>
              {it.sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 13, lineHeight: 18, color: pt.inkMuted }}>{it.sub}</Text> : null}
              {it.meta ? <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 16, color: pt.inkSubtle }}>{it.meta}</Text> : null}
            </View>
          </View>
        );
        return it.onPress ? (
          <Pressable key={it.key} onPress={() => { selection(); it.onPress?.(); }} accessibilityRole="button">
            {row}
          </Pressable>
        ) : (
          <View key={it.key}>{row}</View>
        );
      })}
    </View>
  );
}

/** PRJ-06 / VDM-05 / DSP-04: square photos in threes with a label, and a dashed camera tile to add. */
export function PhotoGrid({
  photos,
  onAdd,
  onRemove,
  adding = false,
}: {
  photos: { key: string | number; url: string; caption?: string | null; video?: boolean; document?: boolean }[];
  onAdd?: () => void;
  onRemove?: (key: string | number) => void;
  adding?: boolean;
}) {
  const tile = { width: '31.5%' as const, aspectRatio: 1, borderRadius: ptRadius.sm, overflow: 'hidden' as const };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {photos.map((p) => (
        <View key={p.key} style={[tile, { backgroundColor: pt.sunken }]}>
          {p.document || p.video ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Feather name={p.video ? 'video' : 'file-text'} size={24} color={pt.brand} />
            </View>
          ) : (
            <Image source={{ uri: p.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          )}
          {p.caption ? (
            <View style={{ position: 'absolute', left: 6, bottom: 6, maxWidth: '88%', backgroundColor: 'rgba(14,26,22,0.6)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontFamily: ptFont.semibold, fontSize: 10, color: '#FFFFFF' }} numberOfLines={1}>
                {p.caption}
              </Text>
            </View>
          ) : null}
          {onRemove ? (
            <Pressable
              onPress={() => { selection(); onRemove(p.key); }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Remove"
              style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(14,26,22,0.6)', alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="x" size={14} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </View>
      ))}
      {onAdd ? (
        <Pressable
          onPress={() => { selection(); onAdd(); }}
          disabled={adding}
          accessibilityRole="button"
          accessibilityLabel="Add a photo"
          style={[tile, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: pt.lineStrong, alignItems: 'center', justifyContent: 'center' }]}
        >
          {adding ? <ActivityIndicator color={pt.brand} /> : <Feather name="camera" size={22} color={pt.brand} />}
        </Pressable>
      ) : null}
    </View>
  );
}

/** "Floors tiled in every room · Builder ticked ☑". */
export function TickRow({ title, sub, checked, onToggle, last = false }: { title: string; sub?: string; checked: boolean; onToggle?: () => void; last?: boolean }) {
  const body = (
    <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontFamily: ptFont.medium, fontSize: 15, lineHeight: 21, color: pt.ink }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{sub}</Text> : null}
      </View>
      <PtCheckbox checked={checked} />
    </View>
  );
  if (!onToggle) return body;
  return (
    <Pressable onPress={() => { selection(); onToggle(); }} accessibilityRole="button" accessibilityState={{ selected: checked }} accessibilityLabel={title}>
      {body}
    </Pressable>
  );
}

/** VON-03…08 dashed box: upload icon, what to send, "Take photo" and "Upload file"; or the file once it's in. */
export function UploadBox({
  title,
  hint,
  onTake,
  onUpload,
  done,
  busy = false,
}: {
  title: string;
  hint?: string;
  onTake: () => void;
  onUpload: () => void;
  done?: { name: string; sub?: string; onReplace: () => void } | null;
  busy?: boolean;
}) {
  if (done) {
    return (
      <View style={{ backgroundColor: pt.raised, borderRadius: ptRadius.md, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: pt.sunken, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="file-text" size={20} color={pt.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 14, color: pt.ink }}>{title}</Text>
          <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.brand }} numberOfLines={1}>
            {done.sub ?? done.name}
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator color={pt.brand} />
        ) : (
          <Pressable onPress={() => { selection(); done.onReplace(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Replace ${title}`}>
            <Text style={{ fontFamily: ptFont.bold, fontSize: 14, color: pt.brand }}>Replace</Text>
          </Pressable>
        )}
      </View>
    );
  }
  const small = (label: string, icon: FeatherName, onPress: () => void) => (
    <Pressable
      onPress={() => { selection(); onPress(); }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${title}`}
      style={{ height: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: pt.brandSoft, flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <Feather name={icon} size={14} color={pt.brand} />
      <Text style={{ fontFamily: ptFont.semibold, fontSize: 13, color: pt.brand }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: pt.lineStrong, borderRadius: ptRadius.md, paddingVertical: 18, paddingHorizontal: 14, alignItems: 'center', gap: 6 }}>
      {busy ? <ActivityIndicator color={pt.brand} /> : <Feather name="upload" size={22} color={pt.brand} />}
      <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink, textAlign: 'center' }}>{title}</Text>
      {hint ? <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted, textAlign: 'center' }}>{hint}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
        {small('Take photo', 'camera', onTake)}
        {small('Upload file', 'file', onUpload)}
      </View>
    </View>
  );
}

/** A person with a line under them and a chip on the right (approvers, team, directors). */
export function PersonRow({
  initials,
  name,
  sub,
  chip,
  tone = 'mint',
  last = false,
  onPress,
}: {
  initials: string;
  name: string;
  sub?: string;
  chip?: { label: string; tone: PtChipTone; icon?: FeatherName } | null;
  tone?: PtAvatarTone;
  last?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>
      <PtAvatar initials={initials} tone={tone} size={40} />
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.ink }}>{name}</Text>
        {sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 12, lineHeight: 16, color: pt.inkMuted }}>{sub}</Text> : null}
      </View>
      {chip ? <PtChip label={chip.label} tone={chip.tone} icon={chip.icon} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={() => { selection(); onPress(); }} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

/** PRJ-03 "Money · Chat · Budget · Documents". */
export function ActionTiles({ items }: { items: { label: string; icon: FeatherName; onPress: () => void }[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {items.map((it) => (
        <Pressable
          key={it.label}
          onPress={() => { selection(); it.onPress(); }}
          accessibilityRole="button"
          style={{ flex: 1, backgroundColor: pt.raised, borderRadius: ptRadius.md, paddingVertical: 14, alignItems: 'center', gap: 6 }}
        >
          <Feather name={it.icon} size={20} color={pt.brand} />
          <Text style={{ fontFamily: ptFont.semibold, fontSize: 13, color: pt.ink }}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Mint halo, emerald disc, white tick and a gold dot (INV-V4, DSP-09, VON-10). */
export function DoneHero({ initials }: { initials?: string }) {
  if (initials) {
    return (
      <View style={{ width: 112, height: 112 }}>
        <PtAvatar initials={initials} tone="gold" size={112} />
        <View style={{ position: 'absolute', right: 0, bottom: 4, width: 36, height: 36, borderRadius: 18, backgroundColor: pt.brand, borderWidth: 3, borderColor: pt.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="check" size={18} color="#FFFFFF" />
        </View>
      </View>
    );
  }
  return (
    <View style={{ width: 128, height: 128, borderRadius: 64, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: pt.emerald700, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="check" size={36} color="#FFFFFF" />
      </View>
      <View style={{ position: 'absolute', top: 8, right: 10, width: 14, height: 14, borderRadius: 7, backgroundColor: pt.gold500 }} />
    </View>
  );
}

/** ★★★★☆ — tappable when `onChange` is given (VND-04). */
export function Stars({ value, size = 14, onChange }: { value: number; size?: number; onChange?: (n: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: onChange ? 14 : 2 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const star = <Text style={{ fontSize: size, color: n <= Math.round(value) ? pt.gold500 : pt.lineStrong }}>★</Text>;
        return onChange ? (
          <Pressable key={n} onPress={() => { selection(); onChange(n); }} accessibilityRole="button" accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`} hitSlop={6}>
            {star}
          </Pressable>
        ) : (
          <View key={n}>{star}</View>
        );
      })}
    </View>
  );
}

/** A file row: icon tile, name and a line under it, chevron (PRJ-09 documents, an attached quote). */
export function FileRow({ title, sub, icon = 'file-text', onPress, last = false, right }: { title: string; sub?: string; icon?: FeatherName; onPress?: () => void; last?: boolean; right?: React.ReactNode }) {
  const body = (
    <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: pt.line }}>
      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: pt.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={18} color={pt.brand} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontFamily: ptFont.semibold, fontSize: 15, color: pt.ink }} numberOfLines={1}>
          {title}
        </Text>
        {sub ? <Text style={{ fontFamily: ptFont.regular, fontSize: 12, color: pt.inkMuted }}>{sub}</Text> : null}
      </View>
      {right ?? (onPress ? <Feather name="chevron-right" size={18} color={pt.inkSubtle} /> : null)}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={() => { selection(); onPress(); }} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

/** Centred spinner or a short message with a retry, while a screen's data loads. */
export function LoadingBlock({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  return (
    <View style={{ paddingVertical: 60, alignItems: 'center', gap: 12 }}>
      {error ? (
        <>
          <PtText color={pt.inkMuted} style={{ textAlign: 'center' }}>
            {error}
          </PtText>
          {onRetry ? (
            <Pressable onPress={onRetry} accessibilityRole="button">
              <Text style={{ fontFamily: ptFont.bold, fontSize: 15, color: pt.brand }}>Try again</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <ActivityIndicator color={pt.brand} />
      )}
    </View>
  );
}

/** A text box several lines tall ("Note for the family", "Tell us what happened"). */
export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  maxLength = 1000,
  minHeight = 104,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  minHeight?: number;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ gap: 8 }}>
      {label ? <PtText variant="label">{label}</PtText> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={pt.inkSubtle}
        multiline
        maxLength={maxLength}
        textAlignVertical="top"
        accessibilityLabel={label ?? placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        selectionColor={pt.brand}
        style={{
          minHeight,
          borderRadius: ptRadius.sm,
          borderWidth: focused ? 2 : 1.5,
          borderColor: focused ? pt.brand : pt.lineStrong,
          backgroundColor: pt.raised,
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: 12,
          fontFamily: ptFont.regular,
          fontSize: 15,
          lineHeight: 22,
          color: pt.ink,
        }}
      />
    </View>
  );
}
