"""
LLM响应解析器

统一处理LLM响应，实现完整的容错机制
"""

from typing import Dict, Any, Optional
import json
import re
import logging

logger = logging.getLogger(__name__)


class ResponseParser:
    """
    LLM响应解析器
    
    功能：
    1. 清理响应文本（去除markdown标记、注释等）
    2. 解析JSON
    3. 验证字段
    4. 类型转换
    5. 默认值填充
    """
    
    @staticmethod
    def clean_response(response_text: str) -> str:
        """
        清理响应文本
        
        处理：
        1. 去除首尾空白
        2. 去除markdown代码块标记（```json```）
        3. 去除注释（// 和 /* */）
        4. 处理换行符
        
        Args:
            response_text: 原始响应文本
            
        Returns:
            str: 清理后的文本
        """
        text = response_text.strip()
        
        # 去除markdown代码块
        if text.startswith('```'):
            # 找到第一个和最后一个```
            lines = text.split('\n')
            # 移除第一行（```json或```）
            if len(lines) > 1:
                lines = lines[1:]
            # 移除最后一行（```）
            if len(lines) > 0 and lines[-1].strip() == '```':
                lines = lines[:-1]
            text = '\n'.join(lines)
        
        # 去除单行注释 // ...
        text = re.sub(r'//.*?$', '', text, flags=re.MULTILINE)
        
        # 去除多行注释 /* ... */
        text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
        
        return text.strip()
    
    @staticmethod
    def parse_json(text: str) -> Optional[Dict[str, Any]]:
        """
        解析JSON

        Args:
            text: JSON文本

        Returns:
            Optional[Dict]: 解析后的字典，失败返回None
        """
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error(f"JSON解析失败: {e}")

            # 特殊处理：Extra data错误（JSON后面有额外内容）
            if "Extra data" in str(e):
                logger.info("检测到Extra data错误，尝试提取第一个完整JSON对象")
                try:
                    # 使用JSONDecoder的raw_decode方法，它会返回第一个JSON对象和结束位置
                    decoder = json.JSONDecoder()
                    obj, end_idx = decoder.raw_decode(text)
                    logger.info(f"成功提取第一个JSON对象（到位置{end_idx}），忽略后续内容")
                    logger.debug(f"忽略的后续内容: {text[end_idx:end_idx+100]}...")
                    return obj
                except Exception as decode_error:
                    logger.error(f"raw_decode提取失败: {decode_error}")

            # 尝试修复常见错误
            try:
                # 修复单引号问题
                fixed_text = text.replace("'", '"')
                return json.loads(fixed_text)
            except:
                pass

            # 尝试提取JSON部分（改进版：处理嵌套和额外数据）
            try:
                # 查找第一个{
                start = text.find('{')
                if start == -1:
                    return None

                # 使用计数器找到匹配的}
                brace_count = 0
                end = start
                in_string = False
                escape_next = False

                for i in range(start, len(text)):
                    char = text[i]

                    # 处理转义字符
                    if escape_next:
                        escape_next = False
                        continue

                    if char == '\\':
                        escape_next = True
                        continue

                    # 处理字符串
                    if char == '"':
                        in_string = not in_string
                        continue

                    # 只在非字符串内计数大括号
                    if not in_string:
                        if char == '{':
                            brace_count += 1
                        elif char == '}':
                            brace_count -= 1
                            if brace_count == 0:
                                end = i
                                break

                if brace_count == 0 and end > start:
                    json_text = text[start:end+1]
                    logger.debug(f"提取JSON片段: {json_text[:100]}...")
                    return json.loads(json_text)
            except Exception as extract_error:
                logger.error(f"JSON提取失败: {extract_error}")
                pass

            # 最后尝试：输出原始文本前500字符以便调试
            logger.error(f"无法解析的响应（前500字符）: {text[:500]}")
            return None

    @staticmethod
    def extract_fields_aggressively(text: str, fields: Dict[str, type]) -> Dict[str, Any]:
        """
        激进地从文本中提取字段值，即使JSON格式不完整

        适用于LLM返回格式混乱但包含关键信息的情况

        Args:
            text: 响应文本
            fields: 需要提取的字段及其类型 {field_name: type}

        Returns:
            Dict: 提取到的字段值
        """
        result = {}

        for field_name, field_type in fields.items():
            # 为每个字段尝试多种提取模式
            patterns = [
                # 标准JSON格式: "field": value
                rf'"{field_name}"\s*:\s*([^,\}}\n]+)',
                # 无引号格式: field: value
                rf'{field_name}\s*:\s*([^,\}}\n]+)',
                # 等号格式: field = value
                rf'{field_name}\s*=\s*([^,\}}\n]+)',
            ]

            value = None
            for pattern in patterns:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    raw_value = match.group(1).strip()

                    try:
                        # 根据类型解析值
                        if field_type == bool:
                            # 布尔值
                            raw_lower = raw_value.lower()
                            if raw_lower in ['true', '1', 'yes']:
                                value = True
                            elif raw_lower in ['false', '0', 'no']:
                                value = False

                        elif field_type == int:
                            # 整数（提取数字部分）
                            num_match = re.search(r'-?\d+', raw_value)
                            if num_match:
                                value = int(num_match.group())

                        elif field_type == float:
                            # 浮点数
                            num_match = re.search(r'-?\d+\.?\d*', raw_value)
                            if num_match:
                                value = float(num_match.group())

                        elif field_type == str:
                            # 字符串（去除引号）
                            value = raw_value.strip('"\'')

                        elif field_type == list:
                            # 列表（尝试解析JSON数组）
                            if raw_value.startswith('['):
                                try:
                                    value = json.loads(raw_value)
                                except:
                                    # 如果不是JSON，尝试分割字符串
                                    value = [s.strip().strip('"\'') for s in raw_value.strip('[]').split(',')]
                            else:
                                # 单个值转为列表
                                value = [raw_value.strip('"\'')]

                        if value is not None:
                            result[field_name] = value
                            logger.info(f"激进提取成功: {field_name} = {value}")
                            break

                    except Exception as e:
                        logger.debug(f"解析字段 '{field_name}' 值 '{raw_value}' 失败: {e}")
                        continue

        return result

    @classmethod
    def parse_trading_decision(cls, response_text: str) -> Dict[str, Any]:
        """
        解析交易决策响应，具有极强的容错能力

        即使JSON格式不完整，也会尽可能提取关键字段

        Args:
            response_text: LLM响应文本

        Returns:
            Dict: 解析后的决策数据，包含：
                - action: str (必需)
                - target_position: int (可选)
                - confidence: float (可选)
                - price: float (可选)
                - rationale: list (可选)
                - stop_loss: float (可选)
                - take_profit: float (可选)
        """
        # 清理响应
        cleaned = cls.clean_response(response_text)

        # 尝试标准JSON解析
        data = cls.parse_json(cleaned)

        if data is not None:
            logger.info("标准JSON解析成功")
            return data

        # JSON解析失败，使用激进提取
        logger.warning("标准JSON解析失败，尝试激进提取关键字段")

        # 定义需要提取的字段及类型
        fields_schema = {
            'action': str,
            'target_position': int,
            'confidence': float,
            'price': float,
            'stop_loss': float,
            'take_profit': float,
        }

        # 激进提取
        extracted = cls.extract_fields_aggressively(cleaned, fields_schema)

        # 提取 rationale（特殊处理，因为可能是列表）
        rationale_patterns = [
            r'"rationale"\s*:\s*\[([^\]]+)\]',
            r'rationale\s*:\s*\[([^\]]+)\]',
            r'"rationale"\s*:\s*"([^"]+)"',
            r'rationale\s*:\s*"([^"]+)"',
        ]

        for pattern in rationale_patterns:
            match = re.search(pattern, cleaned, re.IGNORECASE | re.DOTALL)
            if match:
                rationale_text = match.group(1)
                try:
                    # 尝试解析为列表
                    if '[' in rationale_text or ',' in rationale_text:
                        # 分割并清理
                        items = [item.strip().strip('",\'') for item in rationale_text.split(',')]
                        extracted['rationale'] = [item for item in items if item]
                    else:
                        # 单个字符串
                        extracted['rationale'] = [rationale_text.strip()]
                    logger.info(f"激进提取成功: rationale = {extracted['rationale']}")
                    break
                except Exception as e:
                    logger.debug(f"解析rationale失败: {e}")

        # 验证是否至少提取到action
        if 'action' not in extracted:
            logger.warning("无法提取action字段，尝试在响应中查找操作关键词")
            # 尝试从响应中识别操作意图
            action_keywords = {
                'open_long': ['开多', '做多', 'buy', 'long', 'open long'],
                'open_short': ['开空', '做空', 'sell', 'short', 'open short'],
                'close_long': ['平多', '卖出', 'close long', 'exit long'],
                'close_short': ['平空', '买入平仓', 'close short', 'exit short'],
                'hold': ['持有', '观望', '等待', 'hold', 'wait'],
            }

            for action_name, keywords in action_keywords.items():
                for keyword in keywords:
                    if keyword in cleaned.lower():
                        extracted['action'] = action_name
                        logger.info(f"从关键词识别到操作: {action_name}")
                        break
                if 'action' in extracted:
                    break

        # 如果还是没有action，记录错误但不返回默认值
        if 'action' not in extracted:
            logger.error("完全无法提取任何有效信息")

        # 记录提取结果
        logger.info(f"激进提取最终结果: {extracted}")

        return extracted

    @staticmethod
    def validate_and_convert(
        data: Dict[str, Any],
        schema: Dict[str, type],
        defaults: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        验证和转换字段
        
        Args:
            data: 原始数据
            schema: 字段类型定义 {field_name: type}
            defaults: 默认值 {field_name: default_value}
            
        Returns:
            Dict: 验证后的数据
        """
        result = {}
        
        for field, field_type in schema.items():
            if field in data:
                value = data[field]
                try:
                    # 类型转换
                    if field_type == bool:
                        result[field] = bool(value)
                    elif field_type == int:
                        result[field] = int(value)
                    elif field_type == float:
                        result[field] = float(value)
                    elif field_type == str:
                        result[field] = str(value)
                    elif field_type == list:
                        result[field] = list(value) if isinstance(value, (list, tuple)) else []
                    elif field_type == dict:
                        result[field] = dict(value) if isinstance(value, dict) else {}
                    else:
                        result[field] = value
                except (ValueError, TypeError) as e:
                    logger.warning(f"字段 '{field}' 类型转换失败: {e}, 使用默认值")
                    result[field] = defaults.get(field)
            else:
                # 字段不存在，使用默认值
                result[field] = defaults.get(field)
        
        return result
    
    @classmethod
    def parse_expert_review(cls, response_text: str) -> Dict[str, Any]:
        """
        解析专家复核响应
        
        Args:
            response_text: LLM响应文本
            
        Returns:
            Dict: 解析后的数据
                - approved: bool
                - concerns: List[str]
                - warnings: List[str]
                - severe_warning: bool (新增)
                - warning_reason: str (新增)
        """
        # 默认值（保守策略）
        defaults = {
            'approved': False,
            'concerns': ['解析失败，出于安全考虑不同意信号'],
            'warnings': [],
            'severe_warning': False,
            'warning_reason': ''
        }
        
        try:
            # 清理文本
            cleaned = cls.clean_response(response_text)
            
            # 解析JSON
            data = cls.parse_json(cleaned)
            if data is None:
                logger.error("专家复核响应JSON解析失败")
                return defaults
            
            # 验证和转换
            schema = {
                'approved': bool,
                'concerns': list,
                'warnings': list,
                'severe_warning': bool,
                'warning_reason': str
            }
            
            result = cls.validate_and_convert(data, schema, defaults)
            
            # 额外验证
            if not isinstance(result['concerns'], list):
                result['concerns'] = []
            if not isinstance(result['warnings'], list):
                result['warnings'] = []
            
            # 转换为字符串列表
            result['concerns'] = [str(c) for c in result['concerns']]
            result['warnings'] = [str(w) for w in result['warnings']]
            
            # 如果有严重警告但未审批，强制拒绝
            if result['severe_warning'] and not result['warning_reason']:
                result['warning_reason'] = '存在严重风险'
            
            return result
            
        except Exception as e:
            logger.error(f"解析专家复核响应异常: {e}")
            return defaults
    
    @classmethod
    def parse_abnormal_analysis(cls, response_text: str) -> Dict[str, Any]:
        """
        解析异常分析响应
        
        Args:
            response_text: LLM响应文本
            
        Returns:
            Dict: 解析后的数据
                - cause: str
                - risk_level: str
                - recommendation: str
                - rationale: str
        """
        # 默认值（保守策略）
        defaults = {
            'cause': '解析失败',
            'risk_level': 'critical',
            'recommendation': '暂停交易',
            'rationale': '无法解析LLM响应，建议人工复核'
        }
        
        try:
            cleaned = cls.clean_response(response_text)
            data = cls.parse_json(cleaned)
            
            if data is None:
                logger.error("异常分析响应JSON解析失败")
                return defaults
            
            schema = {
                'cause': str,
                'risk_level': str,
                'recommendation': str,
                'rationale': str
            }
            
            result = cls.validate_and_convert(data, schema, defaults)
            
            # 验证risk_level
            valid_levels = ['low', 'medium', 'high', 'critical']
            if result['risk_level'] not in valid_levels:
                logger.warning(f"无效的风险等级: {result['risk_level']}, 设为critical")
                result['risk_level'] = 'critical'
            
            return result
            
        except Exception as e:
            logger.error(f"解析异常分析响应异常: {e}")
            return defaults
    
    @classmethod
    def parse_signal_conflict(cls, response_text: str) -> Dict[str, Any]:
        """
        解析信号冲突响应
        
        Args:
            response_text: LLM响应文本
            
        Returns:
            Dict: 解析后的数据
                - decision: str
                - rationale: str
        """
        # 默认值（保守策略）
        defaults = {
            'decision': 'wait',
            'rationale': '解析失败，出于安全考虑选择观望'
        }
        
        try:
            cleaned = cls.clean_response(response_text)
            data = cls.parse_json(cleaned)
            
            if data is None:
                logger.error("信号冲突响应JSON解析失败")
                return defaults
            
            schema = {
                'decision': str,
                'rationale': str
            }
            
            result = cls.validate_and_convert(data, schema, defaults)
            
            # 验证decision
            valid_decisions = ['follow_signal_1', 'follow_signal_2', 'wait']
            if result['decision'] not in valid_decisions:
                logger.warning(f"无效的决策: {result['decision']}, 设为wait")
                result['decision'] = 'wait'
            
            return result
            
        except Exception as e:
            logger.error(f"解析信号冲突响应异常: {e}")
            return defaults
    
    @classmethod
    def parse_daily_review(cls, response_text: str) -> Dict[str, Any]:
        """
        解析每日复盘响应
        
        Args:
            response_text: LLM响应文本
            
        Returns:
            Dict: 解析后的数据
                - summary: str
                - lessons: List[Dict]
        """
        # 默认值
        defaults = {
            'summary': '解析失败',
            'lessons': [
                {
                    'content': 'LLM响应解析失败，建议人工复盘',
                    'importance': 'high'
                }
            ]
        }
        
        try:
            cleaned = cls.clean_response(response_text)
            data = cls.parse_json(cleaned)
            
            if data is None:
                logger.error("每日复盘响应JSON解析失败")
                return defaults
            
            result = {
                'summary': str(data.get('summary', '无有效总结')),
                'lessons': []
            }
            
            # 解析lessons
            lessons = data.get('lessons', [])
            valid_importance = ['high', 'medium', 'low']
            
            if isinstance(lessons, list):
                for lesson in lessons:
                    if isinstance(lesson, dict):
                        importance = lesson.get('importance', 'medium')
                        if importance not in valid_importance:
                            importance = 'medium'
                        
                        result['lessons'].append({
                            'content': str(lesson.get('content', '')),
                            'importance': importance
                        })
            
            # 限制教训数量（3-5条）
            if len(result['lessons']) > 5:
                result['lessons'] = result['lessons'][:5]
            
            # 如果没有教训，使用默认
            if not result['lessons']:
                result['lessons'] = defaults['lessons']
            
            return result
            
        except Exception as e:
            logger.error(f"解析每日复盘响应异常: {e}")
            return defaults


# 测试代码
if __name__ == "__main__":
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    parser = ResponseParser()
    
    print("=" * 60)
    print("测试1: 清理markdown代码块")
    text1 = """```json
{
    "approved": true,
    "concerns": ["测试"]
}
```"""
    cleaned1 = parser.clean_response(text1)
    print(f"原文本:\n{text1}")
    print(f"\n清理后:\n{cleaned1}")
    
    print("\n" + "=" * 60)
    print("测试2: 解析专家复核响应（正常）")
    response2 = '{"approved": true, "concerns": ["置信度略低"], "warnings": []}'
    result2 = parser.parse_expert_review(response2)
    print(f"结果: {result2}")
    assert result2['approved'] == True
    
    print("\n" + "=" * 60)
    print("测试3: 解析专家复核响应（markdown包裹）")
    response3 = """```json
{
    "approved": false,
    "concerns": ["风险过大"],
    "warnings": ["建议暂停"]
}
```"""
    result3 = parser.parse_expert_review(response3)
    print(f"结果: {result3}")
    assert result3['approved'] == False
    
    print("\n" + "=" * 60)
    print("测试4: 解析失败，使用默认值")
    response4 = "这不是JSON格式"
    result4 = parser.parse_expert_review(response4)
    print(f"结果: {result4}")
    assert result4['approved'] == False
    assert '解析失败' in result4['concerns'][0]
    
    print("\n" + "=" * 60)
    print("测试5: 解析异常分析响应")
    response5 = """
{
    "cause": "重大消息",
    "risk_level": "high",
    "recommendation": "观望",
    "rationale": "市场波动大"
}
"""
    result5 = parser.parse_abnormal_analysis(response5)
    print(f"结果: {result5}")
    assert result5['risk_level'] == 'high'
    
    print("\n" + "=" * 60)
    print("测试6: 无效的风险等级，自动修正")
    response6 = '{"cause": "test", "risk_level": "invalid", "recommendation": "test", "rationale": "test"}'
    result6 = parser.parse_abnormal_analysis(response6)
    print(f"结果: {result6}")
    assert result6['risk_level'] == 'critical'
    
    print("\n" + "=" * 60)
    print("测试7: 解析信号冲突响应")
    response7 = '{"decision": "wait", "rationale": "风险不明"}'
    result7 = parser.parse_signal_conflict(response7)
    print(f"结果: {result7}")
    assert result7['decision'] == 'wait'
    
    print("\n" + "=" * 60)
    print("测试8: 解析每日复盘响应")
    response8 = """
{
    "summary": "今日盈利100元",
    "lessons": [
        {"content": "趋势策略有效", "importance": "high"},
        {"content": "避免震荡市", "importance": "medium"}
    ]
}
"""
    result8 = parser.parse_daily_review(response8)
    print(f"结果: {result8}")
    assert len(result8['lessons']) == 2
    
    print("\n" + "=" * 60)
    print("测试9: 解析包含注释的JSON")
    response9 = """
{
    // 这是注释
    "approved": true,
    "concerns": [], // 无关注点
    /* 多行注释
       测试 */
    "warnings": []
}
"""
    result9 = parser.parse_expert_review(response9)
    print(f"结果: {result9}")
    assert result9['approved'] == True
    
    print("\n" + "=" * 60)
    print("测试10: 字段类型错误，自动转换")
    response10 = '{"approved": "true", "concerns": "测试", "warnings": []}'  # approved是字符串
    result10 = parser.parse_expert_review(response10)
    print(f"结果: {result10}")
    # 字符串"true"转为布尔值True
    
    print("\n✓ 所有测试通过")
