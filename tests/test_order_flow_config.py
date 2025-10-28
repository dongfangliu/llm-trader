"""
测试订单流配置API
"""

import requests
import json

BASE_URL = "http://localhost:8000/api/order-flow"


def test_get_config():
    """测试获取配置"""
    print("="*60)
    print("测试获取配置")
    print("="*60)
    
    response = requests.get(f"{BASE_URL}/config")
    print(f"状态码: {response.status_code}")
    
    data = response.json()
    print(f"响应: {json.dumps(data, indent=2, ensure_ascii=False)}")
    
    return data


def test_update_config():
    """测试更新配置"""
    print("\n" + "="*60)
    print("测试更新配置")
    print("="*60)
    
    # 更新配置
    new_config = {
        "vpin": {
            "bucket_size": 40
        },
        "large_order": {
            "lookback": 80,
            "threshold_multiplier": 3.0
        },
        "orderbook": {
            "max_history": 800
        }
    }
    
    print(f"新配置: {json.dumps(new_config, indent=2, ensure_ascii=False)}")
    
    response = requests.post(
        f"{BASE_URL}/config",
        json=new_config,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"状态码: {response.status_code}")
    
    data = response.json()
    print(f"响应: {json.dumps(data, indent=2, ensure_ascii=False)}")
    
    return data


def test_restore_default():
    """测试恢复默认配置"""
    print("\n" + "="*60)
    print("测试恢复默认配置")
    print("="*60)
    
    default_config = {
        "vpin": {
            "bucket_size": 50
        },
        "large_order": {
            "lookback": 100,
            "threshold_multiplier": 2.5
        },
        "orderbook": {
            "max_history": 1000
        }
    }
    
    response = requests.post(
        f"{BASE_URL}/config",
        json=default_config,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"状态码: {response.status_code}")
    
    data = response.json()
    print(f"响应: {json.dumps(data, indent=2, ensure_ascii=False)}")
    
    return data


def test_invalid_config():
    """测试无效配置"""
    print("\n" + "="*60)
    print("测试无效配置（应该报错）")
    print("="*60)
    
    # 超出范围的配置
    invalid_config = {
        "vpin": {
            "bucket_size": 1000  # 超过最大值500
        }
    }
    
    response = requests.post(
        f"{BASE_URL}/config",
        json=invalid_config,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"状态码: {response.status_code}")
    
    data = response.json()
    print(f"响应: {json.dumps(data, indent=2, ensure_ascii=False)}")
    
    return data


if __name__ == "__main__":
    try:
        # 测试1: 获取当前配置
        test_get_config()
        
        # 测试2: 更新配置
        test_update_config()
        
        # 测试3: 验证配置已更新
        print("\n验证配置已更新...")
        updated_config = test_get_config()
        
        # 测试4: 恢复默认配置
        test_restore_default()
        
        # 测试5: 无效配置
        test_invalid_config()
        
        print("\n" + "="*60)
        print("✅ 所有测试完成")
        print("="*60)
        
    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到服务器，请确保服务器已启动 (python start_web_v2.py)")
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
