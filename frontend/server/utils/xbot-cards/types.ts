export type Direction = 'up' | 'down' | 'hold'
export type Market = 'A' | 'HK' | 'US'
export type CardVariant = 'promise' | 'proof' | 'data_record'

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
  is_correct?: boolean
  brand_name?: string
}
