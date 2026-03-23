<script setup lang="ts">
const appName = '行情研判'
</script>

<template>
  <div style="min-height: 100dvh; background: #f2f2f7;">
    <!-- Header -->
    <header style="display: flex; align-items: center; padding: 0 16px; height: 52px; position: sticky; top: 0; z-index: 100; background: rgba(249,249,249,0.94); backdrop-filter: blur(20px); border-bottom: 0.5px solid rgba(0,0,0,0.12);">
      <NuxtLink to="/" style="font-size: 15px; color: #007aff; text-decoration: none; padding: 8px 4px; margin-right: 8px;">← 返回</NuxtLink>
      <span style="font-size: 17px; font-weight: 600; color: #1c1c1e; flex: 1; text-align: center; margin-right: 40px;">服务条款</span>
    </header>

    <!-- Content -->
    <div style="max-width: 680px; margin: 0 auto; padding: 24px 20px 60px;">

      <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 12px;">
        <div style="font-size: 11px; font-weight: 700; color: #ff9500; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 8px;">⚠️ 重要声明</div>
        <h2 style="font-size: 20px; font-weight: 800; color: #1c1c1e; margin: 0 0 10px; letter-spacing: -0.3px;">免责声明</h2>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0;">
          本平台提供的所有股票、期货及金融市场分析内容，均由人工智能模型基于公开历史数据生成，<strong>仅供参考，不构成任何投资建议</strong>。市场有风险，投资需谨慎。任何基于本平台内容的投资决策，其风险由用户本人承担，本平台不对任何直接或间接损失负责。
        </p>
      </div>

      <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 12px;">
        <h2 style="font-size: 17px; font-weight: 700; color: #1c1c1e; margin: 0 0 14px;">一、使用限制</h2>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div v-for="(item, i) in [
            '禁止使用爬虫、脚本或任何自动化手段批量抓取本平台分析内容。',
            '禁止将本平台分析结果用于商业转售、二次分发或盈利目的，未经书面授权不得建立镜像站点。',
            '禁止以任何方式绕过配额限制，包括但不限于伪造设备ID、共享账号或使用代理批量请求。',
            '未满 18 周岁的未成年人不得注册或使用本平台的付费功能。',
          ]" :key="i" style="display: flex; gap: 10px; align-items: flex-start;">
            <span style="width: 20px; height: 20px; border-radius: 50%; background: #f2f2f7; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #3c3c43; flex-shrink: 0; margin-top: 1px;">{{ i + 1 }}</span>
            <p style="font-size: 14px; color: #3c3c43; line-height: 1.65; margin: 0;">{{ item }}</p>
          </div>
        </div>
      </div>

      <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 12px;">
        <h2 style="font-size: 17px; font-weight: 700; color: #1c1c1e; margin: 0 0 14px;">二、订阅与退款</h2>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0 0 12px;">
          本平台付费订阅通过爱发电（afdian.com）平台处理，采用<strong>月付制</strong>。订阅成功后即时生效，当月有效。
        </p>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0 0 12px;">
          由于数字服务的特殊性，<strong>原则上不提供退款</strong>。如遇平台出现重大故障导致服务完全不可用，可联系客服协商处理。
        </p>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0;">
          爱发电订阅不会自动续费，每月需手动续订。逾期未续订，订阅权益将在当前周期结束后自动降级为免费版。
        </p>
      </div>

      <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 12px;">
        <h2 style="font-size: 17px; font-weight: 700; color: #1c1c1e; margin: 0 0 14px;">三、服务可用性</h2>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0 0 12px;">
          本平台不对服务可用性（SLA）、分析准确率或响应时间作出任何明示或暗示的保证。AI 分析结果可能因市场异常、数据源不完整或模型局限性而出现误差。
        </p>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0;">
          我们将尽力维持服务稳定，但因技术故障、第三方 API 限制或不可抗力造成的服务中断，本平台不承担补偿责任。
        </p>
      </div>

      <div style="background: white; border-radius: 16px; padding: 24px; margin-bottom: 12px;">
        <h2 style="font-size: 17px; font-weight: 700; color: #1c1c1e; margin: 0 0 14px;">四、条款变更</h2>
        <p style="font-size: 14px; color: #3c3c43; line-height: 1.75; margin: 0;">
          本平台保留随时修改本服务条款的权利。重大变更将通过站内通知或邮件告知注册用户。继续使用本平台即表示您接受修改后的条款。建议您定期查阅本页面了解最新版本。
        </p>
      </div>

      <!-- Footer links -->
      <div style="text-align: center; padding-top: 16px; display: flex; justify-content: center; gap: 24px;">
        <NuxtLink to="/" style="font-size: 14px; color: #007aff; text-decoration: none;">返回首页</NuxtLink>
        <NuxtLink to="/privacy" style="font-size: 14px; color: #007aff; text-decoration: none;">隐私政策</NuxtLink>
      </div>
      <p style="text-align: center; font-size: 12px; color: #aeaeb2; margin-top: 12px;">最后更新：2025年3月</p>
    </div>
  </div>
</template>
