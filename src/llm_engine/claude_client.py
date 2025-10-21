"""
Claude API客户端封装
"""

import os
import json
from typing import Optional, Dict
from anthropic import Anthropic
from loguru import logger


class ClaudeClient:
    """Claude API客户端"""

    def __init__(self,
                 api_key: Optional[str] = None,
                 model: str = "claude-3-5-sonnet-20241022",
                 temperature: Optional[float] = 0.7,
                 max_tokens: int = 2000,
                 timeout: int = 30,
                 top_p: Optional[float] = None,
                 top_k: Optional[int] = None):
        """
        初始化Claude客户端

        Args:
            api_key: API密钥，如果为None则从环境变量读取
            model: 模型名称
            temperature: 温度参数 (0.0-1.0)
            max_tokens: 最大token数
            timeout: 超时时间(秒)
            top_p: nucleus sampling (0.0-1.0), 与temperature二选一
            top_k: 仅采样前K个选项，高级用法
        """
        self.api_key = api_key or os.getenv('ANTHROPIC_API_KEY')
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.top_p = top_p
        self.top_k = top_k
        self.client = None

        # 参数验证
        self._validate_params()

        # 如果有API Key，立即初始化客户端
        if self.api_key and self.api_key != 'YOUR_CLAUDE_API_KEY_HERE':
            try:
                self.client = Anthropic(api_key=self.api_key)
                logger.info(f"Claude客户端初始化成功: {model}")
            except Exception as e:
                logger.error(f"Claude客户端初始化失败: {e}")
        else:
            logger.warning("Claude API Key未配置，客户端将无法使用，请在可视化界面中配置")

    def _validate_params(self):
        """验证参数配置"""
        # Claude Sonnet 4.5 不能同时使用 temperature 和 top_p
        if self.temperature is not None and self.top_p is not None:
            if "sonnet-4" in self.model.lower() or "claude-3-5-sonnet-20241022" in self.model:
                logger.warning(
                    f"Claude Sonnet 4.5 不支持同时使用 temperature 和 top_p，将只使用 temperature={self.temperature}"
                )
                self.top_p = None
            else:
                logger.info("同时设置了 temperature 和 top_p，建议只使用其中一个")

        # 验证取值范围
        if self.temperature is not None and not (0 <= self.temperature <= 1):
            logger.warning(f"temperature={self.temperature} 超出范围 [0, 1]，将使用默认值 0.7")
            self.temperature = 0.7

        if self.top_p is not None and not (0 <= self.top_p <= 1):
            logger.warning(f"top_p={self.top_p} 超出范围 [0, 1]，将忽略此参数")
            self.top_p = None

        if self.top_k is not None and self.top_k <= 0:
            logger.warning(f"top_k={self.top_k} 必须为正整数，将忽略此参数")
            self.top_k = None

    def is_configured(self) -> bool:
        """检查客户端是否已正确配置"""
        return self.client is not None

    def chat(self, prompt: str, system_prompt: Optional[str] = None) -> Optional[str]:
        """
        发送对话请求

        Args:
            prompt: 用户prompt
            system_prompt: 系统prompt

        Returns:
            str: Claude的响应文本
        """
        if not self.is_configured():
            logger.error("Claude客户端未配置，无法调用API")
            return None

        try:
            logger.debug(f"发送请求到Claude: {len(prompt)}字符")

            params = {
                "model": self.model,
                "max_tokens": self.max_tokens,
                "messages": [
                    {"role": "user", "content": prompt}
                ]
            }

            # 添加采样参数 (temperature 和 top_p 二选一)
            if self.top_p is not None:
                params["top_p"] = self.top_p
            elif self.temperature is not None:
                params["temperature"] = self.temperature

            # 添加 top_k
            if self.top_k is not None:
                params["top_k"] = self.top_k

            if system_prompt:
                params["system"] = system_prompt

            response = self.client.messages.create(**params)

            # 提取文本内容
            content = response.content[0].text

            logger.info(f"Claude响应成功: {len(content)}字符")
            return content

        except Exception as e:
            logger.error(f"Claude API调用失败: {e}")
            return None

    def chat_json(self, prompt: str, system_prompt: Optional[str] = None) -> Optional[Dict]:
        """
        发送对话请求并解析JSON响应

        Args:
            prompt: 用户prompt
            system_prompt: 系统prompt

        Returns:
            dict: 解析后的JSON对象
        """
        response = self.chat(prompt, system_prompt)

        if not response:
            return None

        try:
            # 尝试提取JSON（可能包含在markdown代码块中）
            json_str = response

            # 如果响应包含```json标记，提取其中内容
            if "```json" in response:
                start = response.find("```json") + 7
                end = response.find("```", start)
                json_str = response[start:end].strip()
            elif "```" in response:
                start = response.find("```") + 3
                end = response.find("```", start)
                json_str = response[start:end].strip()

            # 解析JSON
            result = json.loads(json_str)
            logger.debug(f"JSON解析成功: {list(result.keys())}")
            return result

        except json.JSONDecodeError as e:
            logger.error(f"JSON解析失败: {e}\n原始响应: {response[:500]}")
            return None

    def validate_response(self, response: Dict, required_keys: list) -> bool:
        """
        验证响应是否包含必需字段

        Args:
            response: 响应字典
            required_keys: 必需的键列表

        Returns:
            bool: 是否有效
        """
        if not response:
            return False

        missing_keys = [key for key in required_keys if key not in response]

        if missing_keys:
            logger.warning(f"响应缺少必需字段: {missing_keys}")
            return False

        return True


if __name__ == "__main__":
    # 测试代码
    client = ClaudeClient()

    # 测试普通对话
    prompt = "简要说明什么是纯碱期货，50字以内。"
    response = client.chat(prompt)
    print(f"普通对话:\n{response}\n")

    # 测试JSON响应
    json_prompt = """
    请分析纯碱期货当前市场趋势，输出JSON格式：
    {
        "trend": "bullish/bearish/neutral",
        "confidence": 75,
        "reasoning": "简要分析"
    }
    """

    json_response = client.chat_json(json_prompt)
    print(f"JSON响应:\n{json.dumps(json_response, ensure_ascii=False, indent=2)}")

    # 验证响应
    is_valid = client.validate_response(json_response, ['trend', 'confidence', 'reasoning'])
    print(f"\n响应有效性: {is_valid}")
