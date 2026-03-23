<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import api from '~/lib/api'
import { useRouter } from 'vue-router'

const router = useRouter()

// ─── Admin header helper ───────────────────────────────────────────────────
function getAdminHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : ''
  return { 'X-Admin-Token': token || '' }
}

// ─── Types ─────────────────────────────────────────────────────────────────
interface UnifiedRow {
  rowType: 'user' | 'device'
  key: string
  userId?: number
  email?: string
  username?: string
  emailVerified?: boolean
  hasHadProTrial: boolean
  deviceId?: string
  subscriptionTier: string
  isBanned: boolean
  createdAt: string | null
  dailyUsage?: number
  dailyLimit?: number
  dailyRemaining?: number
  totalAvailable?: number
  bonusQuota?: number
}

// ─── State ─────────────────────────────────────────────────────────────────
const rows = ref<UnifiedRow[]>([])
const totalUsers = ref(0)
const totalDevices = ref(0)
const page = ref(1)
const search = ref('')
const typeFilter = ref<'all' | 'users' | 'guests'>('all')
const loading = ref(false)
const error = ref('')
const msg = ref('')
const saving = ref<string | null>(null)
const selected = ref<Set<string>>(new Set())
const historyOpen = ref(false)
const historyTarget = ref<UnifiedRow | null>(null)
const historyItems = ref<any[]>([])
const historyLoading = ref(false)

// Local editable maps (key → value) so inputs don't trigger reactivity issues
const bonusInputs = ref<Record<string, number>>({})

const PAGE_SIZE = 20

const totalPages = computed(() => {
  const total = typeFilter.value === 'users'
    ? totalUsers.value
    : typeFilter.value === 'guests'
      ? totalDevices.value
      : totalUsers.value + totalDevices.value
  return Math.max(1, Math.ceil(total / PAGE_SIZE))
})

// ─── Flash message ─────────────────────────────────────────────────────────
let msgTimer: ReturnType<typeof setTimeout> | null = null
function flash(text: string, isError = false) {
  if (isError) {
    error.value = text
    msg.value = ''
  } else {
    msg.value = text
    error.value = ''
  }
  if (msgTimer) clearTimeout(msgTimer)
  msgTimer = setTimeout(() => {
    msg.value = ''
    error.value = ''
  }, 3000)
}

// ─── Data loading ───────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  try {
    const headers = getAdminHeaders()
    const params = { search: search.value || undefined, page: page.value, page_size: PAGE_SIZE }

    const fetchUsers = typeFilter.value !== 'guests'
      ? api.get('/api/admin/users', { headers, params })
      : Promise.resolve(null)

    const fetchDevices = typeFilter.value !== 'users'
      ? api.get('/api/admin/devices', { headers, params })
      : Promise.resolve(null)

    const [usersRes, devicesRes] = await Promise.all([fetchUsers, fetchDevices])

    const userRows: UnifiedRow[] = []
    if (usersRes) {
      const items: any[] = usersRes.data.users || usersRes.data.items || []
      totalUsers.value = usersRes.data.total || items.length
      for (const u of items) {
        const key = `user_${u.id}`
        userRows.push({
          rowType: 'user',
          key,
          userId: u.id,
          email: u.email,
          username: u.username,
          emailVerified: u.email_verified,
          hasHadProTrial: !!u.has_had_pro_trial,
          deviceId: u.device_id,
          subscriptionTier: u.subscription_tier || 'free',
          isBanned: !!u.is_banned || !u.is_active,
          createdAt: u.created_at || null,
          dailyUsage: u.daily_usage ?? 0,
          dailyLimit: u.daily_limit ?? 0,
          dailyRemaining: u.daily_remaining ?? 0,
          totalAvailable: u.total_available ?? 0,
          bonusQuota: u.bonus_quota ?? 0,
        })
        bonusInputs.value[key] = u.bonus_quota ?? 0
      }
    }

    const deviceRows: UnifiedRow[] = []
    if (devicesRes) {
      const items: any[] = devicesRes.data.devices || devicesRes.data.items || []
      totalDevices.value = devicesRes.data.total || items.length
      for (const d of items) {
        const key = `device_${d.id}`
        deviceRows.push({
          rowType: 'device',
          key,
          deviceId: d.device_id || d.id,
          hasHadProTrial: !!d.has_had_pro_trial,
          subscriptionTier: d.subscription_tier || 'free',
          isBanned: !!d.is_banned,
          createdAt: d.created_at || null,
          dailyUsage: d.daily_usage ?? 0,
          dailyLimit: d.daily_limit ?? 0,
          dailyRemaining: d.daily_remaining ?? 0,
          totalAvailable: d.total_available ?? 0,
          bonusQuota: d.bonus_quota ?? 0,
        })
        bonusInputs.value[key] = d.bonus_quota ?? 0
      }
    }

    rows.value = [...userRows, ...deviceRows]
  } catch (e: any) {
    flash(e?.response?.data?.detail || '加载失败', true)
  } finally {
    loading.value = false
  }
}

// ─── Watchers ──────────────────────────────────────────────────────────────
watch([typeFilter, page], () => load())
watch(search, () => {
  page.value = 1
  load()
})
onMounted(() => load())

// ─── Tier helpers ───────────────────────────────────────────────────────────
const tierStyles: Record<string, { background: string; color: string }> = {
  premium: { background: '#f3e8ff', color: '#7c3aed' },
  basic:   { background: '#fef3c7', color: '#92400e' },
  free:    { background: '#f1f5f9', color: '#475569' },
}
const tierLabels: Record<string, string> = { free: '免费版', basic: '标准版', premium: '专业版' }
function tierStyle(tier: string) {
  return tierStyles[tier] || tierStyles.free
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('zh-CN')
}

// ─── User operations ────────────────────────────────────────────────────────
async function updateUser(row: UnifiedRow, body: Record<string, any>) {
  saving.value = row.key
  try {
    await api.put(`/api/admin/users/${row.userId}`, body, { headers: getAdminHeaders() })
    flash('已更新 ✓')
    await load()
  } catch (e: any) {
    flash(e?.response?.data?.detail || '操作失败', true)
  } finally {
    saving.value = null
  }
}

async function changeTier(row: UnifiedRow, newTier: string) {
  if (row.rowType !== 'user') return
  await updateUser(row, { subscription_tier: newTier })
}

async function toggleBanUser(row: UnifiedRow) {
  await updateUser(row, { is_active: row.isBanned })
}

async function toggleVerified(row: UnifiedRow) {
  await updateUser(row, { email_verified: !row.emailVerified })
}

async function resetUsage(row: UnifiedRow) {
  if (!confirm('确定重置今日用量？')) return
  saving.value = row.key
  try {
    await api.patch(`/api/admin/users/${row.userId}/quota`, { daily_usage: 0 }, { headers: getAdminHeaders() })
    flash('已重置用量 ✓')
    await load()
  } catch (e: any) {
    flash(e?.response?.data?.detail || '操作失败', true)
  } finally {
    saving.value = null
  }
}

async function saveBonusQuota(row: UnifiedRow) {
  if (row.rowType !== 'user') return
  const val = bonusInputs.value[row.key] ?? 0
  saving.value = row.key
  try {
    await api.patch(`/api/admin/users/${row.userId}/quota`, { bonus_quota: val }, { headers: getAdminHeaders() })
    flash('已更新永久额度 ✓')
    await load()
  } catch (e: any) {
    flash(e?.response?.data?.detail || '操作失败', true)
  } finally {
    saving.value = null
  }
}

async function deleteUser(row: UnifiedRow) {
  if (!confirm(`确定删除用户 ${row.email}？此操作不可撤销。`)) return
  saving.value = row.key
  try {
    await api.delete(`/api/admin/users/${row.userId}`, { headers: getAdminHeaders() })
    flash('已删除用户 ✓')
    await load()
  } catch (e: any) {
    flash(e?.response?.data?.detail || '删除失败', true)
  } finally {
    saving.value = null
  }
}

// ─── Device operations ──────────────────────────────────────────────────────
function deviceIdParam(row: UnifiedRow) {
  // The API uses the raw device_id string
  return encodeURIComponent(row.deviceId || '')
}

async function toggleBanDevice(row: UnifiedRow) {
  const action = row.isBanned ? 'unban' : 'ban'
  saving.value = row.key
  try {
    await api.post(`/api/admin/devices/${deviceIdParam(row)}/${action}`, {}, { headers: getAdminHeaders() })
    flash(`已${row.isBanned ? '解封' : '封禁'} ✓`)
    await load()
  } catch (e: any) {
    flash(e?.response?.data?.detail || '操作失败', true)
  } finally {
    saving.value = null
  }
}

async function resetTrial(row: UnifiedRow) {
  if (!confirm('确定重置体验次数？')) return
  saving.value = row.key
  try {
    await api.post(`/api/admin/devices/${deviceIdParam(row)}/reset-trial`, {}, { headers: getAdminHeaders() })
    flash('已重置体验 ✓')
    await load()
  } catch (e: any) {
    flash(e?.response?.data?.detail || '操作失败', true)
  } finally {
    saving.value = null
  }
}

async function deleteDevice(row: UnifiedRow) {
  if (!confirm(`确定删除设备 ${row.deviceId}？`)) return
  saving.value = row.key
  try {
    await api.delete(`/api/admin/devices/${deviceIdParam(row)}`, { headers: getAdminHeaders() })
    flash('已删除设备 ✓')
    await load()
  } catch (e: any) {
    flash(e?.response?.data?.detail || '删除失败', true)
  } finally {
    saving.value = null
  }
}

async function openHistory(row: UnifiedRow) {
  historyTarget.value = row
  historyOpen.value = true
  historyLoading.value = true
  historyItems.value = []
  try {
    const res = await api.get(`/api/admin/devices/${deviceIdParam(row)}/history`, { headers: getAdminHeaders() })
    historyItems.value = res.data.items || []
  } catch {
    historyItems.value = []
  } finally {
    historyLoading.value = false
  }
}

function closeHistory() {
  historyOpen.value = false
  historyTarget.value = null
  historyItems.value = []
}

// ─── Bulk selection ─────────────────────────────────────────────────────────
function toggleSelect(key: string) {
  const s = new Set(selected.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  selected.value = s
}

function toggleSelectAll() {
  const deviceKeys = rows.value.filter(r => r.rowType === 'device').map(r => r.key)
  if (selected.value.size === deviceKeys.length && deviceKeys.length > 0) {
    selected.value = new Set()
  } else {
    selected.value = new Set(deviceKeys)
  }
}

async function bulkAction(action: 'ban' | 'unban' | 'reset-trial' | 'delete') {
  const ids = [...selected.value].map(k => {
    const row = rows.value.find(r => r.key === k)
    return row?.deviceId || ''
  }).filter(Boolean)
  if (!ids.length) return
  if (!confirm(`确定对 ${ids.length} 个设备执行「${action}」操作？`)) return
  try {
    await api.post('/api/admin/devices/batch', { action, device_ids: ids }, { headers: getAdminHeaders() })
    flash(`批量操作完成 ✓`)
    selected.value = new Set()
    await load()
  } catch (e: any) {
    flash(e?.response?.data?.detail || '批量操作失败', true)
  }
}

// ─── Reset all ──────────────────────────────────────────────────────────────
async function resetAll() {
  if (!confirm('⚠️ 确定清空全部数据？此操作不可撤销！')) return
  try {
    await api.post('/api/admin/reset-all', {}, { headers: getAdminHeaders() })
    flash('已清空全部数据 ✓')
    await load()
  } catch (e: any) {
    flash(e?.response?.data?.detail || '操作失败', true)
  }
}
</script>

<template>
  <div style="min-height: 100vh; background: #f2f2f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">

    <!-- Flash message -->
    <div
      v-if="msg || error"
      style="position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 9999; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"
      :style="error ? { background: '#ff3b30', color: '#fff' } : { background: '#34c759', color: '#fff' }"
    >
      {{ error || msg }}
    </div>

    <!-- Bulk toolbar -->
    <div
      v-if="selected.size > 0"
      style="position: sticky; top: 0; z-index: 100; background: #1e293b; color: #fff; padding: 10px 20px; display: flex; align-items: center; gap: 12px;"
    >
      <span style="font-size: 14px; font-weight: 500;">已选 {{ selected.size }} 个设备</span>
      <button
        @click="bulkAction('ban')"
        style="padding: 6px 14px; border-radius: 6px; border: none; background: #ff3b30; color: #fff; font-size: 13px; cursor: pointer;"
      >封禁</button>
      <button
        @click="bulkAction('unban')"
        style="padding: 6px 14px; border-radius: 6px; border: none; background: #34c759; color: #fff; font-size: 13px; cursor: pointer;"
      >解封</button>
      <button
        @click="bulkAction('reset-trial')"
        style="padding: 6px 14px; border-radius: 6px; border: none; background: #007aff; color: #fff; font-size: 13px; cursor: pointer;"
      >重置体验</button>
      <button
        @click="bulkAction('delete')"
        style="padding: 6px 14px; border-radius: 6px; border: none; background: #ff9500; color: #fff; font-size: 13px; cursor: pointer;"
      >删除</button>
      <button
        @click="selected = new Set()"
        style="margin-left: auto; padding: 6px 14px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.3); background: transparent; color: #fff; font-size: 13px; cursor: pointer;"
      >取消</button>
    </div>

    <div style="max-width: 1200px; margin: 0 auto; padding: 24px 16px;">

      <!-- Header -->
      <div style="margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 4px;">
          <NuxtLink to="/admin" style="color: #007aff; text-decoration: none; font-size: 14px;">← 返回</NuxtLink>
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #1c1c1e;">用户 &amp; 设备管理</h1>
        </div>
        <p style="margin: 0; font-size: 13px; color: #8e8e93;">
          注册用户 {{ totalUsers }} 人 · 游客设备 {{ totalDevices }} 台
        </p>
      </div>

      <!-- Filters bar -->
      <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 16px;">
        <input
          v-model="search"
          placeholder="搜索邮箱 / 设备ID"
          style="flex: 1; min-width: 200px; padding: 9px 14px; border-radius: 10px; border: 1px solid #d1d1d6; font-size: 14px; background: #fff; outline: none;"
        />
        <select
          v-model="typeFilter"
          style="padding: 9px 14px; border-radius: 10px; border: 1px solid #d1d1d6; font-size: 14px; background: #fff; cursor: pointer;"
        >
          <option value="all">全部</option>
          <option value="users">注册用户</option>
          <option value="guests">游客设备</option>
        </select>
        <button
          @click="load()"
          style="padding: 9px 18px; border-radius: 10px; border: none; background: #007aff; color: #fff; font-size: 14px; font-weight: 500; cursor: pointer;"
        >刷新</button>
        <button
          @click="resetAll()"
          style="padding: 9px 18px; border-radius: 10px; border: none; background: #ff3b30; color: #fff; font-size: 14px; font-weight: 500; cursor: pointer;"
        >清空全部数据</button>
      </div>

      <!-- Loading -->
      <div v-if="loading" style="text-align: center; padding: 48px; color: #8e8e93; font-size: 15px;">
        加载中…
      </div>

      <!-- Table -->
      <div v-else style="background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background: #f8f8fa; border-bottom: 1px solid #e5e5ea;">
                <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #8e8e93; width: 36px;">
                  <input
                    type="checkbox"
                    :checked="selected.size > 0 && selected.size === rows.filter(r => r.rowType === 'device').length"
                    :indeterminate="selected.size > 0 && selected.size < rows.filter(r => r.rowType === 'device').length"
                    @change="toggleSelectAll()"
                    style="cursor: pointer;"
                  />
                </th>
                <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #8e8e93;">用户/设备</th>
                <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #8e8e93;">类型</th>
                <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #8e8e93;">订阅</th>
                <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #8e8e93;">今日额度</th>
                <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #8e8e93;">体验</th>
                <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #8e8e93;">状态</th>
                <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #8e8e93;">注册时间</th>
                <th style="padding: 10px 12px; text-align: left; font-weight: 600; color: #8e8e93;">操作</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in rows" :key="row.key">
                <!-- User row -->
                <tr
                  v-if="row.rowType === 'user'"
                  :style="{ background: row.isBanned ? '#fff5f5' : '#fff', borderBottom: '1px solid #f2f2f7' }"
                >
                  <!-- Checkbox (empty for users) -->
                  <td style="padding: 12px 12px;"></td>

                  <!-- Identity -->
                  <td style="padding: 12px 12px; min-width: 180px;">
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                      <span style="font-weight: 600; color: #1c1c1e;">{{ row.email }}</span>
                      <span
                        v-if="row.emailVerified === false"
                        style="font-size: 11px; padding: 1px 6px; border-radius: 4px; background: #fff3cd; color: #856404;"
                      >未验证</span>
                    </div>
                    <div v-if="row.username" style="font-size: 12px; color: #8e8e93; margin-top: 2px;">{{ row.username }}</div>
                    <div v-if="row.deviceId" style="font-size: 11px; font-family: monospace; color: #aeaeb2; margin-top: 2px;">{{ row.deviceId }}</div>
                  </td>

                  <!-- Type -->
                  <td style="padding: 12px 12px;">
                    <span style="font-size: 12px; color: #007aff;">注册用户</span>
                  </td>

                  <!-- Subscription -->
                  <td style="padding: 12px 12px;">
                    <select
                      :value="row.subscriptionTier"
                      @change="(e) => changeTier(row, (e.target as HTMLSelectElement).value)"
                      :disabled="saving === row.key"
                      style="padding: 4px 8px; border-radius: 6px; border: 1px solid #d1d1d6; font-size: 12px; cursor: pointer;"
                    >
                      <option value="free">免费版</option>
                      <option value="basic">标准版</option>
                      <option value="premium">专业版</option>
                    </select>
                  </td>

                  <!-- Quota -->
                  <td style="padding: 12px 12px; min-width: 140px;">
                    <div style="font-size: 12px; color: #3c3c43;">
                      日剩余 {{ row.dailyRemaining }}/{{ row.dailyLimit }}
                    </div>
                    <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
                      <span style="font-size: 11px; color: #8e8e93;">永久:</span>
                      <input
                        type="number"
                        :value="bonusInputs[row.key] ?? 0"
                        @input="(e) => bonusInputs[row.key] = Number((e.target as HTMLInputElement).value)"
                        @blur="saveBonusQuota(row)"
                        min="0"
                        style="width: 60px; padding: 2px 6px; border-radius: 5px; border: 1px solid #d1d1d6; font-size: 12px;"
                      />
                    </div>
                  </td>

                  <!-- Trial -->
                  <td style="padding: 12px 12px;">
                    <span :style="{ fontSize: '12px', color: row.hasHadProTrial ? '#ff9500' : '#34c759' }">
                      {{ row.hasHadProTrial ? '已用' : '未用' }}
                    </span>
                  </td>

                  <!-- Status -->
                  <td style="padding: 12px 12px;">
                    <span
                      style="font-size: 12px; padding: 2px 8px; border-radius: 20px;"
                      :style="row.isBanned
                        ? { background: '#ffe5e5', color: '#ff3b30' }
                        : { background: '#e8f8ef', color: '#34c759' }"
                    >{{ row.isBanned ? '封禁' : '正常' }}</span>
                  </td>

                  <!-- Created -->
                  <td style="padding: 12px 12px; font-size: 12px; color: #8e8e93; white-space: nowrap;">
                    {{ formatDate(row.createdAt) }}
                  </td>

                  <!-- Operations -->
                  <td style="padding: 12px 12px;">
                    <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                      <button
                        @click="toggleBanUser(row)"
                        :disabled="saving === row.key"
                        style="padding: 4px 10px; border-radius: 6px; border: none; font-size: 12px; cursor: pointer;"
                        :style="row.isBanned
                          ? { background: '#e8f8ef', color: '#34c759' }
                          : { background: '#ffe5e5', color: '#ff3b30' }"
                      >{{ row.isBanned ? '解封' : '封禁' }}</button>

                      <button
                        @click="toggleVerified(row)"
                        :disabled="saving === row.key"
                        style="padding: 4px 10px; border-radius: 6px; border: 1px solid #d1d1d6; background: #f8f8fa; color: #3c3c43; font-size: 12px; cursor: pointer;"
                      >{{ row.emailVerified ? '取消验证' : '设为已验证' }}</button>

                      <button
                        v-if="(row.dailyUsage ?? 0) > 0"
                        @click="resetUsage(row)"
                        :disabled="saving === row.key"
                        style="padding: 4px 10px; border-radius: 6px; border: none; background: #fff3cd; color: #856404; font-size: 12px; cursor: pointer;"
                      >重置用量</button>

                      <button
                        @click="deleteUser(row)"
                        :disabled="saving === row.key"
                        style="padding: 4px 10px; border-radius: 6px; border: none; background: #ff3b30; color: #fff; font-size: 12px; cursor: pointer;"
                      >删除</button>
                    </div>
                  </td>
                </tr>

                <!-- Device row -->
                <tr
                  v-else
                  :style="{ background: row.isBanned ? '#fff5f5' : '#fff', borderBottom: '1px solid #f2f2f7' }"
                >
                  <!-- Checkbox -->
                  <td style="padding: 12px 12px;">
                    <input
                      type="checkbox"
                      :checked="selected.has(row.key)"
                      @change="toggleSelect(row.key)"
                      style="cursor: pointer;"
                    />
                  </td>

                  <!-- Identity -->
                  <td style="padding: 12px 12px; min-width: 180px;">
                    <span style="font-family: monospace; font-size: 12px; color: #3c3c43; word-break: break-all;">{{ row.deviceId }}</span>
                  </td>

                  <!-- Type -->
                  <td style="padding: 12px 12px;">
                    <span style="font-size: 12px; color: #8e8e93;">游客设备</span>
                  </td>

                  <!-- Subscription (badge only) -->
                  <td style="padding: 12px 12px;">
                    <span
                      style="font-size: 12px; padding: 2px 8px; border-radius: 20px;"
                      :style="tierStyle(row.subscriptionTier)"
                    >{{ tierLabels[row.subscriptionTier] || row.subscriptionTier }}</span>
                  </td>

                  <!-- Quota -->
                  <td style="padding: 12px 12px;">
                    <div style="font-size: 12px; color: #3c3c43;">
                      日剩余 {{ row.dailyRemaining }}/{{ row.dailyLimit }}
                    </div>
                  </td>

                  <!-- Trial -->
                  <td style="padding: 12px 12px;">
                    <span :style="{ fontSize: '12px', color: row.hasHadProTrial ? '#ff9500' : '#34c759' }">
                      {{ row.hasHadProTrial ? '已用' : '未用' }}
                    </span>
                  </td>

                  <!-- Status -->
                  <td style="padding: 12px 12px;">
                    <span
                      style="font-size: 12px; padding: 2px 8px; border-radius: 20px;"
                      :style="row.isBanned
                        ? { background: '#ffe5e5', color: '#ff3b30' }
                        : { background: '#e8f8ef', color: '#34c759' }"
                    >{{ row.isBanned ? '封禁' : '正常' }}</span>
                  </td>

                  <!-- Created -->
                  <td style="padding: 12px 12px; font-size: 12px; color: #8e8e93; white-space: nowrap;">
                    {{ formatDate(row.createdAt) }}
                  </td>

                  <!-- Operations -->
                  <td style="padding: 12px 12px;">
                    <div style="display: flex; flex-wrap: wrap; gap: 5px;">
                      <button
                        @click="toggleBanDevice(row)"
                        :disabled="saving === row.key"
                        style="padding: 4px 10px; border-radius: 6px; border: none; font-size: 12px; cursor: pointer;"
                        :style="row.isBanned
                          ? { background: '#e8f8ef', color: '#34c759' }
                          : { background: '#ffe5e5', color: '#ff3b30' }"
                      >{{ row.isBanned ? '解封' : '封禁' }}</button>

                      <button
                        v-if="row.hasHadProTrial"
                        @click="resetTrial(row)"
                        :disabled="saving === row.key"
                        style="padding: 4px 10px; border-radius: 6px; border: none; background: #e8f0fe; color: #007aff; font-size: 12px; cursor: pointer;"
                      >重置体验</button>

                      <button
                        @click="openHistory(row)"
                        style="padding: 4px 10px; border-radius: 6px; border: 1px solid #d1d1d6; background: #f8f8fa; color: #3c3c43; font-size: 12px; cursor: pointer;"
                      >历史</button>

                      <button
                        @click="deleteDevice(row)"
                        :disabled="saving === row.key"
                        style="padding: 4px 10px; border-radius: 6px; border: none; background: #ff3b30; color: #fff; font-size: 12px; cursor: pointer;"
                      >删除</button>
                    </div>
                  </td>
                </tr>
              </template>

              <!-- Empty state -->
              <tr v-if="rows.length === 0">
                <td colspan="9" style="padding: 40px; text-align: center; color: #8e8e93; font-size: 14px;">
                  暂无数据
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Pagination -->
      <div
        v-if="totalPages > 1"
        style="display: flex; align-items: center; justify-content: center; gap: 16px; margin-top: 20px;"
      >
        <button
          @click="page--"
          :disabled="page <= 1"
          style="padding: 8px 20px; border-radius: 10px; border: 1px solid #d1d1d6; background: #fff; font-size: 14px; cursor: pointer;"
          :style="page <= 1 ? { opacity: '0.4', cursor: 'not-allowed' } : {}"
        >上一页</button>
        <span style="font-size: 14px; color: #3c3c43;">{{ page }} / {{ totalPages }}</span>
        <button
          @click="page++"
          :disabled="page >= totalPages"
          style="padding: 8px 20px; border-radius: 10px; border: 1px solid #d1d1d6; background: #fff; font-size: 14px; cursor: pointer;"
          :style="page >= totalPages ? { opacity: '0.4', cursor: 'not-allowed' } : {}"
        >下一页</button>
      </div>

    </div>

    <!-- History modal -->
    <Teleport to="body">
      <div
        v-if="historyOpen"
        @click.self="closeHistory()"
        style="position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 1000; display: flex; align-items: flex-end;"
      >
        <div style="width: 100%; background: #fff; border-radius: 1rem 1rem 0 0; max-height: 70vh; display: flex; flex-direction: column;">
          <!-- Modal header -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e5e5ea;">
            <div>
              <div style="font-weight: 600; font-size: 16px; color: #1c1c1e;">设备历史</div>
              <div v-if="historyTarget" style="font-family: monospace; font-size: 12px; color: #8e8e93; margin-top: 2px;">
                {{ historyTarget.deviceId }}
              </div>
            </div>
            <button
              @click="closeHistory()"
              style="width: 32px; height: 32px; border-radius: 50%; border: none; background: #f2f2f7; color: #3c3c43; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;"
            >✕</button>
          </div>

          <!-- Modal body -->
          <div style="overflow-y: auto; flex: 1; padding: 8px 0;">
            <div v-if="historyLoading" style="text-align: center; padding: 32px; color: #8e8e93;">加载中…</div>
            <div v-else-if="historyItems.length === 0" style="text-align: center; padding: 32px; color: #8e8e93;">暂无历史记录</div>
            <table v-else style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background: #f8f8fa;">
                  <th style="padding: 8px 16px; text-align: left; font-weight: 600; color: #8e8e93;">代码</th>
                  <th style="padding: 8px 16px; text-align: left; font-weight: 600; color: #8e8e93;">市场</th>
                  <th style="padding: 8px 16px; text-align: left; font-weight: 600; color: #8e8e93;">周期</th>
                  <th style="padding: 8px 16px; text-align: left; font-weight: 600; color: #8e8e93;">分析时间</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(item, i) in historyItems"
                  :key="i"
                  style="border-top: 1px solid #f2f2f7;"
                >
                  <td style="padding: 10px 16px; font-weight: 500; color: #1c1c1e;">{{ item.symbol || item.code || '—' }}</td>
                  <td style="padding: 10px 16px; color: #3c3c43;">{{ item.market || '—' }}</td>
                  <td style="padding: 10px 16px; color: #3c3c43;">{{ item.period || item.interval || '—' }}</td>
                  <td style="padding: 10px 16px; font-size: 12px; color: #8e8e93;">{{ item.created_at ? new Date(item.created_at).toLocaleString('zh-CN') : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>
