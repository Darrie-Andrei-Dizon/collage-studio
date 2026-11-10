/**
 * Collage templates.
 *
 * Every template is resolution independent: cells are described in normalized
 * coordinates (0..1) of the canvas, so the same template renders identically
 * on the on-screen preview and on a 4K export.
 *
 * Layout cells (`free` not set) live inside the canvas's inner area and get
 * the user's spacing applied between them. Free cells (scatter, polaroids,
 * shapes floating on a background) are placed exactly where they are defined
 * and may be rotated or overlap.
 */

export type CellShape =
  | 'rect'
  | 'circle'
  | 'heart'
  | 'hexagon'
  | 'diamond'
  | 'arch'
  | 'star'
  | 'pill'
  | 'poly';

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  shape?: CellShape;
  /** Placed exactly at x/y/w/h, ignoring spacing and margin. */
  free?: boolean;
  /** Rotation in degrees around the cell center (free cells only). */
  rotate?: number;
  /** Polaroid-style frame drawn behind the photo (fractions of the cell's short side). */
  frame?: { pad: number; bottom: number; color: string };
  /** For shape 'poly': polygon points in 0..1 of the cell rect. */
  poly?: [number, number][];
}

export type Category =
  | 'Grid'
  | '2 Photos'
  | '3 Photos'
  | '4 Photos'
  | '5 Photos'
  | '6+ Photos'
  | 'Shapes'
  | 'Freestyle'
  | 'Stories'
  | 'Seamless'
  | 'Split screen'
  | 'Profile grid';

/** What gets exported: one image, a swipeable carousel, or tiles for the profile grid. */
export type Mode = 'post' | 'carousel' | 'split' | 'grid';

interface TemplateDef {
  id: string;
  name: string;
  category: Category;
  /** Cells in 0..1 of the WHOLE canvas (all slides side by side). */
  cells: Cell[];
  /** Aspect ratio this template looks best in (optional hint). */
  preferredAspect?: AspectId;
}

export interface Template extends TemplateDef {
  mode: Mode;
  /** Slides across and down. A post is 1×1, a carousel N×1, a grid post 3×rows. */
  cols: number;
  rows: number;
  /** Same design at a different slide count shares a baseId. */
  baseId: string;
}

export type AspectId = '1:1' | '4:5' | '9:16' | '1.91:1' | '3:4';

export const ASPECTS: { id: AspectId; label: string; ratio: number; hint: string }[] = [
  { id: '4:5', label: '4:5', ratio: 4 / 5, hint: 'Feed portrait' },
  { id: '1:1', label: '1:1', ratio: 1, hint: 'Feed square' },
  { id: '9:16', label: '9:16', ratio: 9 / 16, hint: 'Story / Reel' },
  { id: '3:4', label: '3:4', ratio: 3 / 4, hint: 'Feed 3:4' },
  { id: '1.91:1', label: '1.91:1', ratio: 1.91, hint: 'Landscape' },
];

/* ------------------------------------------------------------------ */
/* Guillotine layout DSL                                               */
/* ------------------------------------------------------------------ */

export type Node = 'L' | { dir: 'H' | 'V'; weights: number[]; children: Node[] };

export const L: Node = 'L';
/** Side-by-side columns. */
export const H = (weights: number[] | null, ...children: Node[]): Node => ({
  dir: 'H',
  weights: weights ?? children.map(() => 1),
  children,
});
/** Stacked rows. */
export const V = (weights: number[] | null, ...children: Node[]): Node => ({
  dir: 'V',
  weights: weights ?? children.map(() => 1),
  children,
});

export function layout(node: Node, x = 0, y = 0, w = 1, h = 1, out: Cell[] = []): Cell[] {
  if (node === 'L') {
    out.push({ x, y, w, h });
    return out;
  }
  const total = node.weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  node.children.forEach((child, i) => {
    const f = node.weights[i] / total;
    if (node.dir === 'H') layout(child, x + cursor * w, y, w * f, h, out);
    else layout(child, x, y + cursor * h, w, h * f, out);
    cursor += f;
  });
  return out;
}

const round = (n: number) => Math.round(n * 10000) / 10000;
const signature = (cells: Cell[]) =>
  cells
    .map((c) => `${round(c.x)},${round(c.y)},${round(c.w)},${round(c.h)}`)
    .sort()
    .join('|');

/* ------------------------------------------------------------------ */
/* Generators                                                           */
/* ------------------------------------------------------------------ */

const templates: TemplateDef[] = [];
const seen = new Set<string>();

function add(t: TemplateDef, dedupe = true) {
  if (dedupe) {
    const sig = signature(t.cells) + (t.cells[0]?.shape ?? '');
    if (seen.has(sig)) return;
    seen.add(sig);
  }
  templates.push(t);
}

function categoryFor(n: number): Category {
  if (n === 2) return '2 Photos';
  if (n === 3) return '3 Photos';
  if (n === 4) return '4 Photos';
  if (n === 5) return '5 Photos';
  return '6+ Photos';
}

// 1. Plain grids: rows x cols from 1x1 to 4x4, plus 5x5.
for (let r = 1; r <= 5; r++) {
  for (let c = 1; c <= 5; c++) {
    if ((r === 5) !== (c === 5)) continue;
    const node = V(null, ...Array.from({ length: r }, () => H(null, ...Array.from({ length: c }, () => L))));
    add({
      id: `grid-${r}x${c}`,
      name: r * c === 1 ? 'Single' : `Grid ${r}×${c}`,
      category: 'Grid',
      cells: layout(node),
    });
  }
}

// 2. Weighted two-way splits.
const ratios: [number, number][] = [
  [1, 1],
  [2, 1],
  [1, 2],
  [3, 1],
  [1, 3],
  [3, 2],
  [2, 3],
];
for (const [a, b] of ratios) {
  add({ id: `split-h-${a}-${b}`, name: `Columns ${a}:${b}`, category: '2 Photos', cells: layout(H([a, b], L, L)) });
  add({ id: `split-v-${a}-${b}`, name: `Rows ${a}:${b}`, category: '2 Photos', cells: layout(V([a, b], L, L)) });
}

// 3. Featured: one hero photo + N small photos on one side.
for (const n of [2, 3, 4, 5]) {
  for (const [wa, wb] of [
    [2, 1],
    [3, 1],
  ] as const) {
    const smallCol = V(null, ...Array.from({ length: n }, () => L));
    const smallRow = H(null, ...Array.from({ length: n }, () => L));
    add({ id: `hero-left-${n}-${wa}`, name: `Hero left +${n}`, category: categoryFor(n + 1), cells: layout(H([wa, wb], L, smallCol)) });
    add({ id: `hero-right-${n}-${wa}`, name: `Hero right +${n}`, category: categoryFor(n + 1), cells: layout(H([wb, wa], smallCol, L)) });
    add({ id: `hero-top-${n}-${wa}`, name: `Hero top +${n}`, category: categoryFor(n + 1), cells: layout(V([wa, wb], L, smallRow)) });
    add({ id: `hero-bottom-${n}-${wa}`, name: `Hero bottom +${n}`, category: categoryFor(n + 1), cells: layout(V([wb, wa], smallRow, L)) });
  }
}

// 4. Hand-designed mosaics.
const mosaics: [string, Node][] = [
  ['Tri stack', H(null, L, V(null, L, L))],
  ['Tri stack left', H(null, V(null, L, L), L)],
  ['Tri banner', V(null, L, H(null, L, L))],
  ['Tri banner top', V(null, H(null, L, L), L)],
  ['Pinwheel', V(null, H([2, 1], L, L), H([1, 2], L, L))],
  ['Pinwheel flip', V(null, H([1, 2], L, L), H([2, 1], L, L))],
  ['Staircase', V(null, H([1, 2], L, L), H(null, L, L), H([2, 1], L, L))],
  ['Window', V([1, 2, 1], L, H(null, L, L), L)],
  ['Gallery wall', H(null, V([2, 1], L, L), V([1, 2], L, L), V([2, 1], L, L))],
  ['Brick', V(null, H(null, L, L), H([1, 2, 1], L, L, L), H(null, L, L))],
  ['Magazine', V([3, 2], H([2, 1], L, V(null, L, L)), H(null, L, L, L))],
  ['Editorial', H([3, 2], V([2, 1], L, H(null, L, L)), V(null, L, L))],
  ['Center stage', H([1, 2, 1], V(null, L, L), L, V(null, L, L))],
  ['Center stage rows', V([1, 2, 1], H(null, L, L), L, H(null, L, L))],
  ['Frame', V([1, 3, 1], H(null, L, L, L), H([1, 3, 1], L, L, L), H(null, L, L, L))],
  ['Cross', V(null, H(null, L, L, L), H([1, 2], L, L))],
  ['Ladder', H(null, V(null, L, L, L), V(null, L, L))],
  ['Ladder flip', H(null, V(null, L, L), V(null, L, L, L))],
  ['Panorama sandwich', V([1, 1, 1], H(null, L, L), L, H(null, L, L))],
  ['Tall trio', H([2, 1, 1], L, L, L)],
  ['Wide trio', V([2, 1, 1], L, L, L)],
  ['Cascade', H(null, L, V(null, L, H(null, L, V(null, L, L))))],
  ['Spiral', H([3, 2], L, V([3, 2], L, H([2, 3], V([2, 3], L, L), L)))],
  ['Mondrian', H([3, 1], V([3, 1], L, H([1, 2], L, L)), V([1, 2, 1], L, L, L))],
  ['Bento', V([2, 1], H([2, 1], L, V(null, L, L)), H([1, 2], L, L))],
  ['Bento wide', H([2, 1], V([1, 2], L, H(null, L, L)), V([2, 1], L, L))],
  ['Checker 5', V(null, H(null, L, L), L, H(null, L, L))],
  ['Mosaic 7', V(null, H([2, 1], L, L), H(null, L, L, L), H([1, 2], L, L))],
  ['Mosaic 8', V(null, H(null, L, L, L), H([1, 2], L, L), H(null, L, L, L))],
  ['Mosaic 9', H(null, V([2, 1, 1], L, L, L), V([1, 2, 1], L, L, L), V([1, 1, 2], L, L, L))],
  ['Mosaic 10', V(null, H(null, L, L, L, L), H(null, L, L), H(null, L, L, L, L))],
  ['Big 4 + 8', V([1, 2, 1], H(null, L, L, L, L), H([1, 2, 1], V(null, L, L), L, V(null, L, L)), H(null, L, L, L, L))],
];
mosaics.forEach(([name, node], i) => {
  const cells = layout(node);
  add({ id: `mosaic-${i}`, name, category: categoryFor(cells.length), cells });
});

// 5. Auto-generated guillotine variations for 3–6 photos so every count has lots of choices.
function enumerate(n: number, dir: 'H' | 'V', depth: number): Node[] {
  if (n === 1) return [L];
  if (depth > 3) return [];
  const results: Node[] = [];
  const other = dir === 'H' ? 'V' : 'H';
  const parts = (total: number, k: number): number[][] => {
    if (k === 1) return [[total]];
    const res: number[][] = [];
    for (let first = 1; first <= total - k + 1; first++) {
      for (const rest of parts(total - first, k - 1)) res.push([first, ...rest]);
    }
    return res;
  };
  for (let k = 2; k <= Math.min(3, n); k++) {
    for (const p of parts(n, k)) {
      const childOptions = p.map((m) => enumerate(m, other, depth + 1));
      if (childOptions.some((o) => o.length === 0)) continue;
      // Take a limited cartesian product to keep the set manageable.
      const combos: Node[][] = [[]];
      for (const opts of childOptions) {
        const next: Node[][] = [];
        for (const combo of combos) for (const o of opts.slice(0, 3)) next.push([...combo, o]);
        combos.splice(0, combos.length, ...next.slice(0, 12));
      }
      for (const children of combos) {
        results.push(dir === 'H' ? H(null, ...children) : V(null, ...children));
        if (k === 2) {
          const weights = dir === 'H' ? [2, 1] : [1, 2];
          results.push(dir === 'H' ? H(weights, ...children) : V(weights, ...children));
        }
      }
    }
  }
  return results;
}

for (const n of [3, 4, 5, 6]) {
  let count = 0;
  const limit = n === 6 ? 14 : 18;
  for (const dir of ['H', 'V'] as const) {
    for (const node of enumerate(n, dir, 0)) {
      if (count >= limit) break;
      const cells = layout(node);
      const before = templates.length;
      add({ id: `auto-${n}-${dir}-${count}`, name: `Layout ${n}·${count + 1}`, category: categoryFor(n), cells });
      if (templates.length > before) count++;
    }
  }
}

// 6. Shapes.
const shapeGrid = (rows: number, cols: number, shape: CellShape, inset = 0.06): Cell[] =>
  layout(V(null, ...Array.from({ length: rows }, () => H(null, ...Array.from({ length: cols }, () => L))))).map((c) => ({
    ...c,
    x: c.x + c.w * inset,
    y: c.y + c.h * inset,
    w: c.w * (1 - 2 * inset),
    h: c.h * (1 - 2 * inset),
    shape,
    free: true,
  }));

const single = (shape: CellShape, size = 0.84): Cell[] => [
  { x: (1 - size) / 2, y: (1 - size) / 2, w: size, h: size, shape, free: true },
];

const shapeSets: [string, Cell[]][] = [
  ['Circle', single('circle')],
  ['Heart', single('heart')],
  ['Hexagon', single('hexagon')],
  ['Diamond', single('diamond')],
  ['Star', single('star')],
  ['Arch', single('arch', 0.8)],
  ['Circles 2×2', shapeGrid(2, 2, 'circle')],
  ['Circles 3×3', shapeGrid(3, 3, 'circle')],
  ['Hearts 2×2', shapeGrid(2, 2, 'heart')],
  ['Hearts 3×3', shapeGrid(3, 3, 'heart', 0.04)],
  ['Diamonds 2×2', shapeGrid(2, 2, 'diamond', 0.02)],
  ['Stars 2×2', shapeGrid(2, 2, 'star', 0.02)],
  ['Hex 2×2', shapeGrid(2, 2, 'hexagon', 0.03)],
  ['Arches ×3', layout(H(null, L, L, L)).map((c) => ({ ...c, x: c.x + 0.02, w: c.w - 0.04, y: 0.12, h: 0.76, shape: 'arch' as const, free: true }))],
  ['Arches ×2', layout(H(null, L, L)).map((c) => ({ ...c, x: c.x + 0.03, w: c.w - 0.06, y: 0.1, h: 0.8, shape: 'arch' as const, free: true }))],
  ['Pills ×3', layout(H(null, L, L, L)).map((c) => ({ ...c, x: c.x + 0.025, w: c.w - 0.05, y: 0.06, h: 0.88, shape: 'pill' as const, free: true }))],
  ['Pills ×4', layout(H(null, L, L, L, L)).map((c) => ({ ...c, x: c.x + 0.02, w: c.w - 0.04, y: 0.08, h: 0.84, shape: 'pill' as const, free: true }))],
  [
    'Spotlight',
    [
      ...layout(V(null, H(null, L, L), H(null, L, L))),
      { x: 0.25, y: 0.25, w: 0.5, h: 0.5, shape: 'circle' as const, free: true },
    ],
  ],
  [
    'Heart spotlight',
    [
      ...layout(V(null, H(null, L, L), H(null, L, L))),
      { x: 0.22, y: 0.22, w: 0.56, h: 0.56, shape: 'heart' as const, free: true },
    ],
  ],
  [
    // Tessellating 2-1-2 honeycomb, tuned for 4:5 (still non-overlapping at other ratios).
    'Honeycomb',
    [
      { x: 0.042, y: 0.0064 },
      { x: 0.478, y: 0.0064 },
      { x: 0.26, y: 0.308 },
      { x: 0.042, y: 0.6096 },
      { x: 0.478, y: 0.6096 },
    ].map((c) => ({ ...c, w: 0.48, h: 0.384, shape: 'hexagon' as const, free: true })),
  ],
  [
    'Bubbles',
    [
      { x: 0.04, y: 0.05, w: 0.55, h: 0.55 },
      { x: 0.6, y: 0.08, w: 0.34, h: 0.34 },
      { x: 0.55, y: 0.48, w: 0.42, h: 0.42 },
      { x: 0.12, y: 0.63, w: 0.32, h: 0.32 },
    ].map((c) => ({ ...c, shape: 'circle' as const, free: true })),
  ],
];
shapeSets.forEach(([name, cells], i) => add({ id: `shape-${i}`, name, category: 'Shapes', cells }, false));

// 7. Freestyle: polaroids, scatter, film strips.
const polaroid = (x: number, y: number, size: number, rotate: number): Cell => ({
  x,
  y,
  w: size,
  h: size,
  rotate,
  free: true,
  frame: { pad: 0.05, bottom: 0.2, color: '#FFFFFF' },
});

const freestyle: [string, Cell[], AspectId?][] = [
  ['Polaroid', [polaroid(0.15, 0.12, 0.7, -3)]],
  ['Polaroid pair', [polaroid(0.04, 0.16, 0.5, -7), polaroid(0.46, 0.3, 0.5, 6)]],
  ['Polaroid trio', [polaroid(0.03, 0.06, 0.45, -8), polaroid(0.5, 0.12, 0.45, 7), polaroid(0.25, 0.48, 0.47, -2)]],
  [
    'Polaroid pile',
    [polaroid(0.04, 0.04, 0.42, -10), polaroid(0.52, 0.06, 0.42, 8), polaroid(0.06, 0.5, 0.42, 6), polaroid(0.52, 0.52, 0.42, -6), polaroid(0.29, 0.28, 0.42, 2)],
  ],
  [
    'Scatter',
    [
      { x: 0.05, y: 0.06, w: 0.5, h: 0.4, rotate: -6, free: true },
      { x: 0.45, y: 0.12, w: 0.48, h: 0.38, rotate: 5, free: true },
      { x: 0.08, y: 0.5, w: 0.46, h: 0.42, rotate: 4, free: true },
      { x: 0.47, y: 0.55, w: 0.47, h: 0.38, rotate: -4, free: true },
    ],
  ],
  [
    'Layered',
    [
      { x: 0.05, y: 0.05, w: 0.62, h: 0.62, free: true },
      { x: 0.38, y: 0.38, w: 0.57, h: 0.57, free: true, frame: { pad: 0.025, bottom: 0.025, color: '#FFFFFF' } },
    ],
  ],
  [
    'Inset',
    [
      { x: 0, y: 0, w: 1, h: 1, free: true },
      { x: 0.55, y: 0.6, w: 0.38, h: 0.33, free: true, frame: { pad: 0.03, bottom: 0.03, color: '#FFFFFF' } },
    ],
  ],
  [
    'Film strip',
    layout(V(null, L, L, L)).map((c) => ({ ...c, x: 0.14, w: 0.72, y: c.y + 0.012, h: c.h - 0.024, free: true })),
    '9:16',
  ],
  [
    'Film strip wide',
    layout(H(null, L, L, L)).map((c) => ({ ...c, y: 0.18, h: 0.64, x: c.x + 0.01, w: c.w - 0.02, free: true })),
    '1.91:1',
  ],
  [
    'Photo booth',
    layout(V(null, L, L, L, L)).map((c) => ({ ...c, x: 0.3, w: 0.4, y: c.y + 0.01, h: c.h - 0.02, free: true })),
    '9:16',
  ],
  ['Border', [{ x: 0.07, y: 0.07, w: 0.86, h: 0.86, free: true }]],
  ['Postcard', [{ x: 0.06, y: 0.06, w: 0.88, h: 0.7, free: true }]],
];
freestyle.forEach(([name, cells, aspect], i) =>
  add({ id: `free-${i}`, name, category: 'Freestyle', cells, preferredAspect: aspect }, false),
);

// 8. Story-optimised layouts (tall stacks).
const stories: [string, Node][] = [
  ['Story duo', V(null, L, L)],
  ['Story trio', V(null, L, L, L)],
  ['Story quad', V(null, L, L, L, L)],
  ['Story hero', V([2, 1], L, H(null, L, L))],
  ['Story hero bottom', V([1, 2], H(null, L, L), L)],
  ['Story grid 2×3', V(null, H(null, L, L), H(null, L, L), H(null, L, L))],
  ['Story grid 2×4', V(null, H(null, L, L), H(null, L, L), H(null, L, L), H(null, L, L))],
  ['Story sandwich', V([1, 2, 1], L, L, L)],
  ['Story zigzag', V(null, H([2, 1], L, L), H([1, 2], L, L), H([2, 1], L, L))],
  ['Story columns', H(null, V([1, 2], L, L), V([2, 1], L, L))],
  ['Story mosaic', V([2, 1, 2], H([1, 2], L, L), H(null, L, L, L), H([2, 1], L, L))],
];
stories.forEach(([name, node], i) =>
  add({ id: `story-${i}`, name, category: 'Stories', cells: layout(node), preferredAspect: '9:16' }, false),
);

export const TEMPLATES: readonly Template[] = templates.map((t) => ({ ...t, mode: 'post', cols: 1, rows: 1, baseId: t.id }));

export const CATEGORIES: Category[] = [
  'Grid',
  '2 Photos',
  '3 Photos',
  '4 Photos',
  '5 Photos',
  '6+ Photos',
  'Shapes',
  'Freestyle',
  'Stories',
];

export function templatesIn(category: Category | 'All'): Template[] {
  return category === 'All' ? [...TEMPLATES] : TEMPLATES.filter((t) => t.category === category);
}
