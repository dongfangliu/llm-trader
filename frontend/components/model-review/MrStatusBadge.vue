<script setup lang="ts">
const props = defineProps<{
  status?: string
  label?: string
}>()

const statusLabel: Record<string, string> = {
  pending: '待审核',
  approved: '已通过待结算',
  posted: '已发布待结算',
  rejected: '已拒绝',
  settled: '已结算',
  awaiting: '待验证',
  hit: '命中',
  miss: '未命中',
  ok: '正常',
  error: '异常',
  neutral: '未开始',
  info: '信息',
}
</script>

<template>
  <span :class="['mr-status-badge', `mr-status-${props.status || 'neutral'}`]">
    {{ props.label || statusLabel[props.status || 'neutral'] || props.status || '-' }}
  </span>
</template>
