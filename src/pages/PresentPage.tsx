import { useEffect, useMemo, useRef, useState } from 'react';
import { buildPages } from '../core/pages';
import { useAppState, useStandard } from '../data/store';
import { useTicker } from '../data/ticker';
import { useCursor } from '../data/cursor';
import { tickerSeconds, useScreen } from '../data/screen';
import DonorScroll from './DonorScroll';
import SlidePreview from '../deck/SlidePreview';
import { go } from '../ui/router';

/** The hall screen (D38 to D41): the desktop shows the deck full screen; phones add the scroller messages. Arrow keys or a click move on, Esc leaves. */
export default function PresentPage({ meetingId }: { meetingId: string }) {
  const s = useAppState();
  const std = useStandard();
  const m = s.meetings.find((x) => x.id === meetingId);
  const pages = useMemo(() => (m ? buildPages(m.deck, m.donors, std) : []), [m, std]);
  const [at, setAt] = useState(0);
  const { msgs } = useTicker(meetingId);
  const cursor = useCursor(meetingId);
  const { settings: sc, change } = useScreen(meetingId);
  const last = Math.max(0, pages.length - 1);
  const back = () => go(`/meeting/${meetingId}`);
  const blockOf = (i: number) => (m && pages[i] ? m.deck.findIndex((b) => b.id === pages[i]!.blockId) : -1);
  const announced = useRef<number | null>(null);
  const byPerson = useRef(false); // only a move made here is told to the phones; just opening this page never resets them
  const moveTo = (f: (n: number) => number) => { byPerson.current = true; setAt(f); };

  // a phone (or another computer) moved the hall slide: follow it to the first page of that slide
  useEffect(() => {
    if (!m || sc.slide === null || sc.slide === announced.current) return;
    announced.current = sc.slide;
    if (sc.slide === blockOf(at)) return;
    const first = pages.findIndex((p) => m.deck.findIndex((b) => b.id === p.blockId) === sc.slide);
    if (first >= 0) setAt(first);
  }, [sc.slide, pages]); // eslint-disable-line react-hooks/exhaustive-deps
  // this screen moved to another slide: tell the phones (only when the slide, not just the page, changed)
  useEffect(() => {
    const b = blockOf(at);
    if (!byPerson.current || b < 0 || b === announced.current) return;
    announced.current = b;
    void change({ slide: b });
  }, [at, pages]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (at > last) setAt(last); }, [at, last]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); moveTo((n) => Math.min(last, n + 1)); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); moveTo((n) => Math.max(0, n - 1)); }
      else if (e.key === 'Escape') { if (document.fullscreenElement) void document.exitFullscreen(); else back(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [last]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) return <div style={{ padding: 48, color: '#fff', background: '#000', minHeight: '100vh' }}>Meeting not found. <a onClick={() => go('/')}>Back</a></div>;
  const line = sc.tickerOn ? msgs.map((x) => x.text).join('   ●   ') : '';
  const seconds = tickerSeconds(line.length, sc.tickerSpeed);

  return (
    <div data-testid="present" style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', zIndex: 1000 }}>
      <style>{`@keyframes aks-scroll { from { transform: translateX(100vw); } to { transform: translateX(-100%); } }`}</style>
      <div onClick={() => moveTo((n) => Math.min(last, n + 1))} style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <div style={{ width: 'min(100vw, calc((100vh - 64px) * 16 / 9))' }}>
          {(cursor || sc.autoDonors) && pages[at] && m.deck.find((b) => b.id === pages[at]!.blockId)?.kind === 'prasad'
            ? <DonorScroll donors={m.donors.filter((d) => d.name.trim() !== '')} at={cursor?.donor ?? 0} std={std} auto={cursor ? 0 : sc.autoSpeed} />
            : <SlidePreview page={pages[at]} std={std} />}
        </div>
      </div>
      <div style={{ height: 64, background: '#4A0A0D', color: '#EFE8D6', overflow: 'hidden', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', fontSize: 28 }}>
        {line
          ? <span key={line} style={{ display: 'inline-block', animation: `aks-scroll ${seconds}s linear infinite` }}>{line}</span>
          : <span style={{ opacity: 0.5, paddingLeft: 24, fontSize: 16 }}>{m.date} · slide {pages.length ? at + 1 : 0} of {pages.length} · Esc to leave</span>}
      </div>
    </div>
  );
}
