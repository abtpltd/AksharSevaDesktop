import { useEffect, useMemo, useState } from 'react';
import { App, AutoComplete, Button, Checkbox, Dropdown, Input, Modal, Select, Space, Switch, Tooltip } from 'antd';
import { HistoryOutlined, SaveOutlined, ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { actions, pastDonors, useAppState, useStandard } from '../data/store';
import type { DeckBlock, DeckBlockKind, DonorContact, DonorKind, DonorStyle, Meeting } from '../core/types';
import { displayName, makeDonor, matchContacts, KIND_NAMES, STYLE_NAMES } from '../core/donors';
import { buildPages, slidesOfBlock } from '../core/pages';
import { uid } from '../core/defaults';
import SlidePreview from '../deck/SlidePreview';
import { go } from '../ui/router';
import { addTicker, removeTicker, useTicker } from '../data/ticker';
import { useScreen } from '../data/screen';
import { downloadPptx } from '../deck/exportPptx';
import BlockEditor, { KIND_NAME, blankBlock, summary } from './BlockEditor';
import CanvasEditor from './CanvasEditor';

export default function AnnouncementsTab({ meeting: m, sabhaName }: { meeting: Meeting; sabhaName: string }) {
  const { message } = App.useApp();
  const s = useAppState();
  const std = useStandard();
  const pages = useMemo(() => buildPages(m.deck, m.donors, std), [m.deck, m.donors, std]);
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState<{ block: DeckBlock; isNew: boolean } | null>(null);
  const [dn, setDn] = useState('');
  const [picked, setPicked] = useState<DonorContact | null>(null);
  const [fam, setFam] = useState(false);
  const [sty, setSty] = useState<DonorStyle | undefined>(undefined);
  const [keep, setKeep] = useState(false);
  const [newKind, setNewKind] = useState<DonorKind>('satsangi');
  const [newCompany, setNewCompany] = useState('');
  const [dOcc, setDOcc] = useState('');
  const [dErr, setDErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tplName, setTplName] = useState<string | null>(null);
  const [editor, setEditor] = useState<number | null>(null);
  const tk = useTicker(m.id);
  const scr = useScreen(m.id);
  const addMsg = () => {
    const text = tkText;
    addTicker(m.id, text, tk.msgs).then(() => { setTkText(''); tk.reload(); }).catch((e: Error) => message.error(`The message was not saved: ${e.message || 'no connection'}`));
  };
  const [tkText, setTkText] = useState('');
  const suggestions = useMemo(() => pastDonors(s), [s]);

  useEffect(() => { if (cursor > pages.length - 1) setCursor(Math.max(0, pages.length - 1)); }, [pages.length, cursor]);

  const setDeck = (deck: DeckBlock[], note?: string) => actions.setDeck(m.id, deck, note);
  const [showHistory, setShowHistory] = useState(false);
  const removeBlock = (b: DeckBlock) => {
    setDeck(m.deck.filter((x) => x.id !== b.id), `Removed "${summary(b, m.donors.length)}"`);
    const key = `undo-${b.id}`;
    message.open({ key, type: 'info', duration: 8, content: (<span>Slide removed. <a onClick={() => { actions.undoDeck(m.id); message.destroy(key); }}>Undo</a></span>) });
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= m.deck.length) return;
    const next = [...m.deck];
    [next[i], next[j]] = [next[j], next[i]];
    setDeck(next, 'Moved a slide');
  };
  const showBlock = (id: string) => { const n = slidesOfBlock(pages, id)[0]; if (n) setCursor(n - 1); };
  const hasPrasad = m.deck.some((b) => b.kind === 'prasad');

  const addDonor = () => {
    let name = dn.trim();
    if (!name) { setDErr('Enter the donor name first'); return; }
    let contact = picked;
    if (!contact && keep) {
      const r = actions.addContact({ name, kind: newKind, company: newCompany, family: fam });
      if (!r.ok) { setDErr(r.error); return; }
      contact = { id: r.id, org: s.workingOrg, name: name.replace(/\s+/g, ' ').trim(), kind: newKind, company: newKind === 'satsangi' ? newCompany.trim() : '', family: newKind === 'satsangi' && fam };
    }
    const donor = makeDonor(uid(), contact, !contact && fam ? `${name} & Family` : name, dOcc, { family: fam, style: sty });
    name = donor.name;
    actions.setDonors(m.id, [...m.donors, donor]);
    setDn(''); setDOcc(''); setDErr(''); setPicked(null); setFam(false); setSty(undefined); setKeep(false); setNewCompany(''); setNewKind('satsangi');
    (document.activeElement as HTMLElement | null)?.blur?.();
    const pb = m.deck.find((b) => b.kind === 'prasad');
    if (pb) setTimeout(() => { const ns = slidesOfBlock(buildPages(m.deck, [...m.donors, { id: 'x', name, occasion: '' }], std), pb.id); if (ns.length) setCursor(ns[ns.length - 1] - 1); }, 0);
  };
  const patchDonor = (id: string, p: { name?: string; occasion?: string }) => actions.setDonors(m.id, m.donors.map((d) => (d.id === id ? { ...d, ...p } : d)));
  const moveDonor = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= m.donors.length) return;
    const next = [...m.donors];
    [next[i], next[j]] = [next[j], next[i]];
    actions.setDonors(m.id, next);
  };

  const exportDeck = async () => {
    if (!pages.length) { message.warning('There are no slides to export yet.'); return; }
    setBusy(true);
    try { await downloadPptx(pages, std, `${sabhaName} announcements ${m.date}`, `${sabhaName} announcements ${m.date}`); message.success('PowerPoint downloaded'); }
    catch (e) { message.error(`Could not make the PowerPoint: ${e instanceof Error ? e.message : 'unknown problem'}`); }
    finally { setBusy(false); }
  };

  const addItems = (['text', 'list', 'table', 'poster'] as DeckBlockKind[]).map((k) => ({ key: k, label: KIND_NAME[k] }));
  if (!hasPrasad) addItems.push({ key: 'prasad', label: KIND_NAME.prasad });
  addItems.push({ key: 'canvas', label: 'Custom slide (free layout)' });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 400px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Deck, in order</div>
        {m.deck.map((b, i) => {
          const on = slidesOfBlock(pages, b.id).includes(cursor + 1);
          const slides = slidesOfBlock(pages, b.id);
          return (
            <div key={b.id} className={`card-row${on ? ' active' : ''}`}>
              <div className="grow" role="button" tabIndex={0} onClick={() => showBlock(b.id)} onKeyDown={(e) => { if (e.key === 'Enter') showBlock(b.id); }} style={{ cursor: 'pointer' }}>
                <b style={{ fontWeight: 500 }}>{summary(b, m.donors.length)}</b>
                <span className="muted">{KIND_NAME[b.kind]}{slides.length ? `, slide${slides.length > 1 ? 's' : ''} ${slides[0]}${slides.length > 1 ? ` to ${slides[slides.length - 1]}` : ''}` : ', no slide yet'}</span>
              </div>
              <Space size={2}>
                <Tooltip title="Move up"><Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} /></Tooltip>
                <Tooltip title="Move down"><Button size="small" icon={<ArrowDownOutlined />} disabled={i === m.deck.length - 1} onClick={() => move(i, 1)} /></Tooltip>
                {b.kind === 'canvas'
                  ? <Tooltip title="Open in the slide editor"><Button size="small" icon={<EditOutlined />} onClick={() => setEditor(Math.max(0, slidesOfBlock(pages, b.id)[0] - 1))} /></Tooltip>
                  : b.kind !== 'opening' && b.kind !== 'closing' && <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => setEditing({ block: b, isNew: false })} /></Tooltip>}
                <Tooltip title="Remove"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeBlock(b)} /></Tooltip>
              </Space>
            </div>
          );
        })}
        <Dropdown menu={{ items: addItems, onClick: ({ key }) => { const k = key as DeckBlockKind; const b = blankBlock(k, sabhaName); if (k === 'canvas') { const closing = m.deck.findIndex((x) => x.kind === 'closing'); const next = [...m.deck]; next.splice(closing < 0 ? next.length : closing, 0, b); setDeck(next, 'Added a custom slide'); const at = slidesOfBlock(buildPages(next, m.donors, std), b.id)[0]; setEditor(Math.max(0, (at ?? 1) - 1)); } else if (k === 'prasad') { const closing = m.deck.findIndex((x) => x.kind === 'closing'); const next = [...m.deck]; next.splice(closing < 0 ? next.length : closing, 0, b); setDeck(next, `Added "${summary(b, m.donors.length)}"`); } else setEditing({ block: b, isNew: true }); } }} trigger={['click']}>
          <Button icon={<PlusOutlined />}>Add announcement</Button>
        </Dropdown>
        <Button style={{ marginLeft: 8 }} type={'primary'} ghost icon={<EditOutlined />} onClick={() => setEditor(cursor)} disabled={!pages.length}>Slide editor</Button>
        <Button style={{ marginLeft: 8 }} icon={<SaveOutlined />} onClick={() => setTplName('')}>Save as template</Button>
        <Button style={{ marginLeft: 8 }} icon={<HistoryOutlined />} onClick={() => setShowHistory(true)} disabled={!(m.history ?? []).length}>History</Button>

        {hasPrasad && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Prasad sponsors ({m.donors.length})</div>
            <AutoComplete
              style={{ width: '100%' }} value={dn}
              options={[
                ...(dn.trim() ? matchContacts(s.contacts, dn).map((c) => ({ value: `c:${c.id}`, label: <span>{displayName(c, { family: c.family })} <span className="muted">· {KIND_NAMES[c.kind]}</span></span> })) : []),
                ...suggestions.filter((d) => !d.contactId && d.name.toLowerCase().includes(dn.trim().toLowerCase()) && dn.trim()).slice(0, 5).map((d) => ({ value: `p:${d.id}`, label: <span>{d.occasion ? `${d.name} (${d.occasion})` : d.name} <span className="muted">· earlier</span></span> })),
              ]}
              onChange={(v) => { if (!/^[cp]:/.test(v)) { setDn(v); setPicked(null); setDErr(''); } }}
              onSelect={(v) => {
                if (v.startsWith('c:')) { const c = s.contacts.find((x) => x.id === v.slice(2)); if (c) { setPicked(c); setDn(c.name); setFam(c.family); setSty(undefined); setKeep(false); } }
                else { const hit = suggestions.find((d) => `p:${d.id}` === v); if (hit) { setDn(hit.name); setPicked(null); if (!dOcc) setDOcc(hit.occasion); } }
              }}
              placeholder="Donor name"
            />
            {picked ? (
              <div style={{ marginTop: 6, fontSize: 12 }}>
                <span className="muted">From the directory · {KIND_NAMES[picked.kind]}. </span>
                <Button type="link" size="small" style={{ padding: 0 }} onClick={() => { setPicked(null); }}>Use as typed instead</Button>
              </div>
            ) : null}
            {(!picked || picked.kind === 'satsangi') && dn.trim() ? (
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                <Checkbox checked={fam} onChange={(e) => setFam(e.target.checked)} disabled={!!picked && picked.kind !== 'satsangi'}>& Family</Checkbox>
                {picked && picked.kind === 'satsangi' && picked.company ? (
                  <Select<DonorStyle> size="small" style={{ width: 170 }} value={sty ?? 'name-company'} onChange={setSty} aria-label="How the name shows"
                    options={(Object.keys(STYLE_NAMES) as DonorStyle[]).map((k) => ({ value: k, label: STYLE_NAMES[k] }))} />
                ) : null}
              </div>
            ) : null}
            {!picked && dn.trim() ? (
              <div style={{ marginTop: 6 }}>
                <Checkbox checked={keep} onChange={(e) => setKeep(e.target.checked)}>Save to the donor directory</Checkbox>
                {keep ? (
                  <Space style={{ marginTop: 6 }} wrap>
                    <Select<DonorKind> size="small" style={{ width: 110 }} value={newKind} onChange={setNewKind} aria-label="Kind" options={(Object.keys(KIND_NAMES) as DonorKind[]).map((k) => ({ value: k, label: KIND_NAMES[k] }))} />
                    {newKind === 'satsangi' ? <Input size="small" style={{ width: 170 }} value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="Company (optional)" aria-label="Company" /> : null}
                  </Space>
                ) : null}
              </div>
            ) : null}
            {dn.trim() ? <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>On the slide: <b>{(() => { const c = picked ?? (keep ? { name: dn, kind: newKind, company: newCompany } : null); return c ? displayName(c, { family: fam && c.kind === 'satsangi', style: picked ? sty : undefined }) : dn.trim() + (fam ? ' & Family' : ''); })()}</b></div> : null}
            <Input style={{ marginTop: 6 }} value={dOcc} onChange={(e) => setDOcc(e.target.value)} placeholder="On occasion of" onPressEnter={addDonor} />
            {dErr ? <div style={{ color: '#d64545', fontSize: 12, marginTop: 4 }}>{dErr}</div> : null}
            <Button type="primary" style={{ marginTop: 8 }} onClick={addDonor} block>Add to slides</Button>
            <div style={{ marginTop: 10 }}>
              {m.donors.map((d, i) => (
                <div key={d.id} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 6 }}>
                  <span className="muted" style={{ width: 18 }}>{i + 1}.</span>
                  <Input size="small" value={d.name} onChange={(e) => patchDonor(d.id, { name: e.target.value })} aria-label="Donor name" />
                  <Input size="small" value={d.occasion} onChange={(e) => patchDonor(d.id, { occasion: e.target.value })} aria-label="Occasion" />
                  <Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => moveDonor(i, -1)} aria-label="Move up" />
                  <Button size="small" icon={<ArrowDownOutlined />} disabled={i === m.donors.length - 1} onClick={() => moveDonor(i, 1)} aria-label="Move down" />
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => actions.setDonors(m.id, m.donors.filter((x) => x.id !== d.id))} aria-label="Remove donor" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <SlidePreview page={pages[cursor]} std={std} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
          <Button icon={<LeftOutlined />} disabled={cursor <= 0} onClick={() => setCursor(cursor - 1)} aria-label="Previous slide" />
          <span className="muted">{pages.length ? `Slide ${cursor + 1} of ${pages.length}` : 'No slides yet'}</span>
          <Button icon={<RightOutlined />} disabled={cursor >= pages.length - 1} onClick={() => setCursor(cursor + 1)} aria-label="Next slide" />
          <span style={{ flex: 1 }} />
          <Button type="primary" icon={<DownloadOutlined />} loading={busy} onClick={exportDeck}>Export PowerPoint</Button>
          <Button style={{ marginLeft: 8 }} onClick={() => { go(`/present/${m.id}`); void document.documentElement.requestFullscreen?.().catch(() => {}); }}>Present on this screen</Button>
          <Button style={{ marginLeft: 8 }} onClick={() => go(`/presenter/${m.id}`)}>Presenter view</Button>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Scroller at the bottom of the screen</div>
            <Space wrap style={{ marginBottom: 8 }}>
              <Switch checked={scr.settings.tickerOn} onChange={(v) => void scr.change({ tickerOn: v })} /> <span>On</span>
              <span>Speed</span>
              <Select size="small" style={{ width: 90 }} value={scr.settings.tickerSpeed} onChange={(v) => void scr.change({ tickerSpeed: v })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 1 ? '1 slow' : n === 5 ? '5 fast' : String(n) }))} />
              <Switch checked={scr.settings.autoDonors} onChange={(v) => void scr.change({ autoDonors: v })} /> <span>Donor list scrolls by itself, a name every</span>
              <Select size="small" style={{ width: 80 }} value={scr.settings.autoSpeed} onChange={(v) => void scr.change({ autoSpeed: v })} options={[2, 3, 4, 6, 8, 12].map((n) => ({ value: n, label: `${n} s` }))} />
            </Space>
            {tk.msgs.map((x) => (
              <div key={x.id} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <span style={{ flex: 1 }}>{x.text}</span>
                <Button size="small" danger icon={<DeleteOutlined />} aria-label="Remove message" onClick={() => removeTicker(x.id).then(tk.reload).catch((e: Error) => message.error(`Could not remove it: ${e.message || 'no connection'}`))} />
              </div>
            ))}
            <Space.Compact style={{ width: '100%' }}>
              <Input value={tkText} maxLength={200} placeholder="A message for the scroller" onChange={(e) => setTkText(e.target.value)} onPressEnter={addMsg} />
              <Button onClick={addMsg}>Add</Button>
            </Space.Compact>
          </div>
        </div>
        <div className="slide-strip">
          {pages.map((p, i) => (
            <button key={i} className={i === cursor ? 'on' : ''} onClick={() => setCursor(i)} aria-label={`Show slide ${i + 1}`}>
              <SlidePreview page={p} std={std} />
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 6 }}>Long lists continue on the next slide by themselves. Frame, colours, fonts and logo come from the slide standard.</p>
      </div>

      <Modal
        open={tplName !== null} title="Save this deck as a template" okText="Save template" destroyOnHidden
        onCancel={() => setTplName(null)}
        onOk={() => {
          const id = actions.saveDeckAsTemplate(m.id, tplName ?? '');
          if (!id) { message.error('Give the template a name that is not already used at this center.'); return; }
          setTplName(null);
          message.success('Template saved. Pick it when you start a new meeting.');
        }}
      >
        <p className="muted">The slides and their wording are kept. Poster pictures and donor names are not, because they belong to this meeting.</p>
        <Input value={tplName ?? ''} onChange={(e) => setTplName(e.target.value)} placeholder="For example: Diwali event announcements" aria-label="Template name" onPressEnter={(e) => e.preventDefault()} />
      </Modal>

      <Modal open={showHistory} title="Earlier versions of these slides" footer={null} onCancel={() => setShowHistory(false)}>
        <p className="muted">Going back never loses anything: the slides as they are now are kept here too.</p>
        {(m.history ?? []).map((h, i) => (
          <div key={`${h.at}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #eee' }}>
            <div>
              <div>{h.note}</div>
              <div className="muted">{new Date(h.at).toLocaleString()} · {h.deck.length} slides</div>
            </div>
            <Button size="small" onClick={() => { actions.restoreDeck(m.id, i); setShowHistory(false); message.success('Slides brought back'); }}>Go back to this</Button>
          </div>
        ))}
      </Modal>

      {editor !== null && (
        <CanvasEditor
          title={`${sabhaName} slides`} deck={m.deck} donors={m.donors} std={std} startAt={editor} sabhaName={sabhaName}
          onClose={() => setEditor(null)}
          onSave={(deck, note) => { setDeck(deck, note); setEditor(null); message.success('Slides saved'); }}
        />
      )}

      {editing && (
        <BlockEditor
          key={editing.block.id} block={editing.block} onCancel={() => setEditing(null)}
          onSave={(b) => {
            const next = editing.isNew ? (() => { const closing = m.deck.findIndex((x) => x.kind === 'closing'); const arr = [...m.deck]; arr.splice(closing < 0 ? arr.length : closing, 0, b); return arr; })() : m.deck.map((x) => (x.id === b.id ? b : x));
            setDeck(next, editing.isNew ? `Added "${summary(b, m.donors.length)}"` : `Edited "${summary(b, m.donors.length)}"`);
            setEditing(null);
            setTimeout(() => showBlock(b.id), 0);
          }}
        />
      )}
    </div>
  );
}
