/**
 * Saving & sharing (iOS / Android).
 *
 * Saving: finished images go to their own album / folder called "Collage Studio",
 * separate from the original photos.
 *   - Android: a real folder, Pictures/Collage Studio
 *   - iOS: an album named "Collage Studio" in the Photos app
 * Carousel slides are saved in swipe order (1 → N). Profile-grid tiles are saved in
 * POSTING order (bottom-right tile first), because the newest post shows top-left.
 *
 * Instagram: we deliberately do NOT log in to Instagram or store any tokens.
 * Instagram's publishing API (Graph API) only works for Business/Creator accounts,
 * needs a Facebook app secret held on a server, requires images on a public URL,
 * and must pass Meta app review. Shipping that inside a phone app would leak
 * credentials. Instead the saved files are handed to the real Instagram app:
 *   - iOS: the official `instagram://library?LocalIdentifier=` link opens the
 *     composer with the (first) image selected.
 *   - Android / fallback: the system share sheet, or simply opening Instagram.
 */
import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

import { postingStep } from './project';
import type { ExportResult } from './render';
import type { Template } from './templates';

export const ALBUM_NAME = 'Collage Studio';

export interface SavedCollage {
  asset: Asset | null;
  album: string | null;
}

export async function ensurePermission(): Promise<boolean> {
  const res = await requestPermissionsAsync(false, ['photo']);
  return res.granted;
}

export async function saveToAlbum(fileUri: string): Promise<SavedCollage> {
  try {
    const existing = await Album.get(ALBUM_NAME);
    if (existing) {
      const asset = await Asset.create(fileUri, existing);
      return { asset, album: ALBUM_NAME };
    }
    // Creating the album from the file path puts the file straight into it
    // (on Android this is the Pictures/Collage Studio folder).
    const album = await Album.create(ALBUM_NAME, [fileUri]);
    const assets = await album.getAssets();
    return { asset: assets[assets.length - 1] ?? null, album: ALBUM_NAME };
  } catch (e) {
    // e.g. iOS "limited" photo access can hide albums. Fall back to a plain save
    // so the user never loses their work.
    console.warn('Album save failed, falling back to library save', e);
    const asset = await Asset.create(fileUri);
    return { asset, album: null };
  }
}

/** Order files should be saved/posted in. */
export function saveOrder(result: ExportResult, template: Template) {
  const slides = [...result.slides];
  if (template.mode === 'grid') slides.sort((a, b) => postingStep(template, a.index) - postingStep(template, b.index));
  return slides;
}

export async function saveOutputs(result: ExportResult, template: Template): Promise<SavedCollage[]> {
  if (!(await ensurePermission())) throw new Error('Allow photo access in Settings to save your collage.');
  const saved: SavedCollage[] = [];
  for (const s of saveOrder(result, template)) {
    saved.push(await saveToAlbum(s.uri));
    // Distinct creation times keep the order stable in the Photos / Gallery app.
    await new Promise((r) => setTimeout(r, 120));
  }
  return saved;
}

export async function shareFile(fileUri: string, mime: string, title = 'Share collage') {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(fileUri, { mimeType: mime, UTI: mime === 'image/png' ? 'public.png' : 'public.jpeg', dialogTitle: title });
}

/** Hand the export to Instagram. Single images go straight to the composer or share sheet. */
export async function openInstagram(result: ExportResult, saved: SavedCollage[], mime: string) {
  const first = saved[0]?.asset;
  if (Platform.OS === 'ios' && first) {
    const url = `instagram://library?LocalIdentifier=${encodeURIComponent(first.id)}`;
    if (await Linking.canOpenURL(url)) return Linking.openURL(url);
  }
  if (result.slides.length === 1) return shareFile(result.slides[0].uri, mime, 'Share to Instagram');
  // Several images: open Instagram, where the user multi-selects them from the album.
  try {
    await Linking.openURL('instagram://app');
  } catch {
    await Linking.openURL('https://www.instagram.com/');
  }
}
