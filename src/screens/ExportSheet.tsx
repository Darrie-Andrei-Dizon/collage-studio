import React, { useMemo, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../icons';
import { INSTAGRAM, outputLabel, postingStep } from '../project';
import { coverRect, exportSlides, resolveCells, type Design, type ExportFormat, type ExportResult, type Photo } from '../render';
import { ALBUM_NAME, openInstagram, saveOrder, saveOutputs, shareFile, type SavedCollage } from '../share';
import type { Template } from '../templates';
import { Button, Chip, IconButton, ProgressBar, T, theme } from '../ui';

const SIZES = [
  { width: 1080, label: 'Instagram', note: 'Exact size Instagram stores' },
  { width: 2160, label: 'HD 2×', note: 'Recommended' },
  { width: 3240, label: 'Ultra 3×', note: 'Print quality' },
  { width: 4320, label: 'Max 4×', note: 'Largest files' },
];

type Stage = 'options' | 'working' | 'done';
const isWeb = Platform.OS === 'web';

function Note({ icon = 'info', color = theme.faint, children }: { icon?: IconName; color?: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Icon name={icon} size={16} color={color} style={{ marginTop: 1 }} />
      <T v="small" style={{ flex: 1, color: color === theme.faint ? theme.muted : color }}>
        {children}
      </T>
    </View>
  );
}

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
  const { width: winW, height: winH } = useWindowDimensions();
  const [size, setSize] = useState(2160);
  const [format, setFormat] = useState<ExportFormat>('jpeg');
  const [stage, setStage] = useState<Stage>('options');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ out: ExportResult; saved: SavedCollage[] } | null>(null);

  const n = template.cols * template.rows;
  const height = Math.round(size / aspect);
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const sheetW = Math.min(winW, 640);

  // Warn when a photo would have to be enlarged at this output size.
  const upscaled = useMemo(() => {
    const cells = resolveCells(template, size * template.cols, height * template.rows, design, size / 1080);
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
    setError(null);
    onClose();
  };

  const run = async () => {
    setStage('working');
    setError(null);
    setProgress(0);
    try {
      const out = await exportSlides(template, design, photos, { slideWidth: size, aspect, format, onProgress: setProgress });
      const saved = await saveOutputs(out, template);
      setResult({ out, saved });
      setStage('done');
    } catch (e) {
      setStage('options');
      setError(String((e as Error).message ?? e));
    }
  };

  const again = async () => {
    if (!result) return;
    try {
      await saveOutputs(result.out, template);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  const toInstagram = async () => {
    if (!result) return;
    try {
      await openInstagram(result.out, result.saved, mime);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    }
  };

  const saveLabel = isWeb ? (n === 1 ? 'Download image' : `Download ZIP · ${n} images`) : n === 1 ? `Save to “${ALBUM_NAME}”` : `Save ${n} images to “${ALBUM_NAME}”`;

  /* ---------------- Output previews ---------------- */

  const previews = () => {
    if (!result) return null;
    const { out } = result;
    if (template.mode === 'grid') {
      const tile = Math.min(92, (sheetW - 40 - 12) / 3);
      return (
        <View style={{ alignSelf: 'center', width: tile * 3 + 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {out.slides.map((s) => {
            const step = postingStep(template, s.index);
            return (
              <View key={s.index}>
                <Image source={{ uri: s.uri }} style={{ width: tile, height: tile / aspect, borderRadius: 4 }} />
                <View style={{ position: 'absolute', left: 4, bottom: 4, backgroundColor: step === 1 ? theme.pink : 'rgba(11,10,16,0.78)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}>
                  <T v="small" style={{ fontSize: 10, lineHeight: 14, color: step === 1 ? '#2A0B1C' : '#fff', fontWeight: '800' }}>
                    Post {step}
                  </T>
                </View>
              </View>
            );
          })}
        </View>
      );
    }
    const h = n === 1 ? Math.min(220, winH * 0.28) : 128;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2, justifyContent: n === 1 ? 'center' : 'flex-start', flexGrow: 1 }}>
        {out.slides.map((s) => (
          <View key={s.index}>
            <Image source={{ uri: s.uri }} style={{ width: h * aspect, height: h, borderRadius: 6 }} />
            {n > 1 && (
              <View style={{ position: 'absolute', left: 5, top: 5, backgroundColor: 'rgba(11,10,16,0.78)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 }}>
                <T v="small" style={{ fontSize: 10.5, lineHeight: 15, color: '#fff', fontWeight: '800' }}>
                  {s.index}/{n}
                </T>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    );
  };

  const howToPost = () => {
    if (template.mode === 'grid')
      return isWeb
        ? `The ZIP names files in posting order. Post “post-01” first and “post-${String(n).padStart(2, '0')}” last, one at a time, and your profile shows the full picture.`
        : `Post them one at a time, starting with “Post 1” (tile ${n}). They're saved in that order in “${ALBUM_NAME}”.`;
    if (n > 1)
      return isWeb
        ? `The ZIP holds slide-01 to slide-${String(n).padStart(2, '0')}. In Instagram, start a post, choose “Select multiple” and pick them in order.`
        : `In Instagram, start a post, choose “Select multiple” and tap slides 1 to ${n} from “${ALBUM_NAME}” in order.`;
    return isWeb
      ? 'Upload it from the Instagram app or instagram.com. The phone app hands it to Instagram in one tap.'
      : Platform.OS === 'android'
        ? `Saved in Pictures/${ALBUM_NAME}, separate from your camera photos.`
        : `Saved in Photos → Albums → ${ALBUM_NAME}.`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={close} accessibilityLabel="Close export" />
      <View
        style={{
          alignSelf: 'center',
          width: sheetW,
          maxHeight: winH * 0.9,
          backgroundColor: theme.surface,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderWidth: 1,
          borderColor: theme.border,
          paddingBottom: insets.bottom + 16,
        }}
      >
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.borderStrong, marginTop: 8 }} />
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 10, gap: 16 }}>
          {stage === 'options' && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <T v="title" style={{ fontSize: 22, lineHeight: 28 }}>
                    Export
                  </T>
                  <T v="small">
                    {outputLabel(template)} at {size} × {height} · rendered from your original photos
                  </T>
                </View>
                <IconButton icon="close" label="Close" onPress={close} />
              </View>

              <View style={{ gap: 8 }}>
                <T v="label">{n > 1 ? 'Size of each image' : 'Size'}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {SIZES.map((s) => {
                    const on = s.width === size;
                    return (
                      <Pressable
                        key={s.width}
                        onPress={() => setSize(s.width)}
                        accessibilityState={{ selected: on }}
                        style={{ width: Math.floor((sheetW - 40 - 9) / 2), padding: 12, borderRadius: 16, gap: 2, backgroundColor: on ? theme.accentSoft : theme.surface2, borderWidth: 1.5, borderColor: on ? theme.accent : theme.border }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <T v="body" style={{ fontWeight: '700' }}>
                            {s.label}
                          </T>
                          {on && <Icon name="check" size={16} color={theme.accentHi} />}
                        </View>
                        <T v="small" style={{ fontVariant: ['tabular-nums'] }}>
                          {s.width} × {Math.round(s.width / aspect)}
                          {n > 1 ? ` × ${n}` : ''}
                        </T>
                        <T v="small" style={{ fontSize: 11, color: theme.faint }}>
                          {s.note}
                        </T>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: 8 }}>
                <T v="label">Format</T>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Chip label="JPEG · max quality" active={format === 'jpeg'} onPress={() => setFormat('jpeg')} />
                  <Chip label="PNG · lossless" active={format === 'png'} onPress={() => setFormat('png')} />
                </View>
              </View>

              <View style={{ gap: 10, backgroundColor: theme.surface2, borderRadius: 16, padding: 14 }}>
                <Note>Instagram stores photos {INSTAGRAM.storedWidth} px wide. A larger export gives its resizer more detail and leaves you a full-quality copy.</Note>
                {n > 1 && template.mode !== 'grid' && <Note icon="layers">One carousel holds up to {INSTAGRAM.maxSlides} slides, all at the same ratio.</Note>}
                {template.mode === 'grid' && <Note icon="grid">Tiles are 3:4, the exact shape of the profile grid, so the seams line up.</Note>}
                {upscaled > 0 && (
                  <Note icon="info" color={theme.amber}>
                    {upscaled} photo{upscaled > 1 ? 's are' : ' is'} smaller than {upscaled > 1 ? 'their spots' : 'its spot'} at this size and will be enlarged. Pick a smaller size for the sharpest result.
                  </Note>
                )}
              </View>

              {error && <Note color={theme.danger}>{error}</Note>}
              <Button label={saveLabel} icon="download" onPress={run} />
            </>
          )}

          {stage === 'working' && (
            <View style={{ paddingVertical: 36, gap: 14 }}>
              <T v="title" style={{ textAlign: 'center' }}>
                {n > 1 ? `Rendering image ${Math.min(n, Math.floor(progress * n) + 1)} of ${n}` : 'Rendering your collage'}
              </T>
              <ProgressBar value={progress} height={6} />
              <T v="small" style={{ textAlign: 'center' }}>
                {size} × {height} from your full-resolution originals
              </T>
            </View>
          )}

          {stage === 'done' && result && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(52,211,153,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={22} color={theme.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <T v="title">{isWeb ? 'Downloaded' : 'Saved'}</T>
                  <T v="small">
                    {n} × {result.out.width} × {result.out.height} {result.out.format.toUpperCase()} · {(result.out.totalBytes / 1024 / 1024).toFixed(1)} MB
                  </T>
                </View>
                <IconButton icon="close" label="Close" onPress={close} />
              </View>

              {previews()}

              <View style={{ backgroundColor: theme.surface2, borderRadius: 16, padding: 14 }}>
                <Note icon="instagram">{howToPost()}</Note>
              </View>

              {error && <Note color={theme.danger}>{error}</Note>}

              {isWeb ? (
                <Button label="Download again" icon="download" kind="secondary" onPress={again} />
              ) : (
                <View style={{ gap: 10 }}>
                  <Button label="Open Instagram" icon="instagram" kind="pink" onPress={toInstagram} />
                  {n === 1 && <Button label="Share…" icon="share" kind="secondary" onPress={() => shareFile(saveOrder(result.out, template)[0].uri, mime)} />}
                </View>
              )}
              <Button label="Done" kind="ghost" onPress={close} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
