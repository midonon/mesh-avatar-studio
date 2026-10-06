## Scenario

While streaming with `/live.html` (OBS view `/stream.html`), I want to set the avatar's face myself with a button or a shortcut. The options are neutral, smile, half-closed, wink, surprise, spiral eyes (dizzy) and X eyes (exhausted).

The face should stay until I change it. Blinking, breathing, sway, tracked head and lip-sync should keep working. The app must never change the expression by itself.

Design: [specification](https://github.com/midonon/mesh-avatar-studio/blob/main/docs/manual-expression-spec.en.md) · [research](https://github.com/midonon/mesh-avatar-studio/blob/main/docs/research/manual-expression-research.en.md) · [review](https://github.com/midonon/mesh-avatar-studio/blob/main/docs/manual-expression-review.ja.md)

## Current gaps

- Controller code cannot read this frame's baseline before overrides: `getParameters()` returns the last final pose.
- `setParameterOverrides` takes one replacement map, so a second call erases the first.
- The override validator lacks `eyeSmileL`.
- LiveApp enables random idle and reaction clips, which may write facial tracks.
- The eye-sprite whitelist has only half, closed and smile variants. No parameter selects a replacement eye drawing.

## Planned solution

- **Provider.** Install `setParameterOverrides(provider)` once per avatar lifetime. The provider runs once per shared parameter tick after the existing tracking setter and speech, with a frozen this-frame baseline. Its output is validated and applied as one map. Static maps behave as before. It adds no further full-pose setter calls.
- **Composer.** A pure composer merges natural motion and the manual preset. Owned eye openness is `target × f`, where `f` blends the clamped camera openness and the generated blink. A winked or closed eye stays closed, other eyes blink, and the fade lasts 180 ms. Neutral restores the live pose, never a stale frame.
- **Idle.** The official controller turns `autoIdle` and `autoMotion` off. Continuous idle, blink, breath and sway stay.
- **Special eyes.**
  - New numeric selectors `eyeSpiral` and `eyeCross` (0..1, default 0) go into the override and live-protocol validators.
  - New optional per-eye sprite variants `eyes_spiral` and `eyes_cross` follow the existing head and body deformation. Source-over alphas must produce the combined selector coverage without midpoint iris leakage; see the reviewed specification's explicit formula.
  - At full weight, the ordinary eye stack (iris and blink sprites) is skipped.
  - Head, body, brows and mouth stay independent, and the mouth is never forced open.
  - OBS receives only numbers, never image bytes.

## Scope

- Seven latched, exclusive presets. Pressing the active preset again returns to neutral.
- Buttons with a visible active state and a status line, labeled in Japanese, English and Chinese.
- Editable shortcuts matched on `code` plus exact modifiers, ignoring repeat, IME composition and editable fields. Duplicate, reserved and conflicting bindings are rejected. Defaults are Digit1 to Digit7, with Digit6 and Digit7 left unbound if they collide.
- Versioned per-project storage for bindings only. Reload and project change start at neutral.
- Shared whitelist update for the build-sprites tool, editor import and status, text-only prompt generation and server validation.
- An availability check (missing, corrupt, incomplete or not covering the eye). An unavailable special preset is disabled with a reason, and neutral rendering is untouched.
- Local artwork:
  - purple concentric spirals and bold dark X strokes, each on an opaque skin patch or the existing mask-compositing pipeline;
  - procedural or vector art is preferred, and text-only generation is allowed only if needed;
  - user images are never uploaded;
  - files are kept in git-ignored project folders, never committed or attached.

## Non-goals

- OS-global hotkeys, native helpers and OBS plugins (a possible future, separate extension).
- Emotion detection, automatic or timed changes and `setEmotion`.
- Sweat, stress marks, outer swirls, pose changes, mouth changes and full-avatar replacement.
- Text-to-speech, runtime AI services, vowel DSP changes and SDK replacement. Optional offline artwork generation is separate from runtime behavior.
- Changes to legacy `/stream`, the editor's behavior, samples or reference assets.

## Tasks

- [ ] Engine provider overload; validator entries for `eyeSmileL`, `eyeSpiral` and `eyeCross`.
- [ ] NaturalMotion `sample(ctx)` exposing `blinkOpen` and `autoEyeWeight`.
- [ ] Composer, presets, state, hotkeys, store, panel and i18n.
- [ ] LiveApp: install the provider and turn the auto toggles off.
- [ ] Shared variant whitelist across the tool, editor, prompts and server.
- [ ] Special-eye loading, availability, rendering order and suppression; protocol keys.
- [ ] Create, import and rebuild local spiral and X sprites; visual review.
- [ ] Tests.

## Acceptance criteria

- **Engine seam:**
  - the provider runs once per tick on this frame's baseline;
  - static-map output is golden-identical;
  - body offsets do not drift;
  - no additional full-pose setter calls beyond existing tracking;
  - natural override entries are resolved once against the current baseline, without adding body offsets twice;
  - the clock preserves real elapsed time rather than only clamped drawing dt.
- **Composer:**
  - the wink stays closed through a blink;
  - the eye factor is smooth at face loss;
  - spiral to cross crossfades with a weight sum near 1;
  - neutral follows a live baseline.
- **Assets:**
  - old rigs and sheets load unchanged with special presets disabled, and render pixel-identically at selector 0;
  - missing, corrupt, one-eye-only and non-covering assets give the correct reasons;
  - the build tool, import and server accept the new variants and reject unknown ones.
- **Rendering:**
  - no ordinary eye or iris pixels at full weight;
  - no iris leakage at the spiral/cross crossfade midpoint;
  - eye pixels are constant through a blink cycle while a special eye is latched;
  - placement matches the existing eye-sprite transform at extreme head angles;
  - mouth motion is unaffected;
  - transitions and reset work.
- **Protocol:**
  - the new keys are clamped, missing keys mean 0 and unknown keys are rejected;
  - the OBS final pose equals the controller's pose.
- **Integration:**
  - camera present, lost and off;
  - microphone on and off;
  - hidden controller;
  - reload and project switch;
  - WebSocket disconnect and reconnect;
  - no facial clip writes;
  - legacy `/stream` is unchanged;
  - deformation regression stays at 0 px.
- **Manual:**
  - real keys, Japanese IME and key repeat;
  - focus moved to OBS keeps the preset latched, with the notice shown;
  - visual review of neutral, head turns, mouth motion and reset.

None of these tests have been run. The existing evidence is the synthetic camera, microphone, hidden-controller, OBS relay and 0 px tests.

## Dependencies and risks

- Continuous idle may depend on `autoIdle`; the fallback is a facial-track mask.
- A skin patch may mismatch under deformation.
- A coverage check that is too strict may reject usable art.
- A stale cached `/stream.html` needs a reload.
- Legacy preset values take precedence over the proposals.
- Users may expect shortcuts to work while OBS has focus.

## References

- [W3C UI Events](https://www.w3.org/TR/uievents/)
- [Chrome Keyboard Lock](https://developer.chrome.com/docs/capabilities/web-apis/keyboard-lock) (not a global solution)
- [VTube Studio expressions](https://github.com/DenchiSoft/VTubeStudio/wiki/Expressions-%28a.k.a.-Stickers-or-Emotes%29)
- [Warudo getting started](https://new-docs.warudo.app/docs/tutorials/getting-started)
- [Warudo character](https://docs.warudo.app/docs/assets/character)
- [VSeeFace](https://www.vseeface.icu/)
