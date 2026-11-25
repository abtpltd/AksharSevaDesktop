import { useSyncExternalStore } from 'react';
import { connection } from './connection';
import { createLive, type LiveUi } from './live';
import { actions, getState, subscribeState } from './store';
import { hints } from './hints';
import { startStream } from './liveStream';

/** The one live link to the server. Importing this file switches it on (it does nothing until the computer is connected). */
export const live = createLive({
  connection,
  store: { get: getState, update: actions.updateWith, subscribe: subscribeState, startSession: actions.startSession, endSession: actions.endSession },
});
export const useLive = (): LiveUi => useSyncExternalStore(live.subscribe, live.get);

// instant updates: when the server says something changed, read again a moment later (several hints together cause one read)
let soon: ReturnType<typeof setTimeout> | null = null;
export const stream = () => startStream({
  connection,
  onHint: (h) => { hints.emit(h); if (soon) clearTimeout(soon); soon = setTimeout(() => { soon = null; void live.refreshNow(); }, 250); },
});

if (typeof window !== 'undefined') {
  stream();
  // coming back to the window shows what others did meanwhile
  window.addEventListener('focus', () => { void live.refreshNow(); });
  // closing the window with something not yet sent asks first
  window.addEventListener('beforeunload', (e) => { if (live.hasUnsent()) { e.preventDefault(); e.returnValue = ''; } });
}
