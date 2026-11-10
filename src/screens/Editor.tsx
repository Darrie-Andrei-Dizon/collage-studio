import { Canvas, createPicture, Picture, type SkImage } from '@shopify/react-native-skia';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, PanResponder, Platform, Pressable, ScrollView, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { gradientUri, Icon, type IconName } from '../icons';
import { resize } from '../multi';
import { aspectsFor, countOf, countRange, INSTAGRAM, outputLabel, ratioOf, templatesFor } from '../project';
import {
  clampTransform,
  coverRect,
  DEFAULT_DESIGN,
  drawBackground,
  drawCell,
  drawSeams,
  hitTest,
  IDENTITY,
  loadPreviewImage,
  resolveCells,
  type Design,
  type Photo,
} from '../render';
import type { AspectId, Template } from '../templates';
import { Button, haptic, IconButton, IOSSwitch, PageDots, ProgressBar, Segmented, Slider, Stepper, T, TemplateThumb, Toast, ToolbarItem, useTheme } from '../ui';
import { ExportSheet } from './ExportSheet';

const SOLIDS = ['#FFFFFF', '#F5F0E6', '#000000', '#1F1D24', '#FADADD', '#E8DAEF', '#D6EAF8', '#D5F5E3', '#FCF3CF', '#FAD7A0', '#F1948A', '#BB8FCE', '#85C1E9', '#82E0AA', '#8B5CF6', '#EC4899', '#0EA5E9', '#14B8A6', '#F97316', '#7F1D1D', '#1E3A8A', '#14532D'];

const GRADIENTS: { name: string; colors: [string, string] }[] = [
  { name: 'Peach', colors: ['#FDE68A', '#F9A8D4'] },
  { name: 'Sunset', colors: ['#F97316', '#DB2777'] },
  { name: 'Lavender', colors: ['#C4B5FD', '#FBCFE8'] },
  { name: 'Ocean', colors: ['#0EA5E9', '#14B8A6'] },
  { name: 'Mint', colors: ['#D1FAE5', '#BFDBFE'] },
  { name: 'Dusk', colors: ['#1E1B4B', '#9D174D'] },
  { name: 'Sand', colors: ['#F5E6D3', '#D6C3AE'] },
  { name: 'Night', colors: ['#0F172A', '#4C1D95'] },
  { name: 'Lime', colors: ['#ECFCCB', '#FDE68A'] },
  { name: 'Mono', colors: ['#111111', '#4B5563'] },
];

type Tab = 'layouts' | 'slides' | 'ratio' | 'spacing' | 'background';
const TAB_META: Record<Tab, { label: string; icon: IconName }> = {
  layouts: { label: 'Layouts', icon: 'layout' },
  slides: { label: 'Slides', icon: 'slides' },
  ratio: { label: 'Ratio', icon: 'ratio' },
  spacing: { label: 'Spacing', icon: 'sliders' },
  background: { label: 'Background', icon: 'droplet' },
};

interface Doc {
  template: Template;
  aspectId: AspectId;
  design: Design;
  photos: (Photo | null)[];
}

async function pickPhotos(limit: number): Promise<ImagePicker.ImagePickerAsset[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    orderedSelection: true,
    // Highest quality: no recompression of the originals.
    quality: 1,
    // iOS: deliver a widely compatible format (HEIC -> JPEG) so every photo decodes.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  });
  return res.canceled ? [] : res.assets;
}

export function Editor({ initialTemplate, initialAspect, onBack }: { initialTemplate: Template; initialAspect: AspectId; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const c = useTheme();

  /* ---------------- Document + undo/redo ---------------- */

  const [doc, setDoc] = useState<Doc>({
    template: initialTemplate,
    aspectId: initialTemplate.mode === 'grid' ? INSTAGRAM.gridRatio : initialAspect,
    design: initialTemplate.mode === 'post' ? DEFAULT_DESIGN : { ...DEFAULT_DESIGN, gradient: GRADIENTS[0].colors },
    photos: [],
  });
  const docRef = useRef(doc);
  docRef.current = doc;
  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const [, bump] = useState(0);

  const commit = useCallback(() => {
    past.current = [...past.current.slice(-59), docRef.current];
    future.current = [];
    bump((x) => x + 1);
  }, []);
  const change = useCallback(
    (fn: (d: Doc) => Doc, record = true) => {
      if (record) commit();
      setDoc((d) => fn(d));
    },
    [commit],
  );
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(docRef.current);
    setDoc(prev);
    say('Undone');
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(docRef.current);
    setDoc(next);
    say('Redone');
  };

  const { template, aspectId, design, photos } = doc;
  const setDesign = (patch: Partial<Design>, record = true) => change((d) => ({ ...d, design: { ...d.design, ...patch } }), record);

  /* ---------------- UI state ---------------- */

  const [previews, setPreviews] = useState<Record<string, SkImage>>({});
  const [selected, setSelected] = useState(-1);
  const [tab, setTab] = useState<Tab>('layouts');
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const say = (text: string) => setToast({ text, id: Date.now() });

  const scrollable = (template.mode === 'carousel' || template.mode === 'split') && template.cols > 1;
  const [view, setView] = useState<'fit' | 'focus'>(scrollable && template.cols >= 3 ? 'focus' : 'fit');
  const [scroll, setScroll] = useState(0);

  const ratio = ratioOf(aspectId);
  const cellCount = template.cells.length;
  const slides = template.cols * template.rows;

  /* ---------------- Stage geometry ---------------- */

  const fitW = Math.min(area.w / template.cols, (area.h * ratio) / template.rows);
  const focusW = Math.min(area.w * 0.78, (area.h * ratio) / template.rows);
  const slideW = Math.max(1, view === 'focus' && scrollable ? focusW : fitW);
  const canvasW = slideW * template.cols;
  const canvasH = (slideW / ratio) * template.rows;
  const viewW = Math.max(1, Math.min(area.w, canvasW));
  const maxScroll = Math.max(0, canvasW - viewW);
  const scrollX = Math.max(0, Math.min(maxScroll, scroll));
  const unit = slideW / 1080;

  const cells = useMemo(() => resolveCells(template, canvasW, canvasH, design, unit), [template, canvasW, canvasH, design, unit]);
  const currentSlide = Math.max(0, Math.min(template.cols - 1, Math.round((scrollX + viewW / 2) / slideW - 0.5)));
  const goTo = (i: number) => setScroll(Math.max(0, Math.min(maxScroll, i * slideW - (viewW - slideW) / 2)));

  // Free preview images that are no longer referenced (also by undo history).
  useEffect(() => {
    const used = new Set<string>();
    for (const d of [doc, ...past.current, ...future.current]) d.photos.forEach((p) => p && used.add(p.uri));
    const stale = Object.keys(previews).filter((u) => !used.has(u));
    if (stale.length)
      setPreviews((prev) => {
        const next = { ...prev };
        stale.forEach((u) => {
          next[u]?.dispose();
          delete next[u];
        });
        return next;
      });
  }, [doc, previews]);

  /* ---------------- Photos ---------------- */

  const addAssets = useCallback(
    async (assets: ImagePicker.ImagePickerAsset[], targets: number[]) => {
      if (!assets.length) return;
      setLoading(true);
      try {
        const loaded: Record<string, SkImage> = {};
        for (const a of assets) loaded[a.uri] = await loadPreviewImage(a.uri);
        setPreviews((p) => ({ ...p, ...loaded }));
        change((d) => {
          const next = [...d.photos];
          assets.forEach((a, i) => {
            const idx = targets[i];
            if (idx === undefined) return;
            const img = loaded[a.uri];
            next[idx] = { uri: a.uri, width: img.width(), height: img.height(), sourceLongSide: Math.max(a.width, a.height, img.width(), img.height()), transform: IDENTITY };
          });
          return { ...d, photos: next };
        });
        say(assets.length === 1 ? 'Photo added' : `${assets.length} photos added`);
      } catch (e) {
        const msg = String((e as Error).message ?? e);
        if (Platform.OS === 'web') say(msg);
        else Alert.alert('Could not open photo', msg);
      } finally {
        setLoading(false);
      }
    },
    [change],
  );

  const emptyCells = useMemo(() => Array.from({ length: cellCount }, (_, i) => i).filter((i) => !photos[i]), [cellCount, photos]);
  const filled = cellCount - emptyCells.length;

  const fillAll = async () => {
    const targets = emptyCells.length ? emptyCells : Array.from({ length: cellCount }, (_, i) => i);
    await addAssets(await pickPhotos(targets.length), targets);
  };
  const pickInto = async (index: number) => addAssets(await pickPhotos(1), [index]);

  const updatePhoto = (index: number, fn: (p: Photo) => Photo | null, record = true) =>
    change((d) => {
      const next = [...d.photos];
      const p = next[index];
      if (p) next[index] = fn(p);
      return { ...d, photos: next };
    }, record);

  const swapWithNext = (index: number) => {
    const j = (index + 1) % cellCount;
    change((d) => {
      const next = [...d.photos];
      [next[index], next[j]] = [next[j] ?? null, next[index] ?? null];
      return { ...d, photos: next };
    });
    setSelected(j);
  };

  /* ---------------- Template / slides / ratio ---------------- */

  const setTemplate = (t: Template) => {
    change((d) => ({ ...d, template: t, aspectId: t.preferredAspect && t.mode === 'post' ? t.preferredAspect : d.aspectId }));
    setSelected(-1);
  };
  const setCount = (n: number) => {
    setTemplate(resize(template, n));
    setScroll(0);
  };

  /* ---------------- Live preview ---------------- */

  const picture = useMemo(
    () =>
      createPicture((canvas) => {
        canvas.translate(-scrollX, 0);
        drawBackground(canvas, canvasW, canvasH, design);
        cells.forEach((cell, i) => {
          const photo = photos[i];
          drawCell(canvas, cell, {
            image: photo ? (previews[photo.uri] ?? null) : null,
            transform: photo?.transform ?? IDENTITY,
            design,
            unit,
            placeholder: true,
            selected: i === selected,
          });
        });
        drawSeams(canvas, canvasW, canvasH, template.cols, template.rows);
      }),
    [cells, photos, previews, design, selected, canvasW, canvasH, unit, scrollX, template],
  );

  /* ---------------- Gestures: tap / drag / pinch / scroll ---------------- */

  const live = useRef({ cells, photos, scrollX, maxScroll, slideW, viewW, scrollable });
  live.current = { cells, photos, scrollX, maxScroll, slideW, viewW, scrollable };
  const gesture = useRef({ index: -1, start: IDENTITY, dist: 0, moved: false, pinched: false, committed: false, t: 0, scroll0: 0, scrolling: false });

  const distance = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches;
    return t.length < 2 ? 0 : Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
  };

  const tapRef = useRef<(i: number) => void>(() => {});
  tapRef.current = (i: number) => {
    if (i < 0) return setSelected(-1);
    if (!photos[i]) {
      setSelected(i);
      pickInto(i);
    } else {
      haptic.select();
      setSelected(i === selected ? -1 : i);
    }
  };

  const commitRef = useRef(commit);
  commitRef.current = commit;
  const setPhotoTransform = (index: number, t: Photo['transform']) =>
    setDoc((d) => {
      const arr = [...d.photos];
      if (arr[index]) arr[index] = { ...arr[index]!, transform: t };
      return { ...d, photos: arr };
    });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const L = live.current;
          const index = hitTest(L.cells, e.nativeEvent.locationX + L.scrollX, e.nativeEvent.locationY);
          const photo = index >= 0 ? L.photos[index] : null;
          gesture.current = {
            index,
            start: photo?.transform ?? IDENTITY,
            dist: distance(e),
            moved: false,
            pinched: false,
            committed: false,
            t: Date.now(),
            scroll0: L.scrollX,
            scrolling: !photo && L.scrollable,
          };
        },
        onPanResponderMove: (e, g) => {
          const st = gesture.current;
          const L = live.current;
          if (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6 || e.nativeEvent.touches.length > 1) st.moved = true;
          if (!st.moved) return;
          if (st.scrolling) {
            setScroll(Math.max(0, Math.min(L.maxScroll, st.scroll0 - g.dx)));
            return;
          }
          const photo = st.index >= 0 ? L.photos[st.index] : null;
          if (!photo) return;
          if (!st.committed) {
            commitRef.current();
            st.committed = true;
          }
          const cell = L.cells[st.index];
          const d = distance(e);
          if (d > 0) {
            if (!st.dist) {
              st.dist = d;
              st.start = photo.transform;
            }
            st.pinched = true;
            setPhotoTransform(st.index, clampTransform({ ...st.start, scale: st.start.scale * (d / st.dist) }));
            return;
          }
          if (st.pinched) return; // don't jump when lifting one finger after a pinch
          const dest = coverRect(photo.width, photo.height, cell.photoRect, st.start);
          const slackX = (dest.width - cell.photoRect.width) / 2;
          const slackY = (dest.height - cell.photoRect.height) / 2;
          setPhotoTransform(
            st.index,
            clampTransform({
              ...st.start,
              offsetX: slackX > 0.5 ? st.start.offsetX + g.dx / slackX : st.start.offsetX,
              offsetY: slackY > 0.5 ? st.start.offsetY + g.dy / slackY : st.start.offsetY,
            }),
          );
        },
        onPanResponderRelease: () => {
          const st = gesture.current;
          const L = live.current;
          if (st.scrolling && st.moved) {
            // Snap to the nearest slide, like swiping a real carousel.
            setScroll((s) => {
              const i = Math.round((s + L.viewW / 2) / L.slideW - 0.5);
              return Math.max(0, Math.min(L.maxScroll, i * L.slideW - (L.viewW - L.slideW) / 2));
            });
            return;
          }
          if (!st.moved && Date.now() - st.t < 500) tapRef.current(st.index);
          else if (st.index >= 0 && L.photos[st.index]) setSelected(st.index);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* ---------------- Render ---------------- */

  const sel = selected >= 0 && selected < cellCount ? photos[selected] : null;
  const tabs: Tab[] = ['layouts', ...(template.mode !== 'post' ? (['slides'] as Tab[]) : []), ...(template.mode !== 'grid' ? (['ratio'] as Tab[]) : []), 'spacing', 'background'];
  const [lo, hi] = countRange(template.mode);
  const layoutList = useMemo(() => templatesFor(template.mode, countOf(template)), [template]);
  const itemW = template.mode === 'post' ? 84 : template.mode === 'grid' ? 96 : 176;

  const badges: React.ReactNode[] = [];
  if (slides > 1)
    for (let r = 0; r < template.rows; r++)
      for (let col = 0; col < template.cols; col++) {
        const left = col * slideW - scrollX;
        if (left + slideW < 0 || left > viewW) continue;
        badges.push(
          <View key={`${r}-${col}`} pointerEvents="none" style={{ position: 'absolute', left: left + 6, top: r * (slideW / ratio) + 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, minWidth: 20, paddingHorizontal: 6, height: 20, alignItems: 'center', justifyContent: 'center' }}>
            <T v="caption2" weight="700" tone="white">
              {r * template.cols + col + 1}
            </T>
          </View>,
        );
      }

  const panelLabel = (text: string) => (
    <T v="caption" tone="secondary" style={{ width: 74 }}>
      {text}
    </T>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.stage, paddingTop: insets.top }}>
      {/* Navigation bar */}
      <View style={{ height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to templates" onPress={onBack} hitSlop={6} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, height: 44, opacity: pressed ? 0.5 : 1 })}>
          <Icon name="back" size={24} color={c.tint} strokeWidth={2.2} />
          <T v="body" tone="tint">
            Templates
          </T>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 4 }}>
          <T v="headline" numberOfLines={1}>
            {template.name}
          </T>
          <T v="caption2" tone="secondary" numberOfLines={1}>
            {outputLabel(template)} · {aspectId}
          </T>
        </View>
        <IconButton icon="undo" label="Undo" size={38} disabled={!past.current.length} onPress={undo} />
        <IconButton icon="redo" label="Redo" size={38} disabled={!future.current.length} onPress={redo} />
        <Pressable accessibilityRole="button" accessibilityLabel="Export" disabled={filled === 0} onPress={() => { haptic.tap(); setExporting(true); }} style={({ pressed }) => ({ paddingHorizontal: 10, height: 44, justifyContent: 'center', opacity: filled === 0 ? 0.35 : pressed ? 0.5 : 1 })}>
          <T v="headline" tone="tint">
            Export
          </T>
        </Pressable>
      </View>

      {/* Stage */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width - 32, h: e.nativeEvent.layout.height - 24 })}>
        {area.w > 0 && (
          <View style={[{ width: viewW, height: canvasH, overflow: 'hidden' }, Platform.OS === 'web' ? ({ touchAction: 'none' } as object) : null]} {...responder.panHandlers}>
            <Canvas style={{ width: viewW, height: canvasH }} pointerEvents="none">
              <Picture picture={picture} />
            </Canvas>
            {badges}
          </View>
        )}
        {loading && (
          <View style={{ position: 'absolute', backgroundColor: 'rgba(44,44,46,0.92)', padding: 20, borderRadius: 14 }}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
        <Toast message={toast} />
      </View>

      {/* Slides: page dots, like swiping a real carousel */}
      {scrollable && (
        <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
          <View style={{ width: 44 }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <PageDots
              count={template.cols}
              index={view === 'focus' ? currentSlide : -1}
              onSelect={(i) => {
                setView('focus');
                goTo(i);
              }}
            />
          </View>
          <IconButton icon={view === 'fit' ? 'focus' : 'overview'} label={view === 'fit' ? 'Swipe view' : 'See all slides'} size={40} active={view === 'fit'} onPress={() => setView(view === 'fit' ? 'focus' : 'fit')} />
        </View>
      )}
      {template.mode === 'grid' && (
        <T v="footnote" tone="secondary" style={{ textAlign: 'center', paddingHorizontal: 24 }}>
          Post tile {slides} first and tile 1 last so the picture lines up on your profile.
        </T>
      )}

      {/* Context row */}
      <View style={{ minHeight: 64, justifyContent: 'center', paddingHorizontal: 8 }}>
        {sel ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 4, flexGrow: 1, justifyContent: 'center' }}>
            <ToolbarItem icon="replace" label="Replace" onPress={() => pickInto(selected)} />
            <ToolbarItem icon="zoomOut" label="Zoom Out" onPress={() => updatePhoto(selected, (p) => ({ ...p, transform: clampTransform({ ...p.transform, scale: p.transform.scale / 1.15 }) }))} />
            <ToolbarItem icon="zoomIn" label="Zoom In" onPress={() => updatePhoto(selected, (p) => ({ ...p, transform: clampTransform({ ...p.transform, scale: p.transform.scale * 1.15 }) }))} />
            <ToolbarItem icon="reset" label="Reset" onPress={() => updatePhoto(selected, (p) => ({ ...p, transform: IDENTITY }))} />
            {cellCount > 1 && <ToolbarItem icon="swap" label="Swap" onPress={() => swapWithNext(selected)} />}
            <ToolbarItem
              icon="trash"
              label="Remove"
              destructive
              onPress={() => {
                updatePhoto(selected, () => null);
                setSelected(-1);
                say('Photo Removed');
              }}
            />
            <ToolbarItem icon="close" label="Done" onPress={() => setSelected(-1)} />
          </ScrollView>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 8 }}>
            <View style={{ flex: 1, gap: 6 }}>
              <T v="footnote" tone="secondary">
                <T v="footnote" weight="600">
                  {filled} of {cellCount}
                </T>{' '}
                photos · tap to add, drag to move, pinch to zoom
              </T>
              <ProgressBar value={filled / Math.max(1, cellCount)} />
            </View>
            <Button label={emptyCells.length ? `Add ${emptyCells.length}` : 'Replace All'} icon="photos" kind={emptyCells.length ? 'filled' : 'gray'} size="medium" onPress={fillAll} />
          </View>
        )}
      </View>

      {/* Inspector panel + toolbar */}
      <View style={{ backgroundColor: c.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: insets.bottom + 2 }}>
        <View style={{ height: 128, justifyContent: 'center' }}>
          {tab === 'layouts' && (
            <FlatList
              key={`${template.mode}-${countOf(template)}`}
              horizontal
              data={layoutList}
              keyExtractor={(t) => t.id}
              initialScrollIndex={Math.max(0, layoutList.findIndex((t) => t.id === template.id))}
              getItemLayout={(_, i) => ({ length: itemW + 8, offset: (itemW + 8) * i, index: i })}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12 }}
              renderItem={({ item }) => {
                const on = item.id === template.id;
                return (
                  <Pressable
                    accessibilityLabel={`${item.name} layout`}
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      haptic.select();
                      setTemplate(item);
                    }}
                    style={{ width: itemW, marginRight: 8, alignItems: 'center', gap: 6 }}
                  >
                    <View style={{ height: 80, width: itemW, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 2, borderColor: on ? c.tint : 'transparent' }}>
                      <TemplateThumb template={item} aspect={ratio} maxW={itemW - 10} maxH={70} />
                    </View>
                    <T v="caption2" numberOfLines={1} tone={on ? 'tint' : 'secondary'} weight={on ? '600' : '400'}>
                      {item.name}
                    </T>
                  </Pressable>
                );
              }}
            />
          )}
          {tab === 'slides' && (
            <View style={{ paddingHorizontal: 20, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <T v="headline">{template.mode === 'grid' ? `${template.rows} ${template.rows === 1 ? 'Row' : 'Rows'}` : `${template.cols} Slides`}</T>
                  <T v="footnote" tone="secondary">
                    {template.mode === 'grid' ? `${template.rows * 3} posts on your profile` : `Instagram allows ${INSTAGRAM.minSlides}–${INSTAGRAM.maxSlides}`}
                  </T>
                </View>
                <Stepper value={countOf(template)} min={lo} max={hi} label={template.mode === 'grid' ? 'rows' : 'slides'} onChange={setCount} />
              </View>
              <T v="caption" tone="secondary">
                {template.mode === 'grid' ? 'Tiles export at 3:4, the shape the profile grid shows.' : 'Your photos stay in place when you change the count.'}
              </T>
            </View>
          )}
          {tab === 'ratio' && (
            <View style={{ paddingHorizontal: 20, gap: 12 }}>
              <Segmented options={aspectsFor(template.mode).map((a) => ({ value: a.id, label: a.label }))} value={aspectId} onChange={(id) => change((d) => ({ ...d, aspectId: id }))} />
              <T v="footnote" tone="secondary" style={{ textAlign: 'center' }}>
                {aspectsFor(template.mode).find((a) => a.id === aspectId)?.hint}
                {template.mode !== 'post' ? ' · every slide uses this ratio' : ''}
              </T>
            </View>
          )}
          {tab === 'spacing' && (
            <View style={{ paddingHorizontal: 20, gap: 4 }}>
              <View style={{ flexDirection: 'row', gap: 20 }}>
                <Slider label="Spacing" value={design.gap} min={0} max={80} onStart={commit} onChange={(gap) => setDesign({ gap }, false)} />
                <Slider label="Border" value={design.margin} min={0} max={120} onStart={commit} onChange={(margin) => setDesign({ margin }, false)} />
              </View>
              <View style={{ flexDirection: 'row', gap: 20, alignItems: 'center' }}>
                <Slider label="Corners" value={design.radius} min={0} max={160} onStart={commit} onChange={(radius) => setDesign({ radius }, false)} />
                <View style={{ flex: 1, minWidth: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <T v="subhead">Frame Shadows</T>
                  <IOSSwitch label="Frame shadows" value={design.shadow} onChange={(shadow) => setDesign({ shadow })} />
                </View>
              </View>
            </View>
          )}
          {tab === 'background' && (
            <View style={{ gap: 10 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10, alignItems: 'center' }}>
                {panelLabel('Gradient')}
                {GRADIENTS.map((g) => {
                  const on = design.gradient?.join() === g.colors.join();
                  return (
                    <Pressable key={g.name} accessibilityLabel={`${g.name} gradient`} accessibilityState={{ selected: on }} onPress={() => { haptic.select(); setDesign({ gradient: g.colors }); }} style={{ padding: 2, borderRadius: 20, borderWidth: 2, borderColor: on ? c.tint : 'transparent' }}>
                      <Image source={{ uri: gradientUri(g.colors, 32, 32, 45, 16) }} style={{ width: 32, height: 32, borderRadius: 16 }} />
                    </Pressable>
                  );
                })}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10, alignItems: 'center' }}>
                {panelLabel('Color')}
                {SOLIDS.map((col) => {
                  const on = !design.gradient && design.background === col;
                  return (
                    <Pressable key={col} accessibilityLabel={`Background ${col}`} accessibilityState={{ selected: on }} onPress={() => { haptic.select(); setDesign({ background: col, gradient: null }); }} style={{ padding: 2, borderRadius: 20, borderWidth: 2, borderColor: on ? c.tint : 'transparent' }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: col, borderWidth: 0.5, borderColor: c.separator }} />
                    </Pressable>
                  );
                })}
              </ScrollView>
              {design.gradient && (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 10 }}>
                  {panelLabel('Direction')}
                  <Segmented
                    compact
                    style={{ flex: 1 }}
                    options={[
                      { value: 0, label: '→' },
                      { value: 45, label: '↘' },
                      { value: 90, label: '↓' },
                      { value: 180, label: '←' },
                    ]}
                    value={design.gradientAngle}
                    onChange={(gradientAngle) => setDesign({ gradientAngle })}
                  />
                </View>
              )}
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingTop: 4, paddingHorizontal: 8, borderTopWidth: 0.5, borderColor: c.separator }}>
          {tabs.map((t) => (
            <ToolbarItem key={t} icon={TAB_META[t].icon} label={TAB_META[t].label} active={tab === t} onPress={() => setTab(t)} />
          ))}
        </View>
      </View>

      <ExportSheet visible={exporting} onClose={() => setExporting(false)} template={template} design={design} photos={photos.slice(0, cellCount)} aspect={ratio} />
    </View>
  );
}
