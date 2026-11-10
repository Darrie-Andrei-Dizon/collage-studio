/**
 * Collage rendering.
 *
 * The exact same drawing code is used for the live preview and for the final
 * export. The export is drawn on a CPU (raster) Skia surface at the chosen
 * output resolution using each photo's ORIGINAL full-resolution file, decoded
 * one at a time to keep memory low. Nothing is ever drawn on top of the
 * collage: there is no watermark.
 */
import {
  BlurStyle,
  ClipOp,
  FilterMode,
  ImageFormat,
  MipmapMode,
  PaintStyle,
  Skia,
  type SkCanvas,
  type SkImage,
  type SkPath,
  type SkRect,
} from '@shopify/react-native-skia';

import { writeOutput } from './output';
import type { Cell, CellShape, Template } from './templates';

/** Values are in pixels at a 1080 px wide canvas and scale with the output size. */
export interface Design {
  gap: number;
  margin: number;
  radius: number;
  background: string;
  shadow: boolean;
}

export const DEFAULT_DESIGN: Design = {
  gap: 12,
  margin: 12,
  radius: 0,
  background: '#FFFFFF',
  shadow: true,
};

/** How a photo sits inside its cell. offset is -1..1 of the available slack. */
export interface PhotoTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const IDENTITY: PhotoTransform = { scale: 1, offsetX: 0, offsetY: 0 };

export interface Photo {
  uri: string;
  /** Dimensions of the decoded (preview) image; used for its aspect ratio. */
  width: number;
  height: number;
  /** Longest side of the original file in pixels (used for upscale warnings). */
  sourceLongSide: number;
  transform: PhotoTransform;
}

export interface ResolvedCell {
  /** Outer rect of the cell (frame included). */
  rect: SkRect;
  /** Rect the photo is drawn into. */
  photoRect: SkRect;
  rotate: number;
  shape: CellShape;
  frame?: Cell['frame'];
}

const EPS = 1e-4;

export function resolveCells(template: Template, width: number, height: number, design: Design): ResolvedCell[] {
  const k = width / 1080;
  const margin = design.margin * k;
  const gap = design.gap * k;
  const areaW = width - margin * 2;
  const areaH = height - margin * 2;

  return template.cells.map((cell) => {
    let rect: SkRect;
    if (cell.free) {
      rect = { x: cell.x * width, y: cell.y * height, width: cell.w * width, height: cell.h * height };
    } else {
      const x0 = margin + cell.x * areaW;
      const y0 = margin + cell.y * areaH;
      const x1 = margin + (cell.x + cell.w) * areaW;
      const y1 = margin + (cell.y + cell.h) * areaH;
      const l = cell.x < EPS ? 0 : gap / 2;
      const t = cell.y < EPS ? 0 : gap / 2;
      const r = cell.x + cell.w > 1 - EPS ? 0 : gap / 2;
      const b = cell.y + cell.h > 1 - EPS ? 0 : gap / 2;
      rect = { x: x0 + l, y: y0 + t, width: Math.max(1, x1 - x0 - l - r), height: Math.max(1, y1 - y0 - t - b) };
    }

    let photoRect = rect;
    if (cell.frame) {
      const s = Math.min(rect.width, rect.height);
      const pad = cell.frame.pad * s;
      const bottom = cell.frame.bottom * s;
      photoRect = {
        x: rect.x + pad,
        y: rect.y + pad,
        width: rect.width - pad * 2,
        height: rect.height - pad - bottom,
      };
    }

    return { rect, photoRect, rotate: cell.rotate ?? 0, shape: cell.shape ?? 'rect', frame: cell.frame };
  });
}

/* ------------------------------------------------------------------ */
/* Shapes                                                               */
/* ------------------------------------------------------------------ */

function squareIn(r: SkRect): SkRect {
  const s = Math.min(r.width, r.height);
  return { x: r.x + (r.width - s) / 2, y: r.y + (r.height - s) / 2, width: s, height: s };
}

function polygon(r: SkRect, points: number, innerRatio?: number): SkPath {
  const b = Skia.PathBuilder.Make();
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const outer = r.width / 2;
  const steps = innerRatio ? points * 2 : points;
  for (let i = 0; i < steps; i++) {
    const radius = innerRatio && i % 2 === 1 ? outer * innerRatio : outer;
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / steps;
    const px = cx + radius * Math.cos(a);
    const py = cy + radius * Math.sin(a);
    if (i === 0) b.moveTo(px, py);
    else b.lineTo(px, py);
  }
  b.close();
  return b.detach();
}

export function shapePath(shape: CellShape, r: SkRect, radius: number): SkPath {
  const b = Skia.PathBuilder.Make();
  switch (shape) {
    case 'circle':
      b.addOval(squareIn(r));
      return b.detach();
    case 'pill': {
      const rr = Math.min(r.width, r.height) / 2;
      b.addRRect(Skia.RRectXY(r, rr, rr));
      return b.detach();
    }
    case 'diamond':
      return polygon(squareIn(r), 4);
    case 'hexagon':
      return polygon(squareIn(r), 6);
    case 'star':
      return polygon(squareIn(r), 5, 0.45);
    case 'heart': {
      const s = squareIn(r);
      const X = (v: number) => s.x + v * s.width;
      const Y = (v: number) => s.y + v * s.height;
      b.moveTo(X(0.5), Y(0.95));
      b.cubicTo(X(0.5), Y(0.95), X(0), Y(0.62), X(0), Y(0.32));
      b.cubicTo(X(0), Y(0.14), X(0.14), Y(0.04), X(0.28), Y(0.04));
      b.cubicTo(X(0.4), Y(0.04), X(0.47), Y(0.1), X(0.5), Y(0.2));
      b.cubicTo(X(0.53), Y(0.1), X(0.6), Y(0.04), X(0.72), Y(0.04));
      b.cubicTo(X(0.86), Y(0.04), X(1), Y(0.14), X(1), Y(0.32));
      b.cubicTo(X(1), Y(0.62), X(0.5), Y(0.95), X(0.5), Y(0.95));
      b.close();
      return b.detach();
    }
    case 'arch': {
      const rad = Math.min(r.width / 2, r.height);
      b.moveTo(r.x, r.y + r.height);
      b.lineTo(r.x, r.y + rad);
      b.arcToOval({ x: r.x, y: r.y, width: r.width, height: rad * 2 }, 180, 180, false);
      b.lineTo(r.x + r.width, r.y + r.height);
      b.close();
      return b.detach();
    }
    case 'rect':
    default: {
      const rr = Math.min(radius, r.width / 2, r.height / 2);
      if (rr > 0) b.addRRect(Skia.RRectXY(r, rr, rr));
      else b.addRect(r);
      return b.detach();
    }
  }
}

/* ------------------------------------------------------------------ */
/* Drawing                                                              */
/* ------------------------------------------------------------------ */

/** Destination rect of an image covering `box`, with the user's pan/zoom applied. */
export function coverRect(imgW: number, imgH: number, box: SkRect, t: PhotoTransform): SkRect {
  const s = Math.max(box.width / imgW, box.height / imgH) * t.scale;
  const dw = imgW * s;
  const dh = imgH * s;
  const cx = box.x + box.width / 2 + (t.offsetX * (dw - box.width)) / 2;
  const cy = box.y + box.height / 2 + (t.offsetY * (dh - box.height)) / 2;
  return { x: cx - dw / 2, y: cy - dh / 2, width: dw, height: dh };
}

export function clampTransform(t: PhotoTransform): PhotoTransform {
  const c = (v: number) => Math.max(-1, Math.min(1, v));
  return { scale: Math.max(1, Math.min(6, t.scale)), offsetX: c(t.offsetX), offsetY: c(t.offsetY) };
}

const paint = (color: string) => {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(color));
  return p;
};

export interface CellDrawOptions {
  image: SkImage | null;
  transform: PhotoTransform;
  design: Design;
  scale: number; // canvas width / 1080
  placeholder?: boolean;
  selected?: boolean;
}

export function drawCell(canvas: SkCanvas, cell: ResolvedCell, o: CellDrawOptions) {
  const { rect, photoRect } = cell;
  canvas.save();
  if (cell.rotate) canvas.rotate(cell.rotate, rect.x + rect.width / 2, rect.y + rect.height / 2);

  const radius = o.design.radius * o.scale;

  if (cell.frame) {
    const framePath = shapePath('rect', rect, Math.min(radius, 6 * o.scale));
    if (o.design.shadow) {
      const shadow = paint('#00000040');
      shadow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 10 * o.scale, true));
      canvas.save();
      canvas.translate(0, 6 * o.scale);
      canvas.drawPath(framePath, shadow);
      canvas.restore();
    }
    canvas.drawPath(framePath, paint(cell.frame.color));
  }

  const clip = shapePath(cell.shape, photoRect, radius);

  if (o.image) {
    canvas.save();
    canvas.clipPath(clip, ClipOp.Intersect, true);
    const iw = o.image.width();
    const ih = o.image.height();
    const dest = coverRect(iw, ih, photoRect, o.transform);
    // Trilinear (mipmapped) sampling gives clean, alias-free downscaling of large photos.
    canvas.drawImageRectOptions(
      o.image,
      { x: 0, y: 0, width: iw, height: ih },
      dest,
      FilterMode.Linear,
      MipmapMode.Linear,
      null,
    );
    canvas.restore();
  } else if (o.placeholder) {
    canvas.drawPath(clip, paint('#E9E6F2'));
    const cx = photoRect.x + photoRect.width / 2;
    const cy = photoRect.y + photoRect.height / 2;
    const arm = Math.min(photoRect.width, photoRect.height) * 0.12;
    const plus = paint('#9A92B5');
    plus.setStyle(PaintStyle.Stroke);
    plus.setStrokeWidth(Math.max(2, arm * 0.22));
    canvas.drawLine(cx - arm, cy, cx + arm, cy, plus);
    canvas.drawLine(cx, cy - arm, cx, cy + arm, plus);
  }

  if (o.selected) {
    const sel = paint('#7C4DFF');
    sel.setStyle(PaintStyle.Stroke);
    sel.setStrokeWidth(Math.max(3, 4 * o.scale));
    canvas.drawPath(clip, sel);
  }
  canvas.restore();
}

export function drawBackground(canvas: SkCanvas, width: number, height: number, design: Design) {
  canvas.drawRect({ x: 0, y: 0, width, height }, paint(design.background));
}

/* ------------------------------------------------------------------ */
/* Image loading                                                        */
/* ------------------------------------------------------------------ */

export async function decodeImage(uri: string): Promise<SkImage> {
  const data = await Skia.Data.fromURI(uri);
  const img = Skia.Image.MakeImageFromEncoded(data);
  data.dispose();
  if (!img) throw new Error('This photo format could not be decoded.');
  return img;
}

/** Decode a photo and keep only a downscaled copy for the on-screen preview. */
export async function loadPreviewImage(uri: string, maxSide = 1600): Promise<SkImage> {
  const full = await decodeImage(uri);
  const w = full.width();
  const h = full.height();
  const s = Math.min(1, maxSide / Math.max(w, h));
  if (s >= 1) return full;
  const pw = Math.round(w * s);
  const ph = Math.round(h * s);
  const surface = Skia.Surface.Make(pw, ph);
  if (!surface) return full;
  surface
    .getCanvas()
    .drawImageRectOptions(full, { x: 0, y: 0, width: w, height: h }, { x: 0, y: 0, width: pw, height: ph }, FilterMode.Linear, MipmapMode.Linear, null);
  surface.flush();
  const small = surface.makeImageSnapshot();
  full.dispose();
  return small;
}

/* ------------------------------------------------------------------ */
/* Export                                                               */
/* ------------------------------------------------------------------ */

export type ExportFormat = 'jpeg' | 'png';

export interface ExportOptions {
  width: number;
  aspect: number; // width / height
  format: ExportFormat;
  onProgress?: (fraction: number) => void;
}

export interface ExportResult {
  uri: string;
  width: number;
  height: number;
  bytes: number;
}

export async function exportCollage(
  template: Template,
  design: Design,
  photos: (Photo | null)[],
  opts: ExportOptions,
): Promise<ExportResult> {
  const width = Math.round(opts.width);
  const height = Math.round(opts.width / opts.aspect);
  // Raster (CPU) surface: no GPU texture size limits, deterministic output.
  const surface = Skia.Surface.Make(width, height);
  if (!surface) throw new Error(`Could not allocate a ${width}×${height} canvas.`);
  const canvas = surface.getCanvas();
  const scale = width / 1080;

  drawBackground(canvas, width, height, design);
  const cells = resolveCells(template, width, height, design);
  const total = cells.length + 1;

  for (let i = 0; i < cells.length; i++) {
    const photo = photos[i];
    let image: SkImage | null = null;
    if (photo) image = await decodeImage(photo.uri); // original, full resolution
    drawCell(canvas, cells[i], { image, transform: photo?.transform ?? IDENTITY, design, scale, placeholder: false });
    image?.dispose();
    opts.onProgress?.((i + 1) / total);
    // Yield so the progress UI can update between photos.
    await new Promise((r) => setTimeout(r, 0));
  }

  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const encoded =
    opts.format === 'png' ? snapshot.encodeToBytes(ImageFormat.PNG, 100) : snapshot.encodeToBytes(ImageFormat.JPEG, 100);
  snapshot.dispose();
  surface.dispose();

  const uri = await writeOutput(encoded, opts.format === 'png' ? 'png' : 'jpg');
  opts.onProgress?.(1);
  return { uri, width, height, bytes: encoded.length };
}

/** Hit-test a point (canvas pixels) against resolved cells; topmost first. */
export function hitTest(cells: ResolvedCell[], x: number, y: number): number {
  for (let i = cells.length - 1; i >= 0; i--) {
    const { rect, rotate } = cells[i];
    let px = x;
    let py = y;
    if (rotate) {
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const a = (-rotate * Math.PI) / 180;
      const dx = x - cx;
      const dy = y - cy;
      px = cx + dx * Math.cos(a) - dy * Math.sin(a);
      py = cy + dx * Math.sin(a) + dy * Math.cos(a);
    }
    if (px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height) return i;
  }
  return -1;
}
