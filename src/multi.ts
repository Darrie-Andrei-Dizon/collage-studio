/**
 * Multi-slide templates.
 *
 *  - Seamless carousels: one continuous design across N slides (Instagram allows 2–20).
 *    Photos deliberately straddle slide edges so the post flows as you swipe.
 *  - Split-screen carousels: every slide split into panels (side by side, top/bottom,
 *    diagonal…), including "across the seam" layouts where one photo is cut in half
 *    between two neighbouring slides.
 *  - Panoramic profile grid: a 3-column mosaic of 1–4 rows. Each tile is posted as its own
 *    post; together they form one big picture on the profile grid (shown at 3:4).
 *
 * Cells are generated in "slide units" and converted to 0..1 of the whole canvas.
 */
import { MIXED } from './stories';
import { H, L, layout, V, type Cell, type Node, type Template } from './templates';

export const MIN_SLIDES = 2;
export const MAX_SLIDES = 20; // Instagram's carousel limit
export const MIN_GRID_ROWS = 1;
export const MAX_GRID_ROWS = 4;

type Gen = (n: number) => Cell[];

/** Free cell in slide units (x across slides, y/h in 0..1 of the height). */
const S = (n: number, x: number, y: number, w: number, h: number, extra: Partial<Cell> = {}): Cell => ({
  x: x / n,
  y,
  w: w / n,
  h,
  free: true,
  ...extra,
});

const repeat = <T,>(k: number, f: (i: number) => T): T[] => Array.from({ length: Math.max(0, k) }, (_, i) => f(i));
const cols = (k: number) => H(null, ...repeat(k, () => L));
const thinFrame = { pad: 0.025, bottom: 0.025, color: '#FFFFFF' };
const polaroidFrame = { pad: 0.05, bottom: 0.2, color: '#FFFFFF' };
const spread = (k: number, from: number, to: number) => repeat(k, (i) => (k === 1 ? (from + to) / 2 : from + ((to - from) * i) / (k - 1)));

/* ---------------------------- Seamless carousels ---------------------------- */

const CAROUSEL: { id: string; name: string; gen: Gen }[] = [
  { id: 'panorama', name: 'Panorama', gen: () => [{ x: 0, y: 0, w: 1, h: 1 }] },
  {
    id: 'pano-insets',
    name: 'Panorama + insets',
    gen: (n) => [{ x: 0, y: 0, w: 1, h: 1 }, ...repeat(n, (i) => S(n, i + 0.52, 0.6, 0.4, 0.33, { frame: thinFrame }))],
  },
  {
    id: 'bridges',
    name: 'Seam bridges',
    gen: (n) => [
      ...repeat(n, (i) => S(n, i + 0.1, 0.07, 0.8, 0.55)),
      ...repeat(n - 1, (j) => S(n, j + 1 - 0.28, 0.5, 0.56, 0.42, { frame: thinFrame })),
    ],
  },
  {
    id: 'cascade',
    name: 'Cascade',
    gen: (n) =>
      spread(n, 0.05, n - 1.25).map((x, k) => S(n, x, k % 2 ? 0.4 : 0.07, 1.2, 0.53, { frame: thinFrame })),
  },
  {
    id: 'polaroids',
    name: 'Polaroid trail',
    gen: (n) =>
      spread(n + 1, 0.06, n - 0.84).map((x, k) => S(n, x, k % 2 ? 0.34 : 0.1, 0.78, 0.55, { frame: polaroidFrame, rotate: [-7, 5, -3, 8][k % 4] })),
  },
  {
    id: 'bubbles',
    name: 'Bubble wave',
    gen: (n) => spread(n + 1, 0.04, n - 0.8).map((x, k) => S(n, x, k % 2 ? 0.42 : 0.08, 0.76, 0.5, { shape: 'circle' })),
  },
  { id: 'offset-cols', name: 'Offset columns', gen: (n) => layout(cols(n + 1)) },
  { id: 'brick', name: 'Brick wall', gen: (n) => layout(V(null, cols(n + 1), cols(n))) },
  {
    id: 'mosaic-flow',
    name: 'Mosaic flow',
    gen: (n) =>
      layout(H(repeat(n + 1, (i) => (i % 2 ? 0.8 : 1.4)), ...repeat(n + 1, (i): Node => (i % 2 ? V(null, L, L) : L)))),
  },
  {
    id: 'hero-flow',
    name: 'Hero + grid',
    gen: (n) => {
      const k = Math.max(1, Math.round((n - 1.6) * 1.5));
      return layout(H([1.6, Math.max(0.4, n - 1.6)], L, V(null, cols(k), cols(k))));
    },
  },
  {
    id: 'film',
    name: 'Film roll',
    gen: (n) => {
      const m = Math.round(n * 1.6) + 1;
      const g = 0.06;
      const w = (n - (m + 1) * g) / m;
      return repeat(m, (i) => S(n, g + i * (w + g), 0.22, w, 0.56));
    },
  },
  {
    id: 'arches',
    name: 'Arch gallery',
    gen: (n) => spread(n + 1, 0.08, n - 0.72).map((x) => S(n, x, 0.14, 0.64, 0.72, { shape: 'arch' })),
  },
];

/* ---------------------------- Split-screen carousels ---------------------------- */

const diag = (n: number, i: number, flip: boolean, d = 0.012): Cell[] => {
  const a = flip ? 0.38 : 0.62;
  const b = flip ? 0.62 : 0.38;
  return [
    S(n, i, 0, 1, 1, { shape: 'poly', poly: [[0, 0], [a - d, 0], [b - d, 1], [0, 1]] }),
    S(n, i, 0, 1, 1, { shape: 'poly', poly: [[a + d, 0], [1, 0], [1, 1], [b + d, 1]] }),
  ];
};

const SPLIT: { id: string; name: string; gen: Gen }[] = [
  { id: 'split-v', name: 'Side by side', gen: (n) => layout(cols(2 * n)) },
  { id: 'split-across', name: 'Across the seam', gen: (n) => layout(H([0.5, ...repeat(n - 1, () => 1), 0.5], ...repeat(n + 1, () => L))) },
  { id: 'split-h', name: 'Top & bottom', gen: (n) => layout(H(null, ...repeat(n, () => V(null, L, L)))) },
  { id: 'split-diag', name: 'Diagonal split', gen: (n) => repeat(n, (i) => diag(n, i, false)).flat() },
  { id: 'split-zigzag', name: 'Zigzag split', gen: (n) => repeat(n, (i) => diag(n, i, i % 2 === 1)).flat() },
  {
    id: 'split-seam-circles',
    name: 'Seam circles',
    gen: (n) => [...layout(cols(2 * n)), ...repeat(n - 1, (j) => S(n, j + 1 - 0.3, 0.32, 0.6, 0.36, { shape: 'circle' }))],
  },
  { id: 'split-thirds', name: 'Triptych', gen: (n) => layout(cols(3 * n)) },
  { id: 'split-quad', name: 'Quarters', gen: (n) => layout(H(null, ...repeat(n, () => V(null, cols(2), cols(2))))) },
  {
    id: 'split-offset-rows',
    name: 'Offset rows',
    gen: (n) => layout(V(null, cols(n), H([0.5, ...repeat(n - 1, () => 1), 0.5], ...repeat(n + 1, () => L)))),
  },
  {
    id: 'split-big-small',
    name: 'Big & small',
    gen: (n) => layout(H(null, ...repeat(n, (i): Node => (i % 2 ? H([1, 2], V(null, L, L), L) : H([2, 1], L, V(null, L, L)))))),
  },
];

/* ---------------------------- Panoramic profile grid ---------------------------- */

/** Free cell in tile units for a 3 × r grid. */
const T = (r: number, x: number, y: number, w: number, h: number, extra: Partial<Cell> = {}): Cell => ({
  x: x / 3,
  y: y / r,
  w: w / 3,
  h: h / r,
  free: true,
  ...extra,
});

const GRID: { id: string; name: string; gen: (r: number) => Cell[]; minRows?: number }[] = [
  { id: 'grid-pano', name: 'One panorama', gen: () => [{ x: 0, y: 0, w: 1, h: 1 }] },
  { id: 'grid-tiles', name: 'Photo per tile', gen: (r) => layout(V(null, ...repeat(r, () => cols(3)))) },
  { id: 'grid-columns', name: 'Tall columns', gen: () => layout(cols(3)), minRows: 2 },
  { id: 'grid-rows', name: 'Wide rows', gen: (r) => layout(V(null, ...repeat(r, () => L))), minRows: 2 },
  { id: 'grid-hero', name: 'Hero + side', gen: (r) => layout(H([2, 1], L, V(null, ...repeat(r, () => L)))) },
  { id: 'grid-center', name: 'Center stage', gen: (r) => layout(H(null, V(null, ...repeat(r, () => L)), L, V(null, ...repeat(r, () => L)))), minRows: 2 },
  {
    id: 'grid-offset',
    name: 'Offset mosaic',
    gen: (r) => layout(V(null, ...repeat(r, (i) => (i % 2 ? H([0.5, 1, 1, 0.5], L, L, L, L) : H([1, 1, 1], L, L, L))))),
  },
  {
    id: 'grid-heart',
    name: 'Heart on panorama',
    gen: (r) => {
      const size = Math.min(1.8, r * 0.92);
      return [{ x: 0, y: 0, w: 1, h: 1 }, T(r, 1.5 - size / 2, r / 2 - size / 2, size, size, { shape: 'heart' })];
    },
  },
  {
    id: 'grid-circles',
    name: 'Seam bubbles',
    gen: (r) => {
      const ys = r === 1 ? [0.5] : repeat(r - 1, (i) => i + 1);
      return ys.flatMap((y) => [1, 2].map((x) => T(r, x - 0.42, y - 0.42, 0.84, 0.84, { shape: 'circle' as const })));
    },
  },
  {
    id: 'grid-polaroids',
    name: 'Scattered prints',
    gen: (r) =>
      repeat(r * 2, (i) => {
        const row = Math.floor(i / 2);
        const x = i % 2 ? 1.45 + (row % 2) * 0.35 : 0.2 + (row % 2) * 0.4;
        return T(r, x, row + 0.12, 1.15, 0.8, { frame: polaroidFrame, rotate: [-6, 5, 4, -5][i % 4] });
      }),
  },
];

/* ---------------------------- Lookup ---------------------------- */

const cache = new Map<string, Template[]>();

export function carouselTemplates(n: number): Template[] {
  const key = `carousel-${n}`;
  if (!cache.has(key))
    cache.set(
      key,
      [
        ...CAROUSEL.map((d) => ({ ...d, category: 'Seamless' as const })),
        ...MIXED.map((d) => ({ ...d, category: 'Slide by slide' as const })),
      ].map((d) => ({ id: `${d.id}-${n}`, baseId: d.id, name: d.name, category: d.category, cells: d.gen(n), mode: 'carousel' as const, cols: n, rows: 1 })),
    );
  return cache.get(key)!;
}

export function splitTemplates(n: number): Template[] {
  const key = `split-${n}`;
  if (!cache.has(key))
    cache.set(
      key,
      SPLIT.map((d) => ({ id: `${d.id}-${n}`, baseId: d.id, name: d.name, category: 'Split screen', cells: d.gen(n), mode: 'split', cols: n, rows: 1 })),
    );
  return cache.get(key)!;
}

export function gridTemplates(rows: number): Template[] {
  const key = `grid-${rows}`;
  if (!cache.has(key))
    cache.set(
      key,
      GRID.filter((d) => rows >= (d.minRows ?? 1)).map((d) => ({
        id: `${d.id}-${rows}`,
        baseId: d.id,
        name: d.name,
        category: 'Profile grid',
        cells: d.gen(rows),
        mode: 'grid',
        cols: 3,
        rows,
      })),
    );
  return cache.get(key)!;
}

/** Same design, different slide/row count (falls back to the first template). */
export function resize(t: Template, count: number): Template {
  const list = t.mode === 'carousel' ? carouselTemplates(count) : t.mode === 'split' ? splitTemplates(count) : t.mode === 'grid' ? gridTemplates(count) : [t];
  return list.find((x) => x.baseId === t.baseId) ?? list[0];
}

export const DESIGN_COUNTS = { carousel: CAROUSEL.length + MIXED.length, split: SPLIT.length, grid: GRID.length, seamless: CAROUSEL.length, mixed: MIXED.length };
