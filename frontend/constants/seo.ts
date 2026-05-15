export const SITE_NAME = 'K线AI分析助手'
export const SITE_DESCRIPTION = '面向 A股、港股、美股和期货的 AI K线分析工具，结合均线、MACD、RSI、ATR、成交量和风险控制生成研究参考。'
export const DEFAULT_OG_IMAGE = '/icons/icon-512.png'

export const MARKET_LABELS: Record<string, string> = {
  a: 'A股',
  hk: '港股',
  us: '美股',
  futures: '期货',
}

export const CORE_STOCKS = [
  { market: 'a', symbol: '600519', name: '贵州茅台' },
  { market: 'a', symbol: '300750', name: '宁德时代' },
  { market: 'a', symbol: '002594', name: '比亚迪' },
  { market: 'a', symbol: '600036', name: '招商银行' },
  { market: 'a', symbol: '000858', name: '五粮液' },
  { market: 'hk', symbol: '00700', name: '腾讯控股' },
  { market: 'hk', symbol: '03690', name: '美团' },
  { market: 'hk', symbol: '01810', name: '小米集团' },
  { market: 'hk', symbol: '09988', name: '阿里巴巴' },
  { market: 'us', symbol: 'AAPL', name: '苹果' },
  { market: 'us', symbol: 'NVDA', name: '英伟达' },
  { market: 'us', symbol: 'TSLA', name: '特斯拉' },
  { market: 'us', symbol: 'BABA', name: '阿里巴巴' },
]

export const CORE_FUTURES = [
  { symbol: 'MA', name: '甲醇' },
  { symbol: 'RB', name: '螺纹钢' },
  { symbol: 'CU', name: '沪铜' },
  { symbol: 'SA', name: '纯碱' },
]

export const LEARN_ARTICLES = [
  {
    slug: 'kline',
    title: 'K线图怎么看',
    desc: 'K线图用于记录开盘价、收盘价、最高价和最低价，是观察趋势、波动与交易情绪的基础工具。',
    points: ['实体反映开盘与收盘的差异', '影线反映盘中最高和最低位置', '连续K线比单根K线更适合判断趋势'],
  },
  {
    slug: 'ma',
    title: 'MA均线怎么看',
    desc: 'MA均线用于观察价格在不同周期上的平均位置，常用于判断趋势方向和价格偏离程度。',
    points: ['MA10更贴近短期波动', 'MA30和MA60更适合观察中期趋势', '均线多头排列只代表趋势状态，不代表确定收益'],
  },
  {
    slug: 'macd',
    title: 'MACD指标怎么看',
    desc: 'MACD用于观察价格动能变化，常结合DIF、DEA和柱状线变化判断动能方向。',
    points: ['金叉和死叉只是一种动能变化信号', '柱状线扩大通常代表动能增强', '震荡行情中MACD容易反复发出信号'],
  },
  {
    slug: 'rsi',
    title: 'RSI指标怎么看',
    desc: 'RSI用于观察一段时间内上涨与下跌力量的相对强弱，常见区间为0到100。',
    points: ['RSI高于70常被视为偏热区', 'RSI低于30常被视为偏弱区', '强趋势中RSI可能长时间停留在极端区域'],
  },
  {
    slug: 'atr',
    title: 'ATR指标怎么看',
    desc: 'ATR用于衡量价格波动幅度，不直接判断方向，更适合观察风险和波动空间。',
    points: ['ATR变大代表波动扩大', 'ATR变小代表波动收敛', 'ATR可辅助观察止损距离和仓位风险'],
  },
  {
    slug: 'volume',
    title: '成交量怎么看',
    desc: '成交量用于观察价格变化背后的交易活跃度，常与突破、回撤和趋势延续一起判断。',
    points: ['放量突破需要结合位置和趋势确认', '缩量回调可能代表抛压减弱', '异常放量也可能来自消息或流动性冲击'],
  },
  {
    slug: 'support-resistance',
    title: '支撑压力位怎么看',
    desc: '支撑位和压力位用于观察价格反复争夺的区域，可辅助制定观察位、止损位和交易计划。',
    points: ['历史高低点常形成参考区域', '放量突破后压力可能转为支撑', '支撑压力是区间，不是精确点位'],
  },
  {
    slug: 'stop-loss-position',
    title: '止损与仓位怎么设',
    desc: '止损和仓位控制用于限制单次错误判断的影响，是技术分析落地到交易计划的关键环节。',
    points: ['先确定可承受亏损再反推仓位', '止损距离可结合ATR和结构位', '仓位上限应服务于整体账户风险'],
  },
  {
    slug: 'a-stock-analysis',
    title: 'A股K线分析怎么做',
    desc: 'A股K线分析通常结合趋势、成交量、板块环境和风险控制，适合用统一框架减少主观判断。',
    points: ['先确认市场与板块环境', '再观察均线、MACD、RSI等趋势动能', '最后用止损和仓位参数约束风险'],
    market: 'a',
  },
  {
    slug: 'hk-stock-analysis',
    title: '港股K线分析怎么做',
    desc: '港股K线分析需要额外关注流动性、跳空和外部市场影响，技术指标应结合成交活跃度一起看。',
    points: ['优先观察成交额与流动性', '留意隔夜消息造成的跳空', '用多周期趋势过滤短线噪音'],
    market: 'hk',
  },
  {
    slug: 'us-stock-analysis',
    title: '美股K线分析怎么做',
    desc: '美股K线分析可结合趋势、财报窗口、成交量和波动率，重点关注趋势延续与风险事件。',
    points: ['财报和宏观事件前后波动可能放大', '趋势股可结合均线和成交量观察', '止损距离应匹配个股波动率'],
    market: 'us',
  },
  {
    slug: 'futures-analysis',
    title: '期货K线分析怎么做',
    desc: '期货K线分析需要重视杠杆、波动和合约特性，技术指标只能作为研究参考，风险控制优先级更高。',
    points: ['先确认主力合约和波动水平', '结合ATR设置风险距离', '避免用股票仓位逻辑直接套用期货'],
    market: 'futures',
  },
]

export function getLearnArticle(slug: string) {
  return LEARN_ARTICLES.find(article => article.slug === slug)
}

export function analyzePath(market?: string, symbol?: string, source?: string) {
  const src = source ? `src=${encodeURIComponent(source)}` : ''
  if (!market || !symbol) return src ? `/?${src}` : '/'
  const srcParam = src ? `&${src}` : ''
  return `/?market=${encodeURIComponent(market)}&symbol=${encodeURIComponent(symbol)}${srcParam}`
}
