import type { IconName } from './icons';
import { carouselTemplates, gridTemplates, MAX_GRID_ROWS, MAX_SLIDES, MIN_GRID_ROWS, MIN_SLIDES, splitTemplates } from './multi';
import { ASPECTS, TEMPLATES, type AspectId, type Mode, type Template } from './templates';

/**
 * Instagram facts the app is built around (checked November 2026):
 *  - A carousel holds 2–20 photos/videos, and every slide uses the first slide's ratio.
 *  - Feed photos can be 1.91:1 up to 3:4 tall (4:5 also fine). Instagram stores them
 *    at 1080 px wide.
 *  - The profile grid shows every post cropped to 3:4.
 */
export const INSTAGRAM = {
  minSlides: MIN_SLIDES,
  maxSlides: MAX_SLIDES,
  storedWidth: 1080,
  gridRatio: '3:4' as AspectId,
};

export const MODES: { id: Mode; title: string; blurb: string; icon: IconName }[] = [
  { id: 'post', title: 'Single post', blurb: 'One image for feed or Stories', icon: 'image' },
  { id: 'carousel', title: 'Carousel', blurb: 'Up to 20 slides, seamless or a new layout on every slide', icon: 'layers' },
  { id: 'split', title: 'Split-screen', blurb: 'Panels and photos cut across slides', icon: 'columns' },
  { id: 'grid', title: 'Profile grid', blurb: 'One picture across 3–12 posts', icon: 'grid' },
];

export function aspectsFor(mode: Mode) {
  const ids: AspectId[] = mode === 'post' ? ['4:5', '1:1', '9:16', '3:4', '1.91:1'] : mode === 'grid' ? ['3:4'] : ['4:5', '1:1', '3:4'];
  return ids.map((id) => ASPECTS.find((a) => a.id === id)!);
}

export const ratioOf = (id: AspectId) => ASPECTS.find((a) => a.id === id)!.ratio;

export function countRange(mode: Mode): [number, number] {
  if (mode === 'grid') return [MIN_GRID_ROWS, MAX_GRID_ROWS];
  if (mode === 'post') return [1, 1];
  return [MIN_SLIDES, MAX_SLIDES];
}

export const defaultCount = (mode: Mode) => (mode === 'grid' ? 3 : mode === 'post' ? 1 : 4);

export function templatesFor(mode: Mode, count: number): Template[] {
  if (mode === 'carousel') return carouselTemplates(count);
  if (mode === 'split') return splitTemplates(count);
  if (mode === 'grid') return gridTemplates(count);
  return [...TEMPLATES];
}

export const countOf = (t: Template) => (t.mode === 'grid' ? t.rows : t.cols);

/** "5 slides", "9 posts", "1 image". */
export function outputLabel(t: Template) {
  const n = t.cols * t.rows;
  if (t.mode === 'grid') return `${n} posts`;
  if (t.mode === 'post') return '1 image';
  return `${n} slides`;
}

export function modeTitle(mode: Mode) {
  return MODES.find((m) => m.id === mode)!.title;
}

/**
 * Profile-grid tiles must be posted in reverse: the newest post shows top-left.
 * Returns the 1-based posting step for a tile (1 = post first).
 */
export const postingStep = (t: Template, tileIndex: number) => t.cols * t.rows - tileIndex + 1;
