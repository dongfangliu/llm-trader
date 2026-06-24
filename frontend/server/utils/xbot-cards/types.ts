export type Direction = 'up' | 'down' | 'hold'
export type Market = 'A' | 'HK' | 'US'
export type CardVariant = 'promise' | 'proof' | 'data_record' | 'summary'

/** One stock row in a market-summary settlement card */
export interface SummaryItem {
  symbol: string
  symbol_name: string
  predicted_direction: Direction
  actual_change_pct: number | null
  is_correct: boolean | null
  settlement_verdict_label?: string | null
  settlement_rule_label?: string | null
  plan_outcome_label?: string | null
  plan_effective?: boolean | null
}

export interface CardPayload {
  variant: CardVariant
  symbol: string
  symbol_name: string
  market: Market
  hot_rank?: number
  prediction_date: string
  target_date?: string
  direction?: Direction
  predicted_direction?: Direction
  confidence?: number
  close_price?: number
  target_price?: number
  stop_loss?: number
  accuracy_all?: string
  product_url?: string
  summary?: string
  market_diagnosis?: string
  opportunity_assessment?: string
  risk_analysis?: string
  execution_plan?: string
  disclaimer?: string
  actual_change_pct?: number
  is_correct?: boolean | null
  settlement_rule_label?: string | null
  settlement_verdict_label?: string | null
  settlement_explanation?: string | null
  settlement_band_low?: number | null
  settlement_band_high?: number | null
  plan_outcome?: string | null
  plan_outcome_label?: string | null
  plan_outcome_tone?: string | null
  plan_effective?: boolean | null
  brand_name?: string
  /** Summary-card specific */
  summary_items?: SummaryItem[]
  summary_market?: string    // 'A' | 'HK' | 'US'
  summary_date?: string      // YYYY-MM-DD
}
