import { useMemo, useState } from 'react';
import { App, Button, Dropdown, Input, Modal, Popconfirm, Space, Tag, Tooltip, Typography } from 'antd';
import { ArrowDownOutlined, ArrowLeftOutlined, ArrowUpOutlined, CopyOutlined, DeleteOutlined, EditOutlined, LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { actions, levelName, templateBlocksFor, useAppState, useStandard } from '../data/store';
import { DEFAULT_TEMPLATE_ID, DEFAULT_TEMPLATE_NAME, fillTemplate, visibleTemplates } from '../core/templates';
import { buildPages } from '../core/pages';
import type { DeckBlock, DeckBlockKind } from '../core/types';
import SlidePreview from '../deck/SlidePreview';
import BlockEditor, { KIND_NAME, blankBlock, summary } from './BlockEditor';
import CanvasEditor from './CanvasEditor';
import { go } from '../ui/router';

/** Where a template stands for this center: built in, made here, or made by a level above. */
export default function TemplatesPage({ templateId }: { templateId: string }) {
  return templateId ? <TemplateEditor templateId={templateId} /> : <TemplateList />;
}

function TemplateList() {
  const { message } = App.useApp();
  const s = useAppState();
  const [copying, setCopying] = useState<{ id: string; name: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const visible = useMemo(() => visibleTemplates(s.templates, s.workingOrg), [s.templates, s.workingOrg]);
  const rows = [{ id: DEFAULT_TEMPLATE_ID, name: DEFAULT_TEMPLATE_NAME, org: '', count: templateBlocksFor(s, DEFAULT_TEMPLATE_ID)?.length ?? 0 }, ...visible.map((t) => ({ id: t.id, name: t.name, org: t.org, count: t.blocks.length }))];

  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>Slide templates</Typography.Title>
      <p className="muted">
        A template is the list of slides a new meeting starts with. Copy the standard one, give it a name such as "Ravi Sabha announcements" or "Diwali event", and use it for any sabha.
        You are working for <b>{levelName(s.levels, s.workingOrg)}</b>: you see its templates and those of the levels above.
      </p>
      {rows.map((r) => {
        const own = r.org === s.workingOrg;
        return (
          <div className="card-row" key={r.id}>
            <div className="grow">
              <b>{r.name}</b>
              <span className="muted">{r.count} slides {r.id === DEFAULT_TEMPLATE_ID ? '' : `, made by ${levelName(s.levels, r.org)}`}</span>
            </div>
            <Space>
              {r.id === DEFAULT_TEMPLATE_ID ? <Tag>Built in</Tag> : !own ? <Tag>From a level above</Tag> : null}
              <Button icon={<CopyOutlined />} onClick={() => setCopying({ id: r.id, name: r.id === DEFAULT_TEMPLATE_ID ? '' : `${r.name} copy` })}>Copy</Button>
              {own && <Button icon={<EditOutlined />} onClick={() => go(`/templates/${r.id}`)}>Edit slides</Button>}
              {own && <Button onClick={() => setRenaming({ id: r.id, name: r.name })}>Rename</Button>}
              {own && (
                <Popconfirm title="Delete this template?" description="Meetings already made from it are not changed." okText="Delete" onConfirm={() => actions.deleteTemplate(r.id)}>
                  <Button danger icon={<DeleteOutlined />} aria-label={`Delete ${r.name}`} />
                </Popconfirm>
              )}
            </Space>
          </div>
        );
      })}

      <Modal open={!!copying} title="Copy template" okText="Copy" destroyOnHidden onCancel={() => setCopying(null)}
        onOk={() => {
          const id = actions.copyTemplate(copying!.id, copying!.name);
          if (!id) { message.error('Give the copy a name that is not already used at this center.'); return; }
          setCopying(null);
          go(`/templates/${id}`);
        }}>
        <Input value={copying?.name ?? ''} onChange={(e) => setCopying({ id: copying!.id, name: e.target.value })} placeholder="For example: Ravi Sabha announcements" aria-label="Name of the copy" />
      </Modal>
      <Modal open={!!renaming} title="Rename template" okText="Rename" destroyOnHidden onCancel={() => setRenaming(null)}
        onOk={() => {
          if (!actions.renameTemplate(renaming!.id, renaming!.name)) { message.error('Use a name that is not empty and not already used at this center.'); return; }
          setRenaming(null);
        }}>
        <Input value={renaming?.name ?? ''} onChange={(e) => setRenaming({ id: renaming!.id, name: e.target.value })} aria-label="New name" />
      </Modal>
    </>
  );
}

function TemplateEditor({ templateId }: { templateId: string }) {
  const s = useAppState();
  const std = useStandard();
  const tpl = s.templates.find((t) => t.id === templateId && t.org === s.workingOrg);
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState<{ block: DeckBlock; isNew: boolean } | null>(null);
  const [editor, setEditor] = useState<number | null>(null);
  const blocks = tpl?.blocks ?? [];
  // The preview shows each small title with a sample sabha name in place of {sabha}. Slides are made from one filled copy,
  // so each slide can be matched back to its block by position (filling gives new ids every time it runs).
  const filled = useMemo(() => fillTemplate(blocks, 'Sabha name'), [blocks]);
  const pages = useMemo(() => buildPages(filled, [{ id: 'd1', name: 'Sample donor name', occasion: 'On occasion of birthday' }], std), [filled, std]);
  const pageBlockIndex = useMemo(() => pages.map((p) => filled.findIndex((f) => f.id === p.blockId)), [pages, filled]);

  if (!tpl) {
    return (
      <>
        <Button icon={<ArrowLeftOutlined />} onClick={() => go('/templates')}>Back to templates</Button>
        <p style={{ marginTop: 12 }}>This template can only be edited at the center that made it. Open the list and copy it to change it for this center.</p>
      </>
    );
  }

  const setBlocks = (next: DeckBlock[]) => actions.setTemplateBlocks(tpl.id, next);
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= blocks.length) return; const n = [...blocks]; [n[i], n[j]] = [n[j], n[i]]; setBlocks(n); };
  const insert = (b: DeckBlock) => { const c = blocks.findIndex((x) => x.kind === 'closing'); const n = [...blocks]; n.splice(c < 0 ? n.length : c, 0, b); setBlocks(n); };
  const hasPrasad = blocks.some((b) => b.kind === 'prasad');
  const addItems = (['text', 'list', 'table', 'poster'] as DeckBlockKind[]).map((k) => ({ key: k, label: KIND_NAME[k] }));
  if (!hasPrasad) addItems.push({ key: 'prasad', label: KIND_NAME.prasad });
  addItems.push({ key: 'canvas', label: 'Custom slide (free layout)' });
  const showBlock = (i: number) => { const n = pageBlockIndex.indexOf(i); if (n >= 0) setCursor(n); };

  return (
    <>
      <Button icon={<ArrowLeftOutlined />} onClick={() => go('/templates')}>Back to templates</Button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>{tpl.name}</Typography.Title>
        <Button type="primary" icon={<EditOutlined />} onClick={() => setEditor(cursor)} disabled={!pages.length}>Open full slide editor</Button>
      </div>
      <p className="muted">These are the slides a new meeting starts with. Write <b>{'{sabha}'}</b> in a small title and each meeting puts in its own sabha name. Anyone making a meeting can still delete or add slides there.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 400px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        <div>
          {blocks.map((b, i) => (
            <div key={b.id} className={`card-row${pageBlockIndex[cursor] === i ? ' active' : ''}`}>
              <div className="grow" role="button" tabIndex={0} onClick={() => showBlock(i)} onKeyDown={(e) => { if (e.key === 'Enter') showBlock(i); }} style={{ cursor: 'pointer' }}>
                <b style={{ fontWeight: 500 }}>{b.kind === 'prasad' ? (b.label || 'Prasad sponsors') : summary(b, 0)}</b>
                <span className="muted">{KIND_NAME[b.kind]}</span>
              </div>
              <Space size={2}>
                <Tooltip title="Move up"><Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" /></Tooltip>
                <Tooltip title="Move down"><Button size="small" icon={<ArrowDownOutlined />} disabled={i === blocks.length - 1} onClick={() => move(i, 1)} aria-label="Move down" /></Tooltip>
                {b.kind === 'canvas'
                  ? <Tooltip title="Open in the slide editor"><Button size="small" icon={<EditOutlined />} onClick={() => setEditor(Math.max(0, pageBlockIndex.indexOf(i)))} aria-label="Open in the slide editor" /></Tooltip>
                  : (b.kind === 'opening' || b.kind === 'closing')
                    ? <Tooltip title="Open in the slide editor"><Button size="small" icon={<EditOutlined />} onClick={() => setEditor(Math.max(0, pageBlockIndex.indexOf(i)))} aria-label="Open in the slide editor" /></Tooltip>
                    : <Tooltip title="Edit"><Button size="small" icon={<EditOutlined />} onClick={() => setEditing({ block: b, isNew: false })} aria-label="Edit slide" /></Tooltip>}
                <Tooltip title="Remove"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => setBlocks(blocks.filter((x) => x.id !== b.id))} aria-label="Remove slide" /></Tooltip>
              </Space>
            </div>
          ))}
          <Dropdown menu={{ items: addItems, onClick: ({ key }) => { const k = key as DeckBlockKind; const b = blankBlock(k, '{sabha}'); if (k === 'canvas') { insert(b); setEditor(Math.max(0, blocks.findIndex((x) => x.kind === 'closing') < 0 ? blocks.length : blocks.findIndex((x) => x.kind === 'closing'))); } else if (k === 'prasad') insert(b); else setEditing({ block: b, isNew: true }); } }} trigger={['click']}>
            <Button icon={<PlusOutlined />}>Add slide</Button>
          </Dropdown>
          <Button style={{ marginLeft: 8 }} type="primary" ghost icon={<EditOutlined />} onClick={() => setEditor(cursor)} disabled={!pages.length}>Slide editor</Button>
        </div>
        <div>
          <div onDoubleClick={() => pages.length && setEditor(cursor)} title="Double-click to edit this slide freely"><SlidePreview page={pages[cursor]} std={std} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
            <Button icon={<LeftOutlined />} disabled={cursor <= 0} onClick={() => setCursor(cursor - 1)} aria-label="Previous slide" />
            <span className="muted">{pages.length ? `Slide ${cursor + 1} of ${pages.length}` : 'No slides yet'}</span>
            <Button icon={<RightOutlined />} disabled={cursor >= pages.length - 1} onClick={() => setCursor(cursor + 1)} aria-label="Next slide" />
          </div>
          <p className="muted">Preview with a sample sabha name and a sample donor.</p>
        </div>
      </div>
      {editor !== null && (
        <CanvasEditor
          title={`${tpl.name}`} deck={blocks} donors={[{ id: 'd1', name: 'Sample donor name', occasion: 'On occasion of birthday' }]} std={std} startAt={editor} sabhaName="{sabha}"
          onClose={() => setEditor(null)}
          onSave={(deck) => { setBlocks(deck); setEditor(null); }}
        />
      )}
      {editing && (
        <BlockEditor
          key={editing.block.id} block={editing.block} onCancel={() => setEditing(null)}
          onSave={(b) => { if (editing.isNew) insert(b); else setBlocks(blocks.map((x) => (x.id === b.id ? b : x))); setEditing(null); }}
        />
      )}
    </>
  );
}
