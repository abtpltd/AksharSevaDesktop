import { useMemo, useState, type ReactNode } from 'react';
import { App, Button, ColorPicker, Form, Input, InputNumber, Popconfirm, Segmented, Select, Slider, Tag, Tooltip, Typography, Upload } from 'antd';
import { LockOutlined, UnlockOutlined, UploadOutlined } from '@ant-design/icons';
import { actions, levelName, useAppState, useStandard } from '../data/store';
import { ancestry, BUILT_IN, effective } from '../core/cascade';
import type { SlideStandard, StandardKey } from '../core/types';
import type { Page } from '../core/pages';
import SlidePreview from '../deck/SlidePreview';
import { fileToDataUrl } from '../ui/image';

const FONTS = ['Calibri', 'Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Cambria', 'Segoe UI'];
const sample: Page = {
  kind: 'list', blockId: 'x', label: 'Ravi Sabha Prasad Seva', heading: '',
  items: [{ n: 1, text: 'Sample Donor One', sub: 'On occasion of his daughter’s marriage' }, { n: 2, text: 'Sample Donor Two', sub: 'On occasion of a birthday' }],
};
type ColourKey = 'frameBg' | 'frameBorder' | 'titleColor' | 'labelColor' | 'headingColor' | 'bodyColor' | 'nameColor';

export default function StandardPage() {
  const { message } = App.useApp();
  const s = useAppState();
  const preview = useStandard();
  const [editing, setEditing] = useState(s.workingOrg);

  // the levels from the top down to the center this computer works for
  const chain = useMemo(() => ancestry(s.workingOrg), [s.workingOrg]);
  const at = chain.includes(editing) ? editing : s.workingOrg;
  const eff = useMemo(() => effective(s.standards, at), [s.standards, at]);
  const own = s.standards[at];
  const name = (p: string) => levelName(s.levels, p);

  /** One setting: its control, where its value comes from, a way back to "follow the level above", and the optional lock. */
  const row = (key: StandardKey, label: string, control: ReactNode) => {
    // a lock only applies to the levels below the one that set it, so the locking level can still edit its own value
    const lockedAbove = eff.locked[key] && eff.locked[key] !== at ? eff.locked[key] : undefined;
    const lockedHere = !!own?.locks.includes(key);
    const setHere = own !== undefined && key in own.values;
    const from = eff.source[key];
    return (
      <Form.Item key={key} label={label} style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ opacity: lockedAbove ? 0.55 : 1, pointerEvents: lockedAbove ? 'none' : 'auto' }}>{control}</div>
          {lockedAbove
            ? <Tag icon={<LockOutlined />}>Locked by {name(lockedAbove)}</Tag>
            : setHere
              ? <><Tag color="blue">Set here</Tag><Button type="link" size="small" onClick={() => actions.clearLevelValue(at, key)}>Follow {at === chain[0] ? 'built-in' : 'level above'}</Button></>
              : <Tag>{from === BUILT_IN ? 'Built-in' : `From ${name(from)}`}</Tag>}
          {!lockedAbove && (
            <Tooltip title={lockedHere ? 'Locked: levels below cannot change this. Click to open it again.' : 'Lock this so levels below cannot change it'}>
              <Button size="small" type={lockedHere ? 'primary' : 'text'} icon={lockedHere ? <LockOutlined /> : <UnlockOutlined />} onClick={() => actions.setLevelLock(at, key, !lockedHere)} aria-label={`${lockedHere ? 'Unlock' : 'Lock'} ${label} for levels below`} />
            </Tooltip>
          )}
        </div>
      </Form.Item>
    );
  };
  const set = <K extends StandardKey>(key: K) => (v: SlideStandard[K]) => actions.setLevelValue(at, key, v);
  const colour = (key: ColourKey, label: string) =>
    row(key, label, <ColorPicker value={`#${eff.value[key]}`} showText disabledAlpha onChange={(c) => set(key)(c.toHex().toUpperCase())} />);
  const picture = (key: 'logo' | 'bgImage', label: string, maxPx: number) =>
    row(key, label, (
      <Upload accept="image/*" maxCount={1} showUploadList={false} beforeUpload={(f) => { fileToDataUrl(f, maxPx).then(set(key)).catch((e: Error) => message.error(e.message)); return false; }}>
        <Button icon={<UploadOutlined />}>{eff.value[key] ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}</Button>
      </Upload>
    ));

  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>Slide standard</Typography.Title>
      <p className="muted">
        Each level (worldwide, country, center) changes only what it wants to; everything else follows the level above. A level can also lock a setting so the levels below cannot change it.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 520px) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        <div>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>You are changing the standard for</div>
          <Segmented block value={at} onChange={(v) => setEditing(String(v))} options={chain.map((p) => ({ value: p, label: name(p) }))} />
          <Form layout="vertical" style={{ marginTop: 16 }}>
            {row('fontFace', 'Font (must be installed where the deck is opened)', <Select style={{ width: 200 }} value={eff.value.fontFace} onChange={set('fontFace')} options={FONTS.map((f) => ({ value: f, label: f }))} />)}
            {row('titleText', 'Title on every slide', <Input style={{ width: 240 }} value={eff.value.titleText} onChange={(e) => set('titleText')(e.target.value)} />)}
            {row('openingText', 'Opening slide text', <Input style={{ width: 240 }} value={eff.value.openingText} onChange={(e) => set('openingText')(e.target.value)} />)}
            {row('closingText', 'Closing slide text', <Input style={{ width: 240 }} value={eff.value.closingText} onChange={(e) => set('closingText')(e.target.value)} />)}
            {row('perSlide', 'Names or lines on one slide before it continues', <InputNumber min={1} max={8} value={eff.value.perSlide} onChange={(v) => set('perSlide')(Math.min(8, Math.max(1, Number(v) || 3)))} />)}
            {row('textScale', 'Text size', <Slider style={{ width: 220 }} min={0.8} max={1.3} step={0.05} value={eff.value.textScale} onChange={set('textScale')} tooltip={{ formatter: (v) => `${Math.round((v ?? 1) * 100)}%` }} />)}
            {row('frameStyle', 'Border', <Segmented value={eff.value.frameStyle} onChange={(v) => set('frameStyle')(v as SlideStandard['frameStyle'])} options={[{ value: 'double', label: 'Double' }, { value: 'single', label: 'Single' }, { value: 'none', label: 'None' }]} />)}
            {colour('frameBg', 'Background colour')}
            {picture('bgImage', 'Background picture', 1920)}
            {colour('frameBorder', 'Border colour')}
            {colour('titleColor', 'Title')}
            {colour('labelColor', 'Small title (top left)')}
            {colour('headingColor', 'Heading')}
            {colour('bodyColor', 'Text')}
            {colour('nameColor', 'Names in lists')}
            {picture('logo', 'Logo (bottom left)', 400)}
            <Popconfirm title={`Everything ${name(at)} changes will go back to following the level above.`} okText="Reset this level" onConfirm={() => actions.resetLevel(at)}>
              <Button>Reset everything at {name(at)}</Button>
            </Popconfirm>
          </Form>
        </div>
        <div style={{ position: 'sticky', top: 16 }}>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>What {name(s.workingOrg)} will get</div>
          <SlidePreview page={sample} std={preview} />
          <p className="muted" style={{ marginTop: 8 }}>
            Preview of the deck for {name(s.workingOrg)}. Layout positions are fixed so every deck looks alike. A background picture can make text hard to read, so check it before using it.
          </p>
        </div>
      </div>

    </>
  );
}
