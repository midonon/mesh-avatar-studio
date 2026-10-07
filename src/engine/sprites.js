/** @param {ReturnType<import('./rig.js').createRig>} engine
 * @param {import('../rig/types').Rig} rig */
export function createSpriteModule(engine, rig) {
  const { baseWeights, deformBase, MOUTH } = engine;
  // Drawn eye / mouth variants (public/avatar/miko-qipao/sprites/, cut from full-size drawings) laid over the
  // face. Closed eyes and open mouths are what the single image does not contain, so instead of
  // faking them with shaders these are swapped in like the frames of an anime blink / lip flap.
  // The sprite meshes follow the same head / body deformation as the face.


  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // Mouth opening area (the region the mouth drawings were painted in): used to squash only
  // the inside of the mouth sprite, the skin at its edge stays put.
  const MOUTH_AREA = rig.mouth.area;
  // Mouth shapes. mouthForm is the vowel axis: -1 wide (i) .. 0 (a) .. +1 round (u/o);
  // mouthOpen how far it opens. Each shape names the drawing it uses, the openness that
  // drawing shows at full size, and a width factor (u is a narrowed o).
  const MOUTH_SHAPES = {
    a: { sprite: 'mouth_a', ref: 0.9, width: 1 },
    aHalf: { sprite: 'mouth_a_half', ref: 0.55, width: 1 },
    i: { sprite: 'mouth_i', ref: 0.55, width: 1 },
    e: { sprite: 'mouth_a_half', ref: 0.65, width: 1.06 },
    o: { sprite: 'mouth_o', ref: 0.75, width: 1 },
    u: { sprite: 'mouth_o', ref: 0.75, width: 0.78 },
  };
  // below this the drawn closed mouth of the original image is shown (a barely open mouth
  // drawing looked like a stuck, oddly shaped mouth)
  const MOUTH_OPEN_MIN = 0.16;

  // Vowel regions on the form axis, with a little hysteresis so the drawing does not flicker
  // when the form hovers on a boundary.
  function classifyVowel(form, prev) {
    const pad = 0.07;
    const inside = (v, lo, hi) => v >= lo - (prev ? pad : 0) && v < hi + (prev ? pad : 0);
    const regions = [['i', -9, -0.55], ['e', -0.55, -0.2], ['a', -0.2, 0.35], ['o', 0.35, 0.75], ['u', 0.75, 9]];
    const was = prev && regions.find(r => r[0] === prev || (prev === 'aHalf' && r[0] === 'a'));
    if (was && inside(form, was[1], was[2])) return was[0];
    return regions.find(r => form >= r[1] && form < r[2])[0];
  }

  // Eyes switch between drawings like anime frames: the original open eye (never with shifted
  // lids: lowering the cut-out lash left seams at the corners), the drawn half-closed eye,
  // and the drawn closed / smiling eye.
  const EYE_OPEN_MIN = 0.75, EYE_CLOSED_MAX = 0.3, EYE_FADE_SEC = 0.06;

  function eyeSprite(open, smile) {
    if (open >= EYE_OPEN_MIN) return null;
    if (open < EYE_CLOSED_MAX) return smile >= 0.5 ? 'eyes_smile' : 'eyes_closed';
    return 'eyes_half';
  }

  function mouthShape(open, form, prev = null) {
    if (open < MOUTH_OPEN_MIN) return null;
    const v = classifyVowel(form, prev);
    if (v === 'a') return open >= 0.6 ? 'a' : 'aHalf';
    return v;
  }

  function mouthLineY(x) {
    return MOUTH.cy + (x - MOUTH.cx) * Math.tan(MOUTH.angle);
  }

  function mouthCenterX() { return MOUTH_AREA.cx; }

  function mouthInner(x, y) {
    const c = Math.cos(-MOUTH_AREA.angle), s = Math.sin(-MOUTH_AREA.angle);
    const dx = x - MOUTH_AREA.cx, dy = y - MOUTH_AREA.cy;
    const u = (dx * c - dy * s) / MOUTH_AREA.rx, v = (dx * s + dy * c) / MOUTH_AREA.ry;
    return 1 - sstep(0.55, 0.95, Math.hypot(u, v));
  }

  /**
   * @param R        Renderer
   * @param sheet    parsed sprites.json ({ build, layers: { name: [x, y, w, h] } })
   * @param imgs     { name: HTMLImageElement }
   * @param buildGrid, alphaOf  helpers from the renderer / page
   */
  function createSprites(R, sheet, imgs, buildGrid, alphaOf, ordinary = []) {
    const items = {};
    /** @type {import('./special-eyes').EyeVariantAvailability} */
    const availability = { spiral: { ok: false, reason: 'missing' }, cross: { ok: false, reason: 'missing' } };
    for (const variant of ['spiral', 'cross']) {
      const names = [0, 1].map(i => `eyes_${variant}_${i}`);
      let reason;
      if (names.every(n => !sheet.layers[n])) reason = 'missing';
      else if (names.some(n => !sheet.layers[n])) reason = 'incomplete';
      else if (names.some(n => !imgs[n])) reason = 'corrupt';
      else if (names.some((n, i) => {
        const img = imgs[n], references = [...ordinary.filter(layer => layer.eye === i), ...['closed', 'half', 'smile'].flatMap(style => {
          const name = `eyes_${style}_${i}`, image = imgs[name];
          return image ? [{ rect: sheet.layers[name], width: image.width, height: image.height, alpha: alphaOf(image), sprite: true }] : [];
        })];
        return !eyeCoverage({ rect: sheet.layers[n], width: img.width, height: img.height, alpha: alphaOf(img) }, references, rig.image);
      })) reason = 'uncovered';
      availability[variant] = reason ? { ok: false, reason } : { ok: true };
    }
    // draw order matters for the cross-fades: half-closed under closed / smiling (the fade-in frame is drawn on top)
    const order = n => (n.startsWith('eyes_half') ? 0 : n.startsWith('eyes_spiral') ? 2 : n.startsWith('eyes_cross') ? 3 : n.startsWith('eyes_') ? 1 : 4);
    const entries = Object.entries(sheet.layers).sort((x, y) => order(x[0]) - order(y[0]));
    for (const [name, rect] of entries) {
      if (!imgs[name]) continue;
      if (name.startsWith('eyes_spiral') && !availability.spiral.ok || name.startsWith('eyes_cross') && !availability.cross.ok) continue;
      const mesh = buildGrid(rect, rig.mesh.spriteCell, alphaOf(imgs[name]), imgs[name].width);
      const W = [], inner = [];
      for (let k = 0; k < mesh.rest.length / 2; k++) {
        const x = mesh.rest[k * 2], y = mesh.rest[k * 2 + 1];
        W.push(baseWeights(x, y, 0));
        inner.push(name.startsWith('mouth') ? mouthInner(x, y) : 0);
      }
      const layer = R.addLayer(name, imgs[name], mesh, { color: [0.4, 1, 0.8, 0.6] });
      layer.visible = false;
      items[name] = { mesh, W, inner, layer };
    }
    const tmp = [0, 0];
    let lastShape = null;
    const eyeState = [0, 1].map(() => ({ cur: 'open', prev: 'open', t: 1 }));
    const warned = new Set();

    function place(item, P, phys, squash, width = 1) {
      const r = item.mesh.rest, o = item.mesh.pos;
      for (let k = 0; k < item.W.length; k++) {
        let x = r[k * 2];
        let y = r[k * 2 + 1];
        const w = item.inner[k];
        if (w > 0) {
          const line = mouthLineY(x);
          y = line + (y - line) * (1 + (squash - 1) * w);
          x = mouthCenterX() + (x - mouthCenterX()) * (1 + (width - 1) * w);
        }
        deformBase(x, y, item.W[k], P, phys, tmp);
        o[k * 2] = tmp[0]; o[k * 2 + 1] = tmp[1];
      }
    }

    return {
      availability,
      hasEyeSprites: [0, 1].map(i => ['closed', 'half', 'smile'].every(style => !!items[`eyes_${style}_${i}`])),
      /**
       * Show / hide and deform the sprites for this frame.
       * Returns which eyes are covered by a sprite, so the layered eye parts can be hidden.
       */
      update(P, phys, dt = 1 / 60) {
        for (const it of Object.values(items)) it.layer.visible = false;
        const covered = [false, false];
        for (const [variant, weight] of [['spiral', P.eyeSpiral], ['cross', P.eyeCross]]) {
          if (weight > 0 && !availability[variant].ok && !warned.has(variant)) { warned.add(variant); console.warn(`Special eyes ${variant} unavailable: ${availability[variant].reason}`); }
        }
        const special = specialEyeAlphas(availability.spiral.ok ? P.eyeSpiral : 0, availability.cross.ok ? P.eyeCross : 0);
        const eyes = [
          [P.eyeROpen, P.eyeSmile],
          [P.eyeLOpen, P.eyeSmileL ?? P.eyeSmile],
        ];
        // the frame is picked by openness; when it changes, the new drawing fades in over
        // EYE_FADE_SEC (a time-based cross-fade, so no double image is ever held)
        eyes.forEach(([open, smile], i) => {
          const st = eyeState[i];
          const want = eyeSprite(open, smile) ?? 'open';
          if (want !== st.cur) { st.prev = st.cur; st.cur = want; st.t = 0; }
          st.t = Math.min(1, st.t + dt / EYE_FADE_SEC);
          const k = sstep(0, 1, st.t);
          const show = (name, alpha) => {
            if (special.coverage >= 0.999) return;
            if (name === 'open' || alpha <= 0.001) return;
            const it = items[`${name}_${i}`];
            if (!it) return;
            it.layer.visible = true;
            it.layer.alpha = alpha;
            place(it, P, phys, 1);
          };
          // the outgoing frame stays fully drawn underneath while the new one fades in on top;
          // fading out to the open eye works the other way round
          // whichever frame is drawn higher up (closed/smile above half, both above the open eye)
          // does the fading, the lower one stays solid, so the eye is never see-through
          const rank = n => (n === 'open' ? -1 : n === 'eyes_half' ? 0 : 1);
          if (st.t >= 1) show(st.cur, 1);
          else if (rank(st.cur) > rank(st.prev)) { show(st.prev, 1); show(st.cur, k); }
          else { show(st.cur, 1); show(st.prev, 1 - k); }
          covered[i] = special.coverage >= 0.999 || st.cur !== 'open' && k >= 0.999;
          for (const variant of ['spiral', 'cross']) {
            const alpha = special[variant], it = items[`eyes_${variant}_${i}`];
            if (!it || alpha <= 0.001) continue;
            it.layer.visible = true; it.layer.alpha = alpha;
            place(it, P, phys, 1);
          }
        });
        const shape = mouthShape(P.mouthOpen, P.mouthForm, lastShape);
        lastShape = shape;
        const def = shape && MOUTH_SHAPES[shape];
        const mt = def && items[def.sprite];
        if (mt) {
          mt.layer.visible = true;
          // fade in right above the threshold so the closed line hands over softly
          mt.layer.alpha = sstep(MOUTH_OPEN_MIN, MOUTH_OPEN_MIN + 0.04, P.mouthOpen);
          // never squash a drawing below half its height: flatter looked like a blob
          const squash = Math.min(1.1, Math.max(0.5, P.mouthOpen / def.ref));
          place(mt, P, phys, squash, def.width);
        }
        return { eyes: covered, mouth: shape };
      },
    };
  }
  return { createSprites, mouthShape, eyeSprite };
}
import { eyeCoverage, specialEyeAlphas } from './special-eyes';
