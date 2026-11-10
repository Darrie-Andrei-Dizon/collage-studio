import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Editor } from './src/screens/Editor';
import { Gallery } from './src/screens/Gallery';
import type { AspectId, Template } from './src/templates';

export default function App() {
  const [aspect, setAspect] = useState<AspectId>('4:5');
  const [template, setTemplate] = useState<Template | null>(null);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {template ? (
        <Editor
          key={template.id}
          initialTemplate={template}
          aspect={aspect}
          onAspect={setAspect}
          onBack={() => setTemplate(null)}
        />
      ) : (
        <Gallery
          aspect={aspect}
          onAspect={setAspect}
          onPick={(t) => {
            if (t.preferredAspect) setAspect(t.preferredAspect);
            setTemplate(t);
          }}
        />
      )}
    </SafeAreaProvider>
  );
}
