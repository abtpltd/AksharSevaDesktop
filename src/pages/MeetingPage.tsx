import { Button, DatePicker, Input, Result, Tabs, TimePicker, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { actions, useAppState } from '../data/store';
import { go } from '../ui/router';
import ProgramTab from './ProgramTab';
import AnnouncementsTab from './AnnouncementsTab';

export default function MeetingPage({ meetingId }: { meetingId: string }) {
  const s = useAppState();
  const m = s.meetings.find((x) => x.id === meetingId);
  const sabha = s.sabhas.find((x) => x.id === m?.sabhaId);
  if (!m || !sabha) {
    return <Result status="404" title="Meeting not found" extra={<Button type="primary" onClick={() => go('/')}>Back to meetings</Button>} />;
  }
  return (
    <>
      <Button type="link" icon={<ArrowLeftOutlined />} style={{ padding: 0 }} onClick={() => go('/')}>All meetings</Button>
      <Typography.Title level={3} style={{ marginTop: 4 }}>{sabha.name}</Typography.Title>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <DatePicker value={dayjs(m.date)} format="DD-MM-YYYY" allowClear={false} onChange={(d) => d && actions.updateMeeting(m.id, { date: d.format('YYYY-MM-DD') })} />
        <TimePicker value={dayjs(`2000-01-01T${m.start}`)} format="HH:mm" minuteStep={5} allowClear={false} needConfirm={false} onChange={(t) => t && actions.updateMeeting(m.id, { start: t.format('HH:mm') })} />
        <Input style={{ width: 220 }} placeholder="Venue" value={m.venue} onChange={(e) => actions.updateMeeting(m.id, { venue: e.target.value })} />
        <Input style={{ width: 220 }} placeholder="MC" value={m.mc} onChange={(e) => actions.updateMeeting(m.id, { mc: e.target.value })} />
      </div>
      <Tabs
        defaultActiveKey="program"
        items={[
          { key: 'program', label: 'Program', children: <ProgramTab meeting={m} sabhaName={sabha.name} /> },
          { key: 'ann', label: 'Announcements and slides', children: <AnnouncementsTab meeting={m} sabhaName={sabha.name} /> },
        ]}
      />
    </>
  );
}
