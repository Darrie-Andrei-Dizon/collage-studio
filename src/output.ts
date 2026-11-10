import { File, Paths } from 'expo-file-system';

/** Writes an encoded slide to the app cache and returns its file:// URI. */
export async function writeOutput(bytes: Uint8Array, ext: string, name: string): Promise<string> {
  const file = new File(Paths.cache, `${name}.${ext}`);
  file.create({ overwrite: true });
  await file.write(bytes);
  return file.uri;
}
