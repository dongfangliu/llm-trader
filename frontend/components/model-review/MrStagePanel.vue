<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import MrState from './MrState.vue'
import MrStatusBadge from './MrStatusBadge.vue'

const props = withDefaults(defineProps<{
  title: string
  items: Record<string, any>[]
  empty: string
  status?: string
  defaultExpanded?: boolean
  collapsible?: boolean
  description?: string
}>(), {
  defaultExpanded: true,
  collapsible: true,
})

const expanded = ref(props.defaultExpanded)

watch(() => props.items?.length, (count, prev) => {
  if (!props.collapsible) return
  if (!count) return
  if ((prev ?? 0) === 0 && count > 0) expanded.value = true
})

const count = computed(() => props.items?.length || 0)
const headerId = computed(() => `mr-stage-${Math.random().toString(36).slice(2, 8)}`)
</script>

<template>
  <section class="mr-panel">
    <header class="mr-panel-header">
      <div>
        <h2 class="mr-panel-title">
          <button
            v-if="collapsible"
            type="button"
            class="mr-collapse-trigger"
            :aria-expanded="expanded"
            :aria-controls="headerId"
            @click="expanded = !expanded"
          >
            <span class="chevron" aria-hidden="true">▾</span>
            {{ title }}
          </button>
          <template v-else>{{ title }}</template>
        </h2>
        <p class="mr-panel-sub">
          {{ description || `${count} 条记录` }}
        </p>
      </div>
      <MrStatusBadge :status="status || 'neutral'" :label="String(count)" />
    </header>
    <div :id="headerId" v-show="!collapsible || expanded">
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
    </div>
  </section>
</template>
