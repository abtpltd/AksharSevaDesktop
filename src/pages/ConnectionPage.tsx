import { useState } from 'react';
import { Alert, Button, Form, Input, Popconfirm, Space, Typography } from 'antd';
import { ServerError } from '../data/serverClient';
import { connection, useConnection } from '../data/connection';
import { live, useLive } from '../data/liveApp';

/** Connect to your center's server (D42, D59). Everything is read from and saved on the server; nothing is kept on this computer. */
export default function ConnectionPage() {
  const c = useConnection();
  const [address, setAddress] = useState(c.base);
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const busy = c.status === 'connecting';
  const lv = useLive();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changePw = async () => {
    try { await connection.client()?.changePassword(cur, nw); setCur(''); setNw(''); setPwMsg({ ok: true, text: 'Your password is changed.' }); }
    catch (e) { setPwMsg({ ok: false, text: e instanceof ServerError || e instanceof Error ? e.message : 'Could not change the password' }); }
  };

  const submit = async () => {
    await connection.connect(address, id, password);
    setPassword(''); // the password is used once and not kept
  };

  return (
    <div style={{ maxWidth: 460 }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>Connect to your center's server</Typography.Title>
      <Typography.Paragraph type="secondary">
        Everything is kept on your center's server, not on this computer. Please connect to see and change sabhas, meetings, templates, posters and the slide standard.
      </Typography.Paragraph>

      {c.status === 'connected' ? (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert type="success" showIcon title={`Connected as ${c.user?.name} (${c.user?.role}), ${c.user?.org}`} description={c.base} />
          {lv.problem && <Alert type="error" showIcon title={lv.problem} />}
          {!lv.problem && lv.unsaved && <Alert type="info" showIcon title="Saving your latest changes..." />}
          {!lv.problem && !lv.unsaved && lv.loaded && (
            <Alert type="info" showIcon title="Everything you see is on the server"
              description={`Last read at ${lv.at ? new Date(lv.at).toLocaleTimeString() : 'just now'}. Your changes are sent a moment after you make them, and other people's changes are read every twenty seconds and when you come back to this window.`} />
          )}
          <Button onClick={() => void live.refreshNow()} loading={lv.saving}>Save and read now</Button>
          <Form layout="vertical" onFinish={changePw} requiredMark={false} autoComplete="off">
            <Typography.Text strong>Change my password</Typography.Text>
            <Form.Item label="Current password" style={{ marginTop: 8 }}><Input.Password value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="off" /></Form.Item>
            <Form.Item label="New password" extra="At least 10 characters."><Input.Password value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="off" /></Form.Item>
            {pwMsg && <Alert type={pwMsg.ok ? 'success' : 'error'} showIcon title={pwMsg.text} style={{ marginBottom: 12 }} />}
            <Button htmlType="submit" disabled={!cur || nw.length < 10}>Change password</Button>
          </Form>
          <Popconfirm disabled={!lv.unsaved} title="Some changes have not reached the server yet." description="If you disconnect now they are lost." okText="Disconnect anyway" onConfirm={() => connection.disconnect()}>
            <Button onClick={() => { if (!lv.unsaved) connection.disconnect(); }}>Disconnect</Button>
          </Popconfirm>
        </Space>
      ) : (
        <Form layout="vertical" onFinish={submit} requiredMark={false} autoComplete="off">
          <Form.Item label="Server address" extra="Starts with https://. Plain http works only for this computer.">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="https://nairobi.example.org" inputMode="url" />
          </Form.Item>
          <Form.Item label="Your id">
            <Input value={id} onChange={(e) => setId(e.target.value)} autoComplete="off" />
          </Form.Item>
          <Form.Item label="Password" extra="The password is never saved.">
            <Input.Password value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          </Form.Item>
          {c.status === 'error' && <Alert type="error" showIcon title={c.error} style={{ marginBottom: 16 }} />}
          <Button type="primary" htmlType="submit" loading={busy} disabled={!address.trim() || !id.trim() || !password}>Connect</Button>
        </Form>
      )}
    </div>
  );
}
