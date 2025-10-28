/**
 * 交易时段判断工具
 * 纯碱期货(SA)交易时间：
 * - 日盘: 09:00-15:00
 * - 夜盘: 21:00-23:00
 */

export interface TradingStatus {
  isTrading: boolean;        // 是否在交易时段
  sessionType: 'day' | 'night' | 'closed';  // 交易时段类型
  nextOpenTime: string;      // 下次开盘时间
  message: string;           // 状态描述
}

/**
 * 检查当前是否在交易时段
 */
export function checkTradingHours(date: Date = new Date()): TradingStatus {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  // 日盘: 09:00-15:00 (540-900分钟)
  const dayStart = 9 * 60;      // 09:00 = 540分钟
  const dayEnd = 15 * 60;       // 15:00 = 900分钟

  // 夜盘: 21:00-23:00 (1260-1380分钟)
  const nightStart = 21 * 60;   // 21:00 = 1260分钟
  const nightEnd = 23 * 60;     // 23:00 = 1380分钟

  // 判断是否在日盘交易时段
  if (timeInMinutes >= dayStart && timeInMinutes < dayEnd) {
    return {
      isTrading: true,
      sessionType: 'day',
      nextOpenTime: '',
      message: '日盘交易中'
    };
  }

  // 判断是否在夜盘交易时段
  if (timeInMinutes >= nightStart && timeInMinutes < nightEnd) {
    return {
      isTrading: true,
      sessionType: 'night',
      nextOpenTime: '',
      message: '夜盘交易中'
    };
  }

  // 非交易时段，计算下次开盘时间
  let nextOpenTime = '';
  let message = '';

  if (timeInMinutes < dayStart) {
    // 早上9点前 -> 等待日盘开盘
    nextOpenTime = '09:00';
    message = `休盘中（日盘 ${nextOpenTime} 开盘）`;
  } else if (timeInMinutes >= dayEnd && timeInMinutes < nightStart) {
    // 15:00-21:00 -> 等待夜盘开盘
    nextOpenTime = '21:00';
    message = `休盘中（夜盘 ${nextOpenTime} 开盘）`;
  } else {
    // 23:00后 -> 等待次日日盘开盘
    nextOpenTime = '次日 09:00';
    message = `休盘中（${nextOpenTime} 开盘）`;
  }

  return {
    isTrading: false,
    sessionType: 'closed',
    nextOpenTime,
    message
  };
}

/**
 * 检查数据是否过期（超过5分钟未更新）
 */
export function isDataStale(timestamp: string, thresholdMinutes: number = 5): boolean {
  if (!timestamp) return true;

  try {
    const dataTime = new Date(timestamp).getTime();
    const now = new Date().getTime();
    const diffMinutes = (now - dataTime) / 1000 / 60;

    return diffMinutes > thresholdMinutes;
  } catch {
    return true;
  }
}

/**
 * 格式化数据时效性描述
 */
export function formatDataFreshness(timestamp: string): string {
  if (!timestamp) return '数据未知';

  try {
    const dataTime = new Date(timestamp).getTime();
    const now = new Date().getTime();
    const diffSeconds = Math.floor((now - dataTime) / 1000);

    if (diffSeconds < 60) {
      return `${diffSeconds}秒前`;
    } else if (diffSeconds < 3600) {
      const minutes = Math.floor(diffSeconds / 60);
      return `${minutes}分钟前`;
    } else {
      const hours = Math.floor(diffSeconds / 3600);
      return `${hours}小时前`;
    }
  } catch {
    return '时间解析失败';
  }
}
