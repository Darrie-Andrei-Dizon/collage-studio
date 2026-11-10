import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DESIGN_COUNTS } from '../multi';
import { aspectsFor, countRange, INSTAGRAM, MODES, ratioOf, templatesFor } from '../project';
import { CATEGORIES, type AspectId, type Category, type Mode, type Template } from '../templates';
import { haptic, Row, Section, Segmented, Stepper, T, TemplateThumb, useTheme } from '../ui';

export interface HomeState {
  mode: Mode;
  counts: Record<Mode, number>;
  aspects: Record<Mode, AspectId>;
}

const POST_CATEGORIES = CATEGORIES.filter((c) => !['Seamless', 'Split screen', 'Profile grid', 'Slide by slide'].includes(c));
const SHORT: Record<Mode, string> = { post: 'Post', carousel: 'Carousel', split: 'Split', grid: 'Grid' };
type CarouselFilter = 'all' | 'seamless' | 'mixed';

export function Home({ state, onChange, onPick }: { state: HomeState; onChange: (s: HomeState) => void; onPick: (t: Template, aspect: AspectId) => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const [category, setCategory] = useState<Category | 'All'>('All');
  const [filter, setFilter] = useState<CarouselFilter>('all');
  const { mode } = state;
  const count = state.counts[mode];
  const aspectId = state.aspects[mode];
  const aspect = ratioOf(aspectId);

  const width = Math.min(winW, 720);
  const pad = 16;

  const data = useMemo(() => {
    const list = templatesFor(mode, count);
    if (mode === 'post') return category === 'All' ? list : list.filter((t) => t.category === category);
    if (mode === 'carousel' && filter !== 'all') return list.filter((t) => (filter === 'seamless' ? t.category === 'Seamless' : t.category === 'Slide by slide'));
    return list;
  }, [mode, count, category, filter]);

  const cols = mode === 'post' ? (width > 560 ? 4 : 3) : mode === 'grid' ? (width > 560 ? 3 : 2) : 1;
  const gap = 12;
  const cardW = (width - pad * 2 - gap * (cols - 1)) / cols;
  const [lo, hi] = countRange(mode);
  const set = (patch: Partial<HomeState>) => onChange({ ...state, ...patch });
  const info = MODES.find((m) => m.id === mode)!;
  const ratios = aspectsFor(mode);

  const header = (
    <View style={{ gap: 20, paddingBottom: 12 }}>
      <View style={{ paddingTop: 12, paddingHorizontal: 4 }}>
        <T v="largeTitle">Collage Studio</T>
        <T v="subhead" tone="secondary">
          Full-resolution export. Never a watermark.
        </T>
      </View>

      <View style={{ gap: 8 }}>
        <Segmented options={MODES.map((m) => ({ value: m.id, label: SHORT[m.id] }))} value={mode} onChange={(m) => set({ mode: m })} />
        <T v="footnote" tone="secondary" style={{ paddingHorizontal: 4 }}>
          {info.title}: {info.blurb.charAt(0).toLowerCase() + info.blurb.slice(1)}.
        </T>
      </View>

      <Section
        footer={
          mode === 'grid'
            ? 'Your profile grid shows posts at 3:4, so tiles export at 1080 × 1440 and line up exactly.'
            : mode === 'post'
              ? undefined
              : `Instagram allows ${INSTAGRAM.minSlides} to ${INSTAGRAM.maxSlides} slides in one carousel.`
        }
      >
        {mode !== 'post' && (
          <Row
            label={mode === 'grid' ? 'Rows' : 'Slides'}
            detail={mode === 'grid' ? `${count} · ${count * 3} posts` : String(count)}
            accessory={<Stepper value={count} min={lo} max={hi} label={mode === 'grid' ? 'rows' : 'slides'} onChange={(v) => set({ counts: { ...state.counts, [mode]: v } })} />}
          />
        )}
        {ratios.length > 1 ? (
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
            <T v="body">{mode === 'post' ? 'Aspect ratio' : 'Slide ratio'}</T>
            <Segmented compact options={ratios.map((a) => ({ value: a.id, label: a.label }))} value={aspectId} onChange={(a) => set({ aspects: { ...state.aspects, [mode]: a } })} />
          </View>
        ) : (
          <Row label="Tile ratio" detail="3:4 · Profile grid" />
        )}
      </Section>

      {mode === 'carousel' && (
        <Segmented
          options={[
            { value: 'all', label: `All ${DESIGN_COUNTS.carousel}` },
            { value: 'seamless', label: 'Seamless' },
            { value: 'mixed', label: 'Slide by slide' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      )}
      {mode === 'post' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(['All', ...POST_CATEGORIES] as const).map((cat) => {
            const on = cat === category;
            return (
              <Pressable
                key={cat}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  haptic.select();
                  setCategory(cat);
                }}
                style={{ height: 32, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? c.label : c.fill }}
              >
                <T v="subhead" weight="600" style={{ color: on ? c.bg : c.label }}>
                  {cat}
                </T>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <T v="title3">Templates</T>
        <T v="footnote" tone="secondary">
          {data.length} {mode === 'grid' ? `· ${count * 3} tiles` : mode === 'post' ? '' : `· ${count} slides`}
        </T>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <FlatList
        key={`${mode}-${cols}`}
        data={data}
        extraData={c.name}
        numColumns={cols}
        keyExtractor={(t) => t.id}
        initialNumToRender={10}
        windowSize={7}
        ListHeaderComponent={header}
        style={{ alignSelf: 'center', width }}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: insets.bottom + 32 }}
        columnWrapperStyle={cols > 1 ? { gap, marginBottom: gap + 4 } : undefined}
        renderItem={({ item }) => {
          const thumbH = mode === 'post' ? cardW - 16 : mode === 'grid' ? cardW * 1.1 : Math.min(150, (cardW - 24) / (item.cols * aspect));
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name} template`}
              onPress={() => {
                haptic.tap();
                onPick(item, aspectId);
              }}
              style={({ pressed }) => ({ width: cardW, marginBottom: cols === 1 ? gap + 4 : 0, gap: 6, opacity: pressed ? 0.6 : 1 })}
            >
              <View style={{ backgroundColor: c.card, borderRadius: 12, height: thumbH + (cols === 1 ? 24 : 16), alignItems: 'center', justifyContent: 'center' }}>
                <TemplateThumb template={item} aspect={aspect} maxW={cardW - (cols === 1 ? 24 : 16)} maxH={thumbH} />
              </View>
              <View style={{ paddingHorizontal: 2 }}>
                <T v={cols === 1 ? 'subhead' : 'footnote'} weight="600" numberOfLines={1}>
                  {item.name}
                </T>
                <T v="caption" tone="secondary" numberOfLines={1}>
                  {item.cells.length} {item.cells.length === 1 ? 'photo' : 'photos'}
                  {item.category === 'Slide by slide' ? ' · each slide different' : ''}
                </T>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
