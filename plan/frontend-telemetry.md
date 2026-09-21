# 可选前端遥测

Active：独立 src/lib/telemetry 包；默认关闭。公开 client ID 直连现有 OpenPanel CORS API，绝不携带服务端密钥。页面访问、web-vitals、长任务/滚动帧聚合、发送HTTP耗时、经唯一reducer验真的run观察。无原文、图片、身份、动态URL、录屏或自动点击。上报失败不影响业务，有界无重试。明确浏览器观察不代表后端完整业务统计。

实施后运行 telemetry 行为/浏览器测试、lint、i18n、build、chat架构与运行测试，独立只读审计。保留用户 Dockerfile.source/design.md 改动。真实本地OpenPanel入库验证；不部署生产。
