import { useState } from 'react';
import { Button, Checkbox, Form, Input, Modal, Popconfirm, Radio, Table, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { actions, useAppState } from '../data/store';
import { displayName, KIND_NAMES } from '../core/donors';
import type { DonorContact, DonorKind } from '../core/types';

interface Draft { name: string; kind: DonorKind; company: string; family: boolean }
const blank: Draft = { name: '', kind: 'satsangi', company: '', family: false };

/** The donor directory of the working center: satsangis, companies and others who sponsor prasad, chosen when donors are added to a meeting. */
export default function DonorsPage() {
  const s = useAppState();
  const mine = s.contacts.filter((c) => c.org === s.workingOrg);
  const [editing, setEditing] = useState<{ id?: string; draft: Draft } | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const shown = mine.filter((c) => `${c.name} ${c.company}`.toLowerCase().includes(q.trim().toLowerCase()));

  const save = () => {
    if (!editing) return;
    const r = editing.id ? actions.updateContact(editing.id, editing.draft) : actions.addContact(editing.draft);
    if (!r.ok) { setError(r.error); return; }
    setEditing(null); setError('');
  };
  const open = (c?: DonorContact) => { setError(''); setEditing(c ? { id: c.id, draft: { name: c.name, kind: c.kind, company: c.company, family: c.family } } : { draft: blank }); };
  const set = (p: Partial<Draft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...p } } : e));

  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>Donors</Typography.Title>
      <p className="muted" style={{ maxWidth: 680 }}>
        Satsangis, companies and others who sponsor prasad. Add a name here once, then pick it when adding donors to a meeting. This list belongs to this center only. Someone from another center can be typed in on the meeting as a one-time name.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input allowClear placeholder="Search name or company" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 300 }} aria-label="Search donors" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>Add donor</Button>
      </div>
      <Table<DonorContact> rowKey="id" size="small" dataSource={shown} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: mine.length ? 'No match.' : 'No donors yet. Add the first one.' }}
        columns={[
          { title: 'Shown on slides', render: (_, c) => displayName(c, { family: c.family }) },
          { title: 'Kind', dataIndex: 'kind', width: 110, render: (k: DonorKind) => KIND_NAMES[k] },
          { title: 'Company', dataIndex: 'company' },
          { title: '', width: 90, render: (_, c) => (
            <>
              <Button size="small" type="text" icon={<EditOutlined />} onClick={() => open(c)} aria-label={`Change ${c.name}`} />
              <Popconfirm title="Remove this name?" description="Meetings that already use it keep their text." okText="Remove" onConfirm={() => actions.removeContact(c.id)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Remove ${c.name}`} />
              </Popconfirm>
            </>
          ) },
        ]} />
      <Modal open={!!editing} title={editing?.id ? 'Change donor' : 'Add donor'} okText="Save" onOk={save} onCancel={() => setEditing(null)} destroyOnClose>
        {editing && (
          <Form layout="vertical" onFinish={save}>
            <Form.Item label="Kind">
              <Radio.Group value={editing.draft.kind} onChange={(e) => set({ kind: e.target.value })} options={(Object.keys(KIND_NAMES) as DonorKind[]).map((k) => ({ value: k, label: KIND_NAMES[k] }))} optionType="button" />
            </Form.Item>
            <Form.Item label={editing.draft.kind === 'company' ? 'Company name' : 'Name'} validateStatus={error ? 'error' : undefined} help={error || undefined}>
              <Input autoFocus value={editing.draft.name} onChange={(e) => { set({ name: e.target.value }); setError(''); }} onPressEnter={save} />
            </Form.Item>
            {editing.draft.kind === 'satsangi' && (
              <>
                <Form.Item label="Company (optional)"><Input value={editing.draft.company} onChange={(e) => set({ company: e.target.value })} /></Form.Item>
                <Checkbox checked={editing.draft.family} onChange={(e) => set({ family: e.target.checked })}>Show "& Family" after the name by default</Checkbox>
              </>
            )}
            <div className="muted" style={{ marginTop: 12 }}>On slides: <b>{editing.draft.name.trim() ? displayName(editing.draft, { family: editing.draft.family }) : '…'}</b></div>
          </Form>
        )}
      </Modal>
    </>
  );
}
