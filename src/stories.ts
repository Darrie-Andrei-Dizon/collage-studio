/**
 * "Slide by slide" carousel designs: unlike the seamless designs, every slide gets its
 * own layout (a cover, a grid, a shape, a polaroid…), so a carousel reads like a story
 * instead of one repeated pattern. Some designs add photos that bridge two slides to
 * keep the swipe connected.
 *
 * Scenes are built per slide. Grid-like scenes use slide-scoped layout cells, so the
 * Border and Spacing sliders apply inside every slide.
 */
import { H, L, layout, V, type Cell, type CellShape, type Node } from './templates';

type Scene = (i: number, n: number) => Cell[];

/** Layout node laid out inside slide i. */
const scoped = (node: Node, extra: Partial<Cell> = {}): Scene => (i, n) =>
  layout(node).map((c) => ({ ...c, scope: [i / n, 0, 1 / n, 1] as [number, number, number, number], ...extra }));

/** Layout spanning slides i..i+span-1 (one panorama region). */
const spanning = (i: number, n: number, span: number, node: Node = L): Cell[] =>
  layout(node).map((c) => ({ ...c, scope: [i / n, 0, span / n, 1] as [number, number, number, number] }));

/** Free cell in slide-local units (x may go past 1 to bleed into the next slide). */
const F = (i: number, n: number, x: number, y: number, w: number, h: number, extra: Partial<Cell> = {}): Cell => ({
  x: (i + x) / n,
  y,
  w: w / n,
  h,
  free: true,
  ...extra,
});

const thin = { pad: 0.025, bottom: 0.025, color: '#FFFFFF' };
const polaroid = { pad: 0.05, bottom: 0.2, color: '#FFFFFF' };

/** Deterministic pseudo-random numbers, so a design always looks the same. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------- Scene library ---------------------------- */

const S = {
  full: scoped(L),
  duoCols: scoped(H(null, L, L)),
  duoRows: scoped(V(null, L, L)),
  duoWide: scoped(V([2, 1], L, L)),
  duoTall: scoped(H([2, 1], L, L)),
  trioLeft: scoped(H([3, 2], L, V(null, L, L))),
  trioRight: scoped(H([2, 3], V(null, L, L), L)),
  trioTop: scoped(V([3, 2], L, H(null, L, L))),
  trioBottom: scoped(V([2, 3], H(null, L, L), L)),
  tallTrio: scoped(H(null, L, L, L)),
  strip3: scoped(V(null, L, L, L)),
  quad: scoped(V(null, H(null, L, L), H(null, L, L))),
  five: scoped(V([2, 1], H([2, 1], L, V(null, L, L)), H(null, L, L))),
  six: scoped(V(null, H(null, L, L), H(null, L, L), H(null, L, L))),
  bento: scoped(V([3, 2], H([1, 1], L, V(null, L, L)), H([2, 1], L, L))),
  shape: (shape: CellShape, size = 0.8): Scene => (i, n) => [F(i, n, (1 - size) / 2, 0.5 - (size * 0.8) / 2, size, size * 0.8, { shape })],
  framed: ((i, n) => [F(i, n, 0.1, 0.09, 0.8, 0.82, { frame: thin })]) as Scene,
  polaroid: (rot: number): Scene => (i, n) => [F(i, n, 0.11, 0.16, 0.78, 0.6, { frame: polaroid, rotate: rot })],
  polaroidPair: ((i, n) => [
    F(i, n, 0.05, 0.06, 0.6, 0.46, { frame: polaroid, rotate: -6 }),
    F(i, n, 0.35, 0.46, 0.6, 0.46, { frame: polaroid, rotate: 5 }),
  ]) as Scene,
  overlap: ((i, n) => [F(i, n, 0.06, 0.06, 0.62, 0.58), F(i, n, 0.32, 0.38, 0.62, 0.56, { frame: thin })]) as Scene,
  diag: (flip: boolean): Scene => (i, n) => {
    const a = flip ? 0.38 : 0.62;
    const b = flip ? 0.62 : 0.38;
    const d = 0.012;
    return [
      F(i, n, 0, 0, 1, 1, { shape: 'poly', poly: [[0, 0], [a - d, 0], [b - d, 1], [0, 1]] }),
      F(i, n, 0, 0, 1, 1, { shape: 'poly', poly: [[a + d, 0], [1, 0], [1, 1], [b + d, 1]] }),
    ];
  },
  small: (corner: 'tl' | 'c' | 'br' | 'tr'): Scene => (i, n) => {
    const pos = { tl: [0.08, 0.07], c: [0.2, 0.25], br: [0.32, 0.47], tr: [0.32, 0.07] }[corner];
    return [F(i, n, pos[0], pos[1], 0.6, 0.46, { frame: thin })];
  },
  spotlight: (shape: CellShape): Scene => (i, n) => [...scoped(L)(i, n), F(i, n, 0.18, 0.28, 0.64, 0.44, { shape })],
};

/** Photo that sits across the seam between slide i and i+1. */
const bridge = (i: number, n: number, rot = 0, y = 0.6): Cell => F(i, n, 0.7, y, 0.6, 0.32, { frame: thin, rotate: rot });

const cycle = <T,>(list: T[], k: number) => list[k % list.length];

/* ---------------------------- Designs ---------------------------- */

export const MIXED: { id: string; name: string; gen: (n: number) => Cell[] }[] = [
  {
    id: 'mix-story',
    name: 'Story mix',
    gen: (n) =>
      Array.from({ length: n }, (_, i) =>
        i === n - 1 && n > 2 ? S.framed(i, n) : cycle([S.full, S.quad, S.trioLeft, S.shape('circle'), S.duoRows, S.five, S.polaroid(-4), S.strip3, S.trioRight, S.bento], i)(i, n),
      ).flat(),
  },
  {
    id: 'mix-rhythm',
    name: 'Rhythm 1·2·3·4',
    gen: (n) => {
      const byCount = [S.full, S.duoCols, S.trioLeft, S.quad];
      const seq = [0, 1, 2, 3, 2, 1];
      return Array.from({ length: n }, (_, i) => byCount[cycle(seq, i)](i, n)).flat();
    },
  },
  {
    id: 'mix-magazine',
    name: 'Magazine',
    gen: (n) => {
      const out: Cell[] = [];
      const bridges: Cell[] = [];
      for (let i = 0; i < n; i++) {
        out.push(...(i === 0 ? S.trioTop : cycle([S.duoTall, S.six, S.tallTrio, S.duoWide, S.bento, S.trioBottom], i - 1))(i, n));
        if (i % 2 === 1 && i < n - 1) bridges.push(bridge(i, n, 0, 0.62));
      }
      return [...out, ...bridges]; // bridges on top, so the next slide doesn't cover them
    },
  },
  {
    id: 'mix-shapes',
    name: 'Shape tour',
    gen: (n) => {
      const shapes: CellShape[] = ['circle', 'heart', 'arch', 'hexagon', 'star', 'diamond', 'pill'];
      return Array.from({ length: n }, (_, i) => {
        const shape = cycle(shapes, i);
        return S.shape(shape, shape === 'arch' || shape === 'pill' ? 0.66 : 0.8)(i, n);
      }).flat();
    },
  },
  {
    id: 'mix-spotlight',
    name: 'Spotlight series',
    gen: (n) => Array.from({ length: n }, (_, i) => S.spotlight(cycle<CellShape>(['circle', 'heart', 'star', 'hexagon', 'diamond'], i))(i, n)).flat(),
  },
  {
    id: 'mix-scrapbook',
    name: 'Scrapbook',
    gen: (n) => {
      const r = rng(7);
      const out: Cell[] = [];
      const bridges: Cell[] = [];
      for (let i = 0; i < n; i++) {
        const count = 1 + Math.floor(r() * 3);
        for (let k = 0; k < count; k++) {
          const size = count === 1 ? 0.72 : count === 2 ? 0.56 : 0.46;
          out.push(
            F(i, n, 0.04 + r() * (0.96 - size - 0.04), 0.04 + (k / count) * (0.9 - size * 0.62) + r() * 0.08, size, size * 0.72, {
              frame: polaroid,
              rotate: Math.round((r() - 0.5) * 18),
            }),
          );
        }
        if (i < n - 1 && i % 2 === 0) bridges.push(F(i, n, 0.74, 0.36 + r() * 0.2, 0.52, 0.3, { frame: polaroid, rotate: Math.round((r() - 0.5) * 12) }));
      }
      return [...out, ...bridges];
    },
  },
  {
    id: 'mix-pano-breaks',
    name: 'Panorama breaks',
    gen: (n) => {
      const out: Cell[] = [];
      let i = 0;
      let k = 0;
      while (i < n) {
        if (k % 2 === 0 && i + 1 < n) {
          out.push(...spanning(i, n, 2));
          i += 2;
        } else {
          out.push(...cycle([S.quad, S.trioLeft, S.five, S.duoRows], k)(i, n));
          i += 1;
        }
        k++;
      }
      return out;
    },
  },
  {
    id: 'mix-duo',
    name: 'Dynamic duo',
    gen: (n) => Array.from({ length: n }, (_, i) => cycle([S.duoCols, S.duoRows, S.duoTall, S.diag(false), S.duoWide, S.overlap, S.diag(true)], i)(i, n)).flat(),
  },
  {
    id: 'mix-cover-finale',
    name: 'Cover, grid, finale',
    gen: (n) =>
      Array.from({ length: n }, (_, i) => {
        if (i === 0) return [...S.full(i, n), F(i, n, 0.52, 0.56, 0.4, 0.36, { frame: thin })];
        if (i === n - 1) return S.shape('circle', 0.72)(i, n);
        return cycle([S.quad, S.five, S.six, S.bento], i - 1)(i, n);
      }).flat(),
  },
  {
    id: 'mix-wave',
    name: 'Wave',
    gen: (n) => {
      const m = Math.round(n * 1.5) + 1;
      return Array.from({ length: m }, (_, k) => {
        const t = m === 1 ? 0.5 : k / (m - 1);
        const size = 0.42 + 0.22 * Math.abs(Math.sin(k * 1.3));
        const x = 0.04 + t * (n - size - 0.08);
        const y = 0.5 + Math.sin(t * Math.PI * Math.max(2, n / 1.5)) * 0.24 - (size * 0.8) / 2;
        return { x: x / n, y: Math.max(0.02, Math.min(0.98 - size * 0.8, y)), w: size / n, h: size * 0.8, free: true, shape: k % 3 === 2 ? ('circle' as const) : undefined, frame: k % 3 === 2 ? undefined : thin };
      });
    },
  },
  {
    id: 'mix-mosaic-bridges',
    name: 'Mosaic + bridges',
    gen: (n) => {
      const out: Cell[] = [];
      const bridges: Cell[] = [];
      for (let i = 0; i < n; i++) {
        out.push(...cycle([S.trioLeft, S.duoRows, S.five, S.tallTrio, S.bento, S.quad, S.trioBottom], i)(i, n));
        if (i < n - 1) bridges.push(bridge(i, n, i % 2 ? 4 : -4, i % 2 ? 0.08 : 0.6));
      }
      return [...out, ...bridges];
    },
  },
  {
    id: 'mix-breathing',
    name: 'Breathing room',
    gen: (n) =>
      Array.from({ length: n }, (_, i) =>
        cycle<Scene>([S.full, S.small('tl'), S.small('br'), S.framed, S.small('tr'), S.small('c')], i)(i, n),
      ).flat(),
  },
  {
    id: 'mix-film-diary',
    name: 'Film diary',
    gen: (n) =>
      Array.from({ length: n }, (_, i) =>
        cycle<Scene>(
          [
            S.strip3,
            S.tallTrio,
            (j, m) => [F(j, m, 0.08, 0.22, 0.84, 0.56, { frame: { pad: 0.04, bottom: 0.04, color: '#111111' } })],
            S.polaroidPair,
          ],
          i,
        )(i, n),
      ).flat(),
  },
  {
    id: 'mix-editorial-split',
    name: 'Editorial split',
    gen: (n) => Array.from({ length: n }, (_, i) => cycle([S.diag(false), S.trioTop, S.duoCols, S.diag(true), S.trioBottom, S.duoTall], i)(i, n)).flat(),
  },
];
