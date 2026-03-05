'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token && pathname !== '/admin/login') {
      router.replace('/admin/login');
    } else {
      setReady(true);
    }
  }, [pathname, router]);

  if (!ready) return null;
  if (pathname === '/admin/login') return <>{children}</>;

  const navItems = [
    { href: '/admin/dashboard', label: '📊 数据看板' },
    { href: '/admin/users', label: '👤 用户管理' },
    { href: '/admin/devices', label: '📱 设备管理' },
    { href: '/admin/settings', label: '⚙️ 系统设置' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--background)' }}>
      {/* Sidebar */}
      <aside style={{
        width: '200px', flexShrink: 0, background: '#1e293b', color: '#f1f5f9',
        display: 'flex', flexDirection: 'column', padding: '1.5rem 0',
      }}>
        <div style={{ padding: '0 1.25rem 1.5rem', borderBottom: '1px solid #334155' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#f8fafc' }}>⚙️ Admin 后台</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>LLM Trading</div>
        </div>
        <nav style={{ padding: '1rem 0', flexGrow: 1 }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'block', padding: '0.75rem 1.25rem', color: '#cbd5e1',
                textDecoration: 'none', fontSize: '0.9rem',
                background: pathname === item.href ? '#334155' : 'transparent',
                borderLeft: pathname === item.href ? '3px solid #3b82f6' : '3px solid transparent',
                transition: 'background 0.15s',
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #334155' }}>
          <button
            onClick={() => { localStorage.removeItem('adminToken'); router.replace('/admin/login'); }}
            style={{
              width: '100%', padding: '0.5rem', background: '#334155', color: '#94a3b8',
              border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem',
            }}
          >
            退出登录
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto', padding: '2rem' }}>
        {children}
      </main>
    </div>
  );
}
