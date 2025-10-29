# 测试技术指标修复效果
Write-Host "=== 测试LLM回测技术指标修复 ===" -ForegroundColor Cyan

# 清理旧缓存
$cacheFile = "logs\llm_decisions_cache.json"
if (Test-Path $cacheFile) {
    Write-Host "清理旧缓存: $cacheFile" -ForegroundColor Yellow
    Remove-Item $cacheFile -Force
}

# 运行短期回测（只测试几天，减少LLM调用次数）
Write-Host "`n运行短期回测测试..." -ForegroundColor Green
python src\backtest\llm_decision_backtest.py `
    --mode llm_direct `
    --symbol CZCE.SA0 `
    --period 15 `
    --start "2024-09-01 09:00" `
    --end "2024-09-03 15:00" `
    --initial_units 2.0 `
    --margin_ratio 0.18 `
    --show_rationale `
    --debug

Write-Host "`n=== 测试完成 ===" -ForegroundColor Cyan
Write-Host "请检查输出中：" -ForegroundColor Yellow
Write-Host "1. ✅ 应该看到 '有效数据点: MA10=xxx, MA30=xxx, RSI=xxx, ATR=xxx'" -ForegroundColor White
Write-Host "2. ✅ 应该看到 '已复制指标: ma10(xxx), ma30(xxx), ...' " -ForegroundColor White
Write-Host "3. ✅ 波动率状态不再是'未知'，而是'扩张/收缩/正常'" -ForegroundColor White
Write-Host "4. ✅ 应该有实际的交易决策（不全是hold）" -ForegroundColor White
Write-Host "5. ✅ 决策前关键指标检查应显示有效值（不是NaN）" -ForegroundColor White
