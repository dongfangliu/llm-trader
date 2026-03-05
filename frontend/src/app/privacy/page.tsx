export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '3rem 1.5rem', lineHeight: '1.8' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>隐私政策</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>最后更新：2026年3月</p>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>1. 我们收集的信息</h2>
        <p>我们仅收集以下最少量的信息以提供服务：</p>
        <ul style={{ paddingLeft: '1.5rem', marginTop: '0.5rem' }}>
          <li><strong>设备 ID</strong>：由您的浏览器在本地生成的随机标识符，用于统计每日使用次数和记录订阅状态。我们不收集您的姓名、手机号、邮箱或任何个人身份信息。</li>
          <li><strong>分析历史</strong>：您提交的股票代码和 AI 分析结果会与设备 ID 关联存储，以便您查看历史记录。</li>
          <li><strong>日志</strong>：服务器标准访问日志，用于安全排查，不包含个人信息。</li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>2. 第三方服务</h2>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li><strong>AI 分析</strong>：您的分析请求（包含股票代码和行情数据）会发送至 LLM API 服务商（如 DeepSeek）进行处理。请参阅相应服务商的隐私政策。</li>
          <li><strong>爱发电</strong>：付费订阅通过爱发电平台处理，我们不存储您的支付信息。</li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>3. 数据存储与安全</h2>
        <p>数据存储于香港服务器，我们采取合理的技术措施保护数据安全。我们不会将您的数据出售或共享给第三方。</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>4. Cookie</h2>
        <p>我们仅在 localStorage 中存储设备 ID 和认证 Token，不使用第三方追踪 Cookie。</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>5. 您的权利</h2>
        <p>您可以随时清除浏览器 localStorage 以删除本地存储的设备 ID 和 Token。如需删除服务器端的分析历史记录，请通过下方联系方式联系我们。</p>
      </section>

      <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
        <a href="/" style={{ color: '#2563eb', textDecoration: 'none' }}>← 返回首页</a>
        <span style={{ margin: '0 1rem', color: '#d1d5db' }}>|</span>
        <a href="/terms" style={{ color: '#2563eb', textDecoration: 'none' }}>服务条款</a>
      </div>
    </div>
  );
}
