import type { CSSProperties, ReactNode } from 'react';
import { L, SLIDE_H, SLIDE_W } from '../core/layout';
import type { Page } from '../core/pages';
import { cardSizeFor } from '../core/posterText';
import type { SlideStandard } from '../core/types';
import CanvasView from './CanvasView';
import { safeFont } from '../core/canvas';

/** Inches to a percentage of the slide, so the preview scales to any width. */
const px = (v: number) => `${(v / SLIDE_W) * 100}%`;
const py = (v: number) => `${(v / SLIDE_H) * 100}%`;
/** Points to container-width units: a slide is 960 pt wide. */
const pt = (v: number) => `${(v / 960) * 100}cqw`;
const hex = (c: string) => `#${c.replace('#', '')}`;

const box = (x: number, y: number, w: number, h: number): CSSProperties => ({ position: 'absolute', left: px(x), top: py(y), width: px(w), height: py(h) });

export default function SlidePreview({ page, std }: { page: Page | undefined; std: SlideStandard }) {
  const font = `${safeFont(std.fontFace)}, Calibri, "Segoe UI", sans-serif`;
  const sc = std.textScale || 1; // body text only; the title and the small title keep their size
  const wrap: CSSProperties = { position: 'relative', width: '100%', aspectRatio: `${SLIDE_W} / ${SLIDE_H}`, background: std.bgImage ? `${hex(std.frameBg)} url(${std.bgImage}) center / cover no-repeat` : hex(std.frameBg), containerType: 'inline-size', fontFamily: font, overflow: 'hidden', borderRadius: 4 };
  if (!page) return <div style={wrap} />;
  if (page.kind === 'canvas' && page.bg) wrap.background = hex(page.bg);

  const frame: ReactNode = (
    <>
      {std.frameStyle !== 'none' && <div style={{ ...box(L.frameOuter.x, L.frameOuter.y, L.frameOuter.w, L.frameOuter.h), border: `${pt(3)} solid ${hex(std.frameBorder)}`, boxSizing: 'border-box' }} />}
      {std.frameStyle === 'double' && <div style={{ ...box(L.frameInner.x, L.frameInner.y, L.frameInner.w, L.frameInner.h), border: `${pt(1)} solid ${hex(std.frameBorder)}`, boxSizing: 'border-box' }} />}
    </>
  );
  const logo = std.logo
    ? <img alt="" src={std.logo} style={{ ...box(L.logo.x, L.logo.y, L.logo.w, L.logo.h), objectFit: 'contain' }} />
    : <div style={{ ...box(L.logo.x, L.logo.y, L.logo.w * 0.5, L.logo.w * 0.5), background: '#B8412C', borderRadius: '50%' }} />;

  if (page.kind === 'canvas') {
    if (page.chrome === 'none') return <div style={wrap}><CanvasView elements={page.elements} std={std} /></div>;
    if (page.chrome === 'frame') return <div style={wrap}>{frame}<CanvasView elements={page.elements} std={std} />{logo}</div>;
  }

  if (page.kind === 'opening' || page.kind === 'closing') {
    return (
      <div style={wrap}>
        {frame}
        <div style={{ ...box(0, 0, SLIDE_W, SLIDE_H), display: 'flex', alignItems: 'center', justifyContent: 'center', color: hex(std.nameColor), fontSize: pt(L.centerText.size * sc) }}>
          {page.kind === 'opening' ? std.openingText : std.closingText}
        </div>
        {logo}
      </div>
    );
  }

  const chrome = (
    <>
      {frame}
      {page.label ? <div style={{ ...box(L.label.x, L.label.y, L.label.w, L.label.h), color: hex(std.labelColor), fontWeight: 700, fontSize: pt(L.label.size), lineHeight: 1.1 }}>{page.label}</div> : null}
      <div style={{ ...box(L.title.x, L.title.y, L.title.w, L.title.h), color: hex(std.titleColor), fontSize: pt(L.title.size), textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>{std.titleText}</div>
      <div style={{ ...box(L.mark.x, L.mark.y, L.mark.d, L.mark.d), background: '#D9C27E', borderRadius: '50%' }} />
      {logo}
    </>
  );
  const body: CSSProperties = { ...box(L.body.x, L.body.y, L.body.w, L.body.h), color: hex(std.bodyColor), fontWeight: 700, overflow: 'hidden' };

  if (page.kind === 'canvas') return <div style={wrap}>{chrome}<CanvasView elements={page.elements} std={std} /></div>;
  if (page.kind === 'text') {
    return (
      <div style={wrap}>{chrome}
        <div style={body}>
          {page.heading ? <div style={{ color: hex(std.headingColor), fontSize: pt(L.heading.size * sc), marginBottom: '0.6em' }}>{page.heading}</div> : null}
          {page.lines.map((l, i) => <div key={i} style={{ fontSize: pt(L.line.size * sc), lineHeight: 1.35 }}>{l}</div>)}
        </div>
      </div>
    );
  }
  if (page.kind === 'list') {
    return (
      <div style={wrap}>{chrome}
        <div style={body}>
          {page.heading ? <div style={{ color: hex(std.headingColor), fontSize: pt(L.heading.size * sc), marginBottom: '0.4em' }}>{page.heading}</div> : null}
          {page.items.map((it) => (
            <div key={it.n} style={{ marginBottom: '0.5em' }}>
              <div style={{ color: hex(std.nameColor), fontSize: pt(L.listName.size * sc) }}>{it.n}. {it.text}</div>
              {it.sub ? <div style={{ color: hex(std.nameColor), fontSize: pt(L.listSub.size * sc), marginLeft: '1.2em', fontWeight: 400, fontStyle: 'italic' }}>{it.sub}</div> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (page.kind === 'table') {
    return (
      <div style={wrap}>{chrome}
        <div style={{ ...box(L.table.x, L.table.y, L.table.w, L.table.rowH * Math.max(1, page.rows.length)), color: hex(std.bodyColor), fontWeight: 700 }}>
          <table style={{ width: '100%', height: '100%', borderCollapse: 'collapse', fontSize: pt(L.table.size * sc), tableLayout: 'fixed' }}>
            <tbody>
              {page.rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ border: '1px solid #222', padding: '0 4%' }}>{r[0]}</td>
                  <td style={{ border: '1px solid #222', padding: '0 4%', textAlign: 'center' }}>{r[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
  return (
    <div style={wrap}>{chrome}
      <div style={{ ...box(L.poster.x, L.poster.y, L.poster.w, L.poster.h), display: 'flex', alignItems: 'center', justifyContent: 'center', background: page.image ? 'transparent' : '#E9E2D2' }}>
        {page.image ? <img alt="" src={page.image} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: pt(16) }}>Poster</span>}
      </div>
      <div style={{ ...box(L.card.x, L.card.y, L.card.w, L.card.h), background: '#F4F1EA', color: hex(std.bodyColor), padding: '1.5% 2%', boxSizing: 'border-box', fontSize: pt(cardSizeFor(page.heading, page.lines, sc)), overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {page.heading ? <div style={{ fontWeight: 700 }}>{page.heading}</div> : null}
        {page.lines.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}
