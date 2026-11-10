/**
 * Line icons drawn with Skia from SVG path data (24×24 grid, 2px stroke) and cached
 * as tiny PNGs. No icon font or extra native dependency, and identical on iOS,
 * Android and web.
 */
import { ImageFormat, PaintStyle, Skia, StrokeCap, StrokeJoin, TileMode } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

const PATHS = {
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M21 15l-5-5L5 21 M8.5 7a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z',
  layers: 'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  columns: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M12 3v18',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  layout: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M3 9h18 M9 21V9',
  slides: 'M2 6h14v12H2z M19 8v8 M22 10v4',
  ratio: 'M6 2v14a2 2 0 0 0 2 2h14 M18 22V8a2 2 0 0 0-2-2H2',
  sliders: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  droplet: 'M12 2.7l5.7 5.6a8 8 0 1 1-11.3 0z',
  undo: 'M3 7v6h6 M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13',
  redo: 'M21 7v6h-6 M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  trash: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  replace: 'M21 2v6h-6 M3 12a9 9 0 0 1 15-6.7L21 8 M3 22v-6h6 M21 12a9 9 0 0 1-15 6.7L3 16',
  zoomIn: 'M11 3a8 8 0 1 0 0 16a8 8 0 1 0 0-16z M21 21l-4.3-4.3 M11 8v6 M8 11h6',
  zoomOut: 'M11 3a8 8 0 1 0 0 16a8 8 0 1 0 0-16z M21 21l-4.3-4.3 M8 11h6',
  reset: 'M3 12a9 9 0 1 0 9-9 9.8 9.8 0 0 0-6.7 2.7L3 8 M3 3v5h5',
  swap: 'M16 3l4 4-4 4 M20 7H4 M8 21l-4-4 4-4 M4 17h16',
  focus: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2',
  overview: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  instagram: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z M16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4z M17.5 6.5h.01',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M16 6l-4-4-4 4 M12 2v13',
  check: 'M20 6L9 17l-5-5',
  close: 'M18 6L6 18 M6 6l12 12',
  info: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z M12 16v-4 M12 8h.01',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z',
  photos: 'M8 6h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z M2 16V4a2 2 0 0 1 2-2h12 M22 16l-4-4-7 7',
  wand: 'M15 4V2 M15 16v-2 M8 9h2 M20 9h2 M17.8 11.8L19 13 M15 9h.01 M17.8 6.2L19 5 M3 21l9-9 M12.2 6.2L11 5',
} as const;

export type IconName = keyof typeof PATHS;

const cache = new Map<string, string>();
const SCALE = 3;

function iconUri(name: IconName, size: number, color: string, strokeWidth: number): string {
  const key = `${name}|${size}|${color}|${strokeWidth}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const px = Math.round(size * SCALE);
  const surface = Skia.Surface.Make(px, px);
  const path = Skia.Path.MakeFromSVGString(PATHS[name]);
  if (!surface || !path) return '';
  const canvas = surface.getCanvas();
  canvas.scale(px / 24, px / 24);
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(strokeWidth);
  p.setStrokeCap(StrokeCap.Round);
  p.setStrokeJoin(StrokeJoin.Round);
  canvas.drawPath(path, p);
  surface.flush();
  const img = surface.makeImageSnapshot();
  const uri = `data:image/png;base64,${img.encodeToBase64(ImageFormat.PNG, 100)}`;
  img.dispose();
  surface.dispose();
  cache.set(key, uri);
  return uri;
}

export function Icon({
  name,
  size = 20,
  color = '#F5F3FA',
  strokeWidth = 2,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const uri = useMemo(() => iconUri(name, size, color, strokeWidth), [name, size, color, strokeWidth]);
  return <Image source={{ uri }} style={[{ width: size, height: size }, style]} accessibilityIgnoresInvertColors />;
}

/* Gradient swatches for the background picker (RN has no gradients without extra libs). */
const swatchCache = new Map<string, string>();
export function gradientUri(colors: [string, string], w: number, h: number, angle = 0, radius = 0): string {
  const key = `${colors.join()}|${w}|${h}|${angle}|${radius}`;
  const hit = swatchCache.get(key);
  if (hit) return hit;
  const pw = Math.round(w * 2);
  const ph = Math.round(h * 2);
  const surface = Skia.Surface.Make(pw, ph);
  if (!surface) return '';
  const c = surface.getCanvas();
  const a = (angle * Math.PI) / 180;
  const half = (Math.abs(Math.cos(a)) * pw + Math.abs(Math.sin(a)) * ph) / 2;
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setShader(
    Skia.Shader.MakeLinearGradient(
      { x: pw / 2 - Math.cos(a) * half, y: ph / 2 - Math.sin(a) * half },
      { x: pw / 2 + Math.cos(a) * half, y: ph / 2 + Math.sin(a) * half },
      [Skia.Color(colors[0]), Skia.Color(colors[1])],
      null,
      TileMode.Clamp,
    ),
  );
  c.drawRRect(Skia.RRectXY({ x: 0, y: 0, width: pw, height: ph }, radius * 2, radius * 2), p);
  surface.flush();
  const img = surface.makeImageSnapshot();
  const uri = `data:image/png;base64,${img.encodeToBase64(ImageFormat.PNG, 100)}`;
  img.dispose();
  surface.dispose();
  swatchCache.set(key, uri);
  return uri;
}
