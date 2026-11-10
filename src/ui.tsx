import { createPicture, Canvas, Picture } from '@shopify/react-native-skia';
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { DEFAULT_DESIGN, drawBackground, drawCell, IDENTITY, resolveCells } from './render';
import type { Template } from './templates';

export const theme = {
  bg: '#0F0D16',
  surface: '#1A1724',
  surface2: '#242033',
  border: '#332E45',
  text: '#F4F2FA',
  muted: '#9C96B0',
  accent: '#8B5CF6',
  accent2: '#EC4899',
  danger: '#F87171',
};

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' && { backgroundColor: theme.accent },
        kind === 'secondary' && { backgroundColor: theme.surface2, borderWidth: 1, borderColor: theme.border },
        kind === 'ghost' && { backgroundColor: 'transparent' },
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, kind === 'ghost' && { color: theme.muted }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

/** Minimal dependency-free slider. */
export function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [width, setWidth] = useState(1);
  const widthRef = useRef(1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const range = useRef({ min, max });
  range.current = { min, max };

  const set = (x: number) => {
    const f = Math.max(0, Math.min(1, x / widthRef.current));
    const { min: lo, max: hi } = range.current;
    onChangeRef.current(Math.round(lo + f * (hi - lo)));
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => set(e.nativeEvent.locationX),
        onPanResponderMove: (e) => set(e.nativeEvent.locationX),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const f = (value - min) / (max - min || 1);
  return (
    <View style={{ marginVertical: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.label}>{value}</Text>
      </View>
      <View
        {...responder.panHandlers}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
        style={styles.sliderHit}
      >
        <View pointerEvents="none" style={styles.sliderTrack}>
          <View style={[styles.sliderFill, { width: f * width }]} />
        </View>
        <View pointerEvents="none" style={[styles.sliderThumb, { left: f * width - 11 }]} />
      </View>
    </View>
  );
}

const THUMB_DESIGN = { ...DEFAULT_DESIGN, gap: 40, margin: 40, background: '#2A2540', shadow: false };

/** Small Skia preview of a template layout. */
export function TemplateThumb({ template, size, aspect }: { template: Template; size: number; aspect: number }) {
  const w = aspect >= 1 ? size : size * aspect;
  const h = aspect >= 1 ? size / aspect : size;
  const picture = useMemo(
    () =>
      createPicture((canvas) => {
        // Draw at a 1080-wide virtual canvas, scaled down, so spacing matches the editor.
        const vw = 1080;
        const vh = 1080 / aspect;
        canvas.scale(w / vw, h / vh);
        drawBackground(canvas, vw, vh, THUMB_DESIGN);
        const cells = resolveCells(template, vw, vh, THUMB_DESIGN);
        cells.forEach((c) =>
          drawCell(canvas, c, {
            image: null,
            transform: IDENTITY,
            design: { ...THUMB_DESIGN, radius: 24 },
            scale: 1,
            placeholder: true,
            selected: false,
          }),
        );
      }),
    [template, w, h, aspect],
  );
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Canvas style={{ width: w, height: h, borderRadius: 6, overflow: 'hidden' }}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}

export const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.surface2,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { color: theme.muted, fontWeight: '600', fontSize: 13 },
  label: { color: theme.muted, fontSize: 13, fontWeight: '600' },
  sliderHit: { height: 32, justifyContent: 'center' },
  sliderTrack: { height: 4, borderRadius: 2, backgroundColor: theme.border, overflow: 'hidden' },
  sliderFill: { height: 4, backgroundColor: theme.accent },
  sliderThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    top: 5,
  },
});
