import { useEffect, useRef, useState } from 'react';
import type { Donor, SlideStandard } from '../core/types';

const hex = (c: string) => `#${c.replace('#', '')}`;

/** The whole donor list as one slide that scrolls by itself to the name the announcer is on (D41). The current name is large and marked. */
export default function DonorScroll({ donors, at, std, auto = 0 }: { donors: Donor[]; at: number; std: SlideStandard; auto?: number }) {
  // with no announcer, the list moves on by itself every `auto` seconds (and starts again at the top after the last name)
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!auto || donors.length < 2) return;
    const t = setInterval(() => setStep((n) => (n + 1) % donors.length), auto * 1000);
    return () => clearInterval(t);
  }, [auto, donors.length]);
  const ref = useRef<HTMLDivElement>(null);
  const now = Math.min(Math.max(0, auto ? step : at), Math.max(0, donors.length - 1));
  useEffect(() => { ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [now]);
  return (
    <div data-testid="donor-scroll" style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', background: hex(std.frameBg), fontFamily: `${std.fontFace}, Calibri, sans-serif`, color: hex(std.nameColor), containerType: 'inline-size' }}>
      <div style={{ position: 'absolute', inset: 0, overflowY: 'hidden', padding: '40cqh 6cqw' }}>
        {donors.map((d, i) => (
          <div key={d.id} ref={i === now ? ref : undefined} style={{ textAlign: 'center', padding: '0.6cqw 0', opacity: i === now ? 1 : 0.45, fontSize: i === now ? '5cqw' : '3.2cqw', fontWeight: i === now ? 700 : 400, transition: 'all 0.3s' }}>
            {d.name}{d.occasion ? <div style={{ fontSize: i === now ? '2.4cqw' : '1.8cqw', fontWeight: 400 }}>{d.occasion}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
