/**
 * Renders sample collages with the app's real export pipeline (src/render.ts)
 * in Node, using synthetic 12 MP test photos. For multi-slide templates it
 * writes each slide plus a "strip" preview with the slides side by side.
 *
 *   npm run render:samples                      # a default selection
 *   npm run render:samples -- bridges-5 grid-heart-3
 */
import * as S from '@shopify/react-native-skia';
import fs from 'fs';
import path from 'path';

import { carouselTemplates, gridTemplates, splitTemplates } from '../src/multi';
import { DEFAULT_DESIGN, exportSlides, type Photo } from '../src/render';
import { TEMPLATES, type Template } from '../src/templates';

const { Skia } = S as any;
const OUT = process.env.OUT_DIR!;

function makePhoto(name: string, w: number, h: number, hue: number) {
  const surf = Skia.Surface.Make(w, h);
  const c = surf.getCanvas();
  const p = Skia.Paint();
  p.setShader(
    Skia.Shader.MakeLinearGradient({ x: 0, y: 0 }, { x: w, y: h },
      [Skia.Color(`hsl(${hue},75%,58%)`), Skia.Color(`hsl(${(hue + 100) % 360},70%,42%)`)], null, S.TileMode.Clamp),
  );
  c.drawRect({ x: 0, y: 0, width: w, height: h }, p);
  const dot = Skia.Paint();
  dot.setColor(Skia.Color('#ffffffaa'));
  c.drawCircle(w * 0.3, h * 0.3, Math.min(w, h) * 0.12, dot);
  surf.flush();
  const file = path.join(OUT, `src-${name}.jpg`);
  fs.writeFileSync(file, Buffer.from(surf.makeImageSnapshot().encodeToBytes(S.ImageFormat.JPEG, 95)));
  return file;
}

function allTemplates(): Template[] {
  const out: Template[] = [...TEMPLATES];
  for (let n = 2; n <= 20; n++) out.push(...carouselTemplates(n), ...splitTemplates(n));
  for (let r = 1; r <= 4; r++) out.push(...gridTemplates(r));
  return out;
}

(async () => {
  await (S as any).init();
  const sizes: [number, number][] = [[4032, 3024], [3024, 4032], [4000, 4000], [3000, 2000], [2000, 3000], [3024, 4032]];
  const sources = sizes.map(([w, h], i) => ({ uri: makePhoto(String(i), w, h, i * 55), w, h }));
  const all = allTemplates();
  const ids = process.argv.slice(2).length
    ? process.argv.slice(2)
    : ['grid-2x2', 'shape-18', 'free-2', 'bridges-4', 'cascade-4', 'split-across-4', 'split-zigzag-4', 'grid-heart-3', 'grid-offset-3'];

  for (const id of ids) {
    const t = all.find((x) => x.id === id);
    if (!t) { console.warn('unknown template', id); continue; }
    const photos: Photo[] = t.cells.map((_, i) => {
      const s = sources[i % sources.length];
      return { uri: s.uri, width: s.w, height: s.h, sourceLongSide: Math.max(s.w, s.h), transform: { scale: 1, offsetX: 0, offsetY: 0 } };
    });
    const aspect = t.mode === 'grid' ? 3 / 4 : t.preferredAspect === '9:16' ? 9 / 16 : 4 / 5;
    const design = { ...DEFAULT_DESIGN, radius: 16, gradient: t.mode === 'post' ? null : (['#FDE68A', '#F9A8D4'] as [string, string]) };
    const r = await exportSlides(t, design, photos, { slideWidth: 1080, aspect, format: 'png' });

    // Strip preview: slides laid out with small gaps, at reduced size.
    const k = 0.25, gap = 8;
    const sw = r.width * k, sh = r.height * k;
    const surf = Skia.Surface.Make(Math.round(t.cols * sw + (t.cols + 1) * gap), Math.round(t.rows * sh + (t.rows + 1) * gap));
    const c = surf.getCanvas();
    c.drawColor(Skia.Color('#1A1724'));
    for (const s of r.slides) {
      const img = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(new Uint8Array(fs.readFileSync(s.uri.replace('file://', '')))));
      c.drawImageRectOptions(img, { x: 0, y: 0, width: r.width, height: r.height },
        { x: gap + s.col * (sw + gap), y: gap + s.row * (sh + gap), width: sw, height: sh }, S.FilterMode.Linear, S.MipmapMode.Linear, null);
      fs.renameSync(s.uri.replace('file://', ''), path.join(OUT, `${id}${r.slides.length > 1 ? `-slide${String(s.index).padStart(2, '0')}` : ''}.png`));
    }
    surf.flush();
    fs.writeFileSync(path.join(OUT, `${id}-preview.png`), Buffer.from(surf.makeImageSnapshot().encodeToBytes(S.ImageFormat.PNG, 100)));
    console.log(`${t.name.padEnd(22)} ${t.mode.padEnd(8)} ${r.slides.length} × ${r.width}×${r.height}  ${(r.totalBytes / 1e6).toFixed(1)} MB`);
  }
  fs.readdirSync(OUT).filter((f) => f.startsWith('src-')).forEach((f) => fs.unlinkSync(path.join(OUT, f)));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
