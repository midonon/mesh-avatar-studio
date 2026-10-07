import { expressionIds, type ExpressionId } from './expressions';

export interface Binding { code: string; ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }
export type Bindings = Record<ExpressionId, Binding | null>;
export const defaultBindings = (): Bindings => Object.fromEntries(expressionIds.map((id, i) => [id, { code: `Digit${i + 1}`, ctrl: false, alt: false, shift: false, meta: false }])) as Bindings;
export const bindingFromEvent = (event: KeyboardEvent): Binding => ({ code: event.code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey });
export const bindingEqual = (a: Binding, b: Binding) => a.code === b.code && a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift && a.meta === b.meta;
export function bindingRejected(binding: Binding): boolean {
  return !/^(Digit[0-9]|Key[A-Z]|F([1-9]|1[0-2])|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Space|Backspace|Enter|Home|End|PageUp|PageDown|Insert|Delete|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote)$/.test(binding.code) ||
    ['F5', 'F11', 'F12'].includes(binding.code) || binding.ctrl && binding.alt ||
    (binding.ctrl || binding.meta) && ['KeyW', 'KeyT', 'KeyN', 'KeyR', 'KeyL', 'KeyQ'].includes(binding.code);
}
export function keySuppressed(event: KeyboardEvent, capture = false): boolean {
  const target = event.target instanceof Element ? event.target : null;
  return event.repeat || event.isComposing || event.keyCode === 229 || event.defaultPrevented || capture ||
    !!target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || !!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]');
}
export function bindingLabel(binding: Binding | null) {
  if (!binding) return '—';
  return [...(binding.ctrl ? ['Ctrl'] : []), ...(binding.alt ? ['Alt'] : []), ...(binding.shift ? ['Shift'] : []), ...(binding.meta ? ['Meta'] : []), binding.code.replace(/^Digit|^Key/, '')].join('+');
}
export const bindingStorageKey = (project: string) => `mas.manualExpression.v1.${project}`;
export function parseBindings(value: unknown): Bindings {
  const defaults = defaultBindings();
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('bindings' in value) || !value.bindings || typeof value.bindings !== 'object') return defaults;
  const input = value.bindings as Record<string, unknown>, used: Binding[] = [];
  for (const id of expressionIds) {
    const candidate = input[id];
    if (candidate === null) defaults[id] = null;
    else if (candidate && typeof candidate === 'object') {
      const b = candidate as Binding;
      if (typeof b.code === 'string' && ['ctrl', 'alt', 'shift', 'meta'].every(k => typeof b[k as keyof Binding] === 'boolean') && !bindingRejected(b)) defaults[id] = { code: b.code, ctrl: b.ctrl, alt: b.alt, shift: b.shift, meta: b.meta };
    }
    const b = defaults[id];
    if (b && used.some(previous => bindingEqual(previous, b))) {
      const fallback = defaultBindings()[id]!;
      defaults[id] = used.some(previous => bindingEqual(previous, fallback)) ? null : fallback;
    }
    if (defaults[id]) used.push(defaults[id]!);
  }
  return defaults;
}
export function loadBindings(project: string): Bindings {
  try {
    const raw = localStorage.getItem(bindingStorageKey(project));
    if (!raw) return defaultBindings();
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || !value.bindings || typeof value.bindings !== 'object') console.warn('Invalid stored expression shortcuts; using defaults.');
    return parseBindings(value);
  }
  catch { return defaultBindings(); }
}
