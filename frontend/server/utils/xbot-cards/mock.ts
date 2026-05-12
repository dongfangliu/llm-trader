import type { CardPayload } from './types'

const BASE = {
  symbol: '002594',
  symbol_name: '比亚迪',
  market: 'A' as const,
  hot_rank: 3,
  prediction_date: '2026-04-18',
  target_date: '2026-04-19',
  confidence: 87,
  close_price: 315.20,
  target_price: 340.00,
  stop_loss: 305.00,
  accuracy_all: '21/30',
  product_url: 'https://caicai.tech',
  summary: '比亚迪技术突破推动新能源汽车销量超预期，主力资金持续流入，短线看涨信号明确。',
  market_diagnosis: '大盘震荡走强，新能源板块资金流入明显，市场情绪偏多，短线做多窗口开启。',
  opportunity_assessment: '比亚迪近期销量数据超预期，技术面突破关键压力位315，量价配合良好，MACD金叉确认。',
  risk_analysis: '需关注大盘系统性风险及新能源政策变化。建议止损位设在305以下，控制仓位不超过20%。',
  execution_plan: '分批建仓，首批50%仓位315附近入场，目标340，止损305，风险收益比约2.5:1。',
  disclaimer: '⚠️ 仅供参考，非投资建议',
}

export const MOCK_PREDICTION: Omit<CardPayload, 'variant'> = {
  ...BASE,
  direction: 'up',
}

export const MOCK_RESULT: Omit<CardPayload, 'variant'> = {
  ...BASE,
  predicted_direction: 'up',
  actual_change_pct: 3.8,
  is_correct: true,
}

export const MOCK_HOLD_RESULT: Omit<CardPayload, 'variant'> = {
  ...BASE,
  symbol: '600036',
  symbol_name: '招商银行',
  predicted_direction: 'hold',
  actual_change_pct: 0.38,
  is_correct: true,
  target_price: 322.00,
  stop_loss: 309.00,
  settlement_rule_label: '收盘区间',
  settlement_verdict_label: '区间命中',
  settlement_explanation: '目标日收盘价留在目标价与止损价形成的区间',
  settlement_band_low: 309.00,
  settlement_band_high: 322.00,
}

export const MOCK_SUMMARY_A: Omit<CardPayload, 'variant'> = {
  ...BASE,
  summary_market: 'A',
  summary_date: '2026-04-24',
  accuracy_all: '21/30',
  product_url: 'https://caicai.tech',
  summary_items: [
    { symbol: '002594', symbol_name: '比亚迪',   predicted_direction: 'up',   actual_change_pct:  3.82, is_correct: true  },
    { symbol: '600519', symbol_name: '贵州茅台', predicted_direction: 'down', actual_change_pct: -1.24, is_correct: true  },
    { symbol: '300750', symbol_name: '宁德时代', predicted_direction: 'up',   actual_change_pct: -0.88, is_correct: false },
    { symbol: '688981', symbol_name: '中芯国际', predicted_direction: 'down', actual_change_pct: -2.11, is_correct: true  },
    { symbol: '600036', symbol_name: '招商银行', predicted_direction: 'hold', actual_change_pct:  0.38, is_correct: true, settlement_verdict_label: '区间命中', settlement_rule_label: '收盘区间' },
  ],
}

export const MOCK_SUMMARY_HK: Omit<CardPayload, 'variant'> = {
  ...BASE,
  symbol: '0700',
  symbol_name: '腾讯控股',
  market: 'HK' as const,
  summary_market: 'HK',
  summary_date: '2026-04-24',
  accuracy_all: '21/30',
  product_url: 'https://caicai.tech',
  summary_items: [
    { symbol: '0700', symbol_name: '腾讯控股', predicted_direction: 'up',   actual_change_pct:  1.57, is_correct: true  },
    { symbol: '1810', symbol_name: '小米集团', predicted_direction: 'down', actual_change_pct:  0.43, is_correct: false },
    { symbol: '3690', symbol_name: '美团',     predicted_direction: 'up',   actual_change_pct:  2.31, is_correct: true  },
    { symbol: '9988', symbol_name: '阿里巴巴', predicted_direction: 'down', actual_change_pct: -1.80, is_correct: true  },
  ],
}
