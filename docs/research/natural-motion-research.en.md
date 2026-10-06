# Natural avatar motion: comparative research

Research date: 2026-10-06. Scope: automatic blinking, gaze ownership, breathing, small body sway, and coexistence with webcam tracking. This is a documentation/source review, not a hands-on benchmark of the products. Numerical defaults below must be treated as design proposals, not scientifically validated human-motion constants.

## Verified observations from primary sources

| Product / source | Observation | Design implication for this project |
| --- | --- | --- |
| [VTube Studio model settings](https://github.com/DenchiSoft/VTubeStudio/wiki/VTS-Model-Settings) | Automatic blinking and breathing are parameter-level options. Breathing can operate independently of an input. Parameter output mappings have explicit ownership; smoothing reduces jitter at a latency cost. | Separate generated motion from tracking input and expose strength controls. |
| [VTube Studio provider priorities](https://github.com/DenchiSoft/VTubeStudio/wiki/Interaction-between-Animations,-Tracking,-Physics,-etc.) | Tracking, idle animation, explicit animation, expressions, and physics have defined priorities. Provider changes fade rather than abruptly replace values. Additive and multiplicative expression modes are distinguished. | Specify precedence and switching behavior, rather than relying on update-call order. |
| [Warudo character controls](https://docs.warudo.app/docs/assets/character) | Breathing and swaying are separate controls. Animation layers have body masks and weights. Motion capture usually takes priority over idle layers. | Keep subtle body offsets separate from tracked head direction; avoid automatically playing unrelated gestures. |
| [Warudo face-tracking configuration](https://docs.warudo.app/docs/mocap/face-tracking) | Idle head animation can add blinking, eye movement, and subtle head motion. Look At helps maintain audience-facing gaze, while lip sync has a separate policy. | Treat gaze and eye closure as distinct decisions, rather than one “eye tracking” toggle. No product-specific numerical defaults are inferred from this page. |
| [VSeeFace official guide](https://www.vseeface.icu/) | The developer recommends automatic blinking for lower-quality tracking models and documents conflicts when animations and expression clips write to the same shape. | Automatic blinking is a legitimate aesthetic/robustness choice. Avoid simultaneous writers. Breathing behavior was not established from this guide. |
| [Live2D Cubism automatic blinking](https://docs.live2d.com/en/cubism-sdk-manual/autoeyeblink/) | Blinking is generated at randomized intervals with configurable timing. | Use elapsed-time scheduling with smooth closing/opening and controlled interval variation; do not schedule blinks by rendered frame count. |

## Proposed practices, not claims about all products

1. Offer independent eye-closure and gaze-source choices. Prefer automatic bilateral blinking and a forward gaze for this user's default; retain webcam eyes as an option.
2. Maintain tracked head direction. Add only small, slow body offsets and a breathing parameter; do not add conspicuous nods, hand taps, or random gestures under the label “breathing.”
3. Use one explicit composition stage with a documented ownership table. Do not let tracked eye openness erase the automatic blink, and do not let gaze tracking move eyes when the chosen source is forward/automatic.
4. Let generated motion continue when the camera loses the face or is stopped. Mouth behavior and microphone privacy remain unchanged.
5. Use time-based curves, clamp output to existing engine ranges, and fade mode/strength changes. Avoid stacked smoothing that prevents a blink from closing fully.
6. Store only validated per-project numerical/UI settings locally. Storage failure must leave the current session usable. Provide a reset action and clear Japanese labels.
7. The controller should produce the final pose and relay it to OBS. Two independent randomized blink generators would visibly disagree.
8. Prefer an isolated live-controller composition module over changing numerical mesh deformation or globally changing editor previews.

## Verified current integration constraints

- The data-driven WebGL engine already supports eye openness, gaze, breathing, body angles, and automatic motion. Engine-generated breathing remains present while tracking, but camera eye/body parameters override overlapping automatic values.
- The official live controller supplies a tracked parameter map with a tracking weight. It currently disables idle/automatic gestures when the face is tracked and relays the final engine parameters while camera or microphone capture is active.
- The official OBS view receives final poses, blends active updates, and returns to idle after updates stop. Hidden controller pages already use a worker clock and support updating parameters without drawing.
- A separate microphone controller provides deterministic calibrated vowel lip sync. It must not be rewritten or replaced by this feature.
- Engine ranges: head angles -30..30; body angle X -10..10; body angle Z -10..10; breath 0..1; eye openness 0..1.25; gaze X/Y -1..1. The intended normal open-eye value is 1.
- Existing regression requires numerical mesh deformation to remain exactly 0px different. Tests must verify composition without modifying the reference algorithms or sample assets.

## Unverified / exclusions

No cross-product latency or tracking-accuracy benchmark was performed. No real webcam/OBS recording is available yet. No universal “most realistic” blink interval or breathing strength is claimed. There is no proposal to install a competing application, add an AI-character application, upload images, or alter microphone vowel classification.
