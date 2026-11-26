import { Alert, App as AntApp, Button, ConfigProvider, Layout, Menu, Spin } from 'antd';
import { ApiOutlined, AppstoreOutlined, CalendarOutlined, FormatPainterOutlined, ScheduleOutlined } from '@ant-design/icons';
import { useConnection } from './data/connection';
import { live, useLive } from './data/liveApp';
import { go, useRoute } from './ui/router';
import HomePage from './pages/HomePage';
import CalendarPage from './pages/CalendarPage';
import MeetingPage from './pages/MeetingPage';
import ConnectionPage from './pages/ConnectionPage';
import StandardPage from './pages/StandardPage';
import TemplatesPage from './pages/TemplatesPage';
import PresenterPage from './pages/PresenterPage';
import PresentPage from './pages/PresentPage';
import ErrorBoundary from './ui/ErrorBoundary';
import { useNewVersion } from './ui/newVersion';

export default function App() {
  const route = useRoute();
  const conn = useConnection();
  const lv = useLive();
  const fresh = useNewVersion();
  // everything is read from and saved on the server (D59): nothing can be shown until this computer is connected and has read it
  const ready = conn.status === 'connected' && lv.loaded;
  const meetingId = route.startsWith('/meeting/') ? route.slice('/meeting/'.length) : '';
  const presentId = route.startsWith('/present/') ? route.slice('/present/'.length) : '';
  const presenterId = route.startsWith('/presenter/') ? route.slice('/presenter/'.length) : '';
  const templateId = route.startsWith('/templates/') ? route.slice('/templates/'.length) : '';
  const selected = route === '/calendar' ? 'calendar' : route === '/connection' ? 'connection' : route === '/standard' ? 'standard' : route.startsWith('/templates') ? 'templates' : 'home';

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1370b6', borderRadius: 10, fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif' } }}>
      <AntApp>
        {ready && presentId && <PresentPage meetingId={presentId} />}
        {ready && presenterId && <PresenterPage meetingId={presenterId} />}
        <Layout style={{ minHeight: '100%' }}>
          <Layout.Sider width={220} theme="dark" breakpoint="lg" collapsedWidth={64}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 18, padding: '18px 20px 10px' }}>AksharSeva</div>
            <Menu
              theme="dark" mode="inline" selectedKeys={[selected]}
              items={[
                { key: 'calendar', icon: <ScheduleOutlined />, label: 'Calendar', onClick: () => go('/calendar') },
                { key: 'home', icon: <CalendarOutlined />, label: 'Sabhas and meetings', onClick: () => go('/') },
                { key: 'templates', icon: <AppstoreOutlined />, label: 'Slide templates', onClick: () => go('/templates') },
                { key: 'standard', icon: <FormatPainterOutlined />, label: 'Slide standard', onClick: () => go('/standard') },
                { key: 'connection', icon: <ApiOutlined />, label: 'Connection', onClick: () => go('/connection') },
              ]}
            />
          </Layout.Sider>
          <Layout.Content>
            {fresh && <Alert banner type="info" showIcon message="A new version of AksharSeva is ready." action={<Button size="small" type="primary" onClick={() => window.location.reload()}>Reload</Button>} />}
            {conn.status === 'connected' && lv.problem && <Alert banner type="error" showIcon message={lv.problem} action={<Button size="small" onClick={() => void live.refreshNow()}>Try again</Button>} />}
            {lv.notices.length > 0 && (
              <Alert banner type="warning" showIcon closable={false}
                message={<>{lv.notices.map((n) => <div key={n}>{n}</div>)}</>}
                action={<Button size="small" onClick={() => live.dismissNotices()}>OK</Button>} />
            )}
            <div className="page">
              <ErrorBoundary resetKey={route}>
              {!ready ? (conn.status === 'connected' ? <Spin tip="Reading from the server..."><div style={{ padding: 48 }} /></Spin> : <ConnectionPage />) : route === '/connection' ? <ConnectionPage /> : route === '/calendar' ? <CalendarPage /> : route === '/standard' ? <StandardPage /> : route.startsWith('/templates') ? <TemplatesPage templateId={templateId} /> : meetingId ? <MeetingPage meetingId={meetingId} /> : <HomePage />}
              </ErrorBoundary>
            </div>
          </Layout.Content>
        </Layout>
      </AntApp>
    </ConfigProvider>
  );
}
