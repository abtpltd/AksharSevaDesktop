import { useMemo, useState } from 'react';
import { Button, DatePicker, Dropdown, Input, Segmented, Select, Space, Switch, Typography } from 'antd';
import { LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAppState } from '../data/store';
import { addDays, calendarEntries, filterEntries, monthGrid, weekDays, type CalendarEntry } from '../core/calendar';
import { clock12 } from '../core/time';
import type { Sabha } from '../core/types';
import { go } from '../ui/router';
import { NewMeeting } from './HomePage';

type View = 'month' | 'week' | 'agenda';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// one colour per sabha, in the order the sabhas are listed: [text and border, light fill]
const COLOURS: [string, string][] = [['#6b3fa0', '#efe6f8'], ['#0f766e', '#d9f2ee'], ['#b45309', '#fdebd3'], ['#1d5fa8', '#dcebfa'], ['#a1245b', '#f9e0ec'], ['#3f6212', '#e5f1d3'], ['#9f1d1d', '#fbe1e1'], ['#475569', '#e6eaf0']];
const iso = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');
const nice = (d: string) => dayjs(d).format('ddd D MMM YYYY');

export default function CalendarPage() {
  const s = useAppState();
  const today = iso(dayjs());
  const [view, setView] = useState<View>('month');
  const [cur, setCur] = useState(today);
  const [sel, setSel] = useState(today);
  const [off, setOff] = useState<string[]>([]);
  const [suggested, setSuggested] = useState(true);
  const [when, setWhen] = useState<'all' | 'upcoming' | 'past'>('all');
  const [text, setText] = useState('');
  const [making, setMaking] = useState<{ sabha: Sabha; date: string } | null>(null);

  const colour = (id: string) => COLOURS[Math.max(0, s.sabhas.findIndex((x) => x.id === id)) % COLOURS.length];
  const nameOf = (id: string) => s.sabhas.find((x) => x.id === id)?.name ?? 'Sabha';
  const on = useMemo(() => new Set(s.sabhas.filter((x) => !off.includes(x.id)).map((x) => x.id)), [s.sabhas, off]);
  const filtered = !!(off.length || !suggested || when !== 'all' || text.trim());

  const [from, to] = useMemo((): [string, string] => {
    if (view === 'month') { const g = monthGrid(+cur.slice(0, 4), +cur.slice(5, 7)); return [g[0][0], g[g.length - 1][6]]; }
    if (view === 'week') { const w = weekDays(cur); return [w[0], w[6]]; }
    return [today, addDays(today, 120)];
  }, [view, cur, today]);
  const entries = useMemo(
    () => filterEntries(calendarEntries(s.sabhas, s.meetings, from, to, today), s.sabhas, s.meetings, { sabhaIds: on, suggested, when, text }, today),
    [s.sabhas, s.meetings, from, to, today, on, suggested, when, text],
  );
  const byDay = useMemo(() => { const m = new Map<string, CalendarEntry[]>(); for (const e of entries) m.set(e.date, [...(m.get(e.date) ?? []), e]); return m; }, [entries]);
  const dayEntries = byDay.get(sel) ?? (view === 'agenda' ? calendarEntries(s.sabhas, s.meetings, sel, sel, today).filter((e) => on.has(e.sabhaId)) : []);
  const monthShown = cur.slice(0, 7);

  const step = (n: number) => {
    if (view === 'month') { const d = dayjs(`${monthShown}-01`).add(n, 'month'); setCur(iso(d)); }
    else if (view === 'week') setCur(addDays(cur, 7 * n));
  };
  const jump = (d: string) => { setCur(d); setSel(d); };
  const title = view === 'month' ? dayjs(`${monthShown}-01`).format('MMMM YYYY')
    : view === 'week' ? `${dayjs(from).format('D MMM')} to ${dayjs(to).format('D MMM YYYY')}`
    : 'Coming up';

  const chip = (e: CalendarEntry, i: number) => {
    const [fg, bg] = colour(e.sabhaId);
    return (
      <div key={`${e.meetingId ?? 's'}${i}`} className="cal-ev" title={`${nameOf(e.sabhaId)}, ${clock12(e.start)}${e.meetingId ? '' : ', no meeting yet'}`}
        style={e.meetingId ? { background: bg, color: fg } : { border: `1px dashed ${fg}`, color: fg }}>
        {clock12(e.start)} {nameOf(e.sabhaId)}
      </div>
    );
  };
  const cell = (d: string, wk: boolean) => (
    <div key={d} role="button" tabIndex={0} aria-label={nice(d)} className={`cal-cell${wk ? ' wk' : ''}${d.slice(0, 7) !== monthShown && view === 'month' ? ' out' : ''}${d === sel ? ' sel' : ''}`}
      onClick={() => setSel(d)} onKeyDown={(k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); setSel(d); } }}>
      <span className={`cal-dn${d === today ? ' today' : ''}`}>{+d.slice(8)}</span>
      {(byDay.get(d) ?? []).map(chip)}
    </div>
  );
  const head = DAYS.map((x) => <div key={x} className="cal-dh">{x}</div>);

  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>Calendar</Typography.Title>
      <div className="cal-bar">
        <Space.Compact>
          <Button icon={<LeftOutlined />} aria-label="Previous" disabled={view === 'agenda'} onClick={() => step(-1)} />
          <Button icon={<RightOutlined />} aria-label="Next" disabled={view === 'agenda'} onClick={() => step(1)} />
        </Space.Compact>
        <b className="cal-title">{title}</b>
        <Button onClick={() => jump(today)}>Today</Button>
        <DatePicker value={dayjs(sel)} allowClear={false} format="DD-MM-YYYY" onChange={(d) => d && jump(iso(d))} aria-label="Go to date" />
        <Segmented<View> value={view} onChange={setView} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'agenda', label: 'Agenda' }]} />
        <Dropdown trigger={['click']} menu={{ items: s.sabhas.map((x) => ({ key: x.id, label: x.name })), onClick: ({ key }) => { const sb = s.sabhas.find((x) => x.id === key); if (sb) setMaking({ sabha: sb, date: sel }); } }}>
          <Button type="primary" icon={<PlusOutlined />}>New meeting</Button>
        </Dropdown>
      </div>

      <div className="cal-filters" aria-label="Filters">
        {s.sabhas.map((x) => {
          const [fg, bg] = colour(x.id), isOn = on.has(x.id);
          return (
            <button key={x.id} type="button" aria-pressed={isOn} className="cal-chip" onClick={() => setOff(isOn ? [...off, x.id] : off.filter((o) => o !== x.id))}
              style={isOn ? { background: bg, color: fg, borderColor: fg } : { opacity: 0.5 }}>
              <i style={{ background: fg }} />{x.name}
            </button>
          );
        })}
        <span className="cal-sw"><Switch size="small" checked={suggested} onChange={setSuggested} aria-label="Show suggested Sundays" /> Suggested Sundays</span>
        <Select<'all' | 'upcoming' | 'past'> size="small" value={when} onChange={setWhen} style={{ width: 130 }} aria-label="When"
          options={[{ value: 'all', label: 'All dates' }, { value: 'upcoming', label: 'Upcoming only' }, { value: 'past', label: 'Past only' }]} />
        <Input size="small" allowClear value={text} onChange={(e) => setText(e.target.value)} placeholder="Search venue, MC or sabha" style={{ width: 210 }} aria-label="Search" />
        {filtered && <Button size="small" type="link" onClick={() => { setOff([]); setSuggested(true); setWhen('all'); setText(''); }}>Clear filters</Button>}
      </div>

      {view === 'month' && <div className="cal-grid">{head}{monthGrid(+monthShown.slice(0, 4), +monthShown.slice(5, 7)).flat().map((d) => cell(d, false))}</div>}
      {view === 'week' && <div className="cal-grid">{head}{weekDays(cur).map((d) => cell(d, true))}</div>}
      {view === 'agenda' && (
        <div className="cal-agenda">
          {entries.length === 0 && <div className="muted" style={{ padding: 12 }}>Nothing coming up with these filters.</div>}
          {entries.map((e, i) => {
            const [fg, bg] = colour(e.sabhaId), m = e.meetingId ? s.meetings.find((x) => x.id === e.meetingId) : undefined;
            return (
              <div key={`${e.date}${e.sabhaId}${i}`} className={`cal-arow${e.date === sel ? ' sel' : ''}`} role="button" tabIndex={0} onClick={() => setSel(e.date)} onKeyDown={(k) => { if (k.key === 'Enter') setSel(e.date); }}>
                <span className="cal-adate">{dayjs(e.date).format('ddd D MMM')}</span>
                <span className="cal-ev" style={m ? { background: bg, color: fg } : { border: `1px dashed ${fg}`, color: fg }}>{nameOf(e.sabhaId)}</span>
                <span className="muted">{clock12(e.start)}{m ? (m.venue ? `, ${m.venue}` : '') : ', no meeting yet'}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Solid means a meeting is made. Dashed is a Sunday the weekly rhythm suggests, with no meeting yet. Click a day to open it.</div>

      <div className="cal-panel" aria-live="polite">
        <b>{nice(sel)}</b>
        {dayEntries.length === 0 && <div className="muted" style={{ marginTop: 6 }}>{filtered ? 'No meetings this day with these filters.' : 'No meetings this day. Use New meeting above to start one.'}</div>}
        {dayEntries.map((e, i) => {
          const m = e.meetingId ? s.meetings.find((x) => x.id === e.meetingId) : undefined, sb = s.sabhas.find((x) => x.id === e.sabhaId);
          return (
            <div key={`${e.sabhaId}${i}`} className="cal-prow">
              <div className="grow">
                <b style={{ fontWeight: 500 }}>{nameOf(e.sabhaId)}</b> <span className="muted">{clock12(e.start)}{m?.venue ? `, ${m.venue}` : ''}</span>
                <div className="muted">{m ? `${m.program.length} program ${m.program.length === 1 ? 'item' : 'items'}, ${m.deck.length} ${m.deck.length === 1 ? 'slide' : 'slides'}, ${m.donors.length} ${m.donors.length === 1 ? 'donor' : 'donors'}` : 'Suggested by the weekly rhythm. No meeting made yet.'}</div>
              </div>
              {m
                ? <Space><Button onClick={() => go(`/meeting/${m.id}`)}>Open</Button><Button onClick={() => go(`/present/${m.id}`)}>Present</Button></Space>
                : sb && <Button type="primary" onClick={() => setMaking({ sabha: sb, date: e.date })}>Make this meeting</Button>}
            </div>
          );
        })}
      </div>
      {making && <NewMeeting key={making.sabha.id + making.date} sabha={making.sabha} date={making.date} onClose={() => setMaking(null)} />}
    </>
  );
}
