# LLM 配置说明

## 配置结构

系统使用新的配置结构，支持多个 LLM 提供商。配置分为两个文件：

### 1. `api_keys.yaml` - API 密钥配置

```yaml
provider: deepseek  # 当前使用的提供商: claude, openai, deepseek, custom

providers:
  claude:
    api_key: YOUR_CLAUDE_API_KEY_HERE

  openai:
    api_key: YOUR_OPENAI_API_KEY_HERE
    base_url: https://api.openai.com/v1

  deepseek:
    api_key: sk-xxx...
    base_url: https://api.deepseek.com

  custom:
    api_key: YOUR_API_KEY_HERE
    base_url: https://your-api-endpoint.com/v1
```

### 2. `trading_params.yaml` - 模型参数配置

```yaml
llm:
  model: deepseek-chat        # 模型名称
  temperature: 0.7            # 随机性控制 (0-1)
  max_tokens: 2000            # 最大输出长度
  timeout: 30                 # 超时时间（秒）
```

## 支持的提供商

### Claude (Anthropic)
- **Provider**: `claude`
- **默认模型**: `claude-3-5-sonnet-20241022`
- **获取 API Key**: https://console.anthropic.com/
- **特点**: 效果最好，适合生产环境

### OpenAI
- **Provider**: `openai`
- **默认模型**: `gpt-4`
- **Base URL**: `https://api.openai.com/v1`
- **获取 API Key**: https://platform.openai.com/
- **特点**: 通用性强，生态完善

### DeepSeek (推荐)
- **Provider**: `deepseek`
- **默认模型**: `deepseek-chat`
- **Base URL**: `https://api.deepseek.com`
- **获取 API Key**: https://platform.deepseek.com/
- **特点**: 性价比高，支持思维链，适合开发测试

### 通义千问
- **Provider**: `openai` (OpenAI 兼容)
- **模型**: `qwen-plus`
- **Base URL**: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- **获取 API Key**: https://dashscope.console.aliyun.com/
- **特点**: 国内大模型，响应快

### 智谱 AI (GLM)
- **Provider**: `openai` (OpenAI 兼容)
- **模型**: `glm-4`
- **Base URL**: `https://open.bigmodel.cn/api/paas/v4`
- **获取 API Key**: https://open.bigmodel.cn/
- **特点**: 清华系大模型

### 月之暗面 (Kimi)
- **Provider**: `openai` (OpenAI 兼容)
- **模型**: `moonshot-v1-8k`
- **Base URL**: `https://api.moonshot.cn/v1`
- **获取 API Key**: https://platform.moonshot.cn/
- **特点**: 长文本处理能力强

### 本地 Ollama
- **Provider**: `openai` (OpenAI 兼容)
- **模型**: `llama2` 或其他本地模型
- **Base URL**: `http://localhost:11434/v1`
- **API Key**: `ollama` (任意值)
- **特点**: 完全离线，免费

### 自定义
- **Provider**: `custom`
- **支持任何 OpenAI 兼容的 API**

## 通过 UI 配置

1. 启动 Streamlit 界面：
   ```bash
   streamlit run web/app_improved.py
   ```

2. 在侧边栏点击 **"⚙️ 配置LLM"** 按钮

3. 选择服务商预设，或选择"自定义"手动配置

4. 输入 API Key 和其他参数

5. 点击 **"🧪 测试连接"** 验证配置

6. 点击 **"💾 保存配置"** 保存设置

7. 重启系统使配置生效

## 通过环境变量配置

也可以使用环境变量设置 API Key（优先级高于配置文件）：

```bash
# Windows
set ANTHROPIC_API_KEY=sk-ant-xxx...
set OPENAI_API_KEY=sk-xxx...
set OPENAI_BASE_URL=https://api.deepseek.com

# Linux/Mac
export ANTHROPIC_API_KEY=sk-ant-xxx...
export OPENAI_API_KEY=sk-xxx...
export OPENAI_BASE_URL=https://api.deepseek.com
```

## 配置验证

测试 LLM 连接：

```bash
python -c "from src.llm_engine.llm_factory import LLMFactory; client = LLMFactory.create_client(); print(f'成功: {type(client).__name__}')"
```

## 常见问题

### Q: 如何切换提供商？
A: 修改 `api_keys.yaml` 中的 `provider` 字段，然后重启系统。

### Q: 配置文件格式错误怎么办？
A: 确保 YAML 格式正确，注意缩进使用空格而非 Tab。可以使用在线 YAML 验证工具检查。

### Q: API Key 是否安全？
A: 配置文件仅存储在本地，不会上传。建议使用环境变量存储敏感信息，不要提交到版本控制。

### Q: 为什么测试连接失败？
A: 检查：
1. API Key 是否正确
2. Base URL 是否可访问
3. 网络连接是否正常
4. 账户余额是否充足
