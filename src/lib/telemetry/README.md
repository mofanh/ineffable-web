# 可选前端观测

本包不拥有业务状态。默认关闭，不请求 OpenPanel、不加载性能观察模块。仅新增小型 `web-vitals` 依赖；上报使用 OpenPanel 官方 `/track` 协议，不引入自动点击、录屏与通用 SDK 的重试队列。

## 开启

复制根 `.env.example` 中的配置到 `.env.local`，填写 OpenPanel **write client 的公开 ID**，并在 OpenPanel 项目允许当前前端 origin（如 `http://localhost:5173`）。**绝不填写 client secret**，VITE 变量会进入浏览器产物。正常 `npm run dev` / `make dev-frontend` 启动。Vite 会在配置修改时重启开发服务；已有页面需刷新。生产需在 build 时注入，默认不开启；不需要给生产安装 OpenPanel。

后端 `ineffable.toml` 控制后端事件；静态 Web 的 `.env` 控制浏览器事件，两者属于不同部署进程。OpenPanel 地址应填 `/track` 之前的 API 根地址。

## 查看与口径

- Overview / Pages / Sessions：`screen_view`，只上报路由模板（不区分同类文件）。无真实用户身份，访客按 OpenPanel 匿名识别；不调用 identify，不用于账户级统计。
- Events → `frontend_web_vital`：metric 为 INP/LCP/CLS，value 为毫秒（CLS 无单位）。由 web-vitals 负责标准测量，一般在页面隐藏/生命周期结束时报告。INP 是整个文档生命周期，不将其归因于报告时正在打开的页面。
- `frontend_long_tasks`：可见页面的长任务次数、总耗时、最大耗时；30 秒聚合。浏览器不支持则不报告。
- `frontend_scroll_frames`：滚动期间可见页面的 rAF 间隔；大于 34ms 记为慢帧，是卡顿线索而非精确掉帧率，不读取滚动目标/正文。30 秒聚合，隐藏时刷新；空闲不持续运行 rAF。
- `chat_send_requested` / `chat_send_response`：普通/引导发送和 HTTP 响应头延迟；status=0 是请求未获得响应，不是 run failed。排队成功不代表已消费。
- `chat_first_output`：仅新 POST /send 流授予计时资格，从浏览器新观测到 run.started 至首个文本 delta 到达，**不是发送至首字绘制耗时**。图片、reasoning 不算正文首字。
- `chat_run_observed_end`：同一 epoch 的新运行在当前浏览器被观察到的 canonical completed/failed/cancelled 与耗时，包含观察中的等待。回放、旧 epoch、重复事件和 transport EOF 不生成终态；超过一小时、刷新或换 epoch 丢弃计时，不补造数据。未在当前浏览器直接发起的 Automation/后台运行也不纳入。因此不是全站业务成功率或计费事实。

属性仅允许固定名称、枚举和非负数。路由去掉动态 ID、query、hash、token；不采集标题、输入、聊天正文、工具参数、图片、身份、Cookie 或认证头，fetch 不发送 Referer。网络层的 IP/UA/Origin 仍由 OpenPanel 处理；没有会话录屏与自动点击采集。

web-vitals 官方 API 无卸载能力，底层观察器在首次启用后保持文档生命周期单例；停止时解除应用回调，不在 HMR 中重复注册。完全停止底层采集需关闭配置并刷新页面。

单实例最多排队 32 条，每分钟最多接纳 120 条，串行发送、2 秒超时、无重试。指标是抽样观察，拥塞和离页会丢失；上报故障不提示业务失败。不会持久化事件或无限重放。关闭需重启开发服务/重建部署并刷新页面。

## 验证

`npm run check:telemetry`：有界/关闭/隐私/错误隔离、canonical 去重/旧 epoch/历史与真实浏览器交互检查。
可用 `CHROME_PATH` 指定 Chromium。另运行 lint、i18n:check、build 和 check:chat-architecture。
