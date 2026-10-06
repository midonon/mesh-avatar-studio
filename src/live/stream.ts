import { createAvatarView, neutralParameters } from './avatar-view';
import { viewSettings } from './settings';
import { LivePose } from './protocol';
import { receiveLiveParameters } from './relay';
import './stream.css';

const settings = viewSettings(location.search);
document.documentElement.style.background = settings.background;
const canvas = document.querySelector<HTMLCanvasElement>('#avatar')!;
const pose = new LivePose(settings.project);
const unsubscribe = receiveLiveParameters(data => pose.receive(data, performance.now()));
void createAvatarView(canvas, settings, (avatar, now, dt) => {
  const sampled = pose.sample(now, dt);
  canvas.dataset.live = sampled.active ? 'active' : 'idle';
  avatar.setAutoIdle(settings.idle && !sampled.active); avatar.setAutoMotion(settings.idle && !sampled.active);
  if (settings.idle) avatar.setParameters(sampled.params, sampled.weight);
  else {
    const params = { ...neutralParameters };
    for (const [key, value] of Object.entries(sampled.params)) params[key] = (params[key] ?? 0) * (1 - sampled.weight) + value * sampled.weight;
    avatar.setParameters(params);
  }
}).then(view => {
  const destroy = () => { unsubscribe(); view.destroy(); };
  window.addEventListener('pagehide', destroy, { once: true });
  import.meta.hot?.dispose(destroy);
}).catch(() => { unsubscribe(); canvas.dataset.state = 'error'; });
