from tqsdk import TqApi, TqBacktest, TqSim, TqAuth
from datetime import datetime
import yaml
from pathlib import Path

print("读取TqSDK认证...")
config_path = Path("config/api_keys.yaml")
if config_path.exists():
    cfg = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    tq_cfg = cfg.get("tqsdk", {})
    username = tq_cfg.get("username")
    password = tq_cfg.get("password")
else:
    print("找不到配置文件")
    username = None
    password = None

print("创建TqSDK回测...")
if username and password:
    auth = TqAuth(username, password)
    api = TqApi(TqSim(), auth=auth, backtest=TqBacktest(datetime(2024, 9, 2, 9, 0), datetime(2024, 9, 6, 15, 0)))
else:
    print("警告：没有认证信息")
    api = None
    exit(1)

print("获取K线...")
klines = api.get_kline_serial('CZCE.SA501', 3600, data_length=50)

count = 0
print("开始回测循环...")
while True:
    api.wait_update()
    count += 1
    
    if api.is_changing(klines.iloc[-1], "datetime"):
        bar = klines.iloc[-2]
        bar_time = bar["datetime"]
        print(f"K线 #{count}: {bar_time}, close={bar['close']}")
    
    if count >= 100:  # Safety limit
        print(f"达到安全上限 {count} 次更新")
        break

print("关闭API...")
api.close()
print("完成!")
