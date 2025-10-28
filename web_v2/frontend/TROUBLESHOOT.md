# 调试步骤

## 如果看不到 RealTimePricePanel 组件：

### 1. 强制刷新浏览器
- Windows: 按 `Ctrl + Shift + R` 或 `Ctrl + F5`
- Mac: 按 `Cmd + Shift + R`

### 2. 检查浏览器控制台
1. 按 `F12` 打开开发者工具
2. 切换到 `Console` 选项卡
3. 查看是否有红色错误信息
4. 截图发送错误信息

### 3. 检查网络请求
1. 在开发者工具中切换到 `Network` 选项卡
2. 刷新页面
3. 检查以下API是否返回200:
   - `/api/v1/kline?period=1m&limit=500`
   - `/api/v1/account`
   - `/api/v1/data-source`

### 4. 检查组件是否被渲染
1. 在开发者工具中切换到 `Elements` 选项卡
2. 按 `Ctrl + F` 搜索 "price-ticker-section"
3. 如果找到，说明组件已渲染，可能是CSS隐藏了

### 5. 清除浏览器缓存
1. 按 `Ctrl + Shift + Delete`
2. 选择"缓存的图像和文件"
3. 点击"清除数据"
4. 刷新页面

## 访问地址
- 前端: http://localhost:3000
- 后端API: http://localhost:8000/docs

## 当前运行的服务
- 前端 Vite 服务器: 端口 3000 ✓
- 后端 FastAPI 服务器: 端口 8000 ✓
