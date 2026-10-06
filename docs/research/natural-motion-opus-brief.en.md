# Specification request for Claude Code Opus

## 1. Purpose

Write a concrete, implementable English specification for natural motion controls in Mesh Avatar Studio's official live-camera controller. The user prefers periodically generated blinking to webcam eye tracking and wants subtle breathing/body sway. They explicitly requested comparative research followed by specification design using Claude Code Opus. Product implementation will be handled separately by the primary agent.

## 2. Target and ownership

Own only the specification returned in your response. Do not access files or tools. The accompanying research and architecture summary are your complete inputs. Do not assume access to a particular avatar image or source tree. Do not include local machine paths or identifying user details.

## 3. Scope and non-goals

Design automatic bilateral blinking, independently selected gaze, and breathing/sway controls in the live controller. Preserve webcam head tracking, existing microphone mouth behavior, hidden-page updates, final-pose relay, and all existing avatar assets. No AI-character application, SDK replacement, OBS plugin, new dependency, voice recognition change, or global engine rewrite. Do not commit, push, install, publish, or request image/secret access.

An existing engine update returns an automatically generated pose; external parameters can then overwrite it with one common tracking weight. The live controller currently forwards head, body, eyes, gaze, mouth, brow, and smile parameters from a FacePose sample. Therefore simply keeping the automatic engine idle toggle enabled will not prevent eye openness/body angles being overwritten. You must account for separate tracking weight and generated-motion strength.

The engine offers setParameters(values, optionalWeight), getParameters(), advance()/advanceParameters(), and automatic idle/gesture toggles. The controller has a per-frame callback before engine advancement and another afterward. Final output is relayed through the existing local WebSocket transport. The OBS view also has its own automatic engine, but applies full received parameters when the relay is active. Specify how one controller-side generator remains authoritative.

## 4. Completion criteria

Provide:
- A short decision summary and an explicit per-parameter ownership/precedence table.
- User-facing controls, defaults, allowed ranges, storage behavior, and reset behavior. Distinguish proposed tuning choices from sourced facts.
- Blink timing, phases, interpolation, synchronization of both eyes, frame-rate independence, interruption/mode-switch behavior, and injectable deterministic randomness/time for testing. Avoid a fixed metronomic interval and avoid unexplained frequent double-blinks.
- Forward/automatic versus tracked gaze behavior. Keep gaze separate from eyelid closure. Decide whether minimal v1 needs automatic gaze wandering or only a fixed forward mode.
- Breathing curve and limited body-angle offsets, additive versus replacement behavior, bounds, composition order, smoothing, and zero-strength behavior.
- Concrete behavior with camera stopped, face lost, microphone-only operation, settings changes, controller hidden, reconnect, and no active controller. Account for current relay activity checks and the OBS idle fallback.
- Compatibility with existing tracked mouth/microphone mouth ownership. Do not redesign lipsync.
- Suggested module boundaries, test seams, numerical regression requirements, integration and browser acceptance tests, plus a small implementation sequence.
- Explicit risks/assumptions that the primary agent should inspect in the actual source.

Keep the implementation minimal and focused. Do not demand a new approval step. Prefer controls the user can understand to a generic configurable animation graph. Cite provided primary-source links near any product-derived claim, but do not copy or extensively restate their text.

## 5. Verification

This is a design-only task: no tests or commands should be claimed as run. The implementer must verify ownership, smooth transitions, full blink closure, output bounds, camera-off animation, consistent controller/OBS output, settings storage failure, hidden-page behavior, and unchanged 0px mesh regression. Existing unrelated Windows symlink and editor-layer tests have failures; do not require fixing unrelated features as part of this scope.

## 6. Return format

Return Markdown only: title, decision summary, requirements, settings schema/defaults, composition rules, algorithms, integration points, acceptance tests, implementation sequence, and assumptions. Clearly label the artifact “Specification” and do not return implementation code for the full feature. Small pseudocode equations are welcome when they settle ambiguity. Aim for approximately 1,500–2,500 words with enough concrete detail to implement directly.
