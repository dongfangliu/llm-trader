<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from '#app'
import { useAuthStore } from '~/stores/auth'
import { DEFAULT_APP_NAME } from '~/constants/app'

const route = useRoute()
const auth = useAuthStore()

interface NavItem {
  path: string
  label: string
  icon: string
  adminOnly?: boolean
}

const navItems = computed<NavItem[]>(() => {
  const items: NavItem[] = [
    { path: '/', label: '分析', icon: 'chart' },
    { path: '/account', label: '账户', icon: 'person' },
  ]
  if (auth.isAdmin) {
    items.push({ path: '/admin', label: '管理', icon: 'admin', adminOnly: true })
  }
  return items
})

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const tierLabel: Record<string, string> = {
  free: '免费版',
  basic: '基础版',
  premium: '专业版',
}

const tierColor: Record<string, string> = {
  free: 'var(--ios-secondary)',
  basic: 'var(--ios-green)',
  premium: 'var(--ios-blue)',
}
</script>

<template>
  <div style="display: flex; min-height: 100dvh; background: var(--ios-bg);">

    <!-- Sidebar -->
    <aside style="width: 240px; min-width: 240px; height: 100dvh; position: sticky; top: 0; background: rgba(249,249,249,0.97); border-right: 0.5px solid rgba(0,0,0,0.12); display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden;">

      <!-- Brand -->
      <div style="padding: 20px 16px 16px; border-bottom: 0.5px solid rgba(0,0,0,0.08);">
        <div style="display: flex; align-items: center; gap: 8px;">
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
            <rect x="2" y="9" width="5" height="7" rx="1.5" fill="#dc2626"/>
            <line x1="4.5" y1="6" x2="4.5" y2="9" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="4.5" y1="16" x2="4.5" y2="19" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
            <rect x="8.5" y="4" width="5" height="11" rx="1.5" fill="var(--ios-green)"/>
            <line x1="11" y1="1.5" x2="11" y2="4" stroke="var(--ios-green)" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="11" y1="15" x2="11" y2="17.5" stroke="var(--ios-green)" stroke-width="1.5" stroke-linecap="round"/>
            <rect x="15" y="7" width="5" height="8" rx="1.5" fill="#dc2626"/>
            <line x1="17.5" y1="4" x2="17.5" y2="7" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="17.5" y1="15" x2="17.5" y2="18" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span style="font-size: 15px; font-weight: 700; color: var(--ios-label); letter-spacing: -0.3px;">{{ DEFAULT_APP_NAME }}</span>
        </div>
        <p style="margin: 5px 0 0 26px; font-size: 11px; color: var(--ios-secondary);">股票智能研判</p>
      </div>

      <!-- Nav links -->
      <nav style="flex: 1; padding: 10px 8px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto;">
        <NuxtLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="sl-nav-link"
          :class="{ active: isActive(item.path) }"
        >
          <!-- chart icon -->
          <svg v-if="item.icon === 'chart'" width="16" height="16" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="11" width="3" height="7" rx="1" fill="currentColor"/>
            <rect x="7" y="7" width="3" height="11" rx="1" fill="currentColor"/>
            <rect x="12" y="4" width="3" height="14" rx="1" fill="currentColor"/>
            <rect x="17" y="8" width="1" height="10" rx="0.5" fill="currentColor" opacity="0.4"/>
          </svg>
          <!-- person icon -->
          <svg v-else-if="item.icon === 'person'" width="16" height="16" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="6.5" r="3.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M3 17.5c0-3.59 3.134-6.5 7-6.5s7 2.91 7 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <!-- admin/gear icon -->
          <svg v-else-if="item.icon === 'admin'" width="16" height="16" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <!-- User info -->
      <div style="padding: 14px 16px; border-top: 0.5px solid rgba(0,0,0,0.08);">
        <template v-if="auth.isLoggedIn">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(0,122,255,0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <span style="font-size: 13px; font-weight: 700; color: var(--ios-blue);">
                {{ (auth.user?.email || '?')[0].toUpperCase() }}
              </span>
            </div>
            <div style="flex: 1; min-width: 0;">
              <p style="font-size: 13px; font-weight: 500; color: var(--ios-label); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                {{ auth.user?.email }}
              </p>
              <p style="font-size: 11px; margin: 1px 0 0;">
                <span
                  style="font-weight: 600; padding: 1px 5px; border-radius: 3px; font-size: 10px;"
                  :style="{
                    color: tierColor[auth.tier] || 'var(--ios-secondary)',
                    background: (tierColor[auth.tier] || 'var(--ios-secondary)') + '1a',
                  }"
                >{{ tierLabel[auth.tier] || auth.tier }}</span>
              </p>
            </div>
          </div>
        </template>
        <template v-else>
          <NuxtLink
            to="/login"
            style="display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; color: var(--ios-blue); text-decoration: none;"
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
              <path d="M13 3h4a1 1 0 011 1v12a1 1 0 01-1 1h-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <path d="M8 14l4-4-4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              <line x1="12" y1="10" x2="2" y2="10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            登录 / 注册
          </NuxtLink>
        </template>
      </div>

    </aside>

    <!-- Main content -->
    <main style="flex: 1; overflow-y: auto; min-height: 100dvh;">
      <slot />
    </main>

  </div>
</template>

<style scoped>
.sl-nav-link {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  color: #3c3c43;
  text-decoration: none;
  transition: background 0.1s, color 0.1s;
  -webkit-tap-highlight-color: transparent;
}
.sl-nav-link:hover {
  background: rgba(0,0,0,0.05);
}
.sl-nav-link.active {
  background: rgba(0,122,255,0.1);
  color: var(--ios-blue);
}
</style>
