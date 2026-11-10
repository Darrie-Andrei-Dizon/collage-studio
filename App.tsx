import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { defaultCount } from './src/project';
import { Editor } from './src/screens/Editor';
import { Home, type HomeState } from './src/screens/Home';
import type { AspectId, Template } from './src/templates';
import { theme } from './src/ui';

export default function App() {
  const [home, setHome] = useState<HomeState>({
    mode: 'carousel',
    counts: { post: 1, carousel: defaultCount('carousel'), split: defaultCount('split'), grid: defaultCount('grid') },
    aspects: { post: '4:5', carousel: '4:5', split: '4:5', grid: '3:4' },
  });
  const [open, setOpen] = useState<{ template: Template; aspect: AspectId; key: number } | null>(null);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        {open ? (
          <Editor key={open.key} initialTemplate={open.template} initialAspect={open.aspect} onBack={() => setOpen(null)} />
        ) : (
          <Home state={home} onChange={setHome} onPick={(template, aspect) => setOpen({ template, aspect, key: Date.now() })} />
        )}
      </View>
    </SafeAreaProvider>
  );
}
