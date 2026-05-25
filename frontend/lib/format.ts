// 文本格式化工具

// 去掉方法论内部使用的「X点 / X点钟」时钟方向数字表述，用户侧一律不展示。
// 仅匹配数字+点后紧跟趋势词的情况（如 "4点 稳定下跌"、"趋势为4点稳定下跌"、"2点钟方向"），
// 不会误伤正常的「3点30分」之类时间表述。
const CLOCK_RE = /\d+\s*点钟?\s*(?=稳定|加速|横向|上涨|下跌|整理|方向|附近)/g

export function stripClock(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s).replace(CLOCK_RE, '')
}
