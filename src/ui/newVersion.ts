import { useEffect, useState } from 'react';

/** The name of the main script a page loads, for example `/assets/index-Cywl3rls.js`; null when the page has none (a development page). */
export function mainScript(html: string): string | null {
  const m = /<script[^>]*\ssrc="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/.exec(html);
  return m ? m[1] : null;
}

/** True when the page now on the server loads a different main script than the one running here. Anything unclear is "no". */
export function isNewVersion(running: string | null, onServer: string): boolean {
  const now = mainScript(onServer);
  return !!running && !!now && now !== running;
}

const running = (): string | null => {
  const s = document.querySelector('script[type="module"][src^="/assets/index-"]');
  return s ? s.getAttribute('src') : null;
};

/**
 * Tells the app when a newer build of the back office has been deployed, so a window left open for days can offer a reload.
 * Looks when the window comes back into view and every 10 minutes, and never in development.
 */
export function useNewVersion(): boolean {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const mine = running();
    if (!mine || fresh) return;
    let stop = false;
    const look = async () => {
      try {
        const r = await fetch('/index.html', { cache: 'no-store' });
        if (r.ok && !stop && isNewVersion(mine, await r.text())) setFresh(true);
      } catch { /* offline: try again later */ }
    };
    const timer = window.setInterval(() => void look(), 10 * 60 * 1000);
    const onShow = () => { if (document.visibilityState === 'visible') void look(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { stop = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', onShow); };
  }, [fresh]);
  return fresh;
}
