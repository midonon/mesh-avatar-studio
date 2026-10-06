import { createRoot } from 'react-dom/client';
const root = createRoot(document.getElementById('root')!);
if (location.pathname === '/stream' || location.pathname === '/stream/overlay') {
  void import('./stream/StreamApp').then(({ StreamApp }) => root.render(<StreamApp />));
} else {
  void import('./editor/App').then(({ App }) => root.render(<App />));
}
