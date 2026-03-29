<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '~/lib/api'

function getAdminHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : ''
  return { 'X-Admin-Token': token || '' }
}

const activeTab = ref('llm')
const settings = ref<any>({})
const loading = ref(false)
const saving = ref(false)
const msg = ref('')
const msgType = ref<'success' | 'error'>('success')
const fileInput = ref<HTMLInputElement | null>(null)

const tabs = [
  { key: 'llm', label: '🤖 AI 模型' },
  { key: 'pricing', label: '💰 定价展示' },
  { key: 'afdian', label: '💳 爱发电' },
  { key: 'email', label: '📧 邮件服务' },
  { key: 'app', label: '⚙️ 应用信息' },
]

const tiers = ['free', 'basic', 'premium']
const tierLabels: Record<string, string> = { free: '免费版', basic: '标准版', premium: '专业版' }

function showMsg(text: string, type: 'success' | 'error' = 'success') {
  msg.value = text
  msgType.value = type
  setTimeout(() => { msg.value = '' }, 3000)
}

function ensureSection(section: string) {
  if (!settings.value[section]) settings.value[section] = {}
}

function getField(section: string, field: string) {
  ensureSection(section)
  return settings.value[section][field]
}

function setField(section: string, field: string, val: any) {
  ensureSection(section)
  settings.value[section][field] = val
}

function getTierField(tier: string, field: string) {
  if (!settings.value.pricing) settings.value.pricing = {}
  if (!settings.value.pricing[tier]) settings.value.pricing[tier] = {}
  return settings.value.pricing[tier][field]
}

function setTierField(tier: string, field: string, val: any) {
  if (!settings.value.pricing) settings.value.pricing = {}
  if (!settings.value.pricing[tier]) settings.value.pricing[tier] = {}
  settings.value.pricing[tier][field] = val
}

const DEFAULT_TIER_FEATURES: Record<string, string[]> = {
  // 免费版：仅 A 股，每日 3 次，登录后有历史/收藏/分享/邀请额度
  free: [
    '每日 3 次 AI 研判',
    '仅支持 A 股市场',
    '分析历史记录与收藏',
    '生成分享卡片',
    '邀请好友可获赠额外次数',
  ],
  // 标准版：全市场解锁，每日 5 次，每日 1 次深度研判（完整结果含目标价/止损/置信度）
  basic: [
    '每日 5 次 AI 研判',
    '全市场支持（A 股 / 港股 / 美股 / 期货）',
    '每日 1 次深度研判（完整结果）',
    '分析历史记录与收藏',
    '生成分享卡片',
    '邀请好友可获赠额外次数',
  ],
  // 专业版：全市场，每日 15 次，每次均为深度研判 + 持仓智能分析
  premium: [
    '每日 15 次 AI 研判',
    '全市场支持（A 股 / 港股 / 美股 / 期货）',
    '每次深度研判（完整结果）',
    '持仓智能分析（基于成本价/数量/仓位优化建议）',
    '分析历史记录与收藏',
    '生成分享卡片',
    '邀请好友可获赠额外次数',
    '优先响应速度',
  ],
}

const autoFilling = ref(false)

async function autoFillFeatures() {
  autoFilling.value = true
  try {
    if (!settings.value.pricing) settings.value.pricing = {}
    for (const tier of tiers) {
      settings.value.pricing[`${tier}_features`] = [...DEFAULT_TIER_FEATURES[tier]]
    }
    await api.put('/api/admin/settings', { pricing: settings.value.pricing }, { headers: getAdminHeaders() })
    showMsg('✅ 已自动填充并保存', 'success')
  } catch {
    showMsg('❌ 自动填充失败', 'error')
  } finally {
    autoFilling.value = false
  }
}

function getTierFeatures(tier: string): string[] {
  if (!settings.value.pricing) settings.value.pricing = {}
  const key = `${tier}_features`
  if (!Array.isArray(settings.value.pricing[key])) settings.value.pricing[key] = []
  return settings.value.pricing[key]
}

function addTierFeature(tier: string) {
  getTierFeatures(tier).push('')
}

function removeTierFeature(tier: string, i: number) {
  getTierFeatures(tier).splice(i, 1)
}

function setTierFeatureText(tier: string, i: number, v: string) {
  getTierFeatures(tier)[i] = v
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await api.get('/api/admin/settings', { headers: getAdminHeaders() })
    settings.value = res.data || {}
  } catch {
    showMsg('❌ 加载失败，请检查 Admin Token', 'error')
  } finally {
    loading.value = false
  }
})

async function saveSettings() {
  saving.value = true
  try {
    await api.put('/api/admin/settings', settings.value, { headers: getAdminHeaders() })
    showMsg('✅ 保存成功', 'success')
  } catch (e: any) {
    const detail = e.response?.data?.detail || '保存失败'
    showMsg(`❌ ${detail}`, 'error')
  } finally {
    saving.value = false
  }
}

async function exportSettings() {
  try {
    const res = await api.get('/api/admin/settings/export', {
      headers: getAdminHeaders(),
      responseType: 'blob',
    })
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `settings-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showMsg('✅ 导出成功', 'success')
  } catch {
    showMsg('❌ 导出失败', 'error')
  }
}

function triggerImport() {
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const form = new FormData()
  form.append('file', file)
  try {
    await api.post('/api/admin/settings/import', form, {
      headers: { ...getAdminHeaders(), 'Content-Type': 'multipart/form-data' },
    })
    showMsg('✅ 导入成功，重新加载中...', 'success')
    const res = await api.get('/api/admin/settings', { headers: getAdminHeaders() })
    settings.value = res.data || {}
  } catch {
    showMsg('❌ 导入失败', 'error')
  }
  ;(e.target as HTMLInputElement).value = ''
}
</script>

<template>
  <div style="position:fixed;inset:0;background:#f2f2f7;display:flex;flex-direction:column;overflow-y:auto;">

    <!-- Flash message -->
    <Transition name="flash">
      <div
        v-if="msg"
        style="position:fixed;top:16px;right:16px;z-index:9999;padding:10px 18px;border-radius:10px;font-size:14px;font-weight:600;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,0.18);"
        :style="{ background: msgType === 'success' ? '#34c759' : '#ff3b30' }"
      >
        {{ msg }}
      </div>
    </Transition>

    <!-- Header -->
    <div style="display:flex;align-items:center;padding:48px 16px 16px;">
      <NuxtLink to="/admin" style="color:#007aff;text-decoration:none;font-size:15px;">← 返回</NuxtLink>
      <h1 style="flex:1;text-align:center;font-size:17px;font-weight:600;color:#1c1c1e;margin-right:40px;">系统设置</h1>
    </div>

    <div style="padding:0 16px 32px;max-width:720px;margin:0 auto;width:100%;box-sizing:border-box;">

      <!-- Loading -->
      <div v-if="loading" style="display:flex;justify-content:center;padding:48px 0;">
        <div style="width:28px;height:28px;border:3px solid #007aff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;" />
      </div>

      <template v-else>

        <!-- Tab bar -->
        <div style="display:flex;gap:4px;overflow-x:auto;background:#fff;border-radius:12px;padding:6px;margin-bottom:16px;-webkit-overflow-scrolling:touch;scrollbar-width:none;">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            @click="activeTab = tab.key"
            :style="{
              flex:'none',
              padding:'8px 14px',
              borderRadius:'8px',
              border:'none',
              cursor:'pointer',
              fontSize:'13px',
              fontWeight:'600',
              whiteSpace:'nowrap',
              transition:'background 0.15s,color 0.15s',
              background: activeTab === tab.key ? '#007aff' : 'transparent',
              color: activeTab === tab.key ? '#fff' : '#3c3c43',
            }"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Content card -->
        <div style="background:#fff;border-radius:16px;padding:24px;">

          <!-- ===================== LLM TAB ===================== -->
          <template v-if="activeTab === 'llm'">
            <h2 style="font-size:15px;font-weight:700;color:#1c1c1e;margin:0 0 20px;">AI 模型配置</h2>

            <div style="display:flex;flex-direction:column;gap:16px;">
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">Provider</label>
                <input
                  type="text"
                  :value="getField('llm','provider')"
                  @input="setField('llm','provider',($event.target as HTMLInputElement).value)"
                  placeholder="openai / deepseek / ..."
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">API Key</label>
                <input
                  type="password"
                  :value="getField('llm','api_key')"
                  @input="setField('llm','api_key',($event.target as HTMLInputElement).value)"
                  placeholder="sk-..."
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">Base URL</label>
                <input
                  type="text"
                  :value="getField('llm','base_url')"
                  @input="setField('llm','base_url',($event.target as HTMLInputElement).value)"
                  placeholder="https://api.openai.com/v1"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">Model</label>
                <input
                  type="text"
                  :value="getField('llm','model')"
                  @input="setField('llm','model',($event.target as HTMLInputElement).value)"
                  placeholder="gpt-4o / deepseek-chat"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">Max Tokens</label>
                <input
                  type="number"
                  :value="getField('llm','max_tokens')"
                  @input="setField('llm','max_tokens',Number(($event.target as HTMLInputElement).value))"
                  placeholder="4096"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">Temperature</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  :value="getField('llm','temperature')"
                  @input="setField('llm','temperature',Number(($event.target as HTMLInputElement).value))"
                  placeholder="0.7"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
            </div>
          </template>

          <!-- ===================== PRICING TAB ===================== -->
          <template v-if="activeTab === 'pricing'">
            <h2 style="font-size:15px;font-weight:700;color:#1c1c1e;margin:0 0 20px;">定价展示配置</h2>

            <div style="display:flex;flex-direction:column;gap:24px;">
              <div v-for="tier in tiers" :key="tier" style="border:1px solid rgba(0,0,0,0.08);border-radius:12px;padding:16px;">
                <h3 style="font-size:14px;font-weight:700;color:#007aff;margin:0 0 14px;">{{ tierLabels[tier] }}</h3>
                <div style="display:flex;flex-direction:column;gap:12px;">
                  <div>
                    <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">每日限额</label>
                    <input
                      type="number"
                      :value="getTierField(tier,'daily_limit')"
                      @input="setTierField(tier,'daily_limit',Number(($event.target as HTMLInputElement).value))"
                      style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                    />
                  </div>
                  <div>
                    <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">价格</label>
                    <input
                      type="text"
                      :value="getTierField(tier,'price')"
                      @input="setTierField(tier,'price',($event.target as HTMLInputElement).value)"
                      placeholder="¥29"
                      style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                    />
                  </div>
                  <div>
                    <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">周期</label>
                    <input
                      type="text"
                      :value="getTierField(tier,'period')"
                      @input="setTierField(tier,'period',($event.target as HTMLInputElement).value)"
                      placeholder="月 / 年"
                      style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                    />
                  </div>
                  <div v-if="tier === 'basic'">
                    <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">
                      每日深度研判次数
                      <span style="font-size:11px;font-weight:500;color:#8e8e93;margin-left:6px;">（完整结果，超出后降为标准研判）</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      :value="getTierField(tier,'deep_daily')"
                      @input="setTierField(tier,'deep_daily',Number(($event.target as HTMLInputElement).value))"
                      placeholder="1"
                      style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                    />
                  </div>
                </div>
              </div>
            </div>

          <!-- Per-tier features editor -->
          <div style="margin-top:24px;display:flex;flex-direction:column;gap:16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <h3 style="font-size:14px;font-weight:700;color:#1c1c1e;margin:0;">各版本功能列表</h3>
              <button
                @click="autoFillFeatures"
                :disabled="autoFilling"
                style="padding:7px 14px;background:#ff9500;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity 0.15s;"
                :style="{ opacity: autoFilling ? 0.6 : 1 }"
              >{{ autoFilling ? '填充中...' : '✨ 自动填充' }}</button>
            </div>
            <div v-for="tier in tiers" :key="tier" style="border:1px solid rgba(0,0,0,0.08);border-radius:12px;padding:14px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <h3 style="font-size:14px;font-weight:700;margin:0;" :style="{ color: tier === 'free' ? '#8e8e93' : tier === 'basic' ? '#1d4ed8' : '#7c3aed' }">
                  {{ tierLabels[tier] }}功能列表
                </h3>
                <button
                  @click="addTierFeature(tier)"
                  style="padding:5px 10px;background:#007aff;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;"
                >➕ 添加</button>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;">
                <div
                  v-for="(feat, i) in getTierFeatures(tier)"
                  :key="i"
                  style="display:flex;align-items:center;gap:8px;background:#f9f9fb;border-radius:8px;padding:6px 10px;"
                >
                  <input
                    type="text"
                    :value="feat"
                    @input="setTierFeatureText(tier, i, ($event.target as HTMLInputElement).value)"
                    placeholder="功能说明"
                    style="flex:1;padding:6px 8px;border-radius:6px;border:1px solid rgba(0,0,0,0.12);font-size:14px;outline:none;"
                  />
                  <button
                    @click="removeTierFeature(tier, i)"
                    style="padding:4px 8px;background:#ff3b30;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;flex-shrink:0;"
                  >删除</button>
                </div>
                <p v-if="getTierFeatures(tier).length === 0" style="font-size:13px;color:#aeaeb2;text-align:center;padding:6px 0;">暂无功能</p>
              </div>
            </div>
          </div>
          </template>

          <!-- ===================== AFDIAN TAB ===================== -->
          <template v-if="activeTab === 'afdian'">
            <h2 style="font-size:15px;font-weight:700;color:#1c1c1e;margin:0 0 20px;">爱发电配置</h2>

            <div style="display:flex;flex-direction:column;gap:16px;">
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">标准版 Plan ID</label>
                <input
                  type="text"
                  :value="getField('afdian','basic_plan_id')"
                  @input="setField('afdian','basic_plan_id',($event.target as HTMLInputElement).value)"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">专业版 Plan ID</label>
                <input
                  type="text"
                  :value="getField('afdian','premium_plan_id')"
                  @input="setField('afdian','premium_plan_id',($event.target as HTMLInputElement).value)"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">User ID</label>
                <input
                  type="text"
                  :value="getField('afdian','user_id')"
                  @input="setField('afdian','user_id',($event.target as HTMLInputElement).value)"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">Token</label>
                <input
                  type="password"
                  :value="getField('afdian','token')"
                  @input="setField('afdian','token',($event.target as HTMLInputElement).value)"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
            </div>
          </template>

          <!-- ===================== EMAIL TAB ===================== -->
          <template v-if="activeTab === 'email'">
            <h2 style="font-size:15px;font-weight:700;color:#1c1c1e;margin:0 0 20px;">邮件服务配置</h2>

            <div style="display:flex;flex-direction:column;gap:16px;">
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">Resend API Key</label>
                <input
                  type="password"
                  :value="getField('email','resend_api_key')"
                  @input="setField('email','resend_api_key',($event.target as HTMLInputElement).value)"
                  placeholder="re_..."
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">发件地址</label>
                <input
                  type="text"
                  :value="getField('email','from_address')"
                  @input="setField('email','from_address',($event.target as HTMLInputElement).value)"
                  placeholder="noreply@example.com"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">前端基础 URL</label>
                <input
                  type="text"
                  :value="getField('email','frontend_base_url')"
                  @input="setField('email','frontend_base_url',($event.target as HTMLInputElement).value)"
                  placeholder="https://your-domain.com"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
            </div>
          </template>

          <!-- ===================== APP TAB ===================== -->
          <template v-if="activeTab === 'app'">
            <h2 style="font-size:15px;font-weight:700;color:#1c1c1e;margin:0 0 20px;">应用信息配置</h2>

            <div style="display:flex;flex-direction:column;gap:16px;">
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">应用名称</label>
                <input
                  type="text"
                  :value="getField('app','name')"
                  @input="setField('app','name',($event.target as HTMLInputElement).value)"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>

              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid rgba(0,0,0,0.08);border-radius:10px;">
                <label style="font-size:13px;font-weight:600;color:#1c1c1e;">需要邀请码注册</label>
                <label style="position:relative;display:inline-block;width:44px;height:26px;cursor:pointer;">
                  <input
                    type="checkbox"
                    :checked="getField('app','require_invite_code')"
                    @change="setField('app','require_invite_code',($event.target as HTMLInputElement).checked)"
                    style="opacity:0;width:0;height:0;"
                  />
                  <span
                    :style="{
                      position:'absolute',inset:'0',borderRadius:'13px',transition:'background 0.2s',
                      background: getField('app','require_invite_code') ? '#007aff' : 'rgba(120,120,128,0.32)',
                    }"
                  />
                  <span
                    :style="{
                      position:'absolute',top:'3px',
                      left: getField('app','require_invite_code') ? '21px' : '3px',
                      width:'20px',height:'20px',borderRadius:'50%',background:'#fff',
                      boxShadow:'0 1px 4px rgba(0,0,0,0.3)',transition:'left 0.2s',
                    }"
                  />
                </label>
              </div>

              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">Pro 试用弹窗标题</label>
                <input
                  type="text"
                  :value="getField('app','pro_trial_title')"
                  @input="setField('app','pro_trial_title',($event.target as HTMLInputElement).value)"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">Pro 试用弹窗副标题</label>
                <input
                  type="text"
                  :value="getField('app','pro_trial_subtitle')"
                  @input="setField('app','pro_trial_subtitle',($event.target as HTMLInputElement).value)"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">试用结束页标题</label>
                <input
                  type="text"
                  :value="getField('app','trial_ended_title')"
                  @input="setField('app','trial_ended_title',($event.target as HTMLInputElement).value)"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#1c1c1e;margin-bottom:4px;">试用结束页副标题</label>
                <input
                  type="text"
                  :value="getField('app','trial_ended_subtitle')"
                  @input="setField('app','trial_ended_subtitle',($event.target as HTMLInputElement).value)"
                  style="width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid rgba(0,0,0,0.12);font-size:15px;outline:none;"
                />
              </div>
            </div>
          </template>

          <!-- Save button (every tab) -->
          <div style="margin-top:24px;">
            <button
              @click="saveSettings"
              :disabled="saving"
              style="padding:12px 24px;background:#007aff;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;opacity:1;transition:opacity 0.15s;"
              :style="{ opacity: saving ? 0.6 : 1 }"
            >
              {{ saving ? '保存中...' : '💾 保存' }}
            </button>
          </div>

        </div>

        <!-- Export / Import -->
        <div style="display:flex;gap:12px;margin-top:16px;">
          <button
            @click="exportSettings"
            style="flex:1;padding:12px;background:#fff;color:#007aff;border:1px solid #007aff;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;"
          >
            导出配置
          </button>
          <button
            @click="triggerImport"
            style="flex:1;padding:12px;background:#fff;color:#34c759;border:1px solid #34c759;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;"
          >
            导入配置
          </button>
          <input ref="fileInput" type="file" accept=".json" style="display:none;" @change="onFileChange" />
        </div>

      </template>
    </div>
  </div>
</template>

<style scoped>
@keyframes spin {
  to { transform: rotate(360deg); }
}
.flash-enter-active, .flash-leave-active { transition: opacity 0.3s, transform 0.3s; }
.flash-enter-from, .flash-leave-to { opacity: 0; transform: translateY(-8px); }
input:focus { border-color: #007aff !important; box-shadow: 0 0 0 3px rgba(0,122,255,0.15); }
</style>
