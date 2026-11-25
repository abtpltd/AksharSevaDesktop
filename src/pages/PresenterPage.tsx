import { useEffect, useMemo, useState } from 'react';
import { buildPages } from '../core/pages';
import { chainTimes, clock12 } from '../core/time';
import { useAppState, useStandard } from '../data/store';
import { useScreen } from '../data/screen';
import SlidePreview from '../deck/SlidePreview';
import { go } from '../ui/router';

/**
 * Presenter view for the audio-video person (D40): the slide on the hall screen, the next one, back and next buttons,
 * the program with its times and a clock. It moves the same hall slide the phones move (the `slide` of the screen record).
 */
export default function PresenterPage({ meetingId }: { meetingId: string }) {
  const s = useAppState();
  const std = useStandard();
  const m = s.meetings.find((x) => x.id === meetingId);
  const pages = useMemo(() => (m ? buildPages(m.deck, m.donors, std) : []), [m, std]);
  const { settings: sc, change } = useScreen(meetingId);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);
  if (!m) return <div style={{ padding: 48 }}>Meeting not found. <a onClick={() => go('/')}>Back</a></div>;

  const count = m.deck.length;
  const cur = Math.min(Math.max(0, sc.slide ?? 0), Math.max(0, count - 1));
  const firstPage = (b: number) => pages.find((p) => p.blockId === m.deck[b]?.id);
  const move = (d: number) => { const n = cur + d; if (n >= 0 && n < count) void change({ slide: n }); };
  const timed = chainTimes(m.start, m.program);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const box = (b: number, w: number) => { const p = firstPage(b); return p ? <div style={{ width: w }}><SlidePreview page={p} std={std} /></div> : <div style={{ width: w, aspectRatio: '16 / 9', background: '#222', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No next slide</div>; };

  return (
    <div data-testid="presenter" style={{ position: 'fixed', inset: 0, background: '#111', color: '#eee', zIndex: 1000, padding: 24, display: 'flex', gap: 24, overflow: 'auto' }}>
      <div style={{ flex: 2, minWidth: 0 }}>
        <div style={{ marginBottom: 8, opacity: 0.7 }}>On the hall screen · slide {count ? cur + 1 : 0} of {count}</div>
        {count ? box(cur, 540) : null}
        <div style={{ margin: '16px 0 8px', opacity: 0.7 }}>Next</div>
        {box(Math.min(count - 1, cur + 1), 240)}
        <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
          <button data-testid="p-back" disabled={cur <= 0} onClick={() => move(-1)} style={{ fontSize: 22, padding: '10px 28px', color: '#111', background: '#eee', border: 0, borderRadius: 8, opacity: 1 }}>Back</button>
          <button data-testid="p-next" disabled={cur >= count - 1} onClick={() => move(1)} style={{ fontSize: 22, padding: '10px 28px', color: '#111', background: '#eee', border: 0, borderRadius: 8, opacity: 1 }}>Next</button>
          <button onClick={() => go(`/meeting/${meetingId}`)} style={{ fontSize: 16, padding: '10px 20px', marginLeft: 'auto', color: '#111', background: '#eee', border: 0, borderRadius: 8 }}>Leave</button>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 260 }}>
        <div style={{ fontSize: 40, fontWeight: 600 }}>{clock12(hhmm)}</div>
        <div style={{ opacity: 0.7, marginBottom: 12 }}>{m.date} · starts {clock12(m.start)}</div>
        {timed.map((it) => (
          <div key={it.id} style={{ padding: '6px 0', borderBottom: '1px solid #333', opacity: it.to <= hhmm ? 0.4 : 1, fontWeight: it.from <= hhmm && hhmm < it.to ? 700 : 400 }}>
            {clock12(it.from)} {it.item} <span style={{ opacity: 0.6 }}>{it.minutes} min</span>
          </div>
        ))}
      </div>
    </div>
  );
}
