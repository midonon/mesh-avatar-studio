# Manual Expression Control for the Live Controller: Specification (revision 3, final)

Status: this revision records the Opus design. A local implementation and verification now exist; see [implementation notes](manual-expressions.ja.md). The remaining sections describe the original design and its test plan, rather than claiming every checklist item was individually run.

**Primary-agent review:** Claude Code Opus authored this design. The primary agent checked it against the existing APIs and added the following binding clarifications, which informed the implementation.

- Preserve the existing one `setParameters(sampled.params, sampled.weight)` tracking call before each engine update. The provider adds no further full-pose calls. Install it once per avatar lifetime and evaluate it once per shared parameter update.
- The current NaturalMotion map contains override entries (`mode`, `value`, `weight`), not numeric values. Resolve those entries against a copy of this frame's baseline exactly once to obtain a numeric natural pose `u`. Emit validated `replace` entries for the affected final keys; do not add the same body offset again. Unowned keys remain untouched.
- `ctx.time` is monotonic seconds from the controller's injected frame clock, including hidden-page updates. Do not derive it solely from clamped rendering `dt`; long stalls must retain the existing blink-gap behavior. The provider takes the current clock snapshot captured before the shared update.
- `autoEyeWeight` changes on eye-mode switches, not on face loss. Face loss/regain uses the existing tracking-weight blend in the current baseline; preserve it rather than snapping or inventing a calibration accessor. Use `baseline.eyeLOpen` and `baseline.eyeROpen` separately wherever the equations use the shorthand `eyeXOpen`.
- The engine retains continuous head/body idle; NaturalMotion supplies the separate configurable blink, gaze, breath and additional sway. Those existing APIs already keep continuous movement with random clip toggles disabled.
- Sprite rectangles are global coordinates within the rig image. Each cropped PNG must match its rectangle size. Availability includes opaque coverage over the original eye area, not only a sufficiently large bounding rectangle. Both styles use the same per-eye coverage mask/skin patch.
- During a spiral/cross transition, simply drawing two opaque patches with alphas equal to their selector weights leaks the underlying eye (`0.5 + 0.5` gives only 0.75 total opacity with source-over). Draw spiral below cross, use cross alpha `wC`, and spiral alpha `wS / (1 - wC)` when `wC < 1` (otherwise 0), for normalized nonnegative `wS + wC <= 1`. This gives the intended weighted color and total coverage `wS + wC` on the opaque patch. At full combined coverage, suppress ordinary eye layers; add a midpoint pixel test for iris leakage. An equivalent premultiplied mixture pass is acceptable if it meets the same test.

## 1. Goal and decisions

A streamer using `/live.html` (OBS view `/stream.html`) chooses the avatar's face deliberately. The chosen expression stays until the streamer changes it. Breathing, blinking, sway, gaze, tracked head and speech mouth continue. The app never chooses an expression.

- **Presets.** There are seven presets: `neutral`, `smile`, `half`, `wink`, `surprise`, `spiral` and `cross`.
- **Selection.** Selection is exclusive and latched, and `neutral` is the default. Pressing the active preset's shortcut again selects `neutral`. There is no hold mode, timed release or cycling.
- **Input scope (confirmed).** Shortcuts work only while the controller tab has focus. On-screen buttons are the alternative. Native helpers, OBS plugins and OS-global registration are excluded (Section 13).
- **Composition.** One override provider per tick composes exactly one override map (Sections 3 and 4).
- **No automatic expressions.** `setEmotion` is not used. Random idle and reaction clips are disabled in the official controller (Section 5).
- **Special eyes.** `spiral` and `cross` are drawn by new optional per-eye sprite layers. Two new numeric selector parameters drive them, and OBS receives them in the final pose. No image bytes travel over the protocol (Sections 7 and 8).
- **Persistence.** Bindings are saved per project. The active preset is not saved.
- **Unchanged parts.** Legacy `/stream`, the editor's static-map override path and vowel DSP are unchanged. Samples and reference assets are unchanged.

## 2. Gaps identified before implementation

1. `getParameters()` returns the last final pose. There is no read of this frame's baseline after tracking and speech and before overrides.
2. `setParameterOverrides(map)` takes only a static replacement map. A second call erases the first.
3. The override validator is derived from `PARAMS`, which lacks `eyeSmileL`. The engine and protocol already support `eyeSmileL`.
4. NaturalMotion emits generated blink openness only while its auto-eye weight is positive. No blink accessor exists. No calibration accessor exists either.
5. LiveApp sets `autoIdle` and `autoMotion` to `!tracking`. Random clips may then write facial tracks.
6. The sprite variant whitelist has only `eyes_half`, `eyes_closed`, `eyes_smile` and four mouth variants. That whitelist is shared by the build-sprites tool, editor import/status UI, prompt generation and server validation. No parameter selects a non-blink eye replacement, and adding a preset value alone cannot draw a new eye.

## 3. Engine seam: override provider

`setParameterOverrides(value)` accepts:

- a map (unchanged);
- an empty map, which clears overrides (unchanged), or a new typed `null` clear alias;
- **new:** a function `provider(ctx)` that returns a map or `null`, with `ctx = {baseline, time, dt}`.

**Per tick, inside the shared update:**

1. Apply tracking.
2. Apply speech.
3. If a provider is installed:
   - snapshot the public parameter values into a frozen `baseline`;
   - call the provider once;
   - validate and clamp its result with the static-map validator.
4. Apply overrides by replacement.
5. Draw, capture the final pose and send it.

**Rules.**

- Composition never reads `getParameters()` or last final values.
- The provider never adds a full-pose setter call; the existing tracking setter is retained, and no second override map is applied.
- Map, provider and `null` replace one another.
- Re-entrant `setParameterOverrides` calls inside a provider are ignored, with one warning.
- If a provider throws, that tick applies no overrides and the baseline passes through. The error is logged once per message, and the provider stays installed.
- The provider runs in the hidden-controller loop.
- Project load and reset treat a provider like a map. LiveApp reinstalls its provider on project change and clears it with `null` on dispose.

## 4. Composer

`composeOverrides({baseline, natural, selection, now})` is pure, with no DOM access and no engine calls.

**NaturalMotion.** NaturalMotion moves into the provider as `sample(ctx)`, called once per tick. It returns `{map, blinkOpen, autoEyeWeight}`:

- `map` keeps today's gaze, breath, sway, body angles (baseline plus offset, added once) and eye openness while `autoEyeWeight > 0`.
- `blinkOpen` (0..1, where 1 is open) is always computed.

**Underlying value.** For each key, `u = natural.map[k]` if present, otherwise `baseline[k]`.

**Eye factor.**

- `c = clamp(baseline.eyeXOpen, 0, 1)`
- `f = lerp(c, blinkOpen, autoEyeWeight)`

An owned eye-openness target `T` composes as `M = T * f`. Every other owned key uses `M = T`. Consequences:

- A target of 0 (wink, smile) stays closed through blinks.
- `half` and `surprise` still blink.
- Eye-mode switches use the `autoEyeWeight` ramp; face loss/regain preserve the existing smooth tracking-weight change in the baseline.

**Fade.** The fade lasts 180 ms with smoothstep `s`. Each key stores `T0`, `W0`, `T1`, `W1` and a start time. Per frame:

- `T = lerp(T0, T1, s)`
- `W = lerp(W0, W1, s)`
- `final = lerp(u, M(T), W)`

On a switch:

- `T0` and `W0` take the current interpolated values.
- Newly owned keys start at `W0 = 0`.
- Released keys fade to `W1 = 0` and are dropped when the fade ends.

The last selection wins. Because `u` is read fresh each frame, `neutral` restores the live pose rather than a stale frame.

**Output.** The output is `natural.map` plus the owned or fading keys, clamped.

## 5. Idle and camera facial behavior

**Decision.** The official controller sets `autoIdle = false` and `autoMotion = false` in all modes, removing the only automatic facial writer.

**Kept.** The engine keeps continuous head/body idle; NaturalMotion keeps its separate breath, additional sway, blink and gaze.

**Tradeoff.** Camera-off sessions lose random clip variety.

**Fallback.** An integration test confirms that idle and blink still vary with both toggles off. If continuous idle depends on `autoIdle`, the fallback is a facial-track mask for these keys:

- eye openness and eye smile;
- brows and blush;
- mouth and vowel keys;
- `eyeSpiral` and `eyeCross`.

**Camera inputs.** Tracked brows, smile and openness stay active on keys the preset does not own. Owned keys override them. `neutral` owns nothing.

## 6. Parameters and presets

| Key | Range | Default | Validator |
| --- | --- | --- | --- |
| `eyeLOpen`, `eyeROpen` | 0..1.25 | 1 | existing |
| `eyeSmile` | 0..1 | 0 | existing |
| `eyeSmileL` | 0..1 | 0 | supplemental override entry |
| `browY`, `browAngle` | -1..1 | 0 | existing |
| `blush` | 0..1 | 0 | existing |
| `eyeSpiral` (new) | 0..1 | 0 | override and live protocol |
| `eyeCross` (new) | 0..1 | 0 | override and live protocol |

The new keys are selector weights, not sliders. Unknown keys are still rejected, and no other key's range changes.

In the table below, `–` means not owned and `*` means beyond legacy parity. Values are aesthetic proposals, and legacy values win if they differ.

| ID | eyeL/ROpen | eyeSmile | eyeSmileL | browY | blush | eyeSpiral | eyeCross |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `neutral` | – | – | – | – | – | – | – |
| `smile` | 0 / 0 | 1 | 1 | – | 0.3* | – | – |
| `half` | 0.5 / 0.5 | – | – | – | – | – | – |
| `wink` | 0 / – | – | 1* | – | – | – | – |
| `surprise` | 1.2 / 1.2 | 0 | 0 | 0.7 | 0 | – | – |
| `spiral` | – | 0 | 0 | – | – | 1 | 0 |
| `cross` | – | 0 | 0 | – | – | 0 | 1 |

**Notes on the special presets.**

- They own both selector keys, so exclusivity holds even mid-fade: the fading-out weight plus the fading-in weight is about 1.
- They own eye smile at 0 so the hidden ordinary eye does not show a smile shape during the fade.
- They leave eye openness, brows, blush, head, body and mouth to the underlying pose.
- Blink continues on the hidden ordinary eye, so `neutral` returns to the live openness.
- The mouth is never forced open.

**Labels.**

| ID | 日本語 | English | 中文 |
| --- | --- | --- | --- |
| `neutral` | 通常 | Neutral | 常态 |
| `smile` | 笑顔 | Smile | 微笑 |
| `half` | 半目 | Half-closed | 半闭眼 |
| `wink` | ウインク | Wink | 眨眼 |
| `surprise` | 驚き | Surprise | 惊讶 |
| `spiral` | ぐるぐる目 | Spiral eyes | 蚊香眼 |
| `cross` | バツ目 | X eyes | 叉叉眼 |

**UI strings.**

| Purpose | 日本語 | English | 中文 |
| --- | --- | --- | --- |
| Panel title | 表情 | Expression | 表情 |
| Shortcut column | ショートカット | Shortcut | 快捷键 |
| Change binding | 変更 | Change | 更改 |
| Reset bindings | 初期設定に戻す | Reset bindings | 恢复默认 |
| Focus notice | ショートカットはこのタブにフォーカスがある時のみ動作します。OBSやゲームの操作中は、このウィンドウのボタンをクリックしてください。 | Shortcuts work only while this tab has focus. While using OBS or a game, click a button in this window instead. | 快捷键仅在此标签页获得焦点时有效。使用 OBS 或游戏时，请点击此窗口中的按钮。 |
| Asset missing | 目の画像がありません | Eye images not found | 未找到眼部图像 |
| Asset unusable | 目の画像を使用できません | Eye images could not be used | 眼部图像无法使用 |
| Asset not covering | 目の画像が元の目を覆っていません | Eye images do not cover the original eyes | 眼部图像未覆盖原有眼睛 |

## 7. Special eye rendering

**Layers.** The new optional variants are `eyes_spiral` and `eyes_cross`. As with existing eye sheets, each produces per-eye layers `${variant}_0` and `${variant}_1`. They use the same eye-index convention and the same mesh head/body deformation as existing eye sprites. Placement comes from their `sprites.json` rectangles.

**Weights.** Each frame, the renderer reads `wS = eyeSpiral` and `wC = eyeCross`. If `wS + wC > 1`, both are normalized. Let `w = wS + wC`.

**Order per eye.**

1. Draw the ordinary eye stack unchanged: eye white, iris/pupil, highlights, lid/lash parts and the existing blink/smile sprite crossfade.
2. Draw the special layers on top with the coverage-correct source-over alphas specified in the primary-agent review above.
3. Draw brows and the rest of the existing order.

**Suppression.** The special sprites contain an opaque skin patch, so at `w = 1` they cover the ordinary eye completely. When `w >= 0.999` and the variant is usable, the renderer skips the ordinary eye stack for that eye, including iris and blink sprites. This removes edge bleed and is invisible because the patch is opaque.

**Inactive path.** When `w = 0`, no special code runs, and output must be pixel-identical to the pre-change renderer.

**Unusable variant.** If a variant is unusable on a renderer, its weight is ignored there: ordinary eyes draw and one warning is logged.

**OBS.** `/stream.html` renders from the received numeric `eyeSpiral` and `eyeCross` values with its own loaded sprites. A final-pose message that lacks these keys means 0, which keeps compatibility with older senders.

## 8. Assets, whitelist and availability

**Whitelist.** Add `eyes_spiral` and `eyes_cross` as optional eye variants in one shared definition used by:

- the Python build-sprites tool;
- editor import and status UI (shown as optional, not present);
- variant prompt generation (text-only, eye-only prompts);
- server validation.

Old sprite sheets without these layers stay valid.

**Availability.** At sprite load, the engine computes availability per variant. A variant is available only if:

- both per-eye layers exist;
- the PNGs decode;
- the rectangles are valid within the sheet;
- each rectangle contains the rest-pose bounds of that eye's ordinary parts and ordinary eye sprites.

The result is exposed as `getEyeVariantAvailability()`, which returns `{ok, reason}` with reason `missing`, `corrupt`, `incomplete` or `uncovered`.

**Unavailable variants.**

- The panel disables the button and shows the localized reason.
- A shortcut for a disabled preset only shows the reason in the status line.
- `neutral` and the other presets are unaffected.
- There is no generated fallback and no runtime image-service call.

**Creating assets locally.**

- Spiral: purple concentric spiral lines replacing each eye.
- Cross: bold dark X strokes replacing each eye.
- Each eye sits on an opaque skin patch matching the surrounding face, or uses the established mask-compositing pipeline. A transparent overlay alone is insufficient because the iris would remain visible.
- Procedural or vector drawing is preferred if it passes visual review. Text-only image generation is allowed only if needed.
- User or reference images are never sent to an external service without explicit permission.

**Out of scope for this artwork.** Sweat, stress marks, outer swirls, pose changes, mouth changes and full-avatar replacement.

**Storage of images.** Generated sprites and review renders live only in the project's git-ignored asset folders. They are never committed or attached to issues. Samples and reference assets are not modified.

## 9. Keyboard handling

**Binding format.** A binding is `{code, ctrl, alt, shift, meta}`. It matches `event.code` with exact modifier equality.

**Defaults.**

- `Digit1` to `Digit5` for `neutral` through `surprise`, matching legacy.
- `Digit6` for `spiral` and `Digit7` for `cross`. Each is left unbound if it collides with an existing `/live.html` shortcut.

**Listener.** One `window` `keydown` listener ignores an event when any of these is true:

- `repeat` is true;
- `isComposing` is true, or `keyCode` is 229;
- `defaultPrevented` is true;
- the target is an input, textarea, select or contenteditable element;
- binding capture is active;
- a modal dialog is open.

A matched event calls `preventDefault()`.

**Capture.**

1. The user clicks Change.
2. The next qualifying keydown becomes the candidate binding.
3. Escape, window blur or 10 s without input cancels capture.
4. Bare modifiers are not accepted, and capture keeps waiting.

**Rejected bindings.** Each rejection shows an inline message and keeps the previous binding:

- Tab and Escape;
- Ctrl/Meta with W, T, N, R, L or Q, and F5;
- Ctrl+Alt combinations;
- duplicates of another preset's binding;
- collisions with existing `/live.html` shortcuts.

**Other behavior.** A preset may be unbound. Reset restores the defaults. Buttons and shortcuts call the same `select(id)`. The active button has `aria-pressed=true`, and a status line shows the active label.

## 10. Lifecycle

| Event | Behavior |
| --- | --- |
| Reload or project change | Selection becomes `neutral`; bindings load; availability is recomputed; the provider is reinstalled. |
| Blur or hidden tab | The preset stays latched and output continues. Shortcuts are inactive. |
| WebSocket disconnect or reconnect | The selection is kept. The next frame sends the full final pose, including selectors. |
| Microphone on/off | No effect on presets. Speech owns the mouth. |
| Camera present/lost/off | No preset change. Only `u` and `f` change, smoothly. |
| Assets become unavailable after a rebuild | On the next load, an unavailable latched special preset becomes `neutral` with a status message. |

## 11. Storage

- Key: `localStorage` entry `mas.manualExpression.v1.<projectId>`.
- Value: `{version: 1, bindings: {id: binding or null}}`.
- The active preset is not stored.
- Every read is validated.
- If data is corrupt or the version is unknown, use defaults, log one warning and do not write until the user edits.
- If saved bindings now collide, those entries fall back to defaults.
- Stored data without `spiral` or `cross` entries takes their defaults.

## 12. Module boundaries

| Module | Responsibility |
| --- | --- |
| `expressionPresets` | Frozen table, labels, range checks |
| `expressionComposer` | Pure composition and fade |
| `expressionState` | Selection, toggle, availability gating, lifecycle |
| `expressionHotkeys` | Matcher, suppression, capture, collisions |
| `expressionStore` | Versioned per-project storage |
| `expressionPanel` | Buttons, status, binding editor, notices |
| NaturalMotion | `sample(ctx)` with `blinkOpen` and `autoEyeWeight` |
| Engine | Provider overload; validator entries for `eyeSmileL`, `eyeSpiral` and `eyeCross`; special-eye layers, suppression and availability |
| Live protocol | Accepts and clamps `eyeSpiral` and `eyeCross`; missing means 0 |
| Shared variant whitelist | Build tool, editor, prompts, server |
| LiveApp | Installs the provider; turns auto toggles off |

## 13. Future extension boundary (not in this issue)

OS-global hotkeys would need a separate user-installed local input source. Such a source would send only preset IDs, which the controller would handle like `select(id)`. Keyboard Lock, fullscreen and synthetic key events are not solutions. Nothing in this issue installs, registers or hooks anything outside the browser.

## 14. Implementation checklist

1. Engine provider overload and validator entries.
2. NaturalMotion `sample(ctx)`.
3. Composer, presets, state, hotkeys, store, panel and i18n.
4. LiveApp provider install and auto toggles off.
5. Shared whitelist update across the build tool, editor, prompts and server.
6. Special-eye layer loading, availability, rendering and suppression.
7. Live protocol keys.
8. Local asset creation, import and rebuild, kept in ignored folders.
9. Tests and visual review.

## 15. Planned tests (actual results are in the implementation notes)

**Engine seam:**

- The provider runs once per tick.
- The baseline equals this tick's tracking and speech values, not the previous final pose.
- The static-map output is golden-identical.
- Map, provider and `null` replace one another; a throwing provider leaves the baseline; re-entrant calls are ignored.
- A body offset applied over 100 frames does not drift.
- The full-pose setter is never called.
- Validator snapshot: only the three new keys are added.

**Composer:**

- Preset ranges and ownership are correct.
- The wink stays at 0 through a blink; half and surprise blink.
- `f` is smooth across an `autoEyeWeight` ramp.
- Fade endpoints and mid-fade switches behave as specified.
- Spiral to cross keeps the weight sum near 1.
- Neutral follows a changed baseline.

**Keyboard and storage:**

- Matcher, suppression, capture, collisions and the `Digit6`/`Digit7` fallback.
- Storage fallback and migration without the new IDs.

**Assets:**

- An old rig or sheet loads, its special presets are disabled with reason `missing`, and rendering at selector 0 is pixel-identical to before.
- Corrupt PNG, one missing eye layer and non-covering rectangles give the correct reasons.
- Build tool, editor import and server accept the new variants and still reject unknown ones.

**Rendering:**

- At `w = 1`, the ordinary eye stack is not drawn.
- The eye-region pixels are constant across a full blink cycle while a special eye is latched.
- Special-layer transformed corners equal the existing eye-sprite transform at extreme head angles.
- Mouth and vowel animation is unchanged while a special eye is latched.
- The 180 ms crossfade endpoints are correct.
- Reset to neutral restores the live eye.

**Protocol:**

- The new keys are clamped.
- Missing keys mean 0.
- Unknown keys are rejected.
- No image data is sent.
- The OBS final pose equals the controller's pose with a special eye active.

**Integration (synthetic):**

- Camera present, lost and off.
- Microphone on and off, with the mouth unaffected.
- Hidden-controller output.
- Reload gives neutral.
- Project switch.
- WebSocket disconnect and reconnect.
- With auto toggles off, idle and blink are present and no facial clip writes occur.
- Legacy `/stream` is unchanged.
- Deformation regression stays at 0 px.

**Manual:**

- Real keys, Japanese IME and key repeat.
- Focus moved to OBS: the preset stays latched and the notice is visible.
- Visual review of both eyes in neutral, head turns, mouth motion, transitions and reset.

**Existing evidence:** synthetic camera, microphone, hidden-controller, OBS relay and 0 px tests, plus the user's report of real camera and OBS use. Keyboard input and special eyes are unverified.

## 16. Risks

- Continuous idle may depend on `autoIdle`; the mask fallback covers this.
- Legacy values may differ from this specification.
- A skin patch may visibly mismatch under deformation or lighting, which needs visual review.
- A coverage check that is too strict may reject usable art.
- The provider adds a per-tick allocation.
- Users may expect shortcuts to work while OBS has focus.
- A stale cached `/stream.html` ignores the selectors until it is reloaded.

## 17. Links

The issue links:

- `docs/research/manual-expression-control.md`
- `docs/specs/manual-expression-control.md`
- `docs/architecture.md`

These are proposed paths. Adjust them to the committed paths before filing.
