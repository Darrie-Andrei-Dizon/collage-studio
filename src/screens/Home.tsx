import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../icons';
import { DESIGN_COUNTS } from '../multi';
import { aspectsFor, countRange, INSTAGRAM, MODES, ratioOf, templatesFor } from '../project';
import { CATEGORIES, TEMPLATES, type AspectId, type Category, type Mode, type Template } from '../templates';
import { Chip, Stepper, T, TemplateThumb, theme } from '../ui';

export interface HomeState {
  mode: Mode;
  counts: Record<Mode, number>;
  aspects: Record<Mode, AspectId>;
}

const POST_CATEGORIES = CATEGORIES.filter((c) => !['Seamless', 'Split screen', 'Profile grid'].includes(c));

export function Home({ state, onChange, onPick }: { state: HomeState; onChange: (s: HomeState) => void; onPick: (t: Template, aspect: AspectId) => void }) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const [category, setCategory] = useState<Category | 'All'>('All');
  const { mode } = state;
  const count = state.counts[mode];
  const aspectId = state.aspects[mode];
  const aspect = ratioOf(aspectId);

  const width = Math.min(winW, 760);
  const pad = 16;

  const data = useMemo(() => {
    const list = templatesFor(mode, count);
    return mode === 'post' && category !== 'All' ? list.filter((t) => t.category === category) : list;
  }, [mode, count, category]);

  const cols = mode === 'post' ? (width > 560 ? 4 : 3) : mode === 'grid' ? (width > 560 ? 3 : 2) : 1;
  const gap = 10;
  const cardW = (width - pad * 2 - gap * (cols - 1)) / cols;
  const [lo, hi] = countRange(mode);
  const set = (patch: Partial<HomeState>) => onChange({ ...state, ...patch });

  const header = (
    <View style={{ gap: 18, paddingBottom: 14 }}>
      {/* Brand */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: theme.surface2, padding: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
          {['#C4B5FD', '#F9A8D4', '#FDBA74', '#93C5FD'].map((c) => (
            <View key={c} style={{ width: 12.5, height: 12.5, borderRadius: 3.5, backgroundColor: c }} />
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <T v="display" style={{ fontSize: 24, lineHeight: 28 }}>
            Collage Studio
          </T>
          <T v="small">Full-resolution export · never a watermark</T>
        </View>
      </View>

      {/* Mode picker */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {MODES.map((m) => {
          const active = m.id === mode;
          const n = m.id === 'post' ? TEMPLATES.length : DESIGN_COUNTS[m.id];
          return (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => set({ mode: m.id })}
              style={({ pressed }) => ({
                width: (width - pad * 2 - 10) / 2,
                padding: 14,
                borderRadius: 18,
                gap: 10,
                backgroundColor: active ? theme.accentSoft : theme.surface,
                borderWidth: 1.5,
                borderColor: active ? theme.accent : theme.border,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? theme.accent : theme.surface3 }}>
                  <Icon name={m.icon} size={18} color="#fff" />
                </View>
                <T v="small" style={{ fontSize: 11, color: active ? theme.accentHi : theme.faint, fontWeight: '700' }}>
                  {m.id === 'post' ? `${n} layouts` : `${n} designs`}
                </T>
              </View>
              <View>
                <T v="body" style={{ fontWeight: '700' }}>
                  {m.title}
                </T>
                <T v="small" numberOfLines={2}>
                  {m.blurb}
                </T>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Setup for the chosen mode */}
      <View style={{ backgroundColor: theme.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 14, gap: 14 }}>
        {mode !== 'post' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Stepper
              value={count}
              min={lo}
              max={hi}
              suffix={mode === 'grid' ? `${count === 1 ? 'row' : 'rows'} · ${count * 3} posts` : 'slides'}
              onChange={(v) => set({ counts: { ...state.counts, [mode]: v } })}
            />
            <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
              <Icon name="info" size={15} color={theme.faint} style={{ marginTop: 1 }} />
              <T v="small" style={{ flex: 1 }}>
                {mode === 'grid'
                  ? 'Your profile grid shows posts at 3:4, so tiles export at 1080 × 1440 and line up exactly.'
                  : `Instagram carousels hold ${INSTAGRAM.minSlides}–${INSTAGRAM.maxSlides} slides.`}
              </T>
            </View>
          </View>
        )}
        <View style={{ gap: 8 }}>
          <T v="label">{mode === 'post' ? 'Ratio' : 'Slide ratio'}</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {aspectsFor(mode).map((a) => (
              <Chip key={a.id} label={`${a.label} · ${a.hint}`} active={a.id === aspectId} onPress={() => set({ aspects: { ...state.aspects, [mode]: a.id } })} />
            ))}
          </ScrollView>
        </View>
      </View>

      {mode === 'post' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {(['All', ...POST_CATEGORIES] as const).map((c) => (
            <Chip key={c} label={c} active={c === category} onPress={() => setCategory(c)} />
          ))}
        </ScrollView>
      ) : (
        <T v="label">
          {data.length} designs · {mode === 'grid' ? `${count * 3} tiles` : `${count} slides`}
        </T>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      <FlatList
        key={`${mode}-${cols}`}
        data={data}
        numColumns={cols}
        keyExtractor={(t) => t.id}
        initialNumToRender={12}
        windowSize={7}
        ListHeaderComponent={header}
        style={{ alignSelf: 'center', width }}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: insets.bottom + 32 }}
        columnWrapperStyle={cols > 1 ? { gap, marginBottom: gap } : undefined}
        renderItem={({ item }) => {
          const thumbH = mode === 'post' ? cardW - 20 : mode === 'grid' ? cardW * 1.1 : Math.min(150, (cardW - 20) / (item.cols * aspect));
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name} template`}
              onPress={() => onPick(item, aspectId)}
              style={({ pressed }) => ({
                width: cardW,
                marginBottom: cols === 1 ? gap : 0,
                backgroundColor: pressed ? theme.surface2 : theme.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.border,
                padding: 10,
                gap: 8,
              })}
            >
              <View style={{ alignItems: 'center', justifyContent: 'center', height: thumbH }}>
                <TemplateThumb template={item} aspect={aspect} maxW={cardW - 20} maxH={thumbH} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 2 }}>
                <T v="small" numberOfLines={1} style={{ color: theme.text, fontWeight: '600', flex: 1 }}>
                  {item.name}
                </T>
                <T v="small" style={{ fontSize: 11 }}>
                  {item.cells.length} {item.cells.length === 1 ? 'photo' : 'photos'}
                </T>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
