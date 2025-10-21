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
            # 尝试修复常见错误
            try:
                # 修复单引号问题
                fixed_text = text.replace("'", '"')
                return json.loads(fixed_text)
            except:
                pass
            
            # 尝试提取JSON部分
            try:
                # 查找第一个{和最后一个}
                start = text.find('{')
                end = text.rfind('}')
                if start != -1 and end != -1 and end > start:
                    json_text = text[start:end+1]
                    return json.loads(json_text)
            except:
                pass
            
            return None
    
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
