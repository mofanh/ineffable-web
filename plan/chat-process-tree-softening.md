# 过程树连线柔化

状态：Active，2026-11-10；用户同意实施圆弧分叉、弱化主干和正文少连线。

## 合同

- 以 8px 圆弧替代原直角横枝；末端主干在圆弧起点结束，不残留直角。
- 主干比横枝淡一级，浅深主题分别查看；不降低正文、图标和状态的对比度。
- 过程内 text/update 正文只保留原缩进和细主干，不画横枝；最终正文、产物及插件继续使用原 content seat。
- 仅调整行级视觉角色与 CSS，不改 membership、顺序/key、renderer、折叠、选区/焦点、滚动与恢复。每 pane 仍一个窗口，无新增依赖或请求。
- 保留前端 Dockerfile.source/design.md 及后端未提交内容；本地提交，不推送、不部署、不运行 GitHub Actions/真实模型。

## 完成步骤

- [x] 完成样式与正文视觉角色，验证实际浅深/移动/桌面截图及受影响行为，更新长期规则并提交。
- [ ] 集中独立只读审计，自动修复范围内问题并必要时定向复核；最终本地门禁通过后删除计划。

## 验证

i18n:check、lint、build、chat architecture、web runtime/integration、process browser/lifecycle、stream-layout 与 chat-window；复用未变链路的已通过重型门禁，不重跑无关整套。
补充圆弧与末端、无横枝正文、单一窗口和 RTL 视觉检查；截图等待字体/有限过渡结束。测试使用受控事件，不代表生产/provider、真实手机/Safari 或人工读屏验收。
