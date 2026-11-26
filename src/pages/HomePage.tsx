import { useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, DatePicker, Empty, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Space, Tag, TimePicker, Typography } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { actions, useAppState } from '../data/store';
import type { Sabha } from '../core/types';
import { clock12 } from '../core/time';
import { go } from '../ui/router';
import { DEFAULT_TEMPLATE_ID, DEFAULT_TEMPLATE_NAME, visibleTemplates } from '../core/templates';
import { suggestedDates } from '../core/sabhaDates';
import { comingAtAGlance } from '../core/glance';
import { DAYS, inputOf, usualText, type SabhaInput } from '../core/sabhaForm';

const KIND_LABEL = { weekly: 'Fixed time', flexible: 'Variable time', event: 'Event' } as const;

export default function HomePage() {
  const s = useAppState();
  const [target, setTarget] = useState<Sabha | null>(null);
  const [editing, setEditing] = useState<{ sabha?: Sabha } | null>(null);
  const sabhaName = (id: string) => s.sabhas.find((x) => x.id === id)?.name ?? 'Sabha';
  const glance = useMemo(() => comingAtAGlance(s.sabhas, s.meetings, dayjs().format('YYYY-MM-DD')), [s.sabhas, s.meetings]);
  const upcomingFirst = useMemo(() => [...s.meetings].sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start)), [s.meetings]);

  return (
    <>
      {glance.length > 0 && (
        <>
          <Typography.Title level={3} style={{ marginTop: 0 }}>Coming up</Typography.Title>
          <div data-testid="glance" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 24 }}>
            {glance.map((g) => (
              <Card key={g.sabha.id} size="small" title={g.sabha.name} extra={<span className="muted">{dayjs(g.meeting.date).format('ddd D MMM')}, {clock12(g.meeting.start)}</span>}>
                <div>{g.items} program {g.items === 1 ? 'item' : 'items'}{g.items ? `, ${g.minutes} min, ends ${clock12(g.ends)}` : ''}</div>
                <div>{g.slides} {g.slides === 1 ? 'slide' : 'slides'}, {g.donors} {g.donors === 1 ? 'donor' : 'donors'}</div>
                {g.notes.map((n) => <div key={n} className="muted">{n}</div>)}
                <Button style={{ marginTop: 8 }} onClick={() => go(`/meeting/${g.meeting.id}`)}>Open</Button>
              </Card>
            ))}
          </div>
        </>
      )}
      <Typography.Title level={3} style={{ marginTop: 0 }}>Sabhas and meetings</Typography.Title>
      <p className="muted">Each sabha has a usual time: fixed (the same day and time every week), variable (chosen for each meeting) or an event raised when needed. Every meeting still stands on its own, so any one can start at a different time.</p>
      <Button icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => setEditing({})}>New sabha</Button>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {s.sabhas.map((sb) => (
          <Card key={sb.id} size="small" title={sb.name} extra={<Tag>{KIND_LABEL[sb.kind]}</Tag>}>
            <div className="muted" style={{ minHeight: 40 }}>{sb.usualPattern}</div>
            <Space style={{ marginTop: 8 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setTarget(sb)}>New meeting</Button>
              <Button icon={<EditOutlined />} onClick={() => setEditing({ sabha: sb })} aria-label={`Change ${sb.name}`}>Change</Button>
            </Space>
          </Card>
        ))}
      </div>

      <Typography.Title level={4} style={{ marginTop: 28 }}>Meetings</Typography.Title>
      {upcomingFirst.length === 0 ? (
        <Empty description="No meetings yet. Start one from a sabha above." />
      ) : upcomingFirst.map((m) => (
        <div className="card-row" key={m.id}>
          <div className="grow">
            <b>{sabhaName(m.sabhaId)}</b>
            <span className="muted">{dayjs(m.date).format('ddd D MMM YYYY')}, {clock12(m.start)}{m.venue ? `, ${m.venue}` : ''}</span>
          </div>
          <Space>
            <Button onClick={() => go(`/meeting/${m.id}`)}>Open</Button>
            <Popconfirm title="Delete this meeting?" description="Its program and announcements are removed too." okText="Delete" onConfirm={() => actions.deleteMeeting(m.id)}>
              <Button danger>Delete</Button>
            </Popconfirm>
          </Space>
        </div>
      ))}

      {editing && <SabhaForm key={editing.sabha?.id ?? 'new'} sabha={editing.sabha} onClose={() => setEditing(null)} />}
      {target && <NewMeeting key={target.id} sabha={target} onClose={() => setTarget(null)} />}
    </>
  );
}

export function NewMeeting({ sabha, onClose, date: firstDate }: { sabha: Sabha; onClose: () => void; date?: string }) {
  const s = useAppState();
  const previous = useMemo(() => [...s.meetings].filter((m) => m.sabhaId === sabha.id).sort((a, b) => b.date.localeCompare(a.date))[0], [s.meetings, sabha.id]);
  const usual = useMemo(() => suggestedDates(sabha, s.meetings, dayjs().format('YYYY-MM-DD')), [sabha, s.meetings]); // the next dates of the sabha's weekly rhythm
  const [date, setDate] = useState<Dayjs | null>(firstDate ? dayjs(firstDate) : usual.length ? dayjs(usual[0]) : dayjs());
  const [start, setStart] = useState<Dayjs | null>(dayjs(`2000-01-01T${sabha.defaultStart}`));
  const [venue, setVenue] = useState(sabha.defaultVenue);
  const [copy, setCopy] = useState(true);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const templates = useMemo(() => visibleTemplates(s.templates, s.workingOrg), [s.templates, s.workingOrg]);
  const [error, setError] = useState('');

  const create = () => {
    if (!date || !start) { setError('Pick a date and a start time'); return; }
    const m = actions.createMeeting(sabha, date.format('YYYY-MM-DD'), start.format('HH:mm'), venue.trim(), previous && copy ? previous : undefined, templateId);
    onClose();
    go(`/meeting/${m.id}`);
  };

  return (
    <Modal open title={`New ${sabha.name} meeting`} okText="Create meeting" onOk={create} onCancel={onClose} destroyOnHidden>
      <Form layout="vertical">
        <Form.Item label="Date" validateStatus={error && !date ? 'error' : undefined}>
          {usual.length > 0 && (
            <Space size={[6, 6]} wrap style={{ marginBottom: 8 }}>
              {usual.map((d) => (
                <Button key={d} size="small" type={date?.format('YYYY-MM-DD') === d ? 'primary' : 'default'} onClick={() => { setDate(dayjs(d)); setError(''); }}>{dayjs(d).format('ddd D MMM')}</Button>
              ))}
            </Space>
          )}
          <DatePicker value={date} onChange={(d) => { setDate(d); setError(''); }} format="DD-MM-YYYY" style={{ width: '100%' }} allowClear={false} />
        </Form.Item>
        <Form.Item label="Start time" extra={sabha.kind === 'flexible' ? 'This sabha has no fixed time: choose it for this meeting.' : start && start.format('HH:mm') !== sabha.defaultStart ? `The usual time is ${clock12(sabha.defaultStart)}. Only this meeting starts at a different time.` : undefined}>
          <TimePicker value={start} onChange={(t) => { setStart(t); setError(''); }} format="HH:mm" minuteStep={5} style={{ width: '100%' }} allowClear={false} needConfirm={false} />
        </Form.Item>
        <Form.Item label="Venue"><Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Where it will be held" /></Form.Item>
        {previous ? (
          <Checkbox checked={copy} onChange={(e) => setCopy(e.target.checked)}>
            Start from the last meeting ({dayjs(previous.date).format('D MMM')}): same program and announcements, without posters and donors
          </Checkbox>
        ) : <div className="muted">This sabha has no earlier meeting, so it starts from its usual run.</div>}
        {!(previous && copy) && (
          <Form.Item label="Slide template" style={{ marginTop: 12 }}>
            <Select
              value={templateId} onChange={setTemplateId} aria-label="Slide template"
              options={[{ value: DEFAULT_TEMPLATE_ID, label: DEFAULT_TEMPLATE_NAME }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
            />
          </Form.Item>
        )}
        {error ? <div style={{ color: '#d64545', marginTop: 8 }}>{error}</div> : null}
      </Form>
    </Modal>
  );
}


/** Makes a new sabha, or changes how an existing one is run: fixed weekly time, variable time, or an event. */
export function SabhaForm({ sabha, onClose }: { sabha?: Sabha; onClose: () => void }) {
  const [v, setV] = useState<SabhaInput>(sabha ? inputOf(sabha) : { name: '', kind: 'weekly', day: 0, start: '17:00', venue: '', minutes: 120 });
  const [error, setError] = useState('');
  const set = (p: Partial<SabhaInput>) => { setV((x) => ({ ...x, ...p })); setError(''); };
  const save = () => {
    const r = sabha ? actions.updateSabha(sabha.id, v) : actions.addSabha(v);
    if (!r.ok) { setError(r.error); return; }
    onClose();
  };
  return (
    <Modal open title={sabha ? `Change ${sabha.name}` : 'New sabha'} okText="Save" onOk={save} onCancel={onClose} destroyOnHidden>
      <Form layout="vertical" onFinish={save}>
        <Form.Item label="Name" validateStatus={error && !v.name.trim() ? 'error' : undefined}>
          <Input autoFocus value={v.name} onChange={(e) => set({ name: e.target.value })} onPressEnter={save} placeholder="For example Ravi Sabha" />
        </Form.Item>
        <Form.Item label="Timing">
          <Radio.Group value={v.kind} onChange={(e) => set({ kind: e.target.value })} optionType="button"
            options={[{ value: 'weekly', label: 'Fixed' }, { value: 'flexible', label: 'Variable' }, { value: 'event', label: 'Event' }]} />
          <div className="muted" style={{ marginTop: 6 }}>
            {v.kind === 'weekly' ? 'The same day and time every week. The Calendar suggests these dates, and any one meeting can still start at another time.'
              : v.kind === 'flexible' ? 'No usual slot. The time is chosen for each meeting.'
              : 'Held only when needed. It has a usual time, but no weekly dates.'}
          </div>
        </Form.Item>
        {v.kind === 'weekly' && (
          <Form.Item label="Day"><Select value={v.day} onChange={(d) => set({ day: d })} options={DAYS.map((d, i) => ({ value: i, label: d }))} /></Form.Item>
        )}
        <Form.Item label={v.kind === 'flexible' ? 'Start time offered first' : 'Usual start time'}>
          <TimePicker value={dayjs(`2000-01-01T${v.start}`)} onChange={(t) => t && set({ start: t.format('HH:mm') })} format="HH:mm" minuteStep={5} style={{ width: '100%' }} allowClear={false} needConfirm={false} />
        </Form.Item>
        <Space size="large" align="start">
          <Form.Item label="Usual length (minutes)"><InputNumber min={5} max={600} step={5} value={v.minutes} onChange={(m) => set({ minutes: m ?? 0 })} /></Form.Item>
          <Form.Item label="Usual venue"><Input value={v.venue} onChange={(e) => set({ venue: e.target.value })} placeholder="Optional" /></Form.Item>
        </Space>
        <div className="muted">Shown on the sabha card: <b>{usualText(v)}</b></div>
        {error && <Alert type="error" showIcon message={error} style={{ marginTop: 12 }} />}
      </Form>
    </Modal>
  );
}
