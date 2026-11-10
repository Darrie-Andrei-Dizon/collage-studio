/**
 * Web (browser demo) version of saving & sharing.
 * There is no photo library in a browser, so "saving" downloads the file.
 * Inside claude.ai the page asks the host to save it (the `downloads`
 * capability); in a normal browser it falls back to a regular download.
 */
import type { Asset } from 'expo-media-library';

export const ALBUM_NAME = 'Collage Studio';

export interface SavedCollage {
  asset: Asset | null;
  album: string | null;
}

async function toBlob(uri: string): Promise<Blob> {
  return (await fetch(uri)).blob();
}

function filenameFor(blob: Blob) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `Collage Studio ${stamp}.${blob.type === 'image/png' ? 'png' : 'jpg'}`;
}

export async function saveToAlbum(fileUri: string): Promise<SavedCollage> {
  const blob = await toBlob(fileUri);
  const filename = filenameFor(blob);
  const host = (globalThis as { claude?: { use(name: string): Promise<unknown> } }).claude;
  const downloads = host ? ((await host.use('downloads')) as { save(r: { filename: string; data: Blob }): Promise<unknown> } | null) : null;
  if (downloads) {
    try {
      await downloads.save({ filename, data: blob });
      return { asset: null, album: null };
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'declined') throw new Error('Download was cancelled.');
      // otherwise fall through to a plain browser download
    }
  }
  const a = document.createElement('a');
  a.href = fileUri;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { asset: null, album: null };
}

export async function isInstagramInstalled() {
  return false;
}

export async function shareFile(fileUri: string, mime: string, title = 'Share collage') {
  const blob = await toBlob(fileUri);
  const file = new File([blob], filenameFor(blob), { type: mime });
  const nav = navigator as Navigator & { canShare?(d: ShareData): boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title });
    return;
  }
  throw new Error('Your browser cannot share files directly. The collage was downloaded — upload it from the Instagram app or instagram.com.');
}

export async function shareToInstagram(fileUri: string, _saved: SavedCollage | null, mime: string) {
  await shareFile(fileUri, mime, 'Share to Instagram');
}
