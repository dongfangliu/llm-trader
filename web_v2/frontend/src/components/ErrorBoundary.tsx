/**
 * 错误边界组件 - 捕获子组件渲染错误
 */

import React, { Component, ReactNode } from 'react';
import { Result, Button } from 'antd';
import { WarningOutlined } from '@ant-design/icons';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Component error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '48px',
          background: '#0a0e27',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Result
            status="warning"
            icon={<WarningOutlined style={{ color: '#faad14' }} />}
            title={<span style={{ color: '#e5e7eb' }}>组件加载失败</span>}
            subTitle={
              <div style={{ color: '#9ca3af' }}>
                <p>{this.state.error?.message || '未知错误'}</p>
                <p style={{ marginTop: '16px', fontSize: '14px' }}>
                  请检查浏览器控制台获取详细信息
                </p>
              </div>
            }
            extra={
              <Button
                type="primary"
                onClick={() => window.location.reload()}
              >
                刷新页面
              </Button>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
