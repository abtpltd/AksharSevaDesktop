import { extractDetails } from '../core/posterText';
import { readPictureText } from '../ui/ocr';
import { useState } from 'react';
import { App, Button, Form, Input, Modal, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { DeckBlock, DeckBlockKind } from '../core/types';
import { uid } from '../core/defaults';
import { blankCanvas } from '../core/canvas';
import { fileToDataUrl } from '../ui/image';
import { AddToLibrary, PosterPicker } from './PosterLibrary';

export const KIND_NAME: Record<DeckBlock['kind'], string> = {
  opening: 'Opening slide', closing: 'Closing slide', text: 'Text announcement', list: 'Numbered list', table: 'Table', poster: 'Poster and details', prasad: 'Prasad sponsors', canvas: 'Custom slide',
};

/** A new empty block of a kind. In a template, pass the token {sabha} as the name so each meeting fills in its own. */
export const blankBlock = (kind: DeckBlockKind, sabhaName: string): DeckBlock => {
  const id = uid();
  switch (kind) {
    case 'text': return { id, kind, label: sabhaName, heading: '', lines: [] };
    case 'list': return { id, kind, label: sabhaName, heading: '', lines: [] };
    case 'table': return { id, kind, label: '', rows: [] };
    case 'poster': return { id, kind, label: '', heading: '', lines: [], image: '' };
    case 'prasad': return { id, kind, label: `${sabhaName} Prasad Seva` };
    case 'opening': return { id, kind };
    case 'closing': return { id, kind };
    case 'canvas': return { ...blankCanvas(sabhaName), id };
  }
};

export const summary = (b: DeckBlock, donorCount: number): string => {
  switch (b.kind) {
    case 'opening': case 'closing': return KIND_NAME[b.kind];
    case 'text': return b.heading || b.lines.find((l) => l.trim()) || 'Text announcement';
    case 'list': return `${b.heading || 'List'} (${b.lines.filter((l) => l.trim()).length})`;
    case 'table': return `Table (${b.rows.length} rows)`;
    case 'poster': return b.heading || 'Poster';
    case 'prasad': return `${b.label || 'Prasad sponsors'} (${donorCount})`;
    case 'canvas': return b.elements.find((e) => e.type === 'text' && e.text.trim() !== '')?.type === 'text' ? (b.elements.find((e) => e.type === 'text' && e.text.trim() !== '') as { text: string }).text.split('\n')[0].slice(0, 60) : 'Custom slide';
  }
};

const rowsToText = (rows: [string, string][]) => rows.map((r) => `${r[0]} | ${r[1]}`).join('\n');
const textToRows = (t: string): [string, string][] =>
  t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf('|'); return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });

/** Edits one announcement block. Nothing changes in the deck until Save. */
export default function BlockEditor({ block, onSave, onCancel }: { block: DeckBlock; onSave: (b: DeckBlock) => void; onCancel: () => void }) {
  const { message } = App.useApp();
  const [label, setLabel] = useState('label' in block ? block.label : '');
  const [heading, setHeading] = useState('heading' in block ? block.heading : '');
  const [lines, setLines] = useState('lines' in block ? block.lines.join('\n') : block.kind === 'table' ? rowsToText(block.rows) : '');
  const [image, setImage] = useState(block.kind === 'poster' ? block.image : '');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);

  /** Reads Date, Time and Venue off the poster so they need not be typed. Always shown for checking; never saved until Save. */
  const readPoster = async (img: string, onlyIfEmpty: boolean) => {
    if (onlyIfEmpty && lines.trim()) return;
    setReading(true);
    try {
      const found = extractDetails(await readPictureText(img));
      if (found.length) { setLines(found.join('\n')); message.info('Details read from the poster. Please check them before saving.'); }
      else message.warning('No date, time or venue could be read from this poster. You can type them.');
    } catch {
      message.error('The poster could not be read. You can type the details.');
    } finally { setReading(false); }
  };

  const save = () => {
    const ls = lines.split('\n');
    const empty = ls.every((l) => l.trim() === '');
    if (block.kind === 'text' && !heading.trim() && empty) { setError('Add a heading or some text'); return; }
    if ((block.kind === 'list' || block.kind === 'table') && empty) { setError('Add at least one line'); return; }
    if (block.kind === 'poster' && !image && !heading.trim() && empty) { setError('Add a poster or some details'); return; }
    switch (block.kind) {
      case 'text': onSave({ ...block, label, heading, lines: ls }); break;
      case 'list': onSave({ ...block, label, heading, lines: ls }); break;
      case 'table': onSave({ ...block, label, rows: textToRows(lines) }); break;
      case 'poster': onSave({ ...block, label, heading, lines: ls, image }); break;
      case 'prasad': onSave({ ...block, label }); break;
      default: onSave(block);
    }
  };

  const showHeading = block.kind === 'text' || block.kind === 'list' || block.kind === 'poster';
  const showLines = block.kind === 'text' || block.kind === 'list' || block.kind === 'table' || block.kind === 'poster';
  const linesHelp = block.kind === 'list' ? 'One per line. Put a small note after a bar: Name | On occasion of birthday' : block.kind === 'table' ? 'One row per line: left | right' : 'One line per row on the slide';

  return (
    <Modal open title={KIND_NAME[block.kind]} okText="Save" onOk={save} onCancel={onCancel} destroyOnHidden width={560}>
      <Form layout="vertical" onChange={() => setError('')}>
        <Form.Item label="Small title on the slide (for example the sabha name)"><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Form.Item>
        {showHeading && <Form.Item label="Heading (shown in red)"><Input value={heading} onChange={(e) => setHeading(e.target.value)} /></Form.Item>}
        {showLines && <Form.Item label={block.kind === 'table' ? 'Rows' : 'Lines'} extra={linesHelp}><Input.TextArea rows={7} value={lines} onChange={(e) => setLines(e.target.value)} /></Form.Item>}
        {block.kind === 'poster' && (
          <Form.Item label="Poster or photo">
            <Upload
              accept="image/*" maxCount={1} showUploadList={false}
              beforeUpload={(f) => { fileToDataUrl(f).then((img) => { setImage(img); void readPoster(img, true); }).catch((e: Error) => message.error(e.message)); return false; }}
            >
              <Button icon={<UploadOutlined />}>{image ? 'Change image' : 'Upload image'}</Button>
            </Upload>
            <Button style={{ marginLeft: 8 }} onClick={() => setPicking(true)}>Choose from library</Button>
            {image ? <Button style={{ marginLeft: 8 }} onClick={() => setAdding(true)}>Add to library</Button> : null}
            {image ? <Button style={{ marginLeft: 8 }} loading={reading} onClick={() => void readPoster(image, false)}>Read date, time and venue from the poster</Button> : null}
            {image ? <img alt="" src={image} style={{ display: 'block', maxHeight: 120, marginTop: 8, borderRadius: 4 }} /> : null}
          </Form.Item>
        )}
        {error ? <div style={{ color: '#d64545' }}>{error}</div> : null}
      </Form>
      {picking && <PosterPicker onClose={() => setPicking(false)} onPick={(img, name) => { setImage(img); if (!heading.trim()) setHeading(name); setPicking(false); void readPoster(img, true); }} />}
      {adding && <AddToLibrary image={image} suggested={heading.trim()} onClose={() => setAdding(false)} onDone={() => setAdding(false)} />}
    </Modal>
  );
}
