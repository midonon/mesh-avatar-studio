import { useEffect, useState } from 'react';
import type { EyeVariantAvailability, VariantReason } from '../engine/special-eyes';
import { expressionIds, type ExpressionId } from './expressions';
import { bindingEqual, bindingFromEvent, bindingLabel, bindingRejected, bindingStorageKey, defaultBindings, keySuppressed, loadBindings, type Bindings } from './expression-hotkeys';

const labels = {
  en: { neutral: 'Neutral', smile: 'Smile', half: 'Half-closed', wink: 'Wink', surprise: 'Surprise', spiral: 'Spiral eyes', cross: 'X eyes' },
  ja: { neutral: '通常', smile: '笑顔', half: '半目', wink: 'ウインク', surprise: '驚き', spiral: 'ぐるぐる目', cross: 'バッテン目' },
  zh: { neutral: '常态', smile: '微笑', half: '半闭眼', wink: '眨眼', surprise: '惊讶', spiral: '蚊香眼', cross: '叉叉眼' },
};
const text = {
  en: { title: 'Expression', change: 'Change shortcut', clear: 'Unbind', reset: 'Reset shortcuts', capture: 'Press a key (Escape cancels).', rejected: 'This shortcut is reserved or already assigned.', focus: 'Shortcuts work while this tab has focus. Click a button here when operating OBS or a game.', storage: 'Shortcuts could not be saved. They still work for this session.', missing: 'Eye images not found', corrupt: 'Eye images could not be used', incomplete: 'Both eye images are required', uncovered: 'Eye images do not cover the original eyes' },
  ja: { title: '表情', change: 'キーを変更', clear: '割当を解除', reset: 'キーを初期化', capture: 'キーを押してください（Escapeでキャンセル）。', rejected: '予約済み、または他の表情に割り当てたキーです。', focus: 'キーはこのタブにフォーカスがある間だけ動作します。OBSやゲームを操作中は、この画面のボタンをクリックしてください。', storage: 'キーを保存できません。この操作中は使用できます。', missing: '目の画像がありません', corrupt: '目の画像を使用できません', incomplete: '両目の画像が必要です', uncovered: '目の画像が元の目を覆っていません' },
  zh: { title: '表情', change: '更改快捷键', clear: '取消绑定', reset: '重置快捷键', capture: '按下快捷键（Escape 取消）。', rejected: '此快捷键已保留或分配。', focus: '快捷键仅在此标签页获得焦点时有效。操作OBS或游戏时，请点击此窗口中的按钮。', storage: '无法保存快捷键，本次仍可使用。', missing: '未找到眼部图像', corrupt: '眼部图像无法使用', incomplete: '需要双眼图像', uncovered: '眼部图像未覆盖原有眼睛' },
};
export function ExpressionControls({ project, language, active, onSelect, availability }: {
  project: string; language: 'en' | 'ja' | 'zh'; active: ExpressionId; onSelect: (id: ExpressionId) => void; availability: EyeVariantAvailability;
}) {
  const t = text[language], names = labels[language];
  const [bindings, setBindings] = useState(() => loadBindings(project));
  const [capture, setCapture] = useState<ExpressionId | null>(null), [status, setStatus] = useState('');
  const save = (next: Bindings) => {
    setBindings(next);
    try { localStorage.setItem(bindingStorageKey(project), JSON.stringify({ version: 1, bindings: next })); }
    catch { setStatus(t.storage); }
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (capture) {
        if (event.key === 'Escape') { event.preventDefault(); setCapture(null); return; }
        if (event.repeat || event.isComposing || event.keyCode === 229 || /^(Control|Shift|Alt|Meta)(Left|Right)$/.test(event.code)) return;
        event.preventDefault();
        const candidate = bindingFromEvent(event);
        if (bindingRejected(candidate) || expressionIds.some(id => id !== capture && bindings[id] && bindingEqual(bindings[id]!, candidate))) { setStatus(t.rejected); return; }
        const next = { ...bindings, [capture]: candidate };
        setBindings(next); setCapture(null); setStatus('');
        try { localStorage.setItem(bindingStorageKey(project), JSON.stringify({ version: 1, bindings: next })); }
        catch { setStatus(t.storage); }
        return;
      }
      if (keySuppressed(event)) return;
      const pressed = bindingFromEvent(event), id = expressionIds.find(id => bindings[id] && bindingEqual(bindings[id]!, pressed));
      if (!id) return;
      event.preventDefault();
      if ((id === 'spiral' || id === 'cross') && !availability[id].ok) { setStatus(t[availability[id].reason ?? 'missing']); return; }
      setStatus(''); onSelect(id);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [bindings, capture, availability, onSelect, project, t]);
  useEffect(() => {
    if (!capture) return;
    const cancel = () => setCapture(null), timeout = setTimeout(cancel, 10000);
    window.addEventListener('blur', cancel);
    return () => { clearTimeout(timeout); window.removeEventListener('blur', cancel); };
  }, [capture]);
  return <section data-testid="expression-controls"><h2>{t.title}</h2>
    <div className="expression-list">{expressionIds.map(id => {
      const state = id === 'spiral' || id === 'cross' ? availability[id] : { ok: true };
      const reason = state.ok ? '' : t[(state.reason ?? 'missing') as VariantReason];
      return <div className="expression-row" key={id}>
        <button data-testid={`expression-${id}`} disabled={!state.ok} title={reason} aria-pressed={active === id} onClick={() => { setStatus(''); onSelect(id); }}>{names[id]}</button>
        <kbd>{bindingLabel(bindings[id])}</kbd>
        <button aria-label={`${t.change}: ${names[id]}`} onClick={() => { setCapture(id); setStatus(''); }}>{t.change}</button>
        <button aria-label={`${t.clear}: ${names[id]}`} onClick={() => save({ ...bindings, [id]: null })}>×</button>
        {reason && <small>{reason}</small>}
      </div>;
    })}</div>
    <p role="status" data-testid="expression-status">{capture ? `${names[capture]}: ${t.capture}` : status || names[active]}</p>
    <button onClick={() => { setCapture(null); save(defaultBindings()); }}>{t.reset}</button>
    <small>{t.focus}</small>
  </section>;
}
