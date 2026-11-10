/** Web: keep the encoded collage in memory as a blob: URL. */
export async function writeOutput(bytes: Uint8Array, ext: string): Promise<string> {
  const type = ext === 'png' ? 'image/png' : 'image/jpeg';
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
}
