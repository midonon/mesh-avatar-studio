# Claude Code Opus: manual expression specification and development issue

## 1. Purpose

Produce an implementable English specification and the exact development-issue title/body for user-controlled expressions during streaming in Mesh Avatar Studio. The user requests research, specification by Opus, and an issue, not implementation yet. Use only the accompanying official-source research and inspected architecture summary.

## 2. Target / ownership

Own the returned specification and issue draft only. The primary agent will review and register the issue in the user's own fork. Do not call tools, inspect local files, implement code, run tests, commit, push, or publish. Do not assume access to images or private data.

## 3. Scope / non-goals

Manual presets, buttons, editable hotkeys, neutral/reset, clear active state, parameter precedence, transition behavior, persistence, focus handling, OBS final-pose parity. Official live controller is the target; legacy vowel controller remains compatible. No facial-emotion inference, automatic expression changes, timed cycling, AI-character app, TTS, new artwork, SDK replacement, or changes to vowel DSP.

Global hotkeys are a pending preference. If no answer is appended, define focused-browser v1 honestly and a separate, optional global-input follow-up with a concrete architecture boundary; do not pretend DOM or Keyboard Lock works while another application has focus. If an answer requires global operation, design a minimal native/local bridge as a separately testable work package and account for it in issue scope. This design must not silently install/register software or intercept every keystroke. Avoid broad command execution and sending key events to other programs.

## 4. Completion criteria

Specify exact preset IDs/numeric values within existing engine ranges, exclusive selection and neutral, choose minimum useful activation semantics (latched selection is a reasonable v1), proposed fade duration, keyboard event matching/collision validation, binding capture, suppression for editing/IME/repeat, lifecycle, versioned project-local storage, reset behavior, and Japanese/English/Chinese labels.

Supply a per-parameter composition/priority table. The existing final override stage is a single replacement map. Manual expressions and natural motion must be composed into ONE map. Do not call setParameters twice or setParameterOverrides twice and assume merging. Manual eye control must coexist with blink phases; specify whether multiplication or replacement is appropriate, how deliberate eye closure stays closed, and how camera eye mode behaves. Decide how `eyeSmileL` is validated without altering unrelated keys. Speech owns the mouth, natural motion keeps breathing/sway, tracked head remains unaffected. Restore current underlying values when resetting; do not feed last final parameters back as the baseline.

Address automatic facial changes in existing idle motion: retaining breathing, random blinking, and body motion must not let the app choose a facial expression for the user. Clearly specify which idle/face inputs are preserved or masked under manual control, including neutral. Do not rely on setEmotion with its speech-related lifetime or gesture side effects.

Provide module boundaries and an implementation checklist with meaningful unit/integration/browser tests. Include camera-present/lost/off, microphone on/off, hidden-controller output, reload, switch to neutral, disconnect/reconnect, and OBS authoritative final pose. Distinguish tests that have NOT been run from existing evidence. Numerical deformation regression must remain 0px.

The issue should be self-contained: concrete user scenario, scope/non-goals, implementation tasks, acceptance criteria, dependencies and risks, relevant official-source links. No local machine paths, images, secret data, or claims of implementation completion. Link repository docs by relative paths.

## 5. Verification

Design only; do not claim commands/tests were run. The primary agent will compare assumptions against actual APIs and inspect the issue before creating it. No approval gate is needed for already-requested issue creation. Source-derived paraphrases must be brief; prefer referencing the supplied research rather than repeating competitor documentation.

## 6. Return format

Return a single JSON object with exactly three string keys: `specification`, `issue_title`, `issue_body`. Each document value contains Markdown with real newlines. Aim for an English specification around 1,500–2,000 words and an English issue around 400–700 words. No surrounding code fence. Include decisions and risks, not full implementation code.
