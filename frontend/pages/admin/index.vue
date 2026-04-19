<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '~/lib/api'

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
  <div style="position: fixed; inset: 0; background: #f2f2f7; display: flex; flex-direction: column; overflow-y: auto;">
    <!-- Header -->
    <div style="display: flex; align-items: center; padding: 52px 16px 12px;">
      <NuxtLink to="/" style="color: #007aff; text-decoration: none; font-size: 15px;">← 返回</NuxtLink>
      <h1 style="flex: 1; text-align: center; font-size: 17px; font-weight: 600; color: #000; margin: 0 0 0 -40px;">管理后台</h1>
    </div>

    <div style="padding: 0 16px 40px; max-width: 600px; margin: 0 auto; width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px;">

      <!-- Admin token card -->
      <div style="background: white; border-radius: 14px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
        <label style="display: block; font-size: 13px; font-weight: 600; color: #8e8e93; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px;">管理员令牌</label>
        <input
          v-model="adminToken"
          type="password"
          placeholder="输入 ADMIN_TOKEN"
          style="width: 100%; height: 44px; background: #f2f2f7; border: none; border-radius: 10px; padding: 0 14px; font-size: 15px; color: #000; outline: none; box-sizing: border-box;"
        />
        <div v-if="error" style="font-size: 13px; color: #ff3b30; margin-top: 8px;">{{ error }}</div>
        <button
          @click="saveAdminToken"
          style="margin-top: 12px; width: 100%; height: 44px; background: #007aff; color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer;"
        >
          {{ loading ? '验证中…' : '确认' }}
        </button>
      </div>

      <!-- Stats -->
      <template v-if="stats">
        <div style="background: white; border-radius: 14px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          <h3 style="font-size: 15px; font-weight: 600; color: #000; margin: 0 0 14px;">系统概览</h3>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
            <div style="text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #007aff;">{{ stats.total_users ?? 0 }}</div>
              <div style="font-size: 12px; color: #8e8e93; margin-top: 2px;">注册用户</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #34c759;">{{ stats.analysis_last_24h ?? 0 }}</div>
              <div style="font-size: 12px; color: #8e8e93; margin-top: 2px;">今日分析</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #ff9500;">{{ stats.active_devices_today ?? 0 }}</div>
              <div style="font-size: 12px; color: #8e8e93; margin-top: 2px;">游客设备</div>
            </div>
          </div>
          <div v-if="stats.tier_distribution" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px; padding-top: 12px; border-top: 0.5px solid rgba(60,60,67,0.1);">
            <div style="text-align: center;">
              <div style="font-size: 20px; font-weight: 700; color: #5856d6;">{{ stats.tier_distribution.premium ?? 0 }}</div>
              <div style="font-size: 12px; color: #8e8e93; margin-top: 2px;">专业版</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 20px; font-weight: 700; color: #34c759;">{{ stats.tier_distribution.basic ?? 0 }}</div>
              <div style="font-size: 12px; color: #8e8e93; margin-top: 2px;">标准版</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 20px; font-weight: 700; color: #8e8e93;">{{ stats.total_requests_today ?? 0 }}</div>
              <div style="font-size: 12px; color: #8e8e93; margin-top: 2px;">今日请求</div>
            </div>
          </div>
        </div>

        <!-- 数据来源监控卡 -->
        <div v-if="dsStats" style="background: white; border-radius: 14px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
          <h3 style="font-size: 15px; font-weight: 600; color: #000; margin: 0 0 4px;">行情数据来源（近7天）</h3>
          <p style="font-size: 12px; color: #8e8e93; margin: 0 0 14px;">客户端拉取 vs 服务端 akshare 兜底</p>
          <!-- Summary row -->
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px;">
            <div style="text-align: center;">
              <div style="font-size: 24px; font-weight: 700; color: #34c759;">{{ dsStats.summary.client }}</div>
              <div style="font-size: 11px; color: #8e8e93; margin-top: 2px;">客户端</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 24px; font-weight: 700; color: #ff9500;">{{ dsStats.summary.akshare }}</div>
              <div style="font-size: 11px; color: #8e8e93; margin-top: 2px;">akshare</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 24px; font-weight: 700; color: #007aff;">{{ dsStats.summary.client_pct }}%</div>
              <div style="font-size: 11px; color: #8e8e93; margin-top: 2px;">客户端占比</div>
            </div>
          </div>
          <!-- Progress bar -->
          <div style="height: 8px; background: #f2f2f7; border-radius: 4px; overflow: hidden; margin-bottom: 14px;">
            <div :style="`width: ${dsStats.summary.client_pct}%; height: 100%; background: #34c759; border-radius: 4px; transition: width 0.3s;`" />
          </div>
          <!-- Daily breakdown -->
          <div style="display: flex; flex-direction: column; gap: 6px;">
            <div
              v-for="day in dsStats.days.slice().reverse()"
              :key="day.date"
              style="display: flex; align-items: center; gap: 8px; font-size: 12px;"
            >
              <span style="color: #8e8e93; min-width: 68px;">{{ day.date.slice(5) }}</span>
              <div style="flex: 1; height: 6px; background: #f2f2f7; border-radius: 3px; overflow: hidden;">
                <div :style="`width: ${day.client_pct}%; height: 100%; background: #34c759; border-radius: 3px;`" />
              </div>
              <span style="min-width: 52px; text-align: right; color: #3a3a3c;">
                {{ day.client }}<span style="color: #c7c7cc;">/{{ day.total }}</span>
              </span>
            </div>
          </div>
          <div style="margin-top: 10px; font-size: 11px; color: #8e8e93;">
            绿色 = 客户端成功（分布式IP）/ 橙色 = 服务端兜底（akshare）
          </div>
        </div>

        <!-- Nav cards -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <NuxtLink to="/admin/users" style="text-decoration: none; background: white; border-radius: 16px; padding: 18px 16px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
            <span style="font-size: 24px;">👥</span>
            <span style="font-size: 15px; font-weight: 600; color: #1c1c1e; margin-top: 4px;">用户 & 设备</span>
            <span style="font-size: 12px; color: #8e8e93; line-height: 1.4;">管理注册用户和游客设备</span>
          </NuxtLink>
          <NuxtLink to="/admin/settings" style="text-decoration: none; background: white; border-radius: 16px; padding: 18px 16px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
            <span style="font-size: 24px;">⚙️</span>
            <span style="font-size: 15px; font-weight: 600; color: #1c1c1e; margin-top: 4px;">系统设置</span>
            <span style="font-size: 12px; color: #8e8e93; line-height: 1.4;">LLM、定价、邮件配置</span>
          </NuxtLink>
          <NuxtLink to="/admin/market-data" style="text-decoration: none; background: white; border-radius: 16px; padding: 18px 16px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
            <span style="font-size: 24px;">📈</span>
            <span style="font-size: 15px; font-weight: 600; color: #1c1c1e; margin-top: 4px;">市场数据</span>
            <span style="font-size: 12px; color: #8e8e93; line-height: 1.4;">K线数据状态与采集</span>
          </NuxtLink>
          <NuxtLink to="/admin/xbot" style="text-decoration: none; background: linear-gradient(135deg, #007aff 0%, #5856d6 100%); border-radius: 16px; padding: 18px 16px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 4px 12px rgba(0,122,255,0.3);">
            <span style="font-size: 24px;">🤖</span>
            <span style="font-size: 15px; font-weight: 600; color: #fff; margin-top: 4px;">X Bot 运营</span>
            <span style="font-size: 12px; color: rgba(255,255,255,0.8); line-height: 1.4;">自动发推 · 选股预测 · 涨粉</span>
          </NuxtLink>
        </div>
      </template>

      <!-- Loading state -->
      <div v-if="loading" style="text-align: center; padding: 40px 0; color: #8e8e93; font-size: 15px;">
        加载中…
      </div>
    </div>
  </div>
</template>
