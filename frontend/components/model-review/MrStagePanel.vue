<script setup lang="ts">
import MrState from './MrState.vue'
import MrStatusBadge from './MrStatusBadge.vue'

defineProps<{
  title: string
  items: Record<string, any>[]
  empty: string
  status?: string
}>()
</script>

<template>
  <section class="mr-panel">
    <div class="mr-panel-header">
      <div>
        <h2 class="mr-panel-title">{{ title }}</h2>
        <p class="mr-panel-sub">{{ items?.length || 0 }} 条记录</p>
      </div>
      <MrStatusBadge :status="status || 'neutral'" :label="String(items?.length || 0)" />
    </div>
    <MrState v-if="!items?.length" title="暂无记录" :text="empty" />
    <div v-else>
      <div v-for="item in items" :key="item.id" class="mr-record">
        <div class="mr-record-main">
          <div class="mr-record-title">
            <strong>{{ item.symbol_name }}</strong>
            <MrStatusBadge :status="item.status" />
          </div>
          <div class="mr-record-meta">{{ item.market }} / {{ item.symbol }} / 目标日 {{ item.target_date }}</div>
          <p v-if="item.analysis_summary" class="mr-record-copy">{{ item.analysis_summary }}</p>
        </div>
        <div class="mr-record-actions">
          <slot :item="item" />
        </div>
      </div>
    </div>
  </section>
</template>
