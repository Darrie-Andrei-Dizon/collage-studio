/**
 * Saving & sharing.
 *
 * Saving: the finished collage is written to its own album / folder called
 * "Collage Studio" so it stays separate from the original photos.
 *   - Android: a real folder, Pictures/Collage Studio
 *   - iOS: an album named "Collage Studio" in the Photos app
 *
 * Instagram: we deliberately do NOT log in to Instagram or store any tokens.
 * Instagram's publishing API (Graph API) only works for Business/Creator
 * accounts, needs a Facebook app secret held on a server, requires the image
 * to be uploaded to a public URL first, and must pass Meta app review.
 * Shipping any of that inside a phone app would leak credentials.
 *
 * Instead we hand the saved file to Instagram through the operating system:
 *   - iOS: the official `instagram://library?LocalIdentifier=` deep link opens
 *     Instagram's composer with the collage already selected.
 *   - Android / fallback: the system share sheet (Instagram Feed, Stories,
 *     Reels and Direct all appear there when Instagram is installed).
 * The user stays logged in to the real Instagram app; this app never sees
 * their password.
 */
import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

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
  if (!(await ensurePermission())) {
    throw new Error('Photo library permission is needed to save your collage.');
  }

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

export async function isInstagramInstalled(): Promise<boolean> {
  if (Platform.OS !== 'ios') return true; // Android: Instagram shows up in the share sheet if installed.
  try {
    return await Linking.canOpenURL('instagram://app');
  } catch {
    return false;
  }
}

export async function shareToInstagram(fileUri: string, saved: SavedCollage | null, mime: string) {
  if (Platform.OS === 'ios' && saved?.asset) {
    const url = `instagram://library?LocalIdentifier=${encodeURIComponent(saved.asset.id)}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
      return;
    }
  }
  await shareFile(fileUri, mime, 'Share to Instagram');
}

export async function shareFile(fileUri: string, mime: string, title = 'Share collage') {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(fileUri, {
    mimeType: mime,
    UTI: mime === 'image/png' ? 'public.png' : 'public.jpeg',
    dialogTitle: title,
  });
}
