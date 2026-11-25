import type { CSSProperties } from 'react';
import { SLIDE_H, SLIDE_W } from '../core/layout';
import type { CanvasElement, ShapeEl, SlideStandard, TextEl } from '../core/types';
import { safeFont } from '../core/canvas';

const px = (v: number) => `${(v / SLIDE_W) * 100}%`;
const py = (v: number) => `${(v / SLIDE_H) * 100}%`;
/** Points to container-width units: a slide is 960 pt wide. */
export const pt = (v: number) => `${(v / 960) * 100}cqw`;

/** Where an element sits on the slide, as percentages so it scales with the slide. */
export const boxStyle = (e: CanvasElement): CSSProperties => ({ position: 'absolute', left: px(e.x), top: py(e.y), width: px(e.w), height: py(e.h), transform: e.rot ? `rotate(${e.rot}deg)` : undefined, boxSizing: 'border-box' });

/** The look of a text box. The same function draws the preview, the editor and (through the same numbers) the PowerPoint. */
export const textStyle = (e: TextEl, std: SlideStandard): CSSProperties => ({
  ...boxStyle(e),
  fontFamily: `${safeFont(e.font || std.fontFace)}, Calibri, "Segoe UI", sans-serif`, fontSize: pt(e.size), fontWeight: e.bold ? 700 : 400, fontStyle: e.italic ? 'italic' : 'normal',
  textDecoration: e.underline ? 'underline' : 'none', color: e.color, textAlign: e.align, lineHeight: 1.2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', overflow: 'hidden',
  display: 'flex', flexDirection: 'column', justifyContent: e.valign === 'top' ? 'flex-start' : e.valign === 'middle' ? 'center' : 'flex-end',
  padding: pt(4), background: e.fill || 'transparent', border: e.border && e.borderW > 0 ? `${pt(e.borderW)} solid ${e.border}` : 'none',
});

const shapeInner = (e: ShapeEl): CSSProperties => (
  e.shape === 'line'
    ? { position: 'absolute', left: 0, right: 0, top: '50%', borderTop: `${pt(Math.max(e.lineW, 0.5))} solid ${e.line || '#000000'}` }
    : { position: 'absolute', inset: 0, background: e.fill || 'transparent', border: e.line && e.lineW > 0 ? `${pt(e.lineW)} solid ${e.line}` : 'none', borderRadius: e.shape === 'ellipse' ? '50%' : 0, boxSizing: 'border-box' }
);

/** The elements of a free slide, in stacking order. `skip` hides one (while it is being typed into). */
export default function CanvasView({ elements, std, skip }: { elements: CanvasElement[]; std: SlideStandard; skip?: string }) {
  return (
    <>
      {elements.map((e) => {
        if (e.id === skip) return null;
        if (e.type === 'text') return <div key={e.id} style={textStyle(e, std)}>{e.text}</div>;
        if (e.type === 'image') return <div key={e.id} style={boxStyle(e)}><img alt="" src={e.src} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} /></div>;
        return <div key={e.id} style={boxStyle(e)}><div style={shapeInner(e)} /></div>;
      })}
    </>
  );
}
