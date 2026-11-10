import { Canvas, createPicture, Picture, type SkImage } from '@shopify/react-native-skia';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  clampTransform,
  coverRect,
  DEFAULT_DESIGN,
  drawBackground,
  drawCell,
  hitTest,
  IDENTITY,
  loadPreviewImage,
  resolveCells,
  type Design,
  type Photo,
} from '../render';
import { ASPECTS, TEMPLATES, type AspectId, type Template } from '../templates';
import { Button, Chip, Slider, TemplateThumb, theme } from '../ui';
import { ExportSheet } from './ExportSheet';

const COLORS = [
  '#FFFFFF', '#000000', '#F5F0E6', '#1F1F1F', '#FADADD', '#E8DAEF', '#D6EAF8', '#D5F5E3',
  '#FCF3CF', '#FAD7A0', '#F1948A', '#BB8FCE', '#85C1E9', '#82E0AA', '#F7DC6F', '#8B5CF6',
  '#EC4899', '#0EA5E9', '#14B8A6', '#F97316', '#7F1D1D', '#1E3A8A', '#14532D', '#3F3F46',
];

type Tab = 'layouts' | 'ratio' | 'spacing' | 'color';

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

export function Editor({
  initialTemplate,
  aspect,
  onAspect,
  onBack,
}: {
  initialTemplate: Template;
  aspect: AspectId;
  onAspect: (a: AspectId) => void;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [template, setTemplate] = useState(initialTemplate);
  const [design, setDesign] = useState<Design>(DEFAULT_DESIGN);
  const [photos, setPhotos] = useState<(Photo | null)[]>([]);
  const [previews, setPreviews] = useState<Record<string, SkImage>>({});
  const [selected, setSelected] = useState(-1);
  const [tab, setTab] = useState<Tab>('layouts');
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const ratio = ASPECTS.find((a) => a.id === aspect)!.ratio;
  const cellCount = template.cells.length;

  // Fit the preview canvas into the available area.
  const canvasW = Math.max(1, Math.min(area.w, area.h * ratio));
  const canvasH = canvasW / ratio;
  const scale = canvasW / 1080;
  const cells = useMemo(() => resolveCells(template, canvasW, canvasH, design), [template, canvasW, canvasH, design]);

  // Free preview images that are no longer referenced.
  useEffect(() => {
    const used = new Set(photos.filter(Boolean).map((p) => p!.uri));
    const stale = Object.keys(previews).filter((u) => !used.has(u));
    if (stale.length) {
      setPreviews((prev) => {
        const next = { ...prev };
        stale.forEach((u) => {
          next[u]?.dispose();
          delete next[u];
        });
        return next;
      });
    }
  }, [photos, previews]);

  const addAssets = useCallback(async (assets: ImagePicker.ImagePickerAsset[], targets: number[]) => {
    if (!assets.length) return;
    setLoading(true);
    try {
      const loaded: Record<string, SkImage> = {};
      for (const a of assets) loaded[a.uri] = await loadPreviewImage(a.uri);
      setPreviews((p) => ({ ...p, ...loaded }));
      setPhotos((prev) => {
        const next = [...prev];
        assets.forEach((a, i) => {
          const idx = targets[i];
          if (idx === undefined) return;
          const img = loaded[a.uri];
          next[idx] = {
            uri: a.uri,
            width: img.width(),
            height: img.height(),
            sourceLongSide: Math.max(a.width, a.height, img.width(), img.height()),
            transform: IDENTITY,
          };
        });
        return next;
      });
    } catch (e) {
      Alert.alert('Could not open photo', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  const emptyCells = useMemo(
    () => Array.from({ length: cellCount }, (_, i) => i).filter((i) => !photos[i]),
    [cellCount, photos],
  );

  const fillAll = async () => {
    const targets = emptyCells.length ? emptyCells : Array.from({ length: cellCount }, (_, i) => i);
    const assets = await pickPhotos(targets.length);
    await addAssets(assets, targets);
  };

  const pickInto = async (index: number) => {
    const assets = await pickPhotos(1);
    await addAssets(assets, [index]);
  };

  const updatePhoto = (index: number, fn: (p: Photo) => Photo | null) =>
    setPhotos((prev) => {
      const next = [...prev];
      const p = next[index];
      if (p) next[index] = fn(p);
      return next;
    });

  const swapWithNext = (index: number) =>
    setPhotos((prev) => {
      const next = [...prev];
      const j = (index + 1) % cellCount;
      [next[index], next[j]] = [next[j] ?? null, next[index] ?? null];
      setSelected(j);
      return next;
    });

  /* ---------------- Live preview ---------------- */

  const picture = useMemo(
    () =>
      createPicture((canvas) => {
        drawBackground(canvas, canvasW, canvasH, design);
        cells.forEach((cell, i) => {
          const photo = photos[i];
          drawCell(canvas, cell, {
            image: photo ? previews[photo.uri] ?? null : null,
            transform: photo?.transform ?? IDENTITY,
            design,
            scale,
            placeholder: true,
            selected: i === selected,
          });
        });
      }),
    [cells, photos, previews, design, selected, canvasW, canvasH, scale],
  );

  /* ---------------- Gestures: tap / drag / pinch ---------------- */

  const live = useRef({ cells, photos, selected });
  live.current = { cells, photos, selected };
  const gesture = useRef({ index: -1, start: IDENTITY, dist: 0, moved: false, pinched: false, t: 0 });

  const distance = (e: GestureResponderEvent) => {
    const t = e.nativeEvent.touches;
    if (t.length < 2) return 0;
    return Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
  };

  const tapRef = useRef<(i: number) => void>(() => {});
  tapRef.current = (i: number) => {
    if (i < 0) {
      setSelected(-1);
      return;
    }
    if (!photos[i]) {
      setSelected(i);
      pickInto(i);
    } else {
      setSelected(i === selected ? -1 : i);
    }
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          const index = hitTest(live.current.cells, locationX, locationY);
          const photo = index >= 0 ? live.current.photos[index] : null;
          gesture.current = {
            index,
            start: photo?.transform ?? IDENTITY,
            dist: distance(e),
            moved: false,
            pinched: false,
            t: Date.now(),
          };
        },
        onPanResponderMove: (e, g) => {
          const st = gesture.current;
          if (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6 || e.nativeEvent.touches.length > 1) st.moved = true;
          const photo = st.index >= 0 ? live.current.photos[st.index] : null;
          if (!photo || !st.moved) return;
          const cell = live.current.cells[st.index];

          const d = distance(e);
          if (d > 0) {
            if (!st.dist) {
              st.dist = d;
              st.start = photo.transform;
            }
            st.pinched = true;
            const next = clampTransform({ ...st.start, scale: st.start.scale * (d / st.dist) });
            setPhotos((prev) => {
              const arr = [...prev];
              if (arr[st.index]) arr[st.index] = { ...arr[st.index]!, transform: next };
              return arr;
            });
            return;
          }

          if (st.pinched) return; // don't jump when lifting one finger after a pinch
          const dest = coverRect(photo.width, photo.height, cell.photoRect, st.start);
          const slackX = (dest.width - cell.photoRect.width) / 2;
          const slackY = (dest.height - cell.photoRect.height) / 2;
          const next = clampTransform({
            ...st.start,
            offsetX: slackX > 0.5 ? st.start.offsetX + g.dx / slackX : st.start.offsetX,
            offsetY: slackY > 0.5 ? st.start.offsetY + g.dy / slackY : st.start.offsetY,
          });
          setPhotos((prev) => {
            const arr = [...prev];
            if (arr[st.index]) arr[st.index] = { ...arr[st.index]!, transform: next };
            return arr;
          });
        },
        onPanResponderRelease: () => {
          const st = gesture.current;
          if (!st.moved && Date.now() - st.t < 500) tapRef.current(st.index);
          else if (st.index >= 0 && live.current.photos[st.index]) setSelected(st.index);
        },
      }),
    [],
  );

  const filled = photos.slice(0, cellCount).filter(Boolean).length;
  const sel = selected >= 0 && selected < cellCount ? photos[selected] : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}>
        <Button label="‹ Templates" kind="ghost" onPress={onBack} />
        <Text style={{ flex: 1, textAlign: 'center', color: theme.text, fontWeight: '700' }} numberOfLines={1}>
          {template.name}
        </Text>
        <Button label="Export" onPress={() => setExporting(true)} disabled={filled === 0} />
      </View>

      {/* Canvas */}
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onLayout={(e) => setArea({ w: e.nativeEvent.layout.width - 32, h: e.nativeEvent.layout.height - 32 })}
      >
        {area.w > 0 && (
          <View style={{ width: canvasW, height: canvasH }} {...responder.panHandlers}>
            <Canvas style={{ width: canvasW, height: canvasH }} pointerEvents="none">
              <Picture picture={picture} />
            </Canvas>
          </View>
        )}
        {loading && (
          <View style={{ position: 'absolute', backgroundColor: '#000a', padding: 16, borderRadius: 12 }}>
            <ActivityIndicator color="#fff" />
          </View>
        )}
      </View>

      {/* Selected photo actions */}
      <View style={{ minHeight: 52, justifyContent: 'center', paddingHorizontal: 12 }}>
        {sel ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Chip label="Replace" onPress={() => pickInto(selected)} />
            <Chip label="Zoom +" onPress={() => updatePhoto(selected, (p) => ({ ...p, transform: clampTransform({ ...p.transform, scale: p.transform.scale * 1.15 }) }))} />
            <Chip label="Zoom −" onPress={() => updatePhoto(selected, (p) => ({ ...p, transform: clampTransform({ ...p.transform, scale: p.transform.scale / 1.15 }) }))} />
            <Chip label="Reset" onPress={() => updatePhoto(selected, (p) => ({ ...p, transform: IDENTITY }))} />
            {cellCount > 1 && <Chip label="Swap →" onPress={() => swapWithNext(selected)} />}
            <Chip label="Remove" onPress={() => { updatePhoto(selected, () => null); setSelected(-1); }} />
          </ScrollView>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: theme.muted, flex: 1 }}>
              {filled}/{cellCount} photos · tap a cell to add, drag to move, pinch to zoom
            </Text>
            <Button
              label={emptyCells.length ? `Add ${emptyCells.length}` : 'Replace all'}
              kind="secondary"
              onPress={fillAll}
              style={{ paddingVertical: 8 }}
            />
          </View>
        )}
      </View>

      {/* Tool panel */}
      <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingTop: 10 }}>
          {(['layouts', 'ratio', 'spacing', 'color'] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={{ padding: 8 }}>
              <Text style={{ color: tab === t ? theme.text : theme.muted, fontWeight: '700', textTransform: 'capitalize' }}>{t}</Text>
              {tab === t && <View style={{ height: 2, backgroundColor: theme.accent, marginTop: 4, borderRadius: 1 }} />}
            </Pressable>
          ))}
        </View>
        <View style={{ height: 130, justifyContent: 'center' }}>
          {tab === 'layouts' && (
            <FlatList
              horizontal
              data={TEMPLATES as Template[]}
              keyExtractor={(t) => t.id}
              initialScrollIndex={Math.max(0, TEMPLATES.findIndex((t) => t.id === template.id))}
              getItemLayout={(_, i) => ({ length: 84, offset: 84 * i, index: i })}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    setTemplate(item);
                    setSelected(-1);
                    if (item.preferredAspect && item.preferredAspect !== aspect) onAspect(item.preferredAspect);
                  }}
                  style={{
                    width: 76,
                    marginRight: 8,
                    padding: 4,
                    borderRadius: 10,
                    alignItems: 'center',
                    borderWidth: 2,
                    borderColor: item.id === template.id ? theme.accent : 'transparent',
                  }}
                >
                  <TemplateThumb template={item} size={64} aspect={ratio} />
                  <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 10, marginTop: 2 }}>
                    {item.cells.length} · {item.name}
                  </Text>
                </Pressable>
              )}
            />
          )}
          {tab === 'ratio' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, alignItems: 'center' }}>
              {ASPECTS.map((a) => (
                <Chip key={a.id} label={`${a.label}  ${a.hint}`} active={a.id === aspect} onPress={() => onAspect(a.id)} />
              ))}
            </ScrollView>
          )}
          {tab === 'spacing' && (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20 }}>
              <Slider label="Spacing" value={design.gap} min={0} max={80} onChange={(gap) => setDesign((d) => ({ ...d, gap }))} />
              <Slider label="Border" value={design.margin} min={0} max={120} onChange={(margin) => setDesign((d) => ({ ...d, margin }))} />
              <Slider label="Corners" value={design.radius} min={0} max={160} onChange={(radius) => setDesign((d) => ({ ...d, radius }))} />
              <View style={{ flexDirection: 'row', marginVertical: 6 }}>
                <Chip label={design.shadow ? 'Frame shadow: on' : 'Frame shadow: off'} active={design.shadow} onPress={() => setDesign((d) => ({ ...d, shadow: !d.shadow }))} />
              </View>
            </ScrollView>
          )}
          {tab === 'color' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, alignItems: 'center' }}>
              {COLORS.map((c) => (
                <Pressable
                  key={c}
                  accessibilityLabel={`Background ${c}`}
                  onPress={() => setDesign((d) => ({ ...d, background: c }))}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: c,
                    marginRight: 10,
                    borderWidth: design.background === c ? 3 : 1,
                    borderColor: design.background === c ? theme.accent : theme.border,
                  }}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </View>

      <ExportSheet
        visible={exporting}
        onClose={() => setExporting(false)}
        template={template}
        design={design}
        photos={photos.slice(0, cellCount)}
        aspect={ratio}
      />
    </View>
  );
}
