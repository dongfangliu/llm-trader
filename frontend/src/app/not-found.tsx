export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: '4rem', fontWeight: 'bold', color: '#d1d5db', marginBottom: '1rem' }}>
        404
      </h1>
      <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
        页面不存在
      </h2>
      <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
        您访问的页面已不存在或已被移除
      </p>
      <a
        href="/"
        style={{
          padding: '0.75rem 1.5rem',
          background: '#2563eb',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '0.5rem',
        }}
      >
        返回首页
      </a>
    </div>
  );
}
