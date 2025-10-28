/**
 * 后端状态检查组件
 * 如果后端API无法连接，显示友好的错误提示
 */

import React, { useEffect, useState } from 'react';
import { Result, Button, Spin, Alert } from 'antd';
import { ApiOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import axios from 'axios';

interface BackendStatusProps {
  children: React.ReactNode;
}

const BackendStatus: React.FC<BackendStatusProps> = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [error, setError] = useState<string>('');

  const checkBackend = async () => {
    setChecking(true);
    setError('');

    try {
      // 使用相对路径，让Vite代理处理（开发模式）或直接访问（生产模式）
      const response = await axios.get('/health', {
        timeout: 3000,
        // 开发模式使用空字符串，让Vite代理处理；生产模式使用origin
        baseURL: import.meta.env.DEV ? '' : window.location.origin
      });

      if (response.status === 200) {
        setBackendAvailable(true);
      } else {
        setBackendAvailable(false);
        setError(`API返回异常状态码: ${response.status}`);
      }
    } catch (err: any) {
      setBackendAvailable(false);

      if (err.code === 'ECONNREFUSED' || err.message.includes('Network Error')) {
        setError('无法连接到后端API服务器 (连接被拒绝)');
      } else if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        setError('连接超时 - 后端服务器可能未响应');
      } else {
        setError(err.message || '未知错误');
      }
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkBackend();
  }, []);

  // 正在检查
  if (checking) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#0a0e27'
      }}>
        <Spin size="large" tip={<span style={{ color: '#e5e7eb' }}>正在连接后端服务...</span>} />
      </div>
    );
  }

  // 后端不可用
  if (!backendAvailable) {
    return (
      <div style={{
        padding: '48px',
        background: '#0a0e27',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ maxWidth: '600px', width: '100%' }}>
          <Result
            status="error"
            icon={<ApiOutlined style={{ color: '#ff4d4f' }} />}
            title={<span style={{ color: '#e5e7eb', fontSize: '24px' }}>后端服务未启动</span>}
            subTitle={
              <div style={{ color: '#9ca3af', fontSize: '16px' }}>
                <p style={{ marginBottom: '16px' }}>
                  前端无法连接到后端API服务器，这就是黑屏的原因。
                </p>
                <Alert
                  icon={<WarningOutlined />}
                  message="错误详情"
                  description={error}
                  type="error"
                  showIcon
                  style={{ marginBottom: '24px', textAlign: 'left' }}
                />
              </div>
            }
            extra={[
              <div key="solution" style={{
                background: '#0f1419',
                border: '1px solid #1f2937',
                borderRadius: '8px',
                padding: '24px',
                textAlign: 'left',
                color: '#e5e7eb',
                marginBottom: '24px'
              }}>
                <h3 style={{ color: '#60a5fa', marginBottom: '16px' }}>解决方案：</h3>

                <div style={{ marginBottom: '16px' }}>
                  <strong style={{ color: '#22c55e' }}>方法1：启动完整的Web界面（推荐）</strong>
                  <pre style={{
                    background: '#1a1f2e',
                    padding: '12px',
                    borderRadius: '4px',
                    marginTop: '8px',
                    overflow: 'auto'
                  }}>
                    python start_web_v2.py
                  </pre>
                  <p style={{ color: '#9ca3af', fontSize: '14px', marginTop: '8px' }}>
                    然后在浏览器访问: <a href="http://localhost:8000" style={{ color: '#60a5fa' }}>http://localhost:8000</a>
                  </p>
                </div>

                <div>
                  <strong style={{ color: '#60a5fa' }}>方法2：分别启动前后端（开发模式）</strong>
                  <div style={{ marginTop: '8px' }}>
                    <p style={{ fontSize: '14px', color: '#9ca3af' }}>终端1 - 启动后端:</p>
                    <pre style={{
                      background: '#1a1f2e',
                      padding: '12px',
                      borderRadius: '4px',
                      marginTop: '4px',
                      overflow: 'auto'
                    }}>
                      cd web_v2/server{'\n'}python main.py
                    </pre>
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <p style={{ fontSize: '14px', color: '#9ca3af' }}>终端2 - 启动前端:</p>
                    <pre style={{
                      background: '#1a1f2e',
                      padding: '12px',
                      borderRadius: '4px',
                      marginTop: '4px',
                      overflow: 'auto'
                    }}>
                      cd web_v2/frontend{'\n'}npm run dev
                    </pre>
                  </div>
                </div>
              </div>,
              <Button
                key="retry"
                type="primary"
                size="large"
                icon={<ReloadOutlined />}
                onClick={checkBackend}
              >
                重新检测连接
              </Button>
            ]}
          />
        </div>
      </div>
    );
  }

  // 后端可用，显示正常内容
  return <>{children}</>;
};

export default BackendStatus;
