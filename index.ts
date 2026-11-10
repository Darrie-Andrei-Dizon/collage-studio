import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

// App is required lazily: on web, Skia's WebAssembly build (CanvasKit) must be
// loaded before any module that touches Skia is evaluated.
const start = () => registerRootComponent(require('./App').default);

if (Platform.OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { LoadSkiaWeb } = require('@shopify/react-native-skia/lib/module/web');
  // canvaskit.wasm is served next to index.html (copied into public/ by `npm run build:web`).
  // Offline support when installed as a home-screen web app (pages that ship the
  // manifest, i.e. GitHub Pages; the claude.ai demo page doesn't).
  if ('serviceWorker' in navigator && document.querySelector('link[rel="manifest"]')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  LoadSkiaWeb({ locateFile: (file: string) => file })
    .then(start)
    .catch((e: unknown) => {
      const root = document.getElementById('root');
      if (root) {
        root.innerHTML =
          '<p style="color:#F4F2FA;font:15px system-ui;padding:24px;max-width:36em">Collage Studio could not start its graphics engine in this browser (' +
          String((e as Error)?.message ?? e).replace(/</g, '&lt;') +
          '). Try a current version of Chrome, Edge, Safari or Firefox.</p>';
      }
    });
} else {
  start();
}
