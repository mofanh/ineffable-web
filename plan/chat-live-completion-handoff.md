# 实时完成后的过程折叠

状态：Active。基线：`e069e9f0b39feabd6d89ddc811769cbde046cd3a`。

## 合同

真实本机会话已完成且三个输出片段都已 canonical 接管，实时投影却因无正文生命周期事件
额外创建空 `unattributed` 片段，使严格接管门禁一直不通过；刷新后的历史没有该片段。
只在统一 conversation event projector 修复输出片段创建，不改 Gateway、终态裁决、
canonical 完整性门禁、过程树样式或历史内容，不按事件名字白名单过滤。

无展示/解析状态变化的事件推进覆盖游标，不注册输出片段。真实正文、思考、工具、
图片、插件、子 Agent、独立 phase 和分割标签解析状态必须保留；真实未接管内容继续阻止
完成总分组。过程与 canonical identity、顺序和用户边界不变。

## 阶段与验收

- [x] 在合成流中复现生命周期穿插，修复无操作事件注册输出片段；覆盖有意义的无身份事件。
- [x] 使用真实 Sidebar 的 HTTP/SSE 路径验证完成后无需刷新即可折叠；旧过程可重开，最终
  Markdown 完整可见，terminal 历史失败不得伪造接管或隐藏内容。重放本机只读实际记录。
- [ ] 本机 i18n、lint、production build、chat runtime/integration/architecture、完整 chat
  browser 与受影响窗口/原生图片门禁通过；分阶段本地提交后在 detached worktree 独立只读
  审计，修复并定向复核阻断项。提炼长期规则并删除本计划。

不触发 GitHub Actions，不推送/部署，不请求真实模型。实际 trace 留在 `.git`，回归只用
合成内容。Dockerfile.source、design.md 与后端已有修改不属于本任务；保留原样。
本机 trace 重放和 mock HTTP/SSE Chrome 验收不代表生产、真实 provider 或手机验收。
