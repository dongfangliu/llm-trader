# 分享 & 保存 — 研判凭证功能文档

> 最后更新：2026-03-08  
> 对应迭代：R11（当前最新）

---

## 功能概述

分析结果底部有两个核心操作：**收藏（保存）** 和 **分享研判凭证**。

- **收藏**：将完整研判数据存入 localStorage，随时调出查看历史记录
- **分享**：生成一张 1080×1440（3:4，适配小红书/微信）PNG 研判凭证卡片，供截图分享

---

## 文件结构

| 文件 | 作用 |
|---|---|
| `frontend/src/lib/shareCard.ts` | 所有卡片生成函数（Canvas 绘图） |
| `frontend/src/components/SharePreviewSheet.tsx` | 分享预览底部弹层（含平台按钮） |
| `frontend/src/components/SavedRecordsSheet.tsx` | "我的研判记录"底部弹层 |
| `frontend/src/components/ResultSheet.tsx` | 结果底部弹层，底部 footer 含书签+分享按钮 |
| `frontend/src/app/page.tsx` | 主状态：`savedRecords`、`handleBookmark()`、`handleShareViralCard()` |
| `frontend/src/styles/globals.css` | `.sps-*`（SharePreviewSheet）和 `.rs-footer`（ResultSheet） |

---

## 核心函数：`generatePredictionCardBlob`

**位置：** `frontend/src/lib/shareCard.ts`，最后一个 export 函数

**接口：**
```ts
export interface PredictionCardParams {
  stockName: string;
  stockCode: string;
  market: string;          // 'a' | 'hk' | 'us' | 'futures'
  action: 'buy' | 'sell' | 'hold';
  confidence: number | null;   // 接收但不渲染（已从卡面移除）
  latestPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  opportunityGrade: string | null;  // 只渲染 A/B/C，D 不显示
  reasonExcerpt: string;
  analyzedAt: string;      // ISO timestamp
  tier: string;
  appName: string;
  appBaseUrl?: string;     // QR 码指向的 URL，默认 window.location.origin
}
```

**设计规范（R11 当前版本）：**

- **尺寸**：1080×1440 px（3:4 比例），DPR=2（实际 2160×2880 canvas）
- **背景**：Hero 区（顶部 580px）为策略纯色；白区（#FAFAFA）从 y=580 延续到底部
- **策略配色**（中国股市惯例）：
  - 看好（buy）→ `#FF3B30`（Apple 红）
  - 看空（sell）→ `#34C759`（Apple 绿）
  - 观望（hold）→ `#FF9F0A`（Apple 琥珀）
- **Hero 数字**：
  - 买/卖：目标价相对当前价的隐含收益率 `(target-latest)/latest*100`
  - 观望且收益率 < 0.5%：显示止损距离（`maxLoss%`），标签改为"止损参考距离"
- **内容区（白区）布局，从 y=620 起：**
  1. 策略色 Pill + 股票名
  2. 三列白卡：研判时价 / 目标估价 / 止损参考（含 % 距离子行）
  3. 分隔线
  4. 技术信号摘要（最多 2 行，22px）
  5. 分隔线
  6. 时间戳封存盒（左侧策略色竖条 + 日期 + 说明）
  7. 分隔线
  8. QR 码 + CTA 文案（**锚定底部**，y = H-346 = 1094）
  9. 免责声明（y = H-24）+ 策略色底条（6px）
- **QR 码**：`qrcode` npm 库生成真实可扫码图，URL = `appBaseUrl ?? window.location.origin`
- **CTA 文案**：
  - "我已布局，你呢？"（40px 800weight）
  - "比分析师早 3 小时拿到信号"（22px 灰色）
  - "→  免费解锁每日 AI 研判"（22px 策略色）
  - URL 小字（15px 灰色）

---

## 保存功能

**接口：**
```ts
interface SavedRecord {
  id: string;              // analyzedAt ISO timestamp（唯一键）
  stockName: string;
  stockCode: string;
  market: string;
  action: 'buy' | 'sell' | 'hold';
  impliedReturn: number | null;
  opportunityGrade: string | null;
  latestPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  reasonExcerpt: string;
  analyzedAt: string;
  savedAt: string;
  resultSnapshot: unknown;  // 完整 API 响应快照
}
```

**localStorage key：** `saved_records_v2`（旧 `saved_result_ids` 已弃用）

**书签按钮行为：**
- 未收藏 → 点击 → 存入 `saved_records_v2` + toast "已收藏 {股票名}"
- 已收藏 → 点击 → 打开"我的研判记录"列表（`SavedRecordsSheet`）

---

## `SavedRecordsSheet` 组件

显示所有已保存研判，每条展示：
- 股票名 + 策略色 Pill
- 隐含收益率（红绿色）
- 机会等级 badge（A/B/C）
- 研判时价
- 时间戳 🔒
- 删除按钮（单条）

Prop：
```ts
interface SavedRecordsSheetProps {
  open: boolean;
  onClose: () => void;
  records: SavedRecord[];
  onOpenRecord: (r: SavedRecord) => void;
  onDeleteRecord: (id: string) => void;
}
```

---

## `SharePreviewSheet` 组件

展示生成的卡片图预览 + 分享平台按钮行：
- 保存到相册 / 小红书 / 微信 / 朋友圈

标题："你的研判凭证"

---

## 待改进（已知 TODO）

- [ ] `SavedRecord` 接口在 `page.tsx` 和 `SavedRecordsSheet.tsx` 各定义一次，应提取到 `frontend/src/types/saved.ts`
- [ ] 卡片在买入/卖出场景的 Hero 颜色（红/绿）尚未截图验证，仅 观望/琥珀 有截图
- [ ] `qrcode` 在 SSR 环境会 fallback 到装饰性假码，但前端渲染时正常（`await import('qrcode')` 动态引入）
- [ ] SharePreviewSheet 内的卡片预览因 1080px 宽度被缩放，移动端实际效果需真机验证
- [ ] CTA 文案可根据 action 差异化：看好时"我买了，你呢？" / 看空时"我已做空，你呢？"

---

## 相关依赖

```json
"qrcode": "^1.x",
"@types/qrcode": "^1.x"
```

已安装于 `frontend/package.json`。

---

## 截图文件（项目根目录）

| 文件 | 内容 |
|---|---|
| `ss_share_v5_sheet_hero.png` | ResultSheet 结果页顶部 |
| `ss_share_v5_footer.png` | 底部 footer（书签+分享按钮） |
| `ss_share_v5_bookmarked.png` | 已收藏状态 |
| `ss_share_v5_share_preview.png` | SharePreviewSheet + 卡片预览 |
| `ss_r10_*.png` | R10 时期的 ResultSheet 各区域截图 |
