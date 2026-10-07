export type VariantReason = 'missing' | 'corrupt' | 'incomplete' | 'uncovered';
export interface VariantStatus { ok: boolean; reason?: VariantReason }
export type EyeVariantAvailability = Record<'spiral' | 'cross', VariantStatus>;
export interface CoverageLayer { rect: number[]; width: number; height: number; alpha: Uint8Array; sprite?: boolean }

/** Opaque coverage is checked at the actual eye pixels, not just its bounding box. */
export function eyeCoverage(special: CoverageLayer, references: CoverageLayer[], image: { width: number; height: number }): boolean {
  if (!Array.isArray(special.rect)) return false;
  const [x, y, w, h] = special.rect;
  if (special.rect.length !== 4 || !special.rect.every(Number.isInteger) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > image.width || y + h > image.height || w !== special.width || h !== special.height || special.alpha.length !== w * h) return false;
  for (const ref of references) {
    for (let i = 0; i < ref.alpha.length; i++) {
      if (ref.alpha[i] <= (ref.sprite ? 249 : 8)) continue;
      const px = ref.rect[0] + i % ref.width - x, py = ref.rect[1] + Math.floor(i / ref.width) - y;
      if (px < 0 || py < 0 || px >= w || py >= h || special.alpha[py * w + px] < 250) return false;
    }
  }
  return references.length > 0;
}

export function specialEyeAlphas(spiral: number, cross: number) {
  let s = Math.max(0, Math.min(1, Number.isFinite(spiral) ? spiral : 0)), c = Math.max(0, Math.min(1, Number.isFinite(cross) ? cross : 0));
  const total = s + c;
  if (total > 1) { s /= total; c /= total; }
  return { spiral: c < 1 ? Math.min(1, s / (1 - c)) : 0, cross: c, coverage: s + c };
}
