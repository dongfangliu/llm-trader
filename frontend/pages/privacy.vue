<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '~/lib/api'
import { DEFAULT_APP_NAME } from '~/constants/app'
const appName = ref(DEFAULT_APP_NAME)
onMounted(async () => {
  try {
    const res = await api.get('/api/config')
    if (res.data?.app_name) appName.value = res.data.app_name
  } catch {}
})
</script>

<template>
  <div style="min-height: 100dvh; background: #f2f2f7;">
    <!-- Header -->
    <header style="display: flex; align-items: center; padding: 0 16px; height: 52px; position: sticky; top: 0; z-index: 100; background: rgba(249,249,249,0.94); backdrop-filter: blur(20px); border-bottom: 0.5px solid rgba(0,0,0,0.12);">
      <NuxtLink to="/" style="font-size: 15px; color: #007aff; text-decoration: none; padding: 8px 4px; margin-right: 8px;">← 返回</NuxtLink>
      <span style="font-size: 17px; font-weight: 600; color: #1c1c1e; flex: 1; text-align: center; margin-right: 40px;">隐私政策</span>
    </header>

    <!-- Content -->
    <div style="max-width: 680px; margin: 0 auto; padding: 24px 20px 60px;">

      <!-- Section 1: 收集的数据 -->
      <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 12px;">
        <h2 style="font-size: 17px; font-weight: 700; color: #1c1c1e; margin: 0 0 14px;">一、收集的数据</h2>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0 0 12px;">
          我们仅收集提供服务所必需的最少数据，<strong>不收集任何个人身份信息（PII）</strong>。具体包括：
        </p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div v-for="(item, i) in [
            { title: '设备标识（device_id）', desc: '浏览器生成的随机匿名ID，用于配额统计，不与任何真实身份绑定。' },
            { title: '分析历史', desc: '您提交的股票代码及对应AI分析结果，用于记录使用配额和提供历史查询。' },
            { title: '服务器日志', desc: '请求时间、接口路径、响应状态等标准服务器日志，用于运维监控，定期清理。' },
          ]" :key="i" style="display: flex; gap: 10px; align-items: flex-start;">
            <span style="width: 20px; height: 20px; border-radius: 50%; background: #f2f2f7; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #3c3c43; flex-shrink: 0; margin-top: 1px;">{{ i + 1 }}</span>
            <p style="font-size: 14px; color: #3c3c43; line-height: 1.65; margin: 0;"><strong>{{ item.title }}</strong>：{{ item.desc }}</p>
          </div>
        </div>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 14px 0 0;">
          我们不收集您的姓名、手机号、身份证号、真实邮箱地址（除非您主动注册时提供）或位置信息。注册邮箱仅用于账号验证，不用于营销。
        </p>
      </div>

      <!-- Section 2: 第三方服务 -->
      <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 12px;">
        <h2 style="font-size: 17px; font-weight: 700; color: #1c1c1e; margin: 0 0 14px;">二、第三方服务</h2>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0 0 14px;">
          本平台依赖以下第三方服务，您提交的分析请求内容可能传输至这些服务提供商：
        </p>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="background: #f2f2f7; border-radius: 12px; padding: 14px 16px;">
            <p style="font-size: 14px; font-weight: 600; color: #1c1c1e; margin: 0 0 4px;">LLM API（OpenAI / DeepSeek 等）</p>
            <p style="font-size: 13px; color: #3c3c43; line-height: 1.6; margin: 0;">K线数据与分析请求会发送至AI模型提供商的API。这些提供商有各自独立的隐私政策，我们不控制其数据处理方式。我们不会向这些API发送任何可识别您身份的信息。</p>
          </div>
          <div style="background: #f2f2f7; border-radius: 12px; padding: 14px 16px;">
            <p style="font-size: 14px; font-weight: 600; color: #1c1c1e; margin: 0 0 4px;">爱发电（afdian.com）支付平台</p>
            <p style="font-size: 13px; color: #3c3c43; line-height: 1.6; margin: 0;">订阅支付通过爱发电处理。支付相关信息（如交易ID）由爱发电收集和管理，适用爱发电的隐私政策。我们仅接收用于核验订阅状态的必要信息。</p>
          </div>
        </div>
      </div>

      <!-- Section 3: 存储与安全 -->
      <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 12px;">
        <h2 style="font-size: 17px; font-weight: 700; color: #1c1c1e; margin: 0 0 14px;">三、存储与安全</h2>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0 0 12px;">
          本平台服务器部署于<strong>香港数据中心</strong>，数据存储在香港境内。
        </p>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0 0 12px;">
          我们采用以下合理技术措施保护您的数据：
        </p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div v-for="(item, i) in [
            'HTTPS 加密传输，所有客户端与服务器之间的通信均经过 TLS 加密。',
            '数据库访问权限严格控制，仅限必要的后端服务访问。',
            '管理接口需要独立的管理员令牌进行身份验证。',
          ]" :key="i" style="display: flex; gap: 10px; align-items: flex-start;">
            <span style="width: 20px; height: 20px; border-radius: 50%; background: #f2f2f7; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #3c3c43; flex-shrink: 0; margin-top: 1px;">{{ i + 1 }}</span>
            <p style="font-size: 14px; color: #3c3c43; line-height: 1.65; margin: 0;">{{ item }}</p>
          </div>
        </div>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 14px 0 0;">
          互联网上不存在绝对安全的传输或存储方式，我们无法保证数据的绝对安全，但将持续努力采用合理的行业标准保护措施。
        </p>
      </div>

      <!-- Section 4: Cookies -->
      <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 12px;">
        <h2 style="font-size: 17px; font-weight: 700; color: #1c1c1e; margin: 0 0 14px;">四、Cookies 与本地存储</h2>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0 0 12px;">
          本平台<strong>不使用任何第三方追踪 Cookie</strong>，不接入广告网络，不使用 Google Analytics 等外部分析服务。
        </p>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0 0 12px;">
          我们仅使用浏览器的 <code style="background: #f2f2f7; border-radius: 4px; padding: 1px 5px; font-size: 13px;">localStorage</code> 在您的设备本地存储以下信息：
        </p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div v-for="(item, i) in [
            { k: 'device_id', v: '匿名设备标识，用于配额统计。' },
            { k: 'auth_token', v: '登录后的JWT令牌，用于保持登录状态。' },
            { k: 'admin_token', v: '管理员令牌（仅管理员使用）。' },
          ]" :key="i" style="display: flex; gap: 10px; align-items: flex-start;">
            <span style="width: 20px; height: 20px; border-radius: 50%; background: #f2f2f7; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #3c3c43; flex-shrink: 0; margin-top: 1px;">{{ i + 1 }}</span>
            <p style="font-size: 14px; color: #3c3c43; line-height: 1.65; margin: 0;"><code style="background: #f2f2f7; border-radius: 4px; padding: 1px 5px; font-size: 13px;">{{ item.k }}</code>：{{ item.v }}</p>
          </div>
        </div>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 14px 0 0;">
          这些数据仅存储在您的设备上，不会被自动发送至第三方。
        </p>
      </div>

      <!-- Section 5: 用户权利 -->
      <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 12px;">
        <h2 style="font-size: 17px; font-weight: 700; color: #1c1c1e; margin: 0 0 14px;">五、您的权利</h2>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0 0 14px;">
          您可以随时对自己的数据行使以下权利：
        </p>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="background: #f2f2f7; border-radius: 12px; padding: 14px 16px;">
            <p style="font-size: 14px; font-weight: 600; color: #1c1c1e; margin: 0 0 4px;">删除本地数据</p>
            <p style="font-size: 13px; color: #3c3c43; line-height: 1.6; margin: 0;">在浏览器的开发者工具中清除 <code style="background: white; border-radius: 4px; padding: 1px 5px; font-size: 12px;">localStorage</code>，即可删除设备上存储的所有本地数据，包括 device_id 和登录状态。</p>
          </div>
          <div style="background: #f2f2f7; border-radius: 12px; padding: 14px 16px;">
            <p style="font-size: 14px; font-weight: 600; color: #1c1c1e; margin: 0 0 4px;">删除服务器数据</p>
            <p style="font-size: 13px; color: #3c3c43; line-height: 1.6; margin: 0;">如需删除服务器端与您相关的分析历史或账号数据，请通过爱发电私信或在平台"关于"页面提供的联系方式联系我们，我们将在合理时间内处理您的请求。</p>
          </div>
          <div style="background: #f2f2f7; border-radius: 12px; padding: 14px 16px;">
            <p style="font-size: 14px; font-weight: 600; color: #1c1c1e; margin: 0 0 4px;">访问与更正</p>
            <p style="font-size: 13px; color: #3c3c43; line-height: 1.6; margin: 0;">注册用户可在账号设置页面查看个人信息。如发现错误，可联系我们进行更正。</p>
          </div>
        </div>
      </div>

      <!-- Footer links -->
      <div style="text-align: center; padding-top: 16px; display: flex; justify-content: center; gap: 24px;">
        <NuxtLink to="/" style="font-size: 14px; color: #007aff; text-decoration: none;">返回首页</NuxtLink>
        <NuxtLink to="/terms" style="font-size: 14px; color: #007aff; text-decoration: none;">服务条款</NuxtLink>
      </div>
      <p style="text-align: center; font-size: 12px; color: #aeaeb2; margin-top: 12px;">最后更新：2025年3月</p>
    </div>
  </div>
</template>
