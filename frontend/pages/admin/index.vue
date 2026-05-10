<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  PhArrowLeft,
  PhChartLineUp,
  PhDatabase,
  PhDeviceMobile,
  PhGear,
  PhListChecks,
  PhShieldCheck,
  PhUsers,
} from '@phosphor-icons/vue'
import api from '~/lib/api'
import MrButton from '~/components/model-review/MrButton.vue'
import MrMetric from '~/components/model-review/MrMetric.vue'
import MrShell from '~/components/model-review/MrShell.vue'
import MrState from '~/components/model-review/MrState.vue'

const stats = ref<any>(null)
const dsStats = ref<any>(null)
const adminToken = ref('')
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  if (typeof window !== 'undefined') {
    adminToken.value = localStorage.getItem('admin_token') || ''
  }
  await fetchStats()
})

async function fetchStats() {
  loading.value = true
  error.value = ''
  try {
    const headers = { 'X-Admin-Token': adminToken.value }
    const [statsRes, dsRes] = await Promise.all([
      api.get('/api/admin/stats', { headers }),
      api.get('/api/admin/datasource-stats?days=7', { headers }).catch(() => null),
    ])
    stats.value = statsRes.data
    dsStats.value = dsRes?.data ?? null
  } catch (e: any) {
    if (e.response?.status === 403) {
      error.value = '令牌错误或无管理员权限'
      stats.value = null
    } else {
      error.value = e?.message || '后台数据加载失败'
    }
  } finally {
    loading.value = false
  }
}

function saveAdminToken() {
  if (typeof window !== 'undefined') {
    localStorage.setItem('admin_token', adminToken.value)
  }
  fetchStats()
}
</script>

<template>
  <MrShell title="管理后台" back-to="/" back-label="返回">
    <template #backIcon>
      <PhArrowLeft :size="16" weight="bold" />
    </template>
    <template #titleIcon>
      <PhShieldCheck :size="18" weight="bold" />
    </template>

    <section class="mr-hero">
      <div class="mr-hero-main">
        <div class="mr-kicker">
          <PhShieldCheck :size="16" weight="bold" />
          管理控制台
        </div>
        <h1 class="mr-title">后台运营入口</h1>
        <p class="mr-lead">验证管理员令牌后查看系统概览、用户设备、行情数据和模型复盘工作流。</p>
      </div>
      <aside class="mr-hero-side">
        <div>
          <div class="mr-kicker">当前状态</div>
          <strong>{{ stats ? 'Ready' : 'Locked' }}</strong>
          <small>{{ stats ? `统计日期 ${stats.date}` : '输入 ADMIN_TOKEN 后读取后台数据。' }}</small>
        </div>
      </aside>
    </section>

    <section class="mr-panel">
      <div class="mr-panel-header">
        <div>
          <h2 class="mr-panel-title">管理员令牌</h2>
          <p class="mr-panel-sub">令牌保存在本机 localStorage，用于后台 API 请求。</p>
        </div>
      </div>
      <div class="mr-form-grid" style="grid-template-columns: minmax(0, 1fr) auto">
        <label class="mr-field">
          <span class="mr-label">ADMIN_TOKEN</span>
          <input v-model="adminToken" type="password" class="mr-input" placeholder="输入 ADMIN_TOKEN">
        </label>
        <MrButton variant="primary" :disabled="loading" @click="saveAdminToken">
          {{ loading ? '验证中' : '确认' }}
        </MrButton>
      </div>
      <p v-if="error" class="mr-copy" style="margin-top: 10px; color: var(--mr-bad)">{{ error }}</p>
    </section>

    <template v-if="stats">
      <div class="mr-metrics">
        <MrMetric label="注册用户" :value="stats.total_users ?? 0" sub="账户总量">
          <template #icon><PhUsers :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="今日分析" :value="stats.analysis_last_24h ?? 0" sub="近 24 小时">
          <template #icon><PhChartLineUp :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="活跃设备" :value="stats.active_devices_today ?? 0" sub="今日游客设备">
          <template #icon><PhDeviceMobile :size="18" weight="bold" /></template>
        </MrMetric>
        <MrMetric label="今日请求" :value="stats.total_requests_today ?? 0" sub="所有设备请求">
          <template #icon><PhDatabase :size="18" weight="bold" /></template>
        </MrMetric>
      </div>

      <section v-if="dsStats" class="mr-panel">
        <div class="mr-panel-header">
          <div>
            <h2 class="mr-panel-title">行情数据来源</h2>
            <p class="mr-panel-sub">近 7 天客户端拉取与服务端 akshare 兜底比例。</p>
          </div>
        </div>
        <div class="mr-metrics" style="margin-bottom: 14px">
          <MrMetric label="客户端" :value="dsStats.summary.client" sub="分布式 IP 成功" />
          <MrMetric label="akshare" :value="dsStats.summary.akshare" sub="服务端兜底" />
          <MrMetric label="客户端占比" :value="`${dsStats.summary.client_pct}%`" sub="近 7 天" />
          <MrMetric label="总计" :value="dsStats.summary.total" sub="数据请求" />
        </div>
        <div class="mr-analysis-list">
          <div v-for="day in dsStats.days.slice().reverse()" :key="day.date" class="mr-price-row">
            <span>{{ day.date.slice(5) }}</span>
            <strong>{{ day.client }} / {{ day.total }} · {{ day.client_pct }}%</strong>
          </div>
        </div>
      </section>

      <section class="mr-grid mr-grid-2 mr-grid-flow">
        <NuxtLink to="/admin/users" class="mr-panel" style="text-decoration: none; color: inherit">
          <div class="mr-panel-header">
            <div>
              <h2 class="mr-panel-title">用户与设备</h2>
              <p class="mr-panel-sub">管理注册用户、游客设备和订阅状态。</p>
            </div>
            <PhUsers :size="22" weight="bold" />
          </div>
        </NuxtLink>
        <NuxtLink to="/admin/settings" class="mr-panel" style="text-decoration: none; color: inherit">
          <div class="mr-panel-header">
            <div>
              <h2 class="mr-panel-title">系统设置</h2>
              <p class="mr-panel-sub">LLM、定价、邮件与运行配置。</p>
            </div>
            <PhGear :size="22" weight="bold" />
          </div>
        </NuxtLink>
        <NuxtLink to="/admin/market-data" class="mr-panel" style="text-decoration: none; color: inherit">
          <div class="mr-panel-header">
            <div>
              <h2 class="mr-panel-title">市场数据</h2>
              <p class="mr-panel-sub">K线数据状态与采集任务。</p>
            </div>
            <PhDatabase :size="22" weight="bold" />
          </div>
        </NuxtLink>
        <NuxtLink to="/admin/model-review" class="mr-panel" style="text-decoration: none; color: inherit; border-color: var(--mr-accent); background: var(--mr-accent-soft)">
          <div class="mr-panel-header">
            <div>
              <h2 class="mr-panel-title">模型复盘档案</h2>
              <p class="mr-panel-sub">候选扫描、完整审核、结算复盘与 SEO 素材。</p>
            </div>
            <PhListChecks :size="22" weight="bold" />
          </div>
        </NuxtLink>
      </section>
    </template>

    <MrState v-if="loading && !stats" title="加载中" text="正在验证令牌并读取后台概览。" variant="loading" />
  </MrShell>
</template>
