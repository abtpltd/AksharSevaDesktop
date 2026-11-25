import { Component, type ReactNode } from 'react';
import { Alert, Button } from 'antd';
import { go } from './router';

/** If one page fails to draw, the person still sees the menu and a plain message instead of a blank window, and can go to the connection page. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { failed: boolean; key: string }> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps(p: { resetKey: string }, s: { failed: boolean; key: string }) {
    return p.resetKey !== s.key ? { failed: false, key: p.resetKey } : null; // going to another page tries again
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Alert type="error" showIcon title="This page could not be shown"
        description="Something in the data from the server could not be shown. Your other pages still work. Please tell the administrator which page it was."
        action={<Button size="small" onClick={() => go('/')}>Home</Button>} />
    );
  }
}
