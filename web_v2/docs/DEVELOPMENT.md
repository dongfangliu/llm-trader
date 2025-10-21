# Web V2 开发文档

## 📋 系统架构

```
前端 (React)  ←→  后端 (FastAPI)  ←→  交易系统核心
    |                  |
    └─── WebSocket ────┘
```

## 🚀 快速开始

### 1. 安装依赖

```bash
# 后端依赖
cd server
pip install -r requirements.txt

# 前端依赖
cd frontend
npm install
```

### 2. 启动服务

**方式1：一键启动（Windows）**
```bash
# 命令行
start.bat

# 或 PowerShell
.\start.ps1
```

**方式2：分别启动**
```bash
# 终端1：启动后端
cd server
python main.py

# 终端2：启动前端
cd frontend
npm run dev
```

### 3. 访问应用

- 前端界面：http://localhost:3000
- 后端API文档：http://localhost:8000/docs
- ReDoc文档：http://localhost:8000/redoc

## 🛠️ 开发指南

### 后端开发

**添加新API端点：**

1. 在 `server/api/` 创建新文件
2. 定义路由和处理函数
3. 在 `server/api/__init__.py` 导入
4. 在 `server/main.py` 注册路由

**示例：**
```python
# server/api/example.py
from fastapi import APIRouter
router = APIRouter()

@router.get("")
async def get_example():
    return {"message": "Hello World"}
```

### 前端开发

**添加新组件：**

1. 在 `frontend/src/components/` 创建组件文件
2. 使用TypeScript定义Props类型
3. 导入并在Dashboard中使用

**示例：**
```tsx
// src/components/Example.tsx
interface ExampleProps {
  title: string
}

const Example = ({ title }: ExampleProps) => {
  return <div>{title}</div>
}

export default Example
```

**添加新API调用：**

在 `frontend/src/api/trading.ts` 添加：
```typescript
export const getExample = () => {
  return api.get('/example')
}
```

## 📊 数据流

### REST API 数据流
```
React Component → React Query → Axios → FastAPI → Bridge → 交易系统
```

### WebSocket 数据流
```
交易系统 → Bridge → WebSocket Manager → WebSocket Client → React State
```

## 🐛 调试技巧

### 后端调试

1. **查看日志**：`server/logs/api.log`
2. **交互式API文档**：http://localhost:8000/docs
3. **使用Loguru**：
```python
from loguru import logger
logger.debug("调试信息")
```

### 前端调试

1. **React DevTools**：浏览器扩展
2. **控制台日志**：
```typescript
console.log('数据:', data)
```
3. **React Query DevTools**：在App.tsx中启用

## 🎨 自定义主题

编辑 `frontend/src/main.tsx`:
```typescript
theme={{
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#1890ff',  // 主色调
    fontSize: 14,              // 字体大小
    borderRadius: 6,           // 圆角
  },
}}
```

## 📦 生产部署

### 后端部署

```bash
# 使用Gunicorn
pip install gunicorn
gunicorn server.main:app -w 4 -k uvicorn.workers.UvicornWorker
```

### 前端部署

```bash
# 构建生产版本
cd frontend
npm run build

# dist/ 目录即为生产文件
# 部署到Nginx/Apache或静态托管服务
```

### Nginx配置示例

```nginx
server {
    listen 80;
    
    # 前端
    location / {
        root /path/to/frontend/dist;
        try_files $uri /index.html;
    }
    
    # 后端API
    location /api {
        proxy_pass http://localhost:8000;
    }
    
    # WebSocket
    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 🔒 安全建议

1. **生产环境**修改默认密钥
2. 配置正确的 **CORS_ORIGINS**
3. 使用 **HTTPS** 部署
4. 添加 **API认证**（JWT等）
5. 启用 **限流保护**

## 📝 常见问题

**Q: 前端无法连接后端？**
A: 检查 `vite.config.ts` 中的proxy配置，确保后端已启动。

**Q: WebSocket连接失败？**
A: 检查防火墙，确保8000端口可访问，查看浏览器控制台错误。

**Q: 模拟数据如何切换为真实数据？**
A: 修改 `server/utils/config.py` 中的 `USE_MOCK_DATA = False`

**Q: 如何添加用户认证？**
A: 使用FastAPI的依赖注入系统，参考官方文档添加JWT认证。

## 🌟 最佳实践

1. **组件化**：每个组件单一职责
2. **类型安全**：充分利用TypeScript
3. **错误处理**：使用try-catch和全局错误边界
4. **性能优化**：使用React Query缓存，避免不必要的重渲染
5. **代码规范**：使用ESLint和Prettier

## 📚 参考资源

- [FastAPI官方文档](https://fastapi.tiangolo.com/)
- [React官方文档](https://react.dev/)
- [Ant Design](https://ant.design/)
- [ECharts](https://echarts.apache.org/)
- [React Query](https://tanstack.com/query/latest)
