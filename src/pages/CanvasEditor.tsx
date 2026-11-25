import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as RKeyboardEvent, PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from 'antd';
import {
  AlignCenterOutlined, AlignLeftOutlined, AlignRightOutlined, BoldOutlined, CopyOutlined, DeleteOutlined, FontSizeOutlined, FullscreenExitOutlined, FullscreenOutlined,
  ItalicOutlined, PictureOutlined, PlusOutlined, RedoOutlined, UnderlineOutlined, UndoOutlined,
} from '@ant-design/icons';
import { FONT_CHOICES, MAX_ELEMENTS, MAX_TEXT, SIZE_CHOICES, blankCanvas, isSlidePicture, clampBox, duplicate, moveBy, newImage, newShape, newText, pageToBlock, reorder, resizeRotated, snapAngle, type Handle, type Order } from '../core/canvas';
import { uid } from '../core/defaults';
import { SLIDE_W } from '../core/layout';
import { buildPages } from '../core/pages';
import { pushHist, redoHist, replaceHist, startHist, undoHist, type Hist } from '../core/history';
import type { CanvasBlock, CanvasElement, DeckBlock, Donor, ImageEl, ShapeEl, SlideStandard, TextEl } from '../core/types';
import SlidePreview from '../deck/SlidePreview';
import { boxStyle, textStyle } from '../deck/CanvasView';
import { browserImageSize } from '../deck/exportPptx';
import { fileToDataUrl } from '../ui/image';

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_POS: Record<Handle, CSSProperties> = {
  nw: { left: 0, top: 0 }, n: { left: '50%', top: 0 }, ne: { left: '100%', top: 0 }, e: { left: '100%', top: '50%' },
  se: { left: '100%', top: '100%' }, s: { left: '50%', top: '100%' }, sw: { left: 0, top: '100%' }, w: { left: 0, top: '50%' },
};
const CURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
const normDeg = (a: number) => Math.round(((((a + 180) % 360) + 360) % 360) - 180);
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

type Drag = { mode: 'move' | 'resize' | 'rotate'; id: string; handle?: Handle; sx: number; sy: number; orig: CanvasElement; moved: boolean };

/** A small picture of a slide for the strip. Redrawn only when its own slide changes. */
const Thumb = memo(function Thumb({ page, std }: { page: ReturnType<typeof buildPages>[number]; std: SlideStandard }) { return <SlidePreview page={page} std={std} />; });

/**
 * The slide editor: every slide of the deck on the left, the slide in the middle, and what can be changed on the right.
 * Free slides are edited directly (click, drag, resize, turn, type, fonts, colours); an ordinary slide can be turned into a free one first.
 * Nothing reaches the deck until Save. `donors` is only used to draw the prasad slides.
 */
export default function CanvasEditor({ title, deck, donors, std, startAt = 0, sabhaName, onSave, onClose }: {
  title: string; deck: DeckBlock[]; donors: Donor[]; std: SlideStandard; startAt?: number; sabhaName: string;
  onSave: (deck: DeckBlock[], note: string) => void; onClose: () => void;
}) {
  const [h, setH] = useState<Hist<DeckBlock[]>>(() => startHist(deck));
  const blocks = h.present;
  const [pi, setPi] = useState(startAt);
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [live, setLiveState] = useState<CanvasElement | null>(null);
  const liveRef = useRef<CanvasElement | null>(null);
  /** The box being dragged is kept in a ref as well, so a release in the same moment as the last move still sees the final place. */
  const setLive = (v: CanvasElement | null) => { liveRef.current = v; setLiveState(v); };
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [max, setMax] = useState(false);
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const last = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const changed = h.past.length > 0;

  const pages = useMemo(() => buildPages(blocks, donors, std), [blocks, donors, std]);
  const page = pages[Math.min(pi, Math.max(0, pages.length - 1))];
  const block = page ? blocks.find((b) => b.id === page.blockId) : undefined;
  const canvas: CanvasBlock | null = block && block.kind === 'canvas' ? block : null;
  const shown = useMemo(() => (canvas && live ? { ...canvas, elements: canvas.elements.map((e) => (e.id === live.id ? live : e)) } : canvas), [canvas, live]);
  const selected = shown?.elements.find((e) => e.id === sel) ?? null;
  const shownPage = useMemo(() => (shown && page && page.kind === 'canvas' ? { ...page, elements: shown.elements } : page), [shown, page]);

  useEffect(() => { if (pi > pages.length - 1) setPi(Math.max(0, pages.length - 1)); }, [pages.length, pi]);
  useEffect(() => { if (!pending) return; const i = pages.findIndex((p) => p.blockId === pending); if (i >= 0) { setPi(i); setPending(null); } }, [pending, pages]);
  useEffect(() => { root.current?.focus(); }, []);
  // a pick that no longer exists (deleted, or another slide) is dropped
  useEffect(() => { if (sel && !canvas?.elements.some((e) => e.id === sel)) setSel(null); }, [canvas, sel]);

  const undo = () => { last.current = { key: '', at: 0 }; setH((c) => undoHist(c)); };
  const redo = () => { last.current = { key: '', at: 0 }; setH((c) => redoHist(c)); };
  /** One change to the deck. A `key` joins quick repeated changes (a colour being dragged, an arrow key held down) into one undo step. */
  const commit = useCallback((next: DeckBlock[], key?: string) => {
    const now = Date.now();
    const join = !!key && last.current.key === key && now - last.current.at < 1000;
    last.current = { key: key ?? '', at: now };
    setH((cur) => (join ? replaceHist(cur, next) : pushHist(cur, next)));
  }, []);
  const editCanvas = (fn: (b: CanvasBlock) => CanvasBlock, key?: string) => {
    if (!canvas) return;
    commit(blocks.map((b) => (b.id === canvas.id ? fn(b as CanvasBlock) : b)), key);
  };
  const patchEl = (id: string, patch: Partial<TextEl> & Partial<ShapeEl> & Partial<ImageEl>, key?: string) =>
    editCanvas((b) => ({ ...b, elements: b.elements.map((e) => (e.id === id ? clampBox({ ...e, ...patch } as CanvasElement) : e)) }), key ? `${key}:${id}` : undefined);
  const full = () => !!canvas && canvas.elements.length >= MAX_ELEMENTS;
  const addEl = (el: CanvasElement) => { if (full()) { setNote(`A slide can hold ${MAX_ELEMENTS} pieces at most.`); return; } editCanvas((b) => ({ ...b, elements: [...b.elements, el] })); setSel(el.id); if (el.type === 'text') setEditing(el.id); };
  const removeEl = (id: string) => { editCanvas((b) => ({ ...b, elements: b.elements.filter((e) => e.id !== id) })); setSel(null); setEditing(null); };

  const addSlide = () => { const b = blankCanvas(sabhaName); const i = block ? blocks.findIndex((x) => x.id === block.id) + 1 : blocks.length; commit([...blocks.slice(0, i), b, ...blocks.slice(i)]); setPending(b.id); setSel(null); };
  const copySlide = () => {
    if (!canvas) return;
    const b: CanvasBlock = { ...canvas, id: uid(), elements: canvas.elements.map((e) => ({ ...e, id: uid() })) };
    const i = blocks.findIndex((x) => x.id === canvas.id) + 1;
    commit([...blocks.slice(0, i), b, ...blocks.slice(i)]); setPending(b.id);
  };
  const deleteSlide = () => { if (!block) return; commit(blocks.filter((b) => b.id !== block.id)); setSel(null); };
  const moveSlide = (d: -1 | 1) => {
    if (!block) return;
    const i = blocks.findIndex((b) => b.id === block.id), j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const n = [...blocks]; [n[i], n[j]] = [n[j], n[i]]; commit(n); setPending(block.id);
  };
  /** An ordinary slide becomes free slides (a long list gives one for each of its slides). The wording and look are the same. */
  const convert = () => {
    if (!block || block.kind === 'canvas') return;
    const mine = pages.filter((p) => p.blockId === block.id).map((p) => pageToBlock(p, std));
    const i = blocks.findIndex((b) => b.id === block.id);
    commit([...blocks.slice(0, i), ...mine, ...blocks.slice(i + 1)]); setPending(mine[0]?.id ?? null); setSel(null);
  };

  const addPicture = async (file: File | undefined) => {
    if (!file || !canvas) return;
    try {
      const src = await fileToDataUrl(file);
      if (!isSlidePicture(src)) { setNote('Use a PNG, JPEG, GIF or WebP picture.'); return; }
      addEl(newImage(src, await browserImageSize(src)));
    }
    catch (e) { setNote(e instanceof Error ? e.message : 'The picture could not be added'); }
  };

  /** Ends typing in a text box: the typed text is kept unless the person pressed Escape. Used by every way out of a text box, so no way loses the typing. */
  const finishEdit = (keep: boolean) => {
    const id = editing, ta = taRef.current;
    if (!id) return;
    taRef.current = null;
    setEditing(null);
    setTimeout(() => { if (!root.current?.contains(document.activeElement) || document.activeElement === document.body) root.current?.focus(); }, 0);
    if (keep && ta) { const cur = canvas?.elements.find((x) => x.id === id); if (cur && cur.type === 'text' && ta.value !== cur.text) patchEl(id, { text: ta.value.slice(0, MAX_TEXT) }); }
  };

  // ---- pointer: move, resize, turn ----
  const ppi = () => (stage.current?.getBoundingClientRect().width ?? 1) / SLIDE_W;
  const down = (e: RPointerEvent, el: CanvasElement, mode: Drag['mode'], handle?: Handle) => {
    if (editing === el.id) return;
    if (editing) finishEdit(true);
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSel(el.id);
    drag.current = { mode, id: el.id, handle, sx: e.clientX, sy: e.clientY, orig: el, moved: false };
  };
  const moveTo = (e: RPointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.sx) / ppi(), dy = (e.clientY - d.sy) / ppi();
    if (!d.moved && Math.hypot(dx, dy) < 0.03) return;
    d.moved = true;
    if (d.mode === 'move') setLive(moveBy(d.orig, dx, dy));
    else if (d.mode === 'resize') setLive(resizeRotated(d.orig, d.handle!, dx, dy, e.shiftKey || d.orig.type === 'image'));
    else {
      const r = stage.current!.getBoundingClientRect();
      const cx = r.left + (d.orig.x + d.orig.w / 2) * ppi(), cy = r.top + (d.orig.y + d.orig.h / 2) * ppi();
      setLive({ ...d.orig, rot: normDeg(snapAngle((Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90)) });
    }
  };
  const up = () => {
    const d = drag.current; drag.current = null;
    const fin = liveRef.current;
    if (d?.moved && fin) { setLive(null); editCanvas((b) => ({ ...b, elements: b.elements.map((x) => (x.id === fin.id ? fin : x)) })); }
    else setLive(null);
  };

  // ---- keys ----
  const onKey = (e: RKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (editing) finishEdit(false); else if (sel) setSel(null); else if (max) setMax(false); else if (changed) setAsking(true); else onClose();
      return;
    }
    if (isTyping(e.target)) return;
    const onButton = e.target instanceof HTMLElement && (e.target.tagName === 'BUTTON' || e.target.closest('button') !== null);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (!selected) return;
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (full()) { setNote(`A slide can hold ${MAX_ELEMENTS} pieces at most.`); return; } const c = duplicate(selected); editCanvas((b) => ({ ...b, elements: [...b.elements, c] })); setSel(c.id); return; }
    if (onButton && (e.key === 'Enter' || e.key === ' ' || e.key === 'Delete' || e.key === 'Backspace')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeEl(selected.id); return; }
    if (e.key === 'Enter' && selected.type === 'text') { e.preventDefault(); setEditing(selected.id); return; }
    const step = e.shiftKey ? 0.25 : 0.05;
    const dir: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (dir[e.key]) { e.preventDefault(); const m = moveBy(selected, dir[e.key][0], dir[e.key][1]); patchEl(selected.id, { x: m.x, y: m.y }, 'nudge'); }
  };

  const fonts = useMemo(() => { const f = new Set([...FONT_CHOICES, std.fontFace]); if (selected?.type === 'text' && selected.font) f.add(selected.font); return [...f]; }, [std.fontFace, selected]);
  const groupSize = block ? pages.filter((p) => p.blockId === block.id).length : 1;
  const group = groupSize > 1; // a list or sponsors slide that runs over several slides is one unit here
  const save = () => onSave(blocks, 'Edited slides in the slide editor');

  const num = (label: string, value: number, on: (v: number) => void, o: { min?: number; max?: number; step?: number } = {}) => (
    <label className="ce-field"><span>{label}</span><input type="number" value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0} min={o.min} max={o.max} step={o.step ?? 0.1} onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) on(v); }} /></label>
  );
  const colourField = (label: string, value: string, on: (v: string) => void, optional: boolean) => (
    <label className="ce-field"><span>{label}</span>
      <span className="ce-inline">
        {optional && <input type="checkbox" checked={value !== ''} onChange={(e) => on(e.target.checked ? '#D9C27E' : '')} aria-label={`Use ${label.toLowerCase()}`} />}
        <input type="color" disabled={optional && value === ''} value={value || '#ffffff'} onChange={(e) => on(e.target.value.toUpperCase())} aria-label={label} />
      </span>
    </label>
  );

  const geometry = selected && (
    <div className="ce-grid">
      {num('X', selected.x, (v) => patchEl(selected.id, { x: v }, 'geo'))}{num('Y', selected.y, (v) => patchEl(selected.id, { y: v }, 'geo'))}
      {num('Width', selected.w, (v) => patchEl(selected.id, { w: v }, 'geo'))}{num('Height', selected.h, (v) => patchEl(selected.id, { h: v }, 'geo'))}
      {num('Turn', selected.rot, (v) => patchEl(selected.id, { rot: normDeg(v) }, 'geo'), { step: 5, min: -180, max: 180 })}
    </div>
  );
  const order = (how: Order, label: string) => <Button size="small" onClick={() => selected && editCanvas((b) => ({ ...b, elements: reorder(b.elements, selected.id, how) }))}>{label}</Button>;

  const body = (
    <div ref={root} className={`ce-root${max ? ' max' : ''}`} tabIndex={-1} onKeyDown={onKey} role="dialog" aria-label="Slide editor">
      <div className="ce-bar" onDoubleClick={(e) => { if (e.target === e.currentTarget) setMax(!max); }}>
        <b className="ce-title">{title}</b>
        <Button icon={<UndoOutlined />} disabled={!h.past.length} onClick={undo} aria-label="Undo" title="Undo (Ctrl+Z)" />
        <Button icon={<RedoOutlined />} disabled={!h.future.length} onClick={redo} aria-label="Redo" title="Redo (Ctrl+Y)" />
        <span className="ce-sep" />
        <Button icon={<FontSizeOutlined />} disabled={!canvas} onClick={() => addEl(newText())}>Text</Button>
        <label className={`ant-btn ant-btn-default ce-file${canvas ? '' : ' off'}`}><PictureOutlined /> Picture<input type="file" accept="image/*" disabled={!canvas} onChange={(e) => { void addPicture(e.target.files?.[0]); e.target.value = ''; }} /></label>
        <Button disabled={!canvas} onClick={() => addEl(newShape('rect'))}>Box</Button>
        <Button disabled={!canvas} onClick={() => addEl(newShape('ellipse'))}>Circle</Button>
        <Button disabled={!canvas} onClick={() => addEl(newShape('line'))}>Line</Button>
        <span style={{ flex: 1 }} />
        {note && <span className="ce-note">{note}</span>}
        <Button icon={max ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={() => setMax(!max)} title={max ? 'Make smaller (Esc)' : 'Fill the whole window'}>{max ? 'Smaller' : 'Maximize'}</Button>
        <Button type="primary" onClick={save} disabled={!changed}>Save</Button>
        <Button onClick={() => (changed ? setAsking(true) : onClose())}>Close</Button>
      </div>
      {asking && (
        <div className="ce-ask" role="alert">
          You have changes that are not saved.
          <Button size="small" type="primary" onClick={save}>Save and close</Button>
          <Button size="small" danger onClick={onClose}>Close without saving</Button>
          <Button size="small" onClick={() => setAsking(false)}>Keep editing</Button>
        </div>
      )}
      <div className="ce-body">
        <aside className="ce-strip" aria-label="Slides">
          {pages.map((p, i) => (
            <button key={`${p.blockId}-${i}`} className={`ce-thumb${i === pi ? ' on' : ''}`} onClick={() => { finishEdit(true); setPi(i); setSel(null); }} aria-label={`Slide ${i + 1}`}>
              <span className="ce-num">{i + 1}</span>
              <Thumb page={p} std={std} />
            </button>
          ))}
          <div className="ce-strip-actions">
            <Button size="small" icon={<PlusOutlined />} onClick={addSlide}>New slide</Button>
            <Button size="small" icon={<CopyOutlined />} onClick={copySlide} disabled={!canvas}>Copy slide</Button>
            <Button size="small" onClick={() => moveSlide(-1)} disabled={!block}>{group ? 'Move group up' : 'Move up'}</Button>
            <Button size="small" onClick={() => moveSlide(1)} disabled={!block}>{group ? 'Move group down' : 'Move down'}</Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={deleteSlide} disabled={!block}>{group ? `Delete these ${groupSize} slides` : 'Delete slide'}</Button>
          </div>
        </aside>

        <main className="ce-main" onPointerDown={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
          {!page ? <p className="muted">There are no slides. Use “New slide”.</p> : (
            <div className="ce-stage" ref={stage}>
              <SlidePreview page={shownPage} std={std} />
              {canvas && (
                <div className="ce-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) { finishEdit(true); setSel(null); } }}>
                  {(shown as CanvasBlock).elements.map((el) => (
                    <div key={el.id} className={`ce-box${el.id === sel ? ' sel' : ''}`} style={{ ...boxStyle(el), cursor: editing === el.id ? 'text' : 'move' }}
                      onPointerDown={(e) => down(e, el, 'move')} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={up}
                      onDoubleClick={() => { if (el.type === 'text') { setSel(el.id); setEditing(el.id); } }}>
                      {editing === el.id && el.type === 'text' && (
                        <textarea
                          className="ce-edit" autoFocus defaultValue={el.text} aria-label="Slide text" maxLength={MAX_TEXT} ref={(n) => { taRef.current = n; }}
                          style={{ ...textStyle(el, std), position: 'absolute', inset: 0, width: '100%', height: '100%', left: 0, top: 0, transform: 'none', resize: 'none', outline: 'none', display: 'block', background: el.fill || 'rgba(255,255,255,0.9)' }}
                          onFocus={(e) => e.currentTarget.select()}
                          onBlur={() => finishEdit(true)}
                          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); finishEdit(false); } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { finishEdit(true); } }}
                          onPointerDown={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>
                  ))}
                  {selected && editing !== selected.id && (
                    // the frame, the squares and the turn handle are drawn above every piece, so they can always be reached
                    <div className="ce-selframe" style={boxStyle(selected)}>
                      {HANDLES.filter((hd) => !(selected.type === 'shape' && selected.shape === 'line' && (hd.includes('n') || hd.includes('s')))).map((hd) => (
                        <span key={hd} className="ce-handle" style={{ ...HANDLE_POS[hd], cursor: CURSOR[hd] }} onPointerDown={(e) => down(e, selected, 'resize', hd)} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={up} aria-label={`Resize ${hd}`} />
                      ))}
                      <span className="ce-rotate" onPointerDown={(e) => down(e, selected, 'rotate')} onPointerMove={moveTo} onPointerUp={up} onPointerCancel={up} aria-label="Turn" title="Drag to turn" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {page && !canvas && (
            <div className="ce-convert">
              This slide is made by the app from its text, so its places are fixed.
              <Button type="primary" onClick={convert}>Edit this slide freely</Button>
              <span className="muted">It keeps its words and look; afterwards every piece can be moved, resized and restyled.</span>
            </div>
          )}
          <p className="muted ce-hint">Click a piece to pick it. Drag to move, use the squares to resize, the round handle to turn. Double-click a text to type. Arrow keys nudge, Delete removes, Ctrl+Z undoes.</p>
        </main>

        <aside className="ce-props" aria-label="Properties">
          {!canvas && <p className="muted">Pick a free slide, or turn this one into a free slide, to change it.</p>}
          {canvas && !selected && (
            <>
              <h4>This slide</h4>
              <label className="ce-field wide"><span>Small title</span><input type="text" value={canvas.label} maxLength={200} onChange={(e) => editCanvas((b) => ({ ...b, label: e.target.value }), `label:${canvas.id}`)} /></label>
              <label className="ce-field wide"><span>Frame and titles</span>
                <select value={canvas.chrome} onChange={(e) => editCanvas((b) => ({ ...b, chrome: e.target.value as CanvasBlock['chrome'] }))}>
                  <option value="full">Frame, titles and logo (as the standard)</option><option value="frame">Frame and logo only</option><option value="none">Nothing, just the background</option>
                </select></label>
              {colourField('Own background', canvas.bg, (v) => editCanvas((b) => ({ ...b, bg: v }), `bg:${canvas.id}`), true)}
              <p className="muted">Without its own background the slide follows the slide standard.</p>
            </>
          )}
          {selected && (
            <>
              <h4>{selected.type === 'text' ? 'Text' : selected.type === 'image' ? 'Picture' : selected.shape === 'line' ? 'Line' : selected.shape === 'ellipse' ? 'Circle' : 'Box'}</h4>
              {selected.type === 'text' && (
                <>
                  <label className="ce-field wide"><span>Font</span>
                    <select value={selected.font} onChange={(e) => patchEl(selected.id, { font: e.target.value })} style={{ fontFamily: selected.font || std.fontFace }}>
                      <option value="">Slide standard ({std.fontFace})</option>
                      {fonts.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                    </select></label>
                  <div className="ce-row">
                    <label className="ce-field"><span>Size</span>
                      <input type="number" min={4} max={400} list="ce-sizes" value={selected.size} onChange={(e) => { const v = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(v)) patchEl(selected.id, { size: Math.min(400, Math.max(4, v)) }, 'size'); }} />
                      <datalist id="ce-sizes">{SIZE_CHOICES.map((s) => <option key={s} value={s} />)}</datalist></label>
                    {colourField('Colour', selected.color, (v) => patchEl(selected.id, { color: v }, 'color'), false)}
                  </div>
                  <div className="ce-row">
                    <Button icon={<BoldOutlined />} type={selected.bold ? 'primary' : 'default'} onClick={() => patchEl(selected.id, { bold: !selected.bold })} aria-label="Bold" aria-pressed={selected.bold} />
                    <Button icon={<ItalicOutlined />} type={selected.italic ? 'primary' : 'default'} onClick={() => patchEl(selected.id, { italic: !selected.italic })} aria-label="Italic" aria-pressed={selected.italic} />
                    <Button icon={<UnderlineOutlined />} type={selected.underline ? 'primary' : 'default'} onClick={() => patchEl(selected.id, { underline: !selected.underline })} aria-label="Underline" aria-pressed={selected.underline} />
                    <span className="ce-sep" />
                    <Button icon={<AlignLeftOutlined />} type={selected.align === 'left' ? 'primary' : 'default'} onClick={() => patchEl(selected.id, { align: 'left' })} aria-label="Align left" />
                    <Button icon={<AlignCenterOutlined />} type={selected.align === 'center' ? 'primary' : 'default'} onClick={() => patchEl(selected.id, { align: 'center' })} aria-label="Align centre" />
                    <Button icon={<AlignRightOutlined />} type={selected.align === 'right' ? 'primary' : 'default'} onClick={() => patchEl(selected.id, { align: 'right' })} aria-label="Align right" />
                  </div>
                  <label className="ce-field wide"><span>Text sits at the</span>
                    <select value={selected.valign} onChange={(e) => patchEl(selected.id, { valign: e.target.value as TextEl['valign'] })}><option value="top">top</option><option value="middle">middle</option><option value="bottom">bottom</option></select></label>
                  {colourField('Fill', selected.fill, (v) => patchEl(selected.id, { fill: v }, 'fill'), true)}
                  <div className="ce-row">{colourField('Outline', selected.border, (v) => patchEl(selected.id, { border: v }, 'border'), true)}{selected.border !== '' && num('Thickness', selected.borderW, (v) => patchEl(selected.id, { borderW: Math.min(20, Math.max(0, v)) }, 'borderw'), { min: 0, max: 20, step: 0.5 })}</div>
                </>
              )}
              {selected.type === 'shape' && (
                <>
                  {selected.shape !== 'line' && colourField('Fill', selected.fill, (v) => patchEl(selected.id, { fill: v }, 'fill'), true)}
                  <div className="ce-row">{colourField(selected.shape === 'line' ? 'Colour' : 'Outline', selected.line, (v) => patchEl(selected.id, { line: v }, 'line'), selected.shape !== 'line')}{num('Thickness', selected.lineW, (v) => patchEl(selected.id, { lineW: Math.min(40, Math.max(0, v)) }, 'linew'), { min: 0, max: 40, step: 0.5 })}</div>
                </>
              )}
              {geometry}
              <div className="ce-row wrap">{order('front', 'To front')}{order('forward', 'Forward')}{order('backward', 'Backward')}{order('back', 'To back')}</div>
              <div className="ce-row">
                <Button icon={<CopyOutlined />} onClick={() => { if (full()) { setNote(`A slide can hold ${MAX_ELEMENTS} pieces at most.`); return; } const c = duplicate(selected); editCanvas((b) => ({ ...b, elements: [...b.elements, c] })); setSel(c.id); }}>Copy</Button>
                <Button danger icon={<DeleteOutlined />} onClick={() => removeEl(selected.id)}>Delete</Button>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
  return createPortal(<div className={`ce-backdrop${max ? ' max' : ''}`}>{body}</div>, document.body);
}
