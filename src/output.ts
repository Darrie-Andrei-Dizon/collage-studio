import { File, Paths } from 'expo-file-system';

/** Writes the encoded collage to the app cache and returns its file:// URI. */
export async function writeOutput(bytes: Uint8Array, ext: string): Promise<string> {
  const file = new File(Paths.cache, `collage-${Date.now()}.${ext}`);
  file.create({ overwrite: true });
  await file.write(bytes);
  return file.uri;
}
