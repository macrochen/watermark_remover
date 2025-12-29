#!/bin/bash
# 激活虚拟环境
source venv/bin/activate

# 在后台等待几秒后打开浏览器
(sleep 2 && open http://127.0.0.1:5002) &

# 启动应用
python app.py
