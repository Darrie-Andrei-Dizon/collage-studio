// Runs the app's real Skia drawing code in Node using CanvasKit (WASM).
const fs = require('fs');
const path = require('path');
const H = require('../../node_modules/@shopify/react-native-skia/lib/commonjs/headless');
const ckDir = path.dirname(require.resolve('canvaskit-wasm/bin/full/canvaskit.js'));
const CanvasKitInit = require('canvaskit-wasm/bin/full/canvaskit.js');

const Skia = {};
module.exports = { ...H, Skia };
module.exports.init = async () => {
  global.CanvasKit = await CanvasKitInit({ locateFile: (f) => path.join(ckDir, f) });
  const real = H.getSkiaExports().Skia;
  for (const k of Object.keys(real)) Skia[k] = real[k];
  const D = real.Data;
  // Node's fetch can't read file:// URIs, so load local files directly.
  Skia.Data = {
    fromBytes: (b) => D.fromBytes(b),
    fromURI: async (uri) => D.fromBytes(new Uint8Array(fs.readFileSync(uri.replace('file://', '')))),
  };
};
