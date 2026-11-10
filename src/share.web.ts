/**
 * Web (browser demo) version of saving & sharing.
 * There is no photo library in a browser, so "saving" downloads the file — or a
 * single ZIP for carousels and grid posts. Inside claude.ai the page asks the
 * host to save it (the `downloads` capability); in a normal browser it falls
 * back to a regular download.
 */
import type { Asset } from 'expo-media-library';

import { postingStep } from './project';
import type { ExportResult } from './render';
import type { Template } from './templates';
import { makeZip } from './zip';

export const ALBUM_NAME = 'Collage Studio';

export interface SavedCollage {
  asset: Asset | null;
  album: string | null;
}

type Host = { use(name: string): Promise<unknown> };
type Downloads = { save(r: { filename: string; data: Blob }): Promise<unknown> };

async function download(filename: string, blob: Blob) {
  const host = (globalThis as { claude?: Host }).claude;
  const downloads = host ? ((await host.use('downloads')) as Downloads | null) : null;
  if (downloads) {
    try {
      await downloads.save({ filename, data: blob });
      return;
    } catch (e) {
      if ((e as { code?: string }).code === 'declined') throw new Error('Download cancelled.');
      // otherwise fall through to a plain browser download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function saveOrder(result: ExportResult, template: Template) {
  const slides = [...result.slides];
  if (template.mode === 'grid') slides.sort((a, b) => postingStep(template, a.index) - postingStep(template, b.index));
  return slides;
}

export async function saveOutputs(result: ExportResult, template: Template): Promise<SavedCollage[]> {
  const ext = result.format === 'png' ? 'png' : 'jpg';
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  if (result.slides.length === 1) {
    const blob = await (await fetch(result.slides[0].uri)).blob();
    await download(`Collage Studio ${stamp}.${ext}`, blob);
    return [{ asset: null, album: null }];
  }
  const n = result.slides.length;
  const pad = (v: number) => String(v).padStart(2, '0');
  const files = await Promise.all(
    saveOrder(result, template).map(async (s) => {
      const data = new Uint8Array(await (await (await fetch(s.uri)).blob()).arrayBuffer());
      const name =
        template.mode === 'grid'
          ? `post-${pad(postingStep(template, s.index))}-of-${pad(n)}_tile-${pad(s.index)}.${ext}`
          : `slide-${pad(s.index)}-of-${pad(n)}.${ext}`;
      return { name, data };
    }),
  );
  const kind = template.mode === 'grid' ? 'grid' : 'carousel';
  await download(`Collage Studio ${kind} ${stamp}.zip`, new Blob([makeZip(files) as BlobPart], { type: 'application/zip' }));
  return result.slides.map(() => ({ asset: null, album: null }));
}

export async function shareFile(_fileUri: string, _mime: string) {
  throw new Error('Sharing to apps is available in the phone app.');
}

export async function openInstagram(_result: ExportResult, _saved: SavedCollage[], _mime: string) {
  throw new Error('Posting to Instagram is available in the phone app.');
}
