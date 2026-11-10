import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Platform, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { defaultCount } from './src/project';
import { Editor } from './src/screens/Editor';
import { Home, type HomeState } from './src/screens/Home';
import type { AspectId, Template } from './src/templates';
import { DARK, LIGHT, ThemeProvider } from './src/ui';

/**
 * The system appearance, or on the web an explicit light/dark choice the hosting page
 * sets on <html data-theme> (claude.ai does this when the viewer picks a theme).
 */
function useAppearance(): 'light' | 'dark' {
  const system = useColorScheme();
  const [forced, setForced] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = document.documentElement;
    const read = () => setForced(root.getAttribute('data-theme'));
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  if (forced === 'light' || forced === 'dark') return forced;
  return system === 'light' ? 'light' : 'dark';
}

export default function App() {
  // The template browser follows the system appearance; the editor is always dark,
  // like editing in the Photos app, so colors in your collage read accurately.
  const scheme = useAppearance();
  const homeTheme = scheme === 'light' ? LIGHT : DARK;
  const [home, setHome] = useState<HomeState>({
    mode: 'carousel',
    counts: { post: 1, carousel: defaultCount('carousel'), split: defaultCount('split'), grid: defaultCount('grid') },
    aspects: { post: '4:5', carousel: '4:5', split: '4:5', grid: '3:4' },
  });
  const [open, setOpen] = useState<{ template: Template; aspect: AspectId; key: number } | null>(null);
  const theme = open ? DARK : homeTheme;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={theme}>
        <StatusBar style={theme.name === 'dark' ? 'light' : 'dark'} />
        <View style={{ flex: 1, backgroundColor: theme.bg }}>
          {open ? (
            <Editor key={open.key} initialTemplate={open.template} initialAspect={open.aspect} onBack={() => setOpen(null)} />
          ) : (
            <Home state={home} onChange={setHome} onPick={(template, aspect) => setOpen({ template, aspect, key: Date.now() })} />
          )}
        </View>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
