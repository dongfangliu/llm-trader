export default function TermsPage() {
  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '3rem 1.5rem', lineHeight: '1.8' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>服务条款</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>最后更新：2026年3月</p>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>1. 免责声明</h2>
        <p>本服务提供的所有分析结果<strong>仅供参考，不构成任何投资建议</strong>。市场存在风险，投资需谨慎。用户应自行判断并承担所有投资决策的后果。</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>2. 使用限制</h2>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li>禁止使用自动化工具批量请求分析接口</li>
          <li>禁止将分析结果用于商业再分发或转售</li>
          <li>禁止尝试绕过使用配额限制</li>
          <li>禁止任何违反适用法律法规的使用行为</li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>3. 订阅与退款</h2>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li>订阅通过爱发电平台按月收费</li>
          <li>订阅费用一经支付，原则上不予退款，除非服务存在严重问题</li>
          <li>我们保留随时调整订阅价格的权利，价格变动将提前通知</li>
          <li>订阅取消后，当前计费周期结束前可继续使用</li>
        </ul>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>4. 服务可用性</h2>
        <p>我们努力保证服务稳定可用，但不对服务中断、数据延迟或 AI 分析结果的准确性作出任何保证。</p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>5. 条款变更</h2>
        <p>我们保留随时修改本条款的权利，修改后的条款将在本页面发布。继续使用本服务即视为接受修改后的条款。</p>
      </section>

      <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
        <a href="/" style={{ color: '#2563eb', textDecoration: 'none' }}>← 返回首页</a>
        <span style={{ margin: '0 1rem', color: '#d1d5db' }}>|</span>
        <a href="/privacy" style={{ color: '#2563eb', textDecoration: 'none' }}>隐私政策</a>
      </div>
    </div>
  );
}
