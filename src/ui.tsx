import { ImageFormat, Skia } from '@shopify/react-native-skia';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from './icons';
import { DEFAULT_DESIGN, drawBackground, drawCell, drawSeams, IDENTITY, resolveCells, type Design } from './render';
import type { Template } from './templates';

/* ------------------------------------------------------------------ */
/* Tokens                                                               */
/* ------------------------------------------------------------------ */

export const theme = {
  bg: '#0B0A10',
  surface: '#14121B',
  surface2: '#1C1926',
  surface3: '#262233',
  border: '#2C2839',
  borderStrong: '#3B3550',
  text: '#F5F3FA',
  muted: '#A39DB8',
  faint: '#6F6985',
  accent: '#8B5CF6',
  accentHi: '#A78BFA',
  accentSoft: 'rgba(139, 92, 246, 0.16)',
  pink: '#F472B6',
  amber: '#FBBF24',
  danger: '#F87171',
  success: '#34D399',
};

/** Plus Jakarta Sans on web (loaded by the page); the platform font on phones. */
const family = Platform.OS === 'web' ? '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : undefined;

export const type = StyleSheet.create({
  display: { fontFamily: family, fontSize: 30, lineHeight: 36, fontWeight: '800', color: theme.text, letterSpacing: -0.6 },
  title: { fontFamily: family, fontSize: 18, lineHeight: 24, fontWeight: '700', color: theme.text, letterSpacing: -0.2 },
  body: { fontFamily: family, fontSize: 14, lineHeight: 20, fontWeight: '500', color: theme.text },
  small: { fontFamily: family, fontSize: 12.5, lineHeight: 17, fontWeight: '500', color: theme.muted },
  label: { fontFamily: family, fontSize: 11, lineHeight: 14, fontWeight: '700', color: theme.faint, letterSpacing: 0.9, textTransform: 'uppercase' },
  num: { fontFamily: family, fontVariant: ['tabular-nums'] },
});

export function T({ v = 'body', style, ...rest }: TextProps & { v?: keyof typeof type; style?: StyleProp<TextStyle> }) {
  return <Text {...rest} style={[type[v], style]} />;
}

/* ------------------------------------------------------------------ */
/* Controls                                                             */
/* ------------------------------------------------------------------ */

export function Button({
  label,
  icon,
  onPress,
  kind = 'primary',
  disabled,
  style,
  compact,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'pink';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const bg = kind === 'primary' ? theme.accent : kind === 'pink' ? theme.pink : kind === 'secondary' ? theme.surface3 : 'transparent';
  const fg = kind === 'ghost' ? theme.muted : kind === 'pink' ? '#2A0B1C' : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && { paddingVertical: 9, paddingHorizontal: 14 },
        { backgroundColor: bg },
        kind === 'secondary' && { borderWidth: 1, borderColor: theme.borderStrong },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.85 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={compact ? 16 : 18} color={fg} />}
      <Text style={[type.body, { color: fg, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  disabled,
  active,
  size = 40,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  disabled?: boolean;
  active?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? theme.accentSoft : pressed ? theme.surface3 : 'transparent',
        opacity: disabled ? 0.3 : 1,
      })}
    >
      <Icon name={icon} size={20} color={active ? theme.accentHi : theme.text} />
    </Pressable>
  );
}

/** Icon-over-label tool button (selected-photo toolbar, editor dock). */
export function ToolButton({ icon, label, onPress, active, danger }: { icon: IconName; label: string; onPress: () => void; active?: boolean; danger?: boolean }) {
  const color = danger ? theme.danger : active ? theme.accentHi : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ alignItems: 'center', minWidth: 58, paddingVertical: 6, paddingHorizontal: 4, borderRadius: 12, backgroundColor: pressed ? theme.surface3 : 'transparent' })}
    >
      <Icon name={icon} size={21} color={color} />
      <Text style={[type.small, { color: active ? theme.accentHi : danger ? theme.danger : theme.muted, fontSize: 11, marginTop: 4, fontWeight: '600' }]}>{label}</Text>
      {active && <View style={{ position: 'absolute', bottom: -2, width: 18, height: 3, borderRadius: 2, backgroundColor: theme.accent }} />}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }} style={[styles.chip, active && styles.chipActive]}>
      {icon && <Icon name={icon} size={14} color={active ? '#fff' : theme.muted} />}
      <Text style={[type.small, { fontWeight: '700', color: active ? '#fff' : theme.muted }]}>{label}</Text>
    </Pressable>
  );
}

/** − value + control. */
export function Stepper({ value, min, max, onChange, suffix }: { value: number; min: number; max: number; onChange: (v: number) => void; suffix: string }) {
  return (
    <View style={styles.stepper}>
      <IconButton icon="minus" label="Fewer" size={36} disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))} />
      <View style={{ minWidth: 84, alignItems: 'center' }}>
        <T v="title" style={type.num}>
          {value}
        </T>
        <T v="small" style={{ fontSize: 11, lineHeight: 13 }}>
          {suffix}
        </T>
      </View>
      <IconButton icon="plus" label="More" size={36} disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} />
    </View>
  );
}

/** Minimal dependency-free slider. */
export function Slider({ label, value, min, max, onChange, onStart }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; onStart?: () => void }) {
  const [width, setWidth] = useState(1);
  const widthRef = useRef(1);
  const cb = useRef({ onChange, onStart, min, max });
  cb.current = { onChange, onStart, min, max };

  const set = (x: number) => {
    const f = Math.max(0, Math.min(1, x / widthRef.current));
    const { min: lo, max: hi } = cb.current;
    cb.current.onChange(Math.round(lo + f * (hi - lo)));
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          cb.current.onStart?.();
          set(e.nativeEvent.locationX);
        },
        onPanResponderMove: (e) => set(e.nativeEvent.locationX),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const f = (value - min) / (max - min || 1);
  return (
    <View style={{ flex: 1, minWidth: 140 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
        <T v="small" style={{ fontWeight: '600' }}>
          {label}
        </T>
        <T v="small" style={[type.num, { color: theme.text, fontWeight: '700' }]}>
          {value}
        </T>
      </View>
      <View
        {...responder.panHandlers}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
        style={{ height: 30, justifyContent: 'center' }}
      >
        <View pointerEvents="none" style={styles.sliderTrack}>
          <View style={[styles.sliderFill, { width: f * width }]} />
        </View>
        <View pointerEvents="none" style={[styles.sliderThumb, { left: f * width - 10 }]} />
      </View>
    </View>
  );
}

/** Short message that fades in and out above the canvas. */
export function Toast({ message }: { message: { text: string; id: number } | null }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    setShown(message.text);
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [message, opacity]);
  if (!shown) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.toast, { opacity }]}>
      <Icon name="check" size={16} color={theme.success} />
      <T v="small" style={{ color: theme.text, fontWeight: '600' }}>
        {shown}
      </T>
    </Animated.View>
  );
}

export function ProgressBar({ value, height = 4 }: { value: number; height?: number }) {
  return (
    <View style={{ height, borderRadius: height, backgroundColor: theme.surface3, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, height, backgroundColor: theme.accent, borderRadius: height }} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Template thumbnails                                                  */
/* ------------------------------------------------------------------ */

const PLACEHOLDER = ['#C4B5FD', '#F9A8D4', '#FDBA74', '#93C5FD', '#86EFAC', '#FDE68A', '#A5B4FC', '#F0ABFC', '#67E8F9', '#FCA5A5'];
const THUMB_DESIGN: Design = { ...DEFAULT_DESIGN, gap: 34, margin: 34, radius: 26, background: '#2A2540', shadow: false };
const thumbCache = new Map<string, string>();

/**
 * Renders a template preview once into a small PNG (cached). Plain images instead of
 * one live Skia canvas per thumbnail keep long lists cheap and avoid the browser's
 * limit of ~16 WebGL contexts on the web demo.
 */
function thumbUri(template: Template, w: number, h: number): string {
  const px = Math.max(1, Math.round(w * 2));
  const py = Math.max(1, Math.round(h * 2));
  const key = `${template.id}|${px}|${py}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const surface = Skia.Surface.Make(px, py);
  if (!surface) return '';
  const canvas = surface.getCanvas();
  // Draw at 1080 px per slide, scaled down, so spacing matches the editor.
  const vw = 1080 * template.cols;
  const vh = (vw * h) / w;
  canvas.save();
  canvas.scale(px / vw, py / vh);
  drawBackground(canvas, vw, vh, THUMB_DESIGN);
  resolveCells(template, vw, vh, THUMB_DESIGN, 1).forEach((c, i) =>
    drawCell(canvas, c, {
      image: null,
      transform: IDENTITY,
      design: THUMB_DESIGN,
      unit: 1,
      placeholder: true,
      placeholderColor: PLACEHOLDER[i % PLACEHOLDER.length],
    }),
  );
  canvas.restore();
  drawSeams(canvas, px, py, template.cols, template.rows);
  surface.flush();
  const img = surface.makeImageSnapshot();
  const uri = `data:image/png;base64,${img.encodeToBase64(ImageFormat.PNG, 100)}`;
  img.dispose();
  surface.dispose();
  thumbCache.set(key, uri);
  return uri;
}

/** Fits the whole template (all slides) into maxW × maxH. `aspect` is one slide's width/height. */
export function TemplateThumb({ template, aspect, maxW, maxH }: { template: Template; aspect: number; maxW: number; maxH: number }) {
  const ratio = (template.cols * aspect) / template.rows;
  const w = Math.min(maxW, maxH * ratio);
  const h = w / ratio;
  const uri = useMemo(() => thumbUri(template, w, h), [template, w, h]);
  return uri ? <Image source={{ uri }} style={{ width: w, height: h, borderRadius: 8 }} /> : <View style={{ width: w, height: h }} />;
}

export const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.surface2,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 4,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  sliderTrack: { height: 4, borderRadius: 2, backgroundColor: theme.surface3, overflow: 'hidden' },
  sliderFill: { height: 4, backgroundColor: theme.accent },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    top: 5,
    borderWidth: 3,
    borderColor: theme.accent,
  },
  toast: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(28, 25, 38, 0.96)',
    borderColor: theme.borderStrong,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    zIndex: 20,
  },
});
