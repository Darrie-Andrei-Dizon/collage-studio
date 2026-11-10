import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ASPECTS, CATEGORIES, templatesIn, TEMPLATES, type AspectId, type Category, type Template } from '../templates';
import { Chip, TemplateThumb, theme } from '../ui';

export function Gallery({
  aspect,
  onAspect,
  onPick,
}: {
  aspect: AspectId;
  onAspect: (a: AspectId) => void;
  onPick: (t: Template) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [category, setCategory] = useState<Category | 'All'>('All');
  const data = useMemo(() => templatesIn(category), [category]);
  const ratio = ASPECTS.find((a) => a.id === aspect)!.ratio;

  const cols = width > 700 ? 5 : 3;
  const pad = 16;
  const gap = 10;
  const size = (width - pad * 2 - gap * (cols - 1)) / cols;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: pad, paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ color: theme.text, fontSize: 28, fontWeight: '800' }}>Collage Studio</Text>
        <Text style={{ color: theme.muted, marginTop: 4 }}>
          {TEMPLATES.length} templates · full-resolution export · no watermark
        </Text>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, paddingVertical: 8 }}>
          {ASPECTS.map((a) => (
            <Chip key={a.id} label={`${a.label} · ${a.hint}`} active={a.id === aspect} onPress={() => onAspect(a.id)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 8 }}>
          {(['All', ...CATEGORIES] as const).map((c) => (
            <Chip key={c} label={c} active={c === category} onPress={() => setCategory(c)} />
          ))}
        </ScrollView>
      </View>

      <FlatList
        key={cols}
        data={data}
        numColumns={cols}
        keyExtractor={(t) => t.id}
        initialNumToRender={18}
        windowSize={7}
        contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: insets.bottom + 24 }}
        columnWrapperStyle={{ gap, marginBottom: gap }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onPick(item)}
            style={({ pressed }) => ({
              width: size,
              backgroundColor: theme.surface,
              borderRadius: 14,
              paddingVertical: 8,
              alignItems: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <TemplateThumb template={item} size={size - 16} aspect={ratio} />
            <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 11, marginTop: 6, paddingHorizontal: 6 }}>
              {item.name}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
