import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { coverRect, exportCollage, resolveCells, type Design, type ExportFormat, type ExportResult, type Photo } from '../render';
import { ALBUM_NAME, saveToAlbum, shareFile, shareToInstagram, type SavedCollage } from '../share';
import type { Template } from '../templates';
import { Button, Chip, theme } from '../ui';

const SIZES = [
  { width: 1080, label: 'Instagram', note: 'Exact Instagram size' },
  { width: 2160, label: 'HD 2×', note: 'Recommended' },
  { width: 3240, label: 'Ultra 3×', note: 'Print quality' },
  { width: 4320, label: 'Max 4×', note: 'Largest file' },
];

type Stage = 'options' | 'working' | 'done';

export function ExportSheet({
  visible,
  onClose,
  template,
  design,
  photos,
  aspect,
}: {
  visible: boolean;
  onClose: () => void;
  template: Template;
  design: Design;
  photos: (Photo | null)[];
  aspect: number;
}) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState(2160);
  const [format, setFormat] = useState<ExportFormat>('jpeg');
  const [stage, setStage] = useState<Stage>('options');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(ExportResult & { saved: SavedCollage }) | null>(null);

  const height = Math.round(size / aspect);
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';

  // Warn when a photo would have to be enlarged at this output size.
  const upscaled = useMemo(() => {
    const cells = resolveCells(template, size, height, design);
    return cells.filter((cell, i) => {
      const p = photos[i];
      if (!p) return false;
      const dest = coverRect(p.width, p.height, cell.photoRect, p.transform);
      return Math.max(dest.width, dest.height) > p.sourceLongSide * 1.05;
    }).length;
  }, [template, size, height, design, photos]);

  const close = () => {
    if (stage === 'working') return;
    setStage('options');
    setResult(null);
    onClose();
  };

  const run = async () => {
    setStage('working');
    setError(null);
    setProgress(0);
    try {
      const out = await exportCollage(template, design, photos, { width: size, aspect, format, onProgress: setProgress });
      const saved = await saveToAlbum(out.uri);
      setResult({ ...out, saved });
      setStage('done');
    } catch (e) {
      setStage('options');
      setError(String((e as Error).message ?? e));
      if (Platform.OS !== 'web') Alert.alert('Export failed', String((e as Error).message ?? e));
    }
  };

  const toInstagram = async () => {
    if (!result) return;
    try {
      await shareToInstagram(result.uri, result.saved, mime);
    } catch (e) {
      Alert.alert('Could not open Instagram', String((e as Error).message ?? e));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: '#0008' }} onPress={close} />
      <View
        style={{
          backgroundColor: theme.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: 20,
          paddingBottom: insets.bottom + 20,
        }}
      >
        {stage === 'options' && (
          <>
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Export collage</Text>
            <Text style={{ color: theme.muted, marginTop: 4, marginBottom: 14 }}>
              Rendered from your original photos. No watermark, ever.
            </Text>

            {SIZES.map((s) => {
              const active = s.width === size;
              return (
                <Pressable
                  key={s.width}
                  onPress={() => setSize(s.width)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 12,
                    marginBottom: 8,
                    backgroundColor: active ? '#8B5CF622' : theme.surface2,
                    borderWidth: 1,
                    borderColor: active ? theme.accent : theme.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '700' }}>{s.label}</Text>
                    <Text style={{ color: theme.muted, fontSize: 12 }}>{s.note}</Text>
                  </View>
                  <Text style={{ color: theme.muted, fontVariant: ['tabular-nums'] }}>
                    {s.width} × {Math.round(s.width / aspect)}
                  </Text>
                </Pressable>
              );
            })}

            <View style={{ flexDirection: 'row', marginTop: 6, marginBottom: 4 }}>
              <Chip label="JPEG · max quality" active={format === 'jpeg'} onPress={() => setFormat('jpeg')} />
              <Chip label="PNG · lossless" active={format === 'png'} onPress={() => setFormat('png')} />
            </View>

            {upscaled > 0 && (
              <Text style={{ color: '#FBBF24', marginTop: 8, fontSize: 13 }}>
                {upscaled} photo{upscaled > 1 ? 's are' : ' is'} smaller than {upscaled > 1 ? 'their cells' : 'its cell'} at this size and
                will be enlarged. Pick a smaller size for the sharpest result.
              </Text>
            )}

            {error && <Text style={{ color: theme.danger, marginTop: 10 }}>{error}</Text>}
            <Button label={Platform.OS === 'web' ? 'Render & download' : `Save to “${ALBUM_NAME}”`} onPress={run} style={{ marginTop: 16 }} />
          </>
        )}

        {stage === 'working' && (
          <View style={{ alignItems: 'center', paddingVertical: 30 }}>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={{ color: theme.text, marginTop: 14, fontWeight: '700' }}>
              Rendering {size} × {height}… {Math.round(progress * 100)}%
            </Text>
            <Text style={{ color: theme.muted, marginTop: 4 }}>Using your full-resolution originals</Text>
          </View>
        )}

        {stage === 'done' && result && (
          <>
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800' }}>Saved ✓</Text>
            <Text style={{ color: theme.muted, marginTop: 6, lineHeight: 20 }}>
              {result.width} × {result.height} {format.toUpperCase()} · {(result.bytes / 1024 / 1024).toFixed(1)} MB{'\n'}
              {Platform.OS === 'web'
                ? 'Downloaded to your device. In the phone app this goes into its own “Collage Studio” album.'
                : result.saved.album
                ? Platform.OS === 'android'
                  ? `In your gallery under Pictures/${ALBUM_NAME}, separate from your camera photos.`
                  : `In Photos → Albums → ${ALBUM_NAME}.`
                : 'Saved to your photo library.'}
            </Text>
            {Platform.OS === 'web' ? (
              <>
                <Text style={{ color: theme.muted, marginTop: 12, lineHeight: 20 }}>
                  To post, open Instagram on your phone or at instagram.com and upload the downloaded file. The phone app
                  hands it to Instagram in one tap.
                </Text>
                <Button label="Download again" kind="secondary" onPress={() => saveToAlbum(result.uri).catch(() => {})} style={{ marginTop: 14 }} />
              </>
            ) : (
              <>
                <Button label="Post to Instagram" onPress={toInstagram} style={{ marginTop: 18, backgroundColor: theme.accent2 }} />
                <Button label="Share…" kind="secondary" onPress={() => shareFile(result.uri, mime)} style={{ marginTop: 10 }} />
              </>
            )}
            <Button label="Done" kind="ghost" onPress={close} style={{ marginTop: 4 }} />
          </>
        )}
      </View>
    </Modal>
  );
}
