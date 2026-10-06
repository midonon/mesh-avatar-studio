# Research: manual expression control during streaming

Research date: 2026-10-06. Scope: deliberate hotkeys/buttons, no inferred emotion, no automatic expression switching. Sources are official documents; applications were not installed or benchmarked.

## Comparable products

| Product | Documented behavior | Applicable lesson |
| --- | --- | --- |
| VTube Studio | Expressions select parameters; keyboard or on-screen controls can toggle them. Per-parameter overwrite/add/multiply modes and a clear-all action are documented. Expression groups deactivate other members; the current documentation marks groups as public-beta only. | Give manual choices clear ownership, mutual exclusion, visible active state, and an immediate return to neutral. Prefer a small preset set over a generic expression graph. |
| Warudo | Expression hotkeys are configurable; the onboarding blueprint maps an expression and an exit-all action. Transient expressions are available separately. | Make bindings editable and provide a reset action. Timed automatic release is optional product behavior, outside the requested manual-only scope. |
| VSeeFace | Configurable expression hotkeys work while the application is in the background/minimized. Its FAQ warns about competing expression and tracking writers and recommends changing the existing model rather than repeatedly loading models. | Distinguish desktop-global shortcuts from browser-local shortcuts. Resolve tracking conflicts explicitly; switch numeric parameters without rebuilding assets. |

Primary sources:

- [VTube Studio expressions](https://github.com/DenchiSoft/VTubeStudio/wiki/Expressions-%28a.k.a.-Stickers-or-Emotes%29).
- [Warudo getting started](https://new-docs.warudo.app/docs/tutorials/getting-started) and [character expressions](https://docs.warudo.app/docs/assets/character).
- [VSeeFace official FAQ](https://www.vseeface.icu/) (expression settings, background hotkeys, tracking conflicts).

These are design precedents, not claims that this browser application has the same capabilities.

## Browser limits and keyboard handling

The [W3C UI Events specification](https://www.w3.org/TR/uievents/) targets keyboard events at the focused element. It specifies `repeat` and `isComposing`. Therefore browser DOM listeners cannot provide OS-global hotkeys while a separate game or OBS window has focus. Ignore repeated presses, IME composition, editable fields, already-handled events, and events during binding capture. Match a physical `code` plus exact modifiers; display the accepted shortcut and reject duplicate bindings. These handling choices are project recommendations.

[Chrome's Keyboard Lock documentation](https://developer.chrome.com/docs/capabilities/web-apis/keyboard-lock) limits that API to script-initiated fullscreen. It is not an OS-global shortcut bridge. Do not propose fullscreen, keyboard lock, or a synthetic key event as a global-hotkey solution. Context7 did not return suitable browser-platform documentation, so official standards/browser documents were used as fallback.

Global support needs a separately designed local desktop input source (native helper, OBS integration, or comparable bridge). No helper installation, OBS plugin, extension, startup registration, key logging, or external command execution is authorized in this research task. **Owner decision:** focused-controller shortcuts are sufficient for now; global support is excluded from the development issue.

## Current verified architecture

- The official controller is `/live.html`; `/stream.html` is its transparent OBS view. It now sends the final numeric pose continuously, including camera/microphone-off operation. The WebSocket message contains project, clamped numeric parameters, and a timestamp. OBS applies that final pose rather than interpreting expression names.
- Tracking and speech are evaluated first. The independent `setParameterOverrides()` map replaces the previous override map and is applied after those sources, before drawing and final-pose capture. Current natural motion owns eye openness, gaze, breath, and additional body angles. A second override call would erase the first: compose one final map instead.
- The legacy `/stream` controller already has five manual presets (`normal`, `smile`, `half`, `wink`, `surprise`), buttons, and focused-page digit shortcuts 1–5. Preserve that route; focus this new design on the official controller, without introducing another expression relay.
- The engine has eye smile (including asymmetric left smile), eyelid openness, brows, blush, head/body, and mouth controls. The generic `PARAMS` table lacks `eyeSmileL`, although the actual engine and live protocol support it. Any asymmetric preset must account for the validated override-key seam.
- Engine emotion APIs can trigger gestures and can time out around speech. Direct expression parameter composition is more suitable for latched manual selections. Existing idle motions may also write facial keys. The design must distinguish preserving breathing/blinking from permitting automatic expression changes.
- Existing synthetic tests cover camera, microphone, hidden-controller updates, OBS relay, and 0px deformation. User reports actual camera and OBS use works. No actual keyboard integration/global helper has been verified.

## Proposed requirements to settle in the specification

One active facial preset, neutral/reset, button parity, configurable collision-checked shortcuts, optional latch or hold semantics, clear live status, neutral after reload/project change, stored bindings rather than stored active emotion. Define interruption, release-on-blur for hold mode, rapid switching, and focus loss precisely. Select a minimal v1 rather than shipping every action mode.

Manual facial keys should outrank tracked smile/brows and generated eyelid opening only where the chosen preset owns them. Keep head/gaze/body/breath and speech mouth independent. Explain how blink closure interacts with smile, half-lidded eyes, wink, and surprise without reopening a deliberately closed eye. Releasing ownership must restore the current underlying pose, not a stale captured frame. Do not add LLM/TTS services, automatic detectors, timed expression cycling, or microphone classification changes.

## Later user addition: cartoon eye variants

The user additionally requested `spiral` and `cross` eye replacements. Local visual references show purple spiral eyes and bold dark X eyes. They were inspected locally and saved only in the ignored project folder; they were not sent to Opus or attached publicly. Surrounding sweat, stress marks, loose spirals and motion strokes are separate decorations. The new scope includes optional eye-only asset preparation/import/build, bounded final-pose selector or weights, correct suppression of original eyes/blink sprites, mesh-deformed placement, missing-asset feedback, reset, and visual tests. Mouth and body remain independent. See [the English addition brief](manual-expression-cartoon-requirements.en.md). Image generation is allowed if needed for eye artwork, but sending user images to an external service still requires explicit permission.
