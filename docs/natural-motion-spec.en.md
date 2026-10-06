# Specification: Natural Motion Controls for the Mesh Avatar Studio Live Controller (Revision 2)

**Status:** Design specification only. No code, tests, or commands have been run. This revision **supersedes** the earlier draft. In particular, it withdraws the earlier assumptions A1/A2 (multiple merging `setParameters` calls) and the composition order built on them.

**Labeling:** Values marked **(proposed)** are aesthetic tuning defaults. They are not sourced or validated human-motion constants.

**Implementation review by the primary agent (2026-10-06):** The design below is the actual Claude Code Opus response, not an implementation report. Implementation and command evidence are recorded separately in [natural-motion-verification.ja.md](natural-motion-verification.ja.md). One deliberate adjustment is continuous final-pose relay while the controller is open, including when camera/microphone are stopped and motion strengths are zero. This makes a zero-breath setting authoritative in the OBS view instead of allowing its fallback idle breathing to resume. The settings panel is placed first for convenient use without a camera. No dependency was added.

---

## 0. Verified Engine Semantics (Basis for This Revision)

These facts come from the primary agent's inspection of the actual source:

- **S1.** `setParameters(values, weight)` **replaces** the entire external parameter map and its single common weight. Calls do not merge or accumulate.
- **S2.** Each engine update runs these steps in order:
  1. Generate the automatic motion map, including the basic breathing and blink.
  2. Mix in the single external map with the single weight.
  3. Apply the existing speech/mouth ownership.
  4. Capture the final parameters.
  5. Draw.
- **S3.** The automatic idle toggles control random gestures only. Disabling them does **not** disable the basic breathing or blink generator.
- **S4.** `getParameters()` returns the final captured map.
- **S5.** Writing tracked and generated values together under weight 1 would change existing face-lost and idle head behavior. That approach is therefore rejected.

---

## 1. Decision Summary

1. **Add one small, optional engine seam: a per-key override stage.**
   - It runs after mouth handling and before final capture and draw.
   - Its default is empty, so existing callers keep numerically identical behavior.
2. **The live controller's tracking call is unchanged.** It still makes exactly one `setParameters(trackedMap, trackingWeight)` call per frame. Head, brow, smile, mouth, and face-lost/idle head behavior therefore stay exactly as they are today.
3. **The live controller sets overrides only for natural-motion-owned keys:** eye openness L/R, gaze X/Y, breath, and body angle X/Z. Head, mouth, brow, and smile keys are forbidden in this feature's overrides.
4. **Eye closure and gaze are separate settings.**
   - Eyes: `auto` (generated bilateral blink, default) or `camera` (existing behavior).
   - Gaze: `forward` (default) or `camera` (existing behavior).
   - Separating these decisions is consistent with [Warudo face tracking](https://docs.warudo.app/docs/mocap/face-tracking). Automatic blinking as a legitimate robustness choice follows [VSeeFace](https://www.vseeface.icu/).
5. **No gaze wandering in v1.** `forward` means a fixed gaze of (0, 0).
6. **Breathing and sway use different composition rules.**
   - Breath is **replaced** by the controller generator. The user's strength slider directly defines it.
   - Body sway is **additive** on top of the current-frame body result (automatic + tracking). At zero sway strength, body output is bit-identical to today.
   - Separate breathing and sway controls mirror [Warudo character](https://docs.warudo.app/docs/assets/character).
7. **One authoritative generator.** The controller engine's final captured parameters, overrides included, are both drawn locally and relayed. OBS applies them through its existing relay path. With no controller, OBS uses its existing idle policy. There is no new transport or protocol.
8. **Blinks are time-scheduled with randomized intervals, never frame-counted.** This follows [Live2D auto eye blink](https://docs.live2d.com/en/cubism-sdk-manual/autoeyeblink/).
9. **Explicit precedence with faded transitions**, rather than reliance on call order. This mirrors [VTube Studio provider priorities](https://github.com/DenchiSoft/VTubeStudio/wiki/Interaction-between-Animations,-Tracking,-Physics,-etc.).
10. **Not changed:** the microphone vowel controller and lip sync, mesh/rig deformation, sample assets, and editor previews.

---

## 2. Requirements

Shorthand used in this table:
- **Transition window:** the 0.25 s following any eye-mode or gaze-mode change.
- **Settled:** outside every transition window.

| ID | Requirement |
|---|---|
| R1 | With an empty override set, every engine output (captured parameters and drawn frame) is bit-identical to the pre-feature engine. |
| R2 | Eye mode `auto`, settled: final eye openness L and R are exactly equal and equal to the generator value. Tracked and engine-generated openness have no influence. |
| R3 | Eye mode `camera`, settled: no eye override entries exist. Eye output equals the existing behavior. |
| R4 | Every generated blink emits at least one captured frame with openness exactly 0, at any frame rate ≥ 2 fps. |
| R5 | Gaze mode `forward`, settled: final gaze is exactly (0, 0). Gaze mode `camera`, settled: no gaze override entries exist. |
| R6 | During a transition window, the affected values interpolate linearly between the old and new source, both evaluated on the current frame. Exact values (R2, R5) are required only once settled. |
| R7 | Head X/Y/Z, brow, smile, and all mouth parameters are bit-identical to the pre-feature pipeline for identical inputs, in every mode. |
| R8 | Sway strength 0 (after its slew reaches 0): no body override entries exist, and body X/Z are bit-identical to the pre-feature pipeline. |
| R9 | Breath is always replaced while the live controller is active. Breath strength 0 yields breath exactly 0. This intentional change is labeled in the UI. |
| R10 | All overridden outputs are clamped to engine ranges: body X/Z [-10, 10], breath [0, 1], eye openness [0, 1.25], gaze [-1, 1]. |
| R11 | Generated motion continues when the camera is stopped, the face is lost, only the microphone is active, or the controller page is hidden. |
| R12 | While the relay is active, after OBS's existing blend-in, OBS's applied owned keys equal the relayed values within 1e-6. |
| R13 | Settings read, parse, or write failures never break the live session. |
| R14 | The numerical mesh deformation regression remains exactly 0 px different. |
| R15 | Composition never reads `getParameters()` from a previous frame as a baseline. |

---

## 3. Engine API Addition (the Only Engine Change)

### 3.1 API

```
engine.setParameterOverrides(entries)   // replaces the whole override set (same semantics as setParameters)
engine.clearParameterOverrides()        // equivalent to setParameterOverrides({})

entries: { [parameterKey]: { mode: 'replace' | 'add', value: number, weight?: number } }
```

- The override set is **sticky** until it is replaced or cleared. The live controller replaces it every frame.
- Unknown keys, non-finite values or weights, and unknown modes are **ignored**. They do not throw.
- `weight` defaults to 1 and is clamped to [0, 1].
- The engine itself is generic. The key whitelist is enforced by the controller's composer (§5.1).

### 3.2 Pipeline (Revised Update Order)

1. Generate the automatic motion map. *(Unchanged.)*
2. Mix in the external map with its single weight. *(Unchanged.)*
3. Apply speech/mouth ownership. *(Unchanged.)*
4. **New override stage.** For each valid entry, with `base` = the current-frame value from step 3:
   - `replace`:
     - if `w ≥ 1` → `out = value` (exact; no arithmetic on `base`)
     - else if `w ≤ 0` → `out = base`
     - else → `out = base + (value − base)·w`
   - `add`: `out = base + value·w`
   - Then `out = clamp(out, rangeMin(key), rangeMax(key))`.
5. Capture the final parameters. `getParameters()` returns this map.
6. Draw from the captured map.

**Rules:**
- With an empty override set, step 4 must be a no-op. It must not clamp or touch any key (R1).
- Step 4 must sit in the **shared parameter-evaluation path** used by both the draw path and the existing update-without-draw path (hidden page). The renderer, the relay, and hidden-page updates then all see the same composed map.
- Step 4 uses the current frame's `base`, which satisfies R15. It needs no callback and no feedback.

---

## 4. Settings Schema, Defaults, Storage, Reset

### 4.1 Schema (version 1)

| Key | Type / range | Default | Japanese UI label (suggested) |
|---|---|---|---|
| `eyeMode` | `auto` \| `camera` | `auto` | 目の開閉：自動まばたき / カメラ |
| `blinkRatePerMin` | integer 6–30 | 14 **(proposed)** | まばたき頻度（回/分） |
| `gazeMode` | `forward` \| `camera` | `forward` | 視線：正面 / カメラ |
| `breathStrength` | 0–1, step 0.05 | 0.5 **(proposed)** | 呼吸の強さ（0で呼吸なし） |
| `breathRatePerMin` | integer 8–20 | 12 **(proposed)** | 呼吸の速さ（回/分） |
| `swayStrength` | 0–1, step 0.05 | 0.3 **(proposed)** | 体の揺れ（0で既存の動きのみ） |

- The blink-rate control is disabled when `eyeMode = camera`.
- Blink phase timing, double-blink probability, and sway periods are internal constants. They are not exposed in the UI.

### 4.2 Storage

- **Location:** browser local storage, under key `meshAvatarStudio.naturalMotion.v1.<projectId>`.
- **Contents:** only the fields above plus `"version": 1`.
- **Load:**
  1. Parse the stored value. If parsing fails or the version is unknown, use the full defaults.
  2. Otherwise validate each field independently:
     - wrong type or unknown enum value → that field's default;
     - non-finite number → that field's default;
     - out-of-range number → clamped;
     - integer field → rounded.
- **Save:** debounce writes by 300 ms after the last change.
- **Failure handling:** catch any storage exception and continue with in-memory settings. Show one non-blocking notice per session, for example 「設定を保存できませんでした（この画面では有効です）」. Do not retry in a loop.
- **Reset (既定に戻す):**
  1. Apply the defaults through the normal change path, so transitions and slews apply.
  2. Then persist them.
  3. If persisting fails, the defaults remain in memory. No confirmation dialog.

---

## 5. Ownership and Composition

### 5.1 Ownership and Precedence Table

`base` = current-frame value after automatic generation + tracking mix + mouth handling (§3.2, step 3).

| Parameter | Default owner | Override entry | Settled result |
|---|---|---|---|
| Head X/Y/Z | Existing auto + tracking | **Forbidden** | Unchanged (R7) |
| Mouth (all) | Existing tracked/microphone ownership | **Forbidden** | Unchanged |
| Brow, smile | Existing tracking | **Forbidden** | Unchanged |
| Eye openness L/R | `auto`: blink generator; `camera`: existing | `auto`: `replace`, value = generator, w = 1 | Generator value, with L = R |
| Gaze X/Y | `forward`: fixed; `camera`: existing | `forward`: `replace`, value 0, w = 1 | (0, 0) |
| Breath | Controller generator | `replace`, w = 1, always | `sB·curve(t)` |
| Body X/Z | Existing auto + tracking + generated sway | `add`, value = sway, only while `sS > 0` | `clamp(base + sway)` |
| Body Y (if present) | Existing | **Forbidden** | Unchanged |

**Whitelist enforcement:** the composer's output may contain **only** these keys: eye openness L/R, gaze X/Y, breath, body X/Z. A unit test asserts that no other key ever appears.

### 5.2 Per-Frame Controller Order (Pre-Advance Callback)

1. Build the tracked map from the FacePose sample **exactly as today**. Nothing is stripped.
2. Call `setParameters(trackedMap, trackingWeight)` **exactly as today**.
3. `entries = composer.update(now, settings)`.
4. `engine.setParameterOverrides(entries)`.
5. The engine advances (§3.2).
6. In the post-advance callback, relay `getParameters()` as today. The relayed map now includes the overrides.

**Additional rules:**
- On controller shutdown or unmount, call `clearParameterOverrides()`.
- In `camera` mode, tracked eye and gaze values reach the output through the unchanged external map. The composer does not need to read them.

### 5.3 Transitions and Smoothing

- **Mode switch:** the composer emits a `replace` entry whose `w` ramps linearly over 0.25 s:
  - into `auto` or `forward`: w goes 0 → 1;
  - into `camera`: w goes 1 → 0, and the entry is removed once w reaches 0.
- The **engine** performs the interpolation against the current-frame `base`, so both sources are always current.
- A switch reversed mid-transition continues from the current `w`. It does not jump.
- `sB` and `sS` slew linearly toward their settings at a maximum of 1.0 per second.
- When `sS` reaches exactly 0, the body entries are removed (R8).
- **Blink closure is never low-pass filtered.** No EMA or smoothing is applied to the generated openness.

---

## 6. Algorithms

All generators are pure state machines with an injected monotonic clock (`now`, in seconds) and an injected `rng()` returning values in [0, 1). Production uses the controller's existing clock (the worker clock when hidden) and `Math.random`. Tests use a small local seeded PRNG; no new dependency is added.

**Common time-step rules:**
- `dt = max(0, now − prev)`, so a negative step is treated as 0.
- If `dt > 1.0 s`, apply each generator's large-gap rule below.

### 6.1 Blink Generator → Closure `c`, Openness = `1 − c`

**Phases (proposed).** Each phase duration is scaled by one per-blink factor drawn uniformly from [0.85, 1.15]:

| Phase | Base duration | Closure `c` |
|---|---|---|
| Closing | 0.08 s | `smoothstep(s)` |
| Closed hold | 0.04 s | exactly 1 |
| Opening | 0.16 s | `1 − smoothstep(s)` |
| Open | until next blink | exactly 0 |

Here `smoothstep(s) = s²(3 − 2s)` and `s ∈ [0, 1]` is the normalized phase time.

**Interval scheduling:**
- `mean = 60 / blinkRatePerMin`.
- `interval = max(1.0, mean · (0.4 + 1.2·rng()))`. This is measured from the end of the previous blink's opening phase.
- The result is non-metronomic, has a 1.0 s refractory floor, and has an average near `mean`.
- The first blink after the generator starts comes after a uniform delay in [1.5, 4.0] s.

**Double blinks:**
- After a normal blink, with probability 0.05 **(proposed)**, the next blink starts after a uniform delay in [0.12, 0.25] s instead of a normal interval.
- A follow-up blink never spawns another follow-up.

**Closure guarantee (peak latch):**
- If the closed-hold window lies within `(prev, now]` and no earlier sample of this blink emitted `c = 1`, emit `c = 1` for this sample.
- On the next sample, continue normal evaluation from `now`.

**Large gap:**
- Do not replay missed blinks.
- Force the open state (`c = 0`) and schedule a fresh interval from `now`.

**Rate change:**
- An in-progress blink completes normally.
- If the pending start time is later than `now + 1.6·newMean`, reschedule it to `now + interval(newMean)`.

**Camera mode:** the generator keeps running while `eyeMode = camera`, so switching back to `auto` resumes seamlessly. Switching never forces a blink.

### 6.2 Breathing

- `period = (60 / breathRatePerMin) · (1 + j)`, where `j` is uniform in [-0.08, 0.08] and is redrawn only when `φ` wraps.
- `φ ← (φ + dt / period) mod 1`. On a large gap, wrap `φ` once without drawing intermediate jitters.
- Inhale is 40% of the cycle and exhale 60% **(proposed)**:
  - `u = φ < 0.4 ? 1.25·φ : 0.5 + (φ − 0.4)/1.2`
  - `curve = 0.5 − 0.5·cos(2πu)`
- `breath = clamp(sB·curve, 0, 1)`.
- The output is continuous across wraps and across rate changes, because only the rate of `φ` changes.

**Derived rate bound (replaces the earlier arbitrary 0.02 limit):**
- The steepest point of the curve has `|d curve/dt| ≤ π · 1.25 / Pmin`.
- `Pmin = (60/20)·0.92 = 2.76 s`, so this term is ≈ 1.423/s.
- The strength slew contributes at most 1.0/s × curve ≤ 1.0/s.
- Therefore `|Δbreath| ≤ (π·1.25/2.76 + 1.0)·dt + 1e-9 ≈ 2.43·dt` for `dt ≤ 1 s`.

### 6.3 Body Sway (Additive)

- Use four phase accumulators with periods 7.3 / 11.9 s for X and 9.1 / 13.7 s for Z **(proposed)**. Their initial phases come from `rng()`.
- The sway formulas are:
  - `swayX = 2.0·sS·(0.6·sin 2πφ1 + 0.4·sin 2πφ2)`
  - `swayZ = 1.5·sS·(0.6·sin 2πφ3 + 0.4·sin 2πφ4)`
- Bounds: `|swayX| ≤ 2.0` and `|swayZ| ≤ 1.5`.
- The engine adds sway to the current-frame body base and clamps to [-10, 10].
- **Rate bound:**
  - `|ΔswayX| ≤ (2.0·2π·(0.6/7.3 + 0.4/11.9) + 2.0)·dt + 1e-9`
  - `|ΔswayZ| ≤ (1.5·2π·(0.6/9.1 + 0.4/13.7) + 1.5)·dt + 1e-9`
- Sway never touches head angles. No gestures are added.

---

## 7. Lifecycle and Integration Behavior

| Situation | Behavior |
|---|---|
| Camera stopped | Tracking weight follows existing behavior. Overrides keep being set each frame. The relay continues under the extended condition below. |
| Face lost (camera on) | The existing tracking-weight and idle-head behavior is unchanged. `auto` and `forward` overrides are unaffected. In `camera` modes, eyes and gaze follow existing behavior, including the engine's own blink when tracking weight decays. These are still single-source, because they come from the controller engine. |
| Microphone only | Mouth follows the existing microphone path untouched. Generated motion runs. The relay is active via the existing microphone condition. |
| Settings change | Applied via transitions and slews (§5.3). Persistence is debounced. |
| Controller hidden | The existing worker clock and update-without-draw path run the same evaluation, including the override stage. A stall longer than 1 s triggers the large-gap rules. |
| OBS reconnect | Generator state is kept. OBS blends in through its existing active-update path. |
| No active controller / controller closed | The relay stops and OBS uses its existing idle policy after its existing timeout. Its own blink may differ; this is accepted and documented. The OBS view never calls `setParameterOverrides`. |

**Relay-activity condition (extended):** relay when any of the following holds:
- the camera is active;
- the microphone is active;
- natural motion is active.

"Natural motion is active" means the live controller page is running **and** at least one of the following is true:
- `eyeMode = auto`;
- `gazeMode = forward`;
- `breathStrength > 0`;
- `swayStrength > 0`.

This check reads settings only. It must never request camera or microphone permission.

**OBS consistency:** the summary indicates OBS applies full received parameters while the relay is active. Acceptance test 13 confirms R12. If it fails, the permitted fix is a minimal local change to the OBS view's application of received keys. No protocol or config synchronization may be added.

**Mouth:** the composer neither reads nor writes mouth keys. The override stage runs after mouth handling but cannot touch mouth keys, because of the whitelist. The deterministic vowel controller is not modified.

---

## 8. Module Boundaries

| Module | Responsibility |
|---|---|
| Engine override stage | §3 API and step 4 only. No changes to mesh/rig deformation functions. |
| `naturalMotionSettings` | Schema, validation, injected storage, load/save/reset, failure notice. |
| `blinkGenerator` | §6.1 (clock and rng injected). |
| `breathSwayGenerator` | §6.2–6.3 (clock and rng injected). |
| `motionComposer` | Modes, transition weights, slews, whitelist; returns override entries. |
| Live controller wiring | Override call, clear on shutdown, relay condition, UI panel. |

---

## 9. Acceptance Tests

No test has been run. These tests are requirements for the implementer.

### Unit Tests (Seeded rng, Synthetic Clock)

1. **Override stage:**
   - An empty set gives bit-identical captured maps against a recorded baseline across sampled frames (R1).
   - `replace` at w = 1 gives exactly `value`.
   - `replace` at w = 0 leaves the key untouched.
   - `add` adds the value and clamps.
   - Invalid entries are ignored without throwing.
2. **Blink determinism:** identical seed and timestamps produce identical outputs.
3. **Blink intervals:** over a seeded run of 500 blinks:
   - every normal interval lies in `[max(1.0, 0.4·mean), max(1.0, 1.6·mean)]`;
   - follow-up delays lie in [0.12, 0.25] s;
   - there are no triples.
4. **Full closure:** at 144, 60, 30, 10, 5, and 2 fps, plus ±50% dt jitter, each blink emits openness exactly 0, and openness is exactly 1 between blinks (R4).
5. **Large gap:** a 5 s step causes no replayed blink and leaves the eyes open.
6. **Breath:**
   - output is finite and within [0, 1];
   - the per-step change is within the §6.2 bound, including while rate and strength change;
   - strength 0 gives exactly 0.
7. **Sway:** finite, within ±2.0 / ±1.5, within the §6.3 rate bound; entries are removed when `sS` reaches 0.
8. **Composer:**
   - the output key set is a subset of the whitelist;
   - transition weights reach exactly 1 or exactly removal after 0.25 s;
   - a reversed switch is continuous.
9. **Settings:**
   - per-field fallback and clamping work;
   - throwing get/set leaves the session usable with one notice;
   - reset restores the defaults.

### Integration Tests (Real Engine Parameter Path, No Draw)

10. Exactly one `setParameters` call is made per frame, with the same arguments as the pre-feature controller. Head, brow, smile, and mouth captured values are bit-identical across all mode combinations and face-present/lost sequences (R7).
11. With `auto` / `forward` settled and tracked openness 0.3 and gaze (0.8, −0.6): captured L = R = generator value, and gaze is exactly (0, 0). With `camera` settled: no entries, and the output matches the pre-feature output.
12. Sway 0 settled: body X/Z are bit-identical to the pre-feature output. Sway > 0: captured body = clamp(pre-feature body + sway) for the same frame (R8, R15).
13. With the camera off and the microphone off, the relay still sends. An OBS-view stub's applied owned keys match the relayed keys within 1e-6 after blend-in (R12).
14. The hidden-page worker-clock path produces the same captured map as the draw path for identical timestamps.

### Browser Acceptance

15. Camera off: blinking, breathing, and sway are visible, and OBS matches the controller.
16. Covering and uncovering the camera produces no snap, and head behavior matches the pre-feature build.
17. Toggling every setting live produces no visible jumps, and blinks still close fully.
18. Settings persist after reload. With storage blocked, the page still works and the notice appears.
19. Closing the controller lets OBS return to idle without a stuck closed eye. Reopening it blends back to controller output.
20. **Regression:** the mesh deformation suite remains exactly 0 px different. Known unrelated Windows symlink and editor-layer failures are out of scope.

---

## 10. Implementation Sequence

1. Engine override stage and tests 1 and 14. Confirm R1 before anything else.
2. Settings module and test 9.
3. Generators and tests 2–7.
4. Composer and test 8.
5. Controller wiring (override call, shutdown clear, relay condition) and tests 10–13.
6. UI panel with Japanese labels, disabled states, and reset.
7. Browser acceptance tests and the 0 px regression.

---

## 11. Assumptions and Risks to Inspect

- **A1.** The update-without-draw path and the draw path share one parameter-evaluation function into which step 4 can be inserted. If they do not, insert the stage into both and test their equality (test 14).
- **A2.** Breath 0 is a visually neutral pose, and gaze (0, 0) looks forward on the shipped avatars. The default `breathStrength` 0.5 should be visually compared with the engine's existing breath amplitude and retuned if needed (tuning only).
- **A3.** The relay-condition check can read settings without touching capture APIs.
- **A4.** The OBS view applies received parameters at full weight after blend-in, and its own speech/mouth handling does not alter received mouth values differently from today. Verify only; do not redesign.
- **A5.** The clocks are monotonic. Negative `dt` is clamped to 0.
- **A6.** Parameter keys and ranges match the summary (eye openness 0..1.25 with normal open = 1; body X/Z ±10; breath 0..1; gaze ±1).
- **Risk:** In `camera` eye mode with the face lost, the engine's built-in blink appears. This is existing behavior and is accepted.
- **Risk:** Multiple simultaneous controllers relaying at once is unsupported.
- **Risk:** All timing and amplitude constants are unvalidated proposals. Tune them after real webcam/OBS observation without changing the structure.
