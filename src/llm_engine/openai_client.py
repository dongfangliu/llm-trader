"""
OpenAI-compatible API客户端（支持DeepSeek、通义千问等）
"""

import os
import json
from typing import Optional, Dict
from openai import OpenAI
from loguru import logger


class OpenAIClient:
    """OpenAI-compatible API客户端"""

    def __init__(self,
                 api_key: Optional[str] = None,
                 base_url: Optional[str] = None,
                 model: str = "gpt-3.5-turbo",
                 temperature: Optional[float] = 0.7,
                 max_tokens: int = 2000,
                 timeout: int = 30,
                 top_p: Optional[float] = None,
                 frequency_penalty: Optional[float] = None,
                 presence_penalty: Optional[float] = None,
                 stop: Optional[str] = None,
                 **extra_params):
        """
        初始化OpenAI-compatible客户端

        Args:
            api_key: API密钥
            base_url: API base URL（如 https://api.deepseek.com）
            model: 模型名称
            temperature: 温度参数 (0.0-2.0)
            max_tokens: 最大token数
            timeout: 超时时间(秒)
            top_p: nucleus sampling (0.0-1.0), 与temperature二选一
            frequency_penalty: 频率惩罚 (-2.0 to 2.0), 减少重复词汇
            presence_penalty: 存在惩罚 (-2.0 to 2.0), 鼓励新主题
            stop: 停止序列
            **extra_params: 额外参数 (如 DeepSeek 的 enable_thinking)
        """
        self.api_key = api_key or os.getenv('OPENAI_API_KEY')
        self.base_url = base_url or os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.top_p = top_p
        self.frequency_penalty = frequency_penalty
        self.presence_penalty = presence_penalty
        self.stop = stop
        self.extra_params = extra_params  # DeepSeek enable_thinking 等
        self.client = None

        # 参数验证
        self._validate_params()

        # 如果有API Key，立即初始化客户端
        if self.api_key and self.api_key != 'YOUR_OPENAI_API_KEY_HERE':
            try:
                self.client = OpenAI(
                    api_key=self.api_key,
                    base_url=self.base_url,
                    timeout=timeout
                )
                logger.info(f"OpenAI-compatible客户端初始化成功: {model} @ {self.base_url}")
            except Exception as e:
                logger.error(f"OpenAI-compatible客户端初始化失败: {e}")
        else:
            logger.warning("API Key未配置，客户端将无法使用，请在可视化界面中配置")

    def _validate_params(self):
        """验证参数配置"""
        # 建议不要同时使用 temperature 和 top_p
        if self.temperature is not None and self.top_p is not None:
            logger.info("同时设置了 temperature 和 top_p，建议只使用其中一个")

        # 验证取值范围
        if self.temperature is not None and not (0 <= self.temperature <= 2):
            logger.warning(f"temperature={self.temperature} 超出范围 [0, 2]，将使用默认值 0.7")
            self.temperature = 0.7

        if self.top_p is not None and not (0 <= self.top_p <= 1):
            logger.warning(f"top_p={self.top_p} 超出范围 [0, 1]，将忽略此参数")
            self.top_p = None

        if self.frequency_penalty is not None and not (-2 <= self.frequency_penalty <= 2):
            logger.warning(f"frequency_penalty={self.frequency_penalty} 超出范围 [-2, 2]，将忽略此参数")
            self.frequency_penalty = None

        if self.presence_penalty is not None and not (-2 <= self.presence_penalty <= 2):
            logger.warning(f"presence_penalty={self.presence_penalty} 超出范围 [-2, 2]，将忽略此参数")
            self.presence_penalty = None

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
            str: LLM的响应文本
        """
        if not self.is_configured():
            logger.error("客户端未配置，无法调用API")
            return None

        try:
            logger.debug(f"发送请求: {len(prompt)}字符")

            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            # 构建请求参数
            params = {
                "model": self.model,
                "messages": messages,
                "max_tokens": self.max_tokens
            }

            # 添加可选参数
            if self.temperature is not None:
                params["temperature"] = self.temperature
            if self.top_p is not None:
                params["top_p"] = self.top_p
            if self.frequency_penalty is not None:
                params["frequency_penalty"] = self.frequency_penalty
            if self.presence_penalty is not None:
                params["presence_penalty"] = self.presence_penalty
            if self.stop is not None:
                params["stop"] = self.stop

            # 添加额外参数 (如 DeepSeek 的 enable_thinking)
            # 这些参数通过 extra_body 传递给API（OpenAI SDK标准做法）
            if self.extra_params:
                logger.debug(f"添加额外参数(通过extra_body): {self.extra_params}")
                params["extra_body"] = self.extra_params

            response = self.client.chat.completions.create(**params)

            content = response.choices[0].message.content
            logger.info(f"响应成功: {len(content)}字符")
            return content

        except Exception as e:
            logger.error(f"API调用失败: {e}")
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
    # 测试代码 - DeepSeek示例
    client = OpenAIClient(
        api_key="your-api-key",
        base_url="https://api.deepseek.com",
        model="deepseek-chat"
    )

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
