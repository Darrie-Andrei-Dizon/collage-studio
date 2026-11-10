/**
 * UI kit modelled on Apple's Human Interface Guidelines: iOS system colors (light and
 * dark), the SF type scale, grouped inset lists, segmented controls, iOS steppers,
 * switches and sliders, page dots and haptic feedback.
 */
import { ImageFormat, Skia } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Platform,
  Pressable,
  Switch,
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
/* iOS system colors                                                    */
/* ------------------------------------------------------------------ */

export interface Palette {
  name: 'light' | 'dark';
  /** systemGroupedBackground */
  bg: string;
  /** secondarySystemGroupedBackground (cards, list rows) */
  card: string;
  /** tertiarySystemGroupedBackground */
  card2: string;
  /** systemFill-style tints for controls */
  fill: string;
  fill2: string;
  separator: string;
  label: string;
  secondary: string;
  tertiary: string;
  tint: string;
  tintSoft: string;
  pink: string;
  green: string;
  orange: string;
  red: string;
  /** Selected segment background in a segmented control. */
  segment: string;
  stage: string;
  thumbBg: string;
}

export const DARK: Palette = {
  name: 'dark',
  bg: '#000000',
  card: '#1C1C1E',
  card2: '#2C2C2E',
  fill: 'rgba(118,118,128,0.24)',
  fill2: 'rgba(118,118,128,0.36)',
  separator: 'rgba(84,84,88,0.6)',
  label: '#FFFFFF',
  secondary: 'rgba(235,235,245,0.6)',
  tertiary: 'rgba(235,235,245,0.3)',
  tint: '#0A84FF',
  tintSoft: 'rgba(10,132,255,0.18)',
  pink: '#FF375F',
  green: '#30D158',
  orange: '#FF9F0A',
  red: '#FF453A',
  segment: '#636366',
  stage: '#000000',
  thumbBg: '#2C2C2E',
};

export const LIGHT: Palette = {
  name: 'light',
  bg: '#F2F2F7',
  card: '#FFFFFF',
  card2: '#F2F2F7',
  fill: 'rgba(118,118,128,0.12)',
  fill2: 'rgba(118,118,128,0.2)',
  separator: 'rgba(60,60,67,0.29)',
  label: '#000000',
  secondary: 'rgba(60,60,67,0.6)',
  tertiary: 'rgba(60,60,67,0.3)',
  tint: '#007AFF',
  tintSoft: 'rgba(0,122,255,0.12)',
  pink: '#FF2D55',
  green: '#34C759',
  orange: '#FF9500',
  red: '#FF3B30',
  segment: '#FFFFFF',
  stage: '#F2F2F7',
  thumbBg: '#E5E5EA',
};

const ThemeCtx = createContext<Palette>(DARK);
export const ThemeProvider = ThemeCtx.Provider;
export const useTheme = () => useContext(ThemeCtx);

/* ------------------------------------------------------------------ */
/* Haptics (no-ops on web)                                              */
/* ------------------------------------------------------------------ */

export const haptic = {
  select: () => Platform.OS !== 'web' && Haptics.selectionAsync().catch(() => {}),
  tap: () => Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  success: () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
};

/* ------------------------------------------------------------------ */
/* Typography: the iOS Dynamic Type "Large" sizes                       */
/* ------------------------------------------------------------------ */

/** SF Pro on Apple devices; Inter (loaded by the web page) elsewhere. */
const family = Platform.OS === 'web' ? '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, system-ui, sans-serif' : undefined;

const TYPE = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.37 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: 0.36 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: 0.35 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600', letterSpacing: 0.38 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.41 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400', letterSpacing: -0.41 },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400', letterSpacing: -0.32 },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.24 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: -0.08 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400', letterSpacing: 0 },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: '400', letterSpacing: 0.07 },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof TYPE;
type Tone = 'label' | 'secondary' | 'tertiary' | 'tint' | 'red' | 'orange' | 'green' | 'white';

export function T({
  v = 'body',
  tone = 'label',
  weight,
  style,
  ...rest
}: TextProps & { v?: TypeVariant; tone?: Tone; weight?: TextStyle['fontWeight']; style?: StyleProp<TextStyle> }) {
  const c = useTheme();
  const color = tone === 'white' ? '#FFFFFF' : (c as unknown as Record<string, string>)[tone];
  return <Text {...rest} style={[{ fontFamily: family, color }, TYPE[v], weight ? { fontWeight: weight } : null, style]} />;
}

/* ------------------------------------------------------------------ */
/* Buttons                                                              */
/* ------------------------------------------------------------------ */

/** iOS 15+ button styles: filled, tinted, gray and plain. */
export function Button({
  label,
  icon,
  onPress,
  kind = 'filled',
  size = 'large',
  color,
  disabled,
  style,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  kind?: 'filled' | 'tinted' | 'gray' | 'plain';
  size?: 'large' | 'medium' | 'small';
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const tint = color ?? c.tint;
  const bg = kind === 'filled' ? tint : kind === 'tinted' ? (color ? `${color}2E` : c.tintSoft) : kind === 'gray' ? c.fill : 'transparent';
  const fg = kind === 'filled' ? '#FFFFFF' : kind === 'gray' ? c.label : tint;
  const pad = size === 'large' ? { height: 50, paddingHorizontal: 20, borderRadius: 14 } : size === 'medium' ? { height: 38, paddingHorizontal: 16, borderRadius: 999 } : { height: 30, paddingHorizontal: 12, borderRadius: 999 };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [
        { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: bg, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 },
        kind !== 'plain' && pad,
        kind === 'plain' && { minHeight: 44, paddingHorizontal: 8 },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={size === 'large' ? 20 : 17} color={fg} />}
      <T v={size === 'large' ? 'headline' : size === 'medium' ? 'subhead' : 'footnote'} weight="600" style={{ color: fg }}>
        {label}
      </T>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, disabled, active, tinted, size = 44 }: { icon: IconName; onPress: () => void; label: string; disabled?: boolean; active?: boolean; tinted?: boolean; size?: number }) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      hitSlop={4}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? c.tintSoft : 'transparent',
        opacity: disabled ? 0.3 : pressed ? 0.5 : 1,
      })}
    >
      <Icon name={icon} size={22} color={active || tinted ? c.tint : c.label} strokeWidth={1.8} />
    </Pressable>
  );
}

/** Icon over a caption, like the Photos editing toolbar. */
export function ToolbarItem({ icon, label, onPress, active, destructive }: { icon: IconName; label: string; onPress: () => void; active?: boolean; destructive?: boolean }) {
  const c = useTheme();
  const color = destructive ? c.red : active ? c.tint : c.label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => ({ alignItems: 'center', justifyContent: 'center', minWidth: 60, height: 50, gap: 3, opacity: pressed ? 0.5 : 1 })}
    >
      <Icon name={icon} size={23} color={color} strokeWidth={1.7} />
      <T v="caption2" weight="500" style={{ color: destructive ? c.red : active ? c.tint : c.secondary }}>
        {label}
      </T>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control                                                    */
/* ------------------------------------------------------------------ */

export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
  style,
  compact,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const c = useTheme();
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: 'row', backgroundColor: c.fill, borderRadius: 9, padding: 2 }, style]}>
      {options.map((o, i) => {
        const on = o.value === value;
        const prevOn = i > 0 && options[i - 1].value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => {
              if (!on) haptic.select();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              height: compact ? 28 : 32,
              borderRadius: 7,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 6,
              backgroundColor: on ? c.segment : 'transparent',
              shadowColor: '#000',
              shadowOpacity: on ? 0.12 : 0,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
              borderLeftWidth: i > 0 && !on && !prevOn ? 0.5 : 0,
              borderLeftColor: c.separator,
            }}
          >
            <T v={compact ? 'footnote' : 'subhead'} weight={on ? '600' : '500'} numberOfLines={1}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Grouped inset list                                                   */
/* ------------------------------------------------------------------ */

export function Section({ header, footer, children, style }: { header?: string; footer?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ gap: 6 }, style]}>
      {header && (
        <T v="footnote" tone="secondary" style={{ textTransform: 'uppercase', paddingHorizontal: 16 }}>
          {header}
        </T>
      )}
      <View style={{ backgroundColor: c.card, borderRadius: 12, overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 && <View style={{ height: 0.5, backgroundColor: c.separator, marginLeft: 16 }} />}
            {row}
          </View>
        ))}
      </View>
      {footer && (
        <T v="footnote" tone="secondary" style={{ paddingHorizontal: 16 }}>
          {footer}
        </T>
      )}
    </View>
  );
}

export function Row({
  label,
  detail,
  subtitle,
  accessory,
  checked,
  onPress,
  icon,
  iconBg,
}: {
  label: string;
  detail?: string;
  subtitle?: string;
  accessory?: React.ReactNode;
  checked?: boolean;
  onPress?: () => void;
  icon?: IconName;
  iconBg?: string;
}) {
  const c = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 16, paddingVertical: subtitle ? 8 : 6, gap: 12 }}>
      {icon && (
        <View style={{ width: 29, height: 29, borderRadius: 7, backgroundColor: iconBg ?? c.tint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={17} color="#FFFFFF" strokeWidth={2} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <T v="body">{label}</T>
        {subtitle && (
          <T v="footnote" tone="secondary">
            {subtitle}
          </T>
        )}
      </View>
      {detail && (
        <T v="body" tone="secondary" style={{ fontVariant: ['tabular-nums'] }}>
          {detail}
        </T>
      )}
      {accessory}
      {checked !== undefined && <View style={{ width: 22, alignItems: 'flex-end' }}>{checked && <Icon name="check" size={20} color={c.tint} strokeWidth={2.4} />}</View>}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!checked }}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => ({ backgroundColor: pressed ? c.fill : 'transparent' })}
    >
      {body}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Stepper, switch, slider, progress, page dots, toast                  */
/* ------------------------------------------------------------------ */

/** UIStepper: a − | + pill. */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const c = useTheme();
  const btn = (sign: -1 | 1) => {
    const disabled = sign < 0 ? value <= min : value >= max;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={sign < 0 ? `Fewer ${label}` : `More ${label}`}
        disabled={disabled}
        onPress={() => {
          haptic.select();
          onChange(value + sign);
        }}
        style={({ pressed }) => ({ width: 46, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.fill2 : 'transparent', opacity: disabled ? 0.3 : 1 })}
      >
        <Icon name={sign < 0 ? 'minus' : 'plus'} size={18} color={c.label} strokeWidth={2} />
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.fill, borderRadius: 8, overflow: 'hidden' }}>
      {btn(-1)}
      <View style={{ width: 0.5, height: 18, backgroundColor: c.separator }} />
      {btn(1)}
    </View>
  );
}

export function IOSSwitch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const c = useTheme();
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={(v) => {
        haptic.select();
        onChange(v);
      }}
      trackColor={{ false: c.fill2, true: c.green }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={c.fill2}
      {...(Platform.OS === 'web' ? ({ activeThumbColor: '#FFFFFF' } as object) : {})}
    />
  );
}

/** UISlider: thin track, tint fill, white knob with a soft shadow. */
export function Slider({ label, value, min, max, onChange, onStart }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; onStart?: () => void }) {
  const c = useTheme();
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="footnote" tone="secondary">
          {label}
        </T>
        <T v="footnote" weight="600" style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </T>
      </View>
      <View
        {...responder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value }}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
        style={{ height: 34, justifyContent: 'center' }}
      >
        <View pointerEvents="none" style={{ height: 4, borderRadius: 2, backgroundColor: c.fill2, overflow: 'hidden' }}>
          <View style={{ height: 4, width: f * width, backgroundColor: c.tint }} />
        </View>
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: f * width - 14, top: 3, width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}
        />
      </View>
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const c = useTheme();
  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: c.fill2, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, height: 4, backgroundColor: c.tint, borderRadius: 2 }} />
    </View>
  );
}

/** UIPageControl. */
export function PageDots({ count, index, onSelect }: { count: number; index: number; onSelect: (i: number) => void }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: c.fill, borderRadius: 999, paddingHorizontal: 8, height: 26 }}>
      {Array.from({ length: count }, (_, i) => (
        <Pressable
          key={i}
          accessibilityRole="button"
          accessibilityLabel={`Slide ${i + 1}`}
          accessibilityState={{ selected: i === index }}
          hitSlop={{ top: 10, bottom: 10 }}
          onPress={() => {
            haptic.select();
            onSelect(i);
          }}
          style={{ paddingHorizontal: count > 12 ? 2.5 : 4, height: 26, justifyContent: 'center' }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: i === index ? c.label : c.tertiary }} />
        </Pressable>
      ))}
    </View>
  );
}

/** HUD-style confirmation that fades in and out. */
export function Toast({ message }: { message: { text: string; id: number } | null }) {
  const c = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    setShown(message.text);
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }),
      Animated.delay(1800),
      Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [message, opacity]);
  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', top: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.name === 'dark' ? 'rgba(44,44,46,0.96)' : 'rgba(255,255,255,0.97)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, opacity, zIndex: 20 }}
    >
      <Icon name="check" size={16} color={c.green} strokeWidth={2.4} />
      <T v="subhead" weight="600">
        {shown}
      </T>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Template thumbnails                                                  */
/* ------------------------------------------------------------------ */

const PLACEHOLDER = ['#BF9BFF', '#FF9EC4', '#FFBF7F', '#8EC5FF', '#7FDDA7', '#FFE07A', '#A7B4FF', '#F3A6FF', '#7FE3F0', '#FFA3A3'];
const thumbCache = new Map<string, string>();

/**
 * Renders a template preview once into a small PNG (cached). Plain images instead of
 * one live Skia canvas per thumbnail keep long lists cheap and avoid the browser's
 * limit of ~16 WebGL contexts on the web demo.
 */
function thumbUri(template: Template, w: number, h: number, bg: string): string {
  const px = Math.max(1, Math.round(w * 2));
  const py = Math.max(1, Math.round(h * 2));
  const key = `${template.id}|${px}|${py}|${bg}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const surface = Skia.Surface.Make(px, py);
  if (!surface) return '';
  const design: Design = { ...DEFAULT_DESIGN, gap: 34, margin: 34, radius: 26, background: bg, shadow: false };
  const canvas = surface.getCanvas();
  // Draw at 1080 px per slide, scaled down, so spacing matches the editor.
  const vw = 1080 * template.cols;
  const vh = (vw * h) / w;
  canvas.save();
  canvas.scale(px / vw, py / vh);
  drawBackground(canvas, vw, vh, design);
  resolveCells(template, vw, vh, design, 1).forEach((cell, i) =>
    drawCell(canvas, cell, { image: null, transform: IDENTITY, design, unit: 1, placeholder: true, placeholderColor: PLACEHOLDER[i % PLACEHOLDER.length] }),
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
  const c = useTheme();
  const ratio = (template.cols * aspect) / template.rows;
  const w = Math.min(maxW, maxH * ratio);
  const h = w / ratio;
  const uri = useMemo(() => thumbUri(template, w, h, c.thumbBg), [template, w, h, c.thumbBg]);
  return uri ? <Image source={{ uri }} style={{ width: w, height: h, borderRadius: 6 }} /> : <View style={{ width: w, height: h }} />;
}
