# React + TypeScript 前端

现代化的交易系统前端界面

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器（带HMR）
npm run dev

# 访问 http://localhost:3000
```

## 📦 构建生产版本

```bash
# 构建
npm run build

# 预览生产构建
npm run preview
```

## 🎨 技术栈

- **React 18** - UI框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具（超快HMR）
- **Ant Design 5** - UI组件库（暗色主题）
- **ECharts** - 专业图表库
- **Zustand** - 轻量级状态管理
- **React Query** - 数据获取和缓存
- **Axios** - HTTP客户端

## 📁 项目结构

```
src/
├── api/                 # API调用
│   ├── client.ts        # Axios配置
│   └── trading.ts       # 交易API
├── components/          # React组件
│   ├── Header.tsx       # 顶部导航
│   ├── Dashboard.tsx    # 仪表盘
│   ├── KlineChart.tsx   # K线图表
│   ├── AccountCard.tsx  # 账户信息卡片
│   ├── ControlPanel.tsx # 控制面板
│   └── SignalPanel.tsx  # 信号面板
├── hooks/               # 自定义Hooks
│   └── useWebSocket.ts  # WebSocket Hook
├── App.tsx              # 主应用
└── main.tsx             # 入口文件
```

## 🎯 特性

- ✅ **实时数据推送** - WebSocket自动重连
- ✅ **暗色主题** - 专为交易设计
- ✅ **响应式布局** - 支持各种屏幕尺寸
- ✅ **TypeScript** - 完整类型支持
- ✅ **热模块替换** - 开发时即时更新
- ✅ **专业图表** - ECharts K线图
- ✅ **错误处理** - 全局错误拦截
- ✅ **性能优化** - React Query自动缓存

## 🔧 开发工具

```bash
# 代码检查
npm run lint

# 代码格式化
npm run format

# 类型检查
tsc --noEmit
```

## 📝 环境变量

创建 `.env` 文件：

```bash
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

## 🌐 浏览器支持

- Chrome/Edge (最新版)
- Firefox (最新版)
- Safari 14+

## 📚 相关文档

- [React文档](https://react.dev/)
- [Ant Design](https://ant.design/)
- [ECharts](https://echarts.apache.org/)
- [Vite](https://vitejs.dev/)
