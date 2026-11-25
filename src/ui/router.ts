import { useSyncExternalStore } from 'react';

const sub = (cb: () => void) => { window.addEventListener('hashchange', cb); return () => window.removeEventListener('hashchange', cb); };
export const useRoute = (): string => useSyncExternalStore(sub, () => window.location.hash.slice(1) || '/');
export const go = (path: string): void => { window.location.hash = path; };
