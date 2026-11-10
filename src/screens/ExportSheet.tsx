import React, { useMemo, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../icons';
import { INSTAGRAM, outputLabel, postingStep } from '../project';
import { coverRect, exportSlides, resolveCells, type Design, type ExportFormat, type ExportResult, type Photo } from '../render';
import { ALBUM_NAME, openInstagram, prepareShare, saveOrder, saveOutputs, shareFile, shareFiles, type SavedCollage } from '../share';
import type { Template } from '../templates';
import { Button, haptic, ProgressBar, Row, Section, Segmented, T, ThemeProvider, useTheme } from '../ui';

const SIZES = [
  { width: 1080, label: 'Instagram', note: 'The exact size Instagram stores' },
  { width: 2160, label: 'High', note: 'Recommended' },
  { width: 3240, label: 'Ultra', note: 'Print quality' },
  { width: 4320, label: 'Maximum', note: 'Largest files' },
];

type Stage = 'options' | 'working' | 'done';
const isWeb = Platform.OS === 'web';
/** Phone browsers and home-screen web apps can hand images to the share sheet (Save Image, Instagram…). */
const webCanShare = isWeb && typeof navigator !== 'undefined' && !!navigator.share && 'canShare' in navigator && !(globalThis as { claude?: unknown }).claude;
/** Safari limits a page's memory, so the browser version skips the 4× size. */
const SIZE_OPTIONS = isWeb ? SIZES.slice(0, 3) : SIZES;

/** iOS sheets sit one level up: the sheet uses the elevated background, list rows the next shade. */
export function ExportSheet(props: Parameters<typeof SheetBody>[0]) {
  const c = useTheme();
  const elevated = c.name === 'dark' ? { ...c, bg: '#1C1C1E', card: '#2C2C2E', segment: '#636366' } : c;
  return (
    <ThemeProvider value={elevated}>
      <SheetBody {...props} />
    </ThemeProvider>
  );
}

function SheetBody({
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
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [size, setSize] = useState(2160);
  const [format, setFormat] = useState<ExportFormat>('jpeg');
  const [stage, setStage] = useState<Stage>('options');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ out: ExportResult; saved: SavedCollage[] } | null>(null);
  const [shareReady, setShareReady] = useState<File[] | null>(null);

  const n = template.cols * template.rows;
  const height = Math.round(size / aspect);
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const sheetW = Math.min(winW, 600);

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
    setShareReady(null);
    setError(null);
    onClose();
  };

  const run = async () => {
    setStage('working');
    setError(null);
    setProgress(0);
    try {
      const out = await exportSlides(template, design, photos, { slideWidth: size, aspect, format, onProgress: setProgress });
      // Browsers that can share files get a "Save to Photos" button (the share sheet has to
      // open from a tap); everywhere else the images are saved or downloaded right away.
      const files = isWeb ? await prepareShare(out, template) : null;
      const saved = files ? [] : await saveOutputs(out, template);
      setShareReady(files);
      setResult({ out, saved });
      setStage('done');
      haptic.success();
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

  const saveLabel = webCanShare
    ? n === 1
      ? 'Create Image'
      : `Create ${n} Images`
    : isWeb
      ? n === 1
        ? 'Download Image'
        : `Download ${n} Images (ZIP)` : n === 1 ? `Save to ${ALBUM_NAME}` : `Save ${n} Images`;

  /* ---------------- Output previews ---------------- */

  const previews = () => {
    if (!result) return null;
    const { out } = result;
    if (template.mode === 'grid') {
      const tile = Math.min(96, (sheetW - 32 - 6) / 3);
      return (
        <View style={{ alignSelf: 'center', width: tile * 3 + 6, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
          {out.slides.map((s) => {
            const step = postingStep(template, s.index);
            return (
              <View key={s.index}>
                <Image source={{ uri: s.uri }} style={{ width: tile, height: tile / aspect }} />
                <View style={{ position: 'absolute', right: 4, bottom: 4, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: step === 1 ? c.tint : 'rgba(0,0,0,0.6)' }}>
                  <T v="caption2" weight="700" tone="white">
                    {step}
                  </T>
                </View>
              </View>
            );
          })}
        </View>
      );
    }
    const h = n === 1 ? Math.min(240, winH * 0.3) : 140;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, justifyContent: n === 1 ? 'center' : 'flex-start', flexGrow: 1 }}>
        {out.slides.map((s) => (
          <View key={s.index} style={{ gap: 4, alignItems: 'center' }}>
            <Image source={{ uri: s.uri }} style={{ width: h * aspect, height: h, borderRadius: 8 }} />
            {n > 1 && (
              <T v="caption2" tone="secondary">
                {s.index} of {n}
              </T>
            )}
          </View>
        ))}
      </ScrollView>
    );
  };

  const steps = (): string[] => {
    if (shareReady) {
      if (template.mode === 'grid')
        return ['Tap Save to Photos, then Save Images.', `In Instagram, post the tile numbered 1 first (bottom right), on its own.`, `Keep going in order up to ${n}; your profile then shows the full picture.`];
      if (n > 1) return [`Tap Save to Photos, then Save ${n} Images.`, 'In Instagram, tap + and choose Select Multiple.', `Pick slides 1 to ${n} in order from Recents, then share.`];
      return ['Tap Save to Photos, then Save Image. Or pick Instagram in the share sheet to post right away.'];
    }
    if (template.mode === 'grid')
      return isWeb
        ? ['Unzip the download. Files are named in posting order.', 'Post “post-01” first, as its own post.', `Keep going one at a time until “post-${String(n).padStart(2, '0')}”.`]
        : [`Open Instagram and post tile ${n} (marked 1) first.`, 'Post the rest one at a time, following the numbers.', 'After the last one, your profile shows the full picture.'];
    if (n > 1)
      return isWeb
        ? [`Unzip the download: slide-01 to slide-${String(n).padStart(2, '0')}.`, 'In Instagram, tap + and choose Select Multiple.', 'Pick the slides in order, then share.']
        : ['Tap Open Instagram, then + and Select Multiple.', `Pick slides 1 to ${n} from the “${ALBUM_NAME}” album, in order.`, 'Add a caption and share.'];
    return isWeb
      ? ['Upload the image from the Instagram app or instagram.com.']
      : [Platform.OS === 'android' ? `Saved in Pictures/${ALBUM_NAME}.` : `Saved in Photos → Albums → ${ALBUM_NAME}.`, 'Tap Open Instagram to post it.'];
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={close} accessibilityLabel="Dismiss" />
      <View style={{ alignSelf: 'center', width: sheetW, maxHeight: winH * 0.92, backgroundColor: c.bg, borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingBottom: insets.bottom + 12 }}>
        <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: c.tertiary, marginTop: 6 }} />

        {/* Sheet header */}
        <View style={{ height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}>
          <View style={{ width: 80 }}>
            {stage === 'options' && (
              <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.5 : 1 })}>
                <T v="body" tone="tint">
                  Cancel
                </T>
              </Pressable>
            )}
          </View>
          <T v="headline" style={{ flex: 1, textAlign: 'center' }}>
            Export
          </T>
          <View style={{ width: 80, alignItems: 'flex-end' }}>
            {stage === 'done' && (
              <Pressable accessibilityRole="button" onPress={close} style={({ pressed }) => ({ padding: 8, opacity: pressed ? 0.5 : 1 })}>
                <T v="headline" tone="tint">
                  Done
                </T>
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 22 }}>
          {stage === 'options' && (
            <>
              <T v="footnote" tone="secondary" style={{ textAlign: 'center', marginTop: -4 }}>
                {outputLabel(template)}, rendered from your original photos
              </T>

              <Section header={n > 1 ? 'Size of each image' : 'Size'} footer={`Instagram stores photos ${INSTAGRAM.storedWidth} px wide. A larger export gives its resizer more detail and leaves you a full-quality copy.`}>
                {SIZE_OPTIONS.map((s) => (
                  <Row key={s.width} label={s.label} subtitle={`${s.width} × ${Math.round(s.width / aspect)} · ${s.note}`} checked={s.width === size} onPress={() => setSize(s.width)} />
                ))}
              </Section>

              <Section header="Format" footer={format === 'png' ? 'Lossless PNG: every pixel exactly as rendered, larger files.' : 'JPEG at quality 100: visually identical, much smaller files.'}>
                <View style={{ padding: 12 }}>
                  <Segmented
                    options={[
                      { value: 'jpeg', label: 'JPEG' },
                      { value: 'png', label: 'PNG' },
                    ]}
                    value={format}
                    onChange={setFormat}
                  />
                </View>
              </Section>

              {(upscaled > 0 || (n > 1 && template.mode !== 'grid') || template.mode === 'grid') && (
                <Section>
                  {n > 1 && template.mode !== 'grid' && <Row icon="layers" iconBg={c.tint} label={`${n} of ${INSTAGRAM.maxSlides} slides`} subtitle="One carousel holds up to 20, all at the same ratio" />}
                  {template.mode === 'grid' && <Row icon="grid" iconBg={c.tint} label="3:4 tiles" subtitle="The exact shape of the profile grid" />}
                  {upscaled > 0 && (
                    <Row icon="info" iconBg={c.orange} label={`${upscaled} ${upscaled > 1 ? 'photos' : 'photo'} will be enlarged`} subtitle="Choose a smaller size for the sharpest result" />
                  )}
                </Section>
              )}

              {error && (
                <T v="footnote" tone="red" style={{ textAlign: 'center' }}>
                  {error}
                </T>
              )}
              <Button label={saveLabel} onPress={run} />
            </>
          )}

          {stage === 'working' && (
            <View style={{ paddingVertical: 40, gap: 16 }}>
              <T v="title3" style={{ textAlign: 'center' }}>
                {n > 1 ? `Rendering ${Math.min(n, Math.floor(progress * n) + 1)} of ${n}` : 'Rendering'}
              </T>
              <ProgressBar value={progress} />
              <T v="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                {size} × {height} from your full-resolution originals
              </T>
            </View>
          )}

          {stage === 'done' && result && (
            <>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.green, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={30} color="#FFFFFF" strokeWidth={3} />
                </View>
                <T v="title3">{shareReady ? (n === 1 ? 'Your image is ready' : `${n} images are ready`) : isWeb ? 'Downloaded' : `Saved to ${ALBUM_NAME}`}</T>
                <T v="footnote" tone="secondary">
                  {n} × {result.out.width} × {result.out.height} {result.out.format.toUpperCase()} · {(result.out.totalBytes / 1024 / 1024).toFixed(1)} MB
                </T>
              </View>

              {previews()}

              <Section header="How to post">
                {steps().map((text, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 11, alignItems: 'flex-start' }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.tintSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <T v="caption" weight="700" tone="tint">
                        {i + 1}
                      </T>
                    </View>
                    <T v="subhead" style={{ flex: 1 }}>
                      {text}
                    </T>
                  </View>
                ))}
              </Section>

              {error && (
                <T v="footnote" tone="red" style={{ textAlign: 'center' }}>
                  {error}
                </T>
              )}

              {shareReady ? (
                <View style={{ gap: 10 }}>
                  <Button label="Save to Photos" icon="share" onPress={() => shareFiles(shareReady).catch((e) => setError(String((e as Error).message ?? e)))} />
                  <Button label={n === 1 ? 'Download Instead' : 'Download ZIP Instead'} icon="download" kind="gray" onPress={again} />
                </View>
              ) : isWeb ? (
                <Button label="Download Again" icon="download" kind="tinted" onPress={again} />
              ) : (
                <View style={{ gap: 10 }}>
                  <Button label="Open Instagram" icon="instagram" onPress={toInstagram} />
                  {n === 1 && <Button label="Share…" icon="share" kind="gray" onPress={() => shareFile(saveOrder(result.out, template)[0].uri, mime)} />}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
