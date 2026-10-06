import { LIVE_EVENT, liveMessage } from './protocol';

export function createLiveSender(project: string) {
  let sent = -Infinity;
  return (params: Record<string, number>, now: number) => {
    if (!import.meta.hot || now - sent < 1000 / 60) return;
    const message = liveMessage({ project, params, t: now });
    if (message) { import.meta.hot.send(LIVE_EVENT, message); sent = now; }
  };
}
export function receiveLiveParameters(callback: (data: unknown) => void) {
  import.meta.hot?.on(LIVE_EVENT, callback);
  return () => import.meta.hot?.off(LIVE_EVENT, callback);
}
