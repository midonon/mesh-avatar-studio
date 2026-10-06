import type { Plugin, WebSocketClient } from 'vite';
import { LIVE_EVENT, liveMessage } from '../live/protocol';

export function liveRelay(): Plugin {
  return {
    name: 'local-live-relay',
    configureServer(server) {
      const lastSent = new WeakMap<WebSocketClient['socket'], number>();
      server.ws.on(LIVE_EVENT, (data, client) => {
        const now = performance.now();
        if (now - (lastSent.get(client.socket) ?? -Infinity) < 1000 / 60) return;
        const message = liveMessage(data);
        if (!message) return;
        lastSent.set(client.socket, now);
        server.ws.send(LIVE_EVENT, message);
      });
    },
  };
}
