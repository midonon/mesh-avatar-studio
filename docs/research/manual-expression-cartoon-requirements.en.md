# User additions for the final specification and development issue

Supersede the previous result with complete final documents in the same JSON format. This remains a specification/issue task, no implementation.

## Confirmed input scope

The user answered that focused-controller hotkeys are sufficient for now. Remove the pending global-hotkey decision and exclude native helpers/OBS plugins/global registration from this issue. A short future-extension boundary is enough; no separate global issue is needed now.

## Required cartoon expressions

The user supplied two local visual references and requested spiral eyes and X-shaped eyes. The reference pictures were inspected locally by the primary agent and are NOT part of this prompt. No image is authorized for external upload. Describe the feature from this text summary:

- `spiral`: purple concentric spiral lines replacing both ordinary eye drawings. A dizzy/confused manga eye shape. Reference surroundings include sweat and loose swirl/motion marks; these are separate decorations, not part of the mandatory eye replacement.
- `cross`: bold dark X strokes replacing both eyes. A defeated/exhausted manga eye shape. Reference includes stress marks and an open mouth, but mandatory scope is the eye replacement; microphone/tracked mouth must keep working and not be forced open.
- Both are deliberately selected, latched, exclusive with the existing manual facial presets, and immediately resettable to normal. No periodic rotation or automatic emotion detection. Give them Japanese/English/Chinese labels and configurable shortcuts; proposed defaults Digit6 and Digit7 may be used if reserved/collision rules allow.

## Existing sprite pipeline facts

The engine sprite module reads `sprites.json` layer rectangles and named PNGs. Eye sheets currently create separate per-eye layers named `${variant}_0` and `${variant}_1`; they follow the existing mesh head/body deformation. Ordinary eye sprite choices are `eyes_half`, `eyes_closed`, and `eyes_smile`. The source's ordinary eyes are hidden only when a usable replacement covers them; crossfades already exist. The allowed variant filenames currently include only three eye variants plus four mouth variants. The Python build-sprites tool, editor import/status UI, variant prompt generation, and server validation share that finite whitelist.

Design a concrete optional extension for `eyes_spiral` and `eyes_cross`, preserving old rigs, old sprite sheets, and 0px deformation when the feature is inactive. Do not assume adding a preset parameter alone can draw these eyes. Specify new numeric parameters/ranges or another bounded selector seam, validation in the engine and final-pose live protocol, covering BOTH underlying eye parts/iris and ordinary blink sprites, alpha-transition ownership, per-eye placement, and renderer order. The authoritative controller pose must communicate the selector to OBS without image bytes. Body/head/mouth remain independent.

If assets are absent or corrupt, disable the preset and show a useful reason; keep neutral rendering intact. No silent generated approximation or runtime call to an image service. Eye sprite images and derived review files live in ignored project folders, never committed or attached to the public issue. Keep samples/reference unchanged. Include local asset creation/import/rebuild tasks and explicit visual review of normal, head turns, mouth motion and resetting.

Image generation is allowed by the user IF needed to produce eye-only artwork. A future implementation may request new text-only eye sprites or locally prepare existing artwork. Do not send user images to any external service without explicit permission; no permission to publish images is implied. Use a matching opaque skin patch or the established mask-compositing pipeline to remove the original eyes, because a transparent X/spiral overlay alone leaves the original iris visible. Sweat, stress marks, outer spirals, wrench/body pose changes, full-avatar replacement, and mandatory mouth changes are out of this issue unless separately requested.

Avoid arbitrarily mandating AI generation if a simple local procedural/vector sprite meets the visual requirement. This is an implementation choice after visual review, not permission to alter unrelated avatar layers.

## Output

Extend the corrected concrete engine/provider specification and issue with these two eye variants. Include dependencies and tests for old assets, missing new assets, local import/build, numeric relay validation, ordinary eye suppression, head-deformed placement, blink interaction while a special eye is latched, transitions and reset. Keep the issue self-contained and future-work phrasing. Return `specification`, `issue_title`, `issue_body`, with repository-relative research/spec links.
