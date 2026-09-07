# 人工回答后恢复 SSE

范围：回答或审批 resume receipt 为 streaming/resuming 后，复用 ConversationRuntimeController 和现有 SSE API，按 conversation cursor 接续；轮询仅作连接失败/提前结束兜底。不改变后端状态机、持久化、工具协议。

验收：canonical 用户输入保留，新 assistant 位于输入之后；同 run 的 execution_epoch 保留；正常连接在 EOF 前逐事件投影；旧订阅回调和切换会话后的回调被隔离；EOF 不裁决业务终态。

阶段：主 Agent 实施及回归、提交；一次独立只读审计；处理阻断项；确定性 Web CI；长期规则归入 AGENTS 并删除本计划。

门禁：chat store/resume/runtime/routing/architecture/web-runtime/web-integration、lint、i18n:check、production build。回归使用受控 SSE 字节流，真实 provider/登录浏览器体验属于外部验证，不以本地流测试代替。

基线：4cc3ae422b77af447a85b41b71e3f01ff905e1a8。无后端改动；保留 Dockerfile.source/design.md 用户工作。
