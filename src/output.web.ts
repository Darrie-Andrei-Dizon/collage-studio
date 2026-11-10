/** Web: keep the encoded slide in memory as a blob: URL. */
export async function writeOutput(bytes: Uint8Array, ext: string, _name: string): Promise<string> {
  const type = ext === 'png' ? 'image/png' : 'image/jpeg';
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
}
