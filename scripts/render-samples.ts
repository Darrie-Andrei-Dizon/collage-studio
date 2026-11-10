/**
 * Renders sample collages with the app's real export pipeline (src/render.ts)
 * in Node, using synthetic 12 MP test photos. Output: ./samples/*.png
 *
 *   npm run render:samples
 */
import * as S from '@shopify/react-native-skia';
import fs from 'fs';
import path from 'path';

import { DEFAULT_DESIGN, exportCollage, type Photo } from '../src/render';
import { TEMPLATES } from '../src/templates';

const { Skia } = S as any;
const OUT = process.env.OUT_DIR!;

function makePhoto(name: string, w: number, h: number, hue: number) {
  const surf = Skia.Surface.Make(w, h);
  const c = surf.getCanvas();
  const p = Skia.Paint();
  p.setShader(
    Skia.Shader.MakeLinearGradient({ x: 0, y: 0 }, { x: w, y: h },
      [Skia.Color(`hsl(${hue},80%,55%)`), Skia.Color(`hsl(${(hue + 120) % 360},80%,45%)`)], null, S.TileMode.Clamp),
  );
  c.drawRect({ x: 0, y: 0, width: w, height: h }, p);
  const dot = Skia.Paint();
  dot.setColor(Skia.Color('#ffffffcc'));
  c.drawCircle(w * 0.3, h * 0.3, Math.min(w, h) * 0.12, dot);
  surf.flush();
  const file = path.join(OUT, `src-${name}.jpg`);
  fs.writeFileSync(file, Buffer.from(surf.makeImageSnapshot().encodeToBytes(S.ImageFormat.JPEG, 95)));
  return file;
}

(async () => {
  await (S as any).init();
  const sizes: [number, number][] = [[4032, 3024], [3024, 4032], [4000, 4000], [3000, 2000], [2000, 3000], [3024, 4032]];
  const photos: Photo[] = sizes.map(([w, h], i) => ({
    uri: makePhoto(String(i), w, h, i * 55),
    width: w,
    height: h,
    sourceLongSide: Math.max(w, h),
    transform: { scale: 1, offsetX: 0, offsetY: 0 },
  }));
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['grid-2x2', 'mosaic-23', 'shape-18', 'shape-19', 'free-2', 'story-10'];
  for (const id of ids) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) { console.warn('unknown template', id); continue; }
    const aspect = t.preferredAspect === '9:16' ? 9 / 16 : 4 / 5;
    const r = await exportCollage(t, { ...DEFAULT_DESIGN, radius: 24 }, photos.slice(0, t.cells.length), { width: 2160, aspect, format: 'png' });
    const dest = path.join(OUT, `${id}.png`);
    fs.renameSync(r.uri.replace('file://', ''), dest);
    console.log(`${t.name.padEnd(20)} ${r.width}×${r.height}  ${(r.bytes / 1e6).toFixed(1)} MB  → ${dest}`);
  }
  fs.readdirSync(OUT).filter((f) => f.startsWith('src-')).forEach((f) => fs.unlinkSync(path.join(OUT, f)));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
