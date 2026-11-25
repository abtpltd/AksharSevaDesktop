import { App, Button, Input, InputNumber, Popconfirm, Select, Space, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, CopyOutlined, DeleteOutlined, DownloadOutlined, PlusOutlined, UndoOutlined } from '@ant-design/icons';
import { actions, useAppState } from '../data/store';
import { MEDIA, type Meeting, type ProgramItem } from '../core/types';
import { chainTimes, clock12, fromMinutes, toMinutes, totalMinutes } from '../core/time';
import { templateFor, uid } from '../core/defaults';
import { programAsCsv, programAsText } from '../core/programText';

export default function ProgramTab({ meeting: m, sabhaName }: { meeting: Meeting; sabhaName: string }) {
  const { message } = App.useApp();
  const s = useAppState();
  const sabha = s.sabhas.find((x) => x.id === m.sabhaId);
  const timed = chainTimes(m.start, m.program);
  const total = totalMinutes(m.program);
  const end = fromMinutes(toMinutes(m.start) + total);

  const set = (program: ProgramItem[]) => actions.setProgram(m.id, program);
  const patch = (id: string, p: Partial<ProgramItem>) => set(m.program.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= m.program.length) return;
    const next = [...m.program];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };

  const copyText = async () => {
    try { await navigator.clipboard.writeText(programAsText(sabhaName, m)); message.success('Program copied. Paste it in WhatsApp.'); }
    catch { message.error('Could not copy. Select the times and copy them by hand.'); }
  };
  const downloadCsv = () => {
    const blob = new Blob(['﻿' + programAsCsv(m)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${sabhaName} ${m.date} program.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <>
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Button icon={<CopyOutlined />} onClick={copyText}>Copy as text for WhatsApp</Button>
        <Button icon={<DownloadOutlined />} onClick={downloadCsv}>Download CSV</Button>
        <Button onClick={() => window.print()}>Print</Button>
        <span style={{ flex: 1 }} />
        {sabha && (
          <Popconfirm title="Replace this program with the usual run?" okText="Replace" onConfirm={() => set(templateFor(sabha))}>
            <Button icon={<UndoOutlined />}>Reset to the usual run</Button>
          </Popconfirm>
        )}
      </div>

      <div className="prog-row prog-head"><span>Time</span><span>Program</span><span>Medium</span><span>Presenter</span><span>Minutes</span><span>Remark</span><span /></div>
      {m.program.map((it, i) => (
        <div className="prog-row" key={it.id}>
          <span className="prog-time">{clock12(timed[i].from)} to {clock12(timed[i].to)}</span>
          <Input value={it.item} onChange={(e) => patch(it.id, { item: e.target.value })} placeholder="Program item" />
          <Select value={it.medium} onChange={(v) => patch(it.id, { medium: v })} options={MEDIA.map((x) => ({ value: x, label: x }))} />
          <Input value={it.presenter} onChange={(e) => patch(it.id, { presenter: e.target.value })} placeholder="Presenter" />
          <InputNumber min={0} max={600} value={it.minutes} onChange={(v) => patch(it.id, { minutes: Number(v) || 0 })} style={{ width: '100%' }} />
          <Input value={it.remark} onChange={(e) => patch(it.id, { remark: e.target.value })} placeholder="Remark" />
          <Space size={2} className="no-print">
            <Tooltip title="Move up"><Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} /></Tooltip>
            <Tooltip title="Move down"><Button size="small" icon={<ArrowDownOutlined />} disabled={i === m.program.length - 1} onClick={() => move(i, 1)} /></Tooltip>
            <Tooltip title="Remove"><Button size="small" danger icon={<DeleteOutlined />} onClick={() => set(m.program.filter((x) => x.id !== it.id))} /></Tooltip>
          </Space>
        </div>
      ))}
      <div className="no-print" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button icon={<PlusOutlined />} onClick={() => set([...m.program, { id: uid(), item: '', medium: 'Live', presenter: '', minutes: 10, remark: '' }])}>Add item</Button>
        <span className="muted">{m.program.length} items, {total} minutes, ends {clock12(end)}. Start times follow each other automatically.</span>
      </div>
    </>
  );
}
