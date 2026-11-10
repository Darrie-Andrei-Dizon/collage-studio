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

function fileName(template: Template, index: number, n: number, ext: string) {
  const pad = (v: number) => String(v).padStart(2, '0');
  if (n === 1) return `Collage Studio.${ext}`;
  return template.mode === 'grid' ? `post-${pad(postingStep(template, index))}-of-${pad(n)}_tile-${pad(index)}.${ext}` : `slide-${pad(index)}-of-${pad(n)}.${ext}`;
}

/**
 * On phones (iPhone Safari, home-screen web app, Android Chrome) the share sheet can
 * take the images directly: "Save Image(s)" puts them in Photos, or pick Instagram.
 * Returns the files ready to share, or null where the browser can't share files.
 * Safari only opens the share sheet from a tap, so call shareFiles() from onPress.
 */
export async function prepareShare(result: ExportResult, template: Template): Promise<File[] | null> {
  const nav = navigator as Navigator & { canShare?(d: ShareData): boolean };
  // Inside claude.ai the page can't open the share sheet; it saves through the host instead.
  if ((globalThis as { claude?: unknown }).claude || !nav.share || !nav.canShare) return null;
  const ext = result.format === 'png' ? 'png' : 'jpg';
  const type = result.format === 'png' ? 'image/png' : 'image/jpeg';
  const n = result.slides.length;
  const files = await Promise.all(
    saveOrder(result, template).map(async (s) => new File([await (await fetch(s.uri)).blob()], fileName(template, s.index, n, ext), { type })),
  );
  try {
    return nav.canShare({ files }) ? files : null;
  } catch {
    return null;
  }
}

export async function shareFiles(files: File[]) {
  try {
    await navigator.share({ files });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return; // the user closed the share sheet
    throw e;
  }
}

export async function shareFile(_fileUri: string, _mime: string) {
  throw new Error('Sharing to apps is available in the phone app.');
}

export async function openInstagram(_result: ExportResult, _saved: SavedCollage[], _mime: string) {
  throw new Error('Posting to Instagram is available in the phone app.');
}
