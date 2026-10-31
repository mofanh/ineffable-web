# 工作台布局、聊天操作与页面密度迭代

起点：`529cd96`。用户已授权直接实现以下四项，并同意左栏大部分时间收起。
本文件是执行与独立审查的共同验收合同。现有 `Dockerfile.source` 修改和未跟踪的
`design.md` 属于用户已有工作，不得覆盖或纳入本轮提交。

## 目标与边界

- 首次默认收起左栏；后续恢复用户明确选择的开合状态，导航入口保持可达。
- 聊天实际宽度与布局占位一致，超过 640px 也不能遮挡内容。
- 用户偏好宽度与当前生效宽度分开；展开左栏、缩窗产生的临时约束解除后恢复偏好。
- 桌面中栏以实际可见 480px 为初始保底验证值；空间不够时合理复用抽屉/全屏模式，
  以实际几何验证最终断点规则。拖拽到达边界时停止，不擅自打开全屏或关闭用户左栏。
- 中栏卡片和指标根据自身容器宽度调整列数。
- Composer 直接展示模型，将沙箱、能力与迭代整理到带可见名称的运行设置入口；
  附件、发送、显式 Stop 保持容易定位，选中值与交互状态具有清楚的视觉层级。
- 功能页减少重复眉题和说明，压缩标题与指标占用，内容列表提前；产品文案移除
  Gateway Model Profile 等实现术语，保留真正帮助选择的模型能力和计费信息。
- 继续复用 app/UI 组件、资源与错误服务、i18n 和语义主题 token。
- 不改后端协议、会话/队列/SSE 生命周期、权限策略和模型/沙箱选择裁决。
- 不新增色彩主题、持久化草稿副本、附件队列或没有实际职责的中转模块。

## Phase 1：布局与偏好

- [x] 左栏首次默认收起，恢复已有开合偏好，补齐刷新恢复。
- [x] 聊天宽度预算、实际占位和首屏/左栏动画稳定边界一致。
- [x] 临时限制不覆盖持久化偏好；支持拖拽、键盘、快速反向、断点与全屏恢复。
- [x] 保持导航/聊天 memo 边界、延迟挂载、编辑/聊天草稿和运行订阅连续。
- [x] 按容器宽度修正指标和模型卡片排版。
- [x] 增加有意义的浏览器回归：默认与记忆、无覆盖、约束恢复、临界尺寸。
- [x] 通过本阶段检查并创建中文分点提交。

本阶段门禁：`i18n:check`、`lint`、`build`、`check:responsive-layout`、
`check:shell-performance`（开发和生产），以及本轮新增的几何/偏好回归。

## Phase 2：聊天输入区与交互层级

- [x] 模型选择直接可见，运行设置有可见名称，长名称在窄 docked/全屏尺寸可辨认。
- [x] 复用同一套沙箱、能力和迭代控制及回调，不另建配置状态或请求路径。
- [x] 设置入口及内部所有控件键盘/触摸可达，嵌套弹层、错误/重试、loading 与 focus 正常。
- [x] 附件、文件引用、发送、Stop、排队和草稿连续；状态不单靠颜色区分。
- [x] 同步中英文，并通过相关浏览器检查，创建中文分点提交。

本阶段门禁：`i18n:check`、`lint`、`build`、`check:composer-catalog`、
`check:capability-save`、`check:file-references`、`check:chat-browser`。
按影响补充图片、自动化配置与 toast 的相关验证。

Phase 2 本地验证记录（基于 Phase 1 `243347e`）：

- 模型、附件和发送/Stop 保持主操作行；运行设置位于第二行，沿用既有 props 与回调。
- 修复 InputGroup 的禁用样式范围：仅实际输入控件 disabled 时降低组透明度，
  空输入导致的 Send disabled 不再弱化模型、附件及设置。
- `i18n:check`、`lint`、`build`、`check:composer-catalog`、`check:capability-save`、
  `check:file-references`、完整 `check:chat-browser`、`check:images`、
  `check:automation-runtime`、`check:sandbox-delivery-browser` 均 exit 0。
- 新增 `check:composer-settings` 默认 18 组通过：中英文、明暗、300/320/390/768px，
  以及真实 AppShell 的 390/900px 模态 Sheet 内嵌套沙箱/能力弹层、逐层 Escape、
  焦点与背景隔离、outside 触摸、草稿和选择保留。该检查已接入 Frontend Quality 独立步骤。
- 自动化日志：`/tmp/ineffable-ui-composer-validation/*-integrated.log`、
  `composer-settings-final.log` 及基础检查的 `*-final.log`；
  截图及 18 组结果：`/tmp/ineffable-ui-composer-validation/settings-artifacts/`。
- 隔离工作树最初共享 Vite 缓存，导致两项初始化检查失败；将依赖缓存隔离后，
  原断言、原超时的 images/file-references 原门禁串行通过，并在集成基线上再次通过。
- 全部为本地 Chrome + 模拟 Gateway 数据；GitHub Actions 尚未运行，不代表生产联调。

## Phase 3：页面密度与视觉层级

- [ ] 收敛共享指标页标题、间距、指标卡密度；页面真实主内容提前。
- [ ] 模型页、自动化页和管理页面按现有共享层收敛，不复制页面 shell。
- [ ] 清理重复眉题和常驻帮助块，更新双语产品文案，重要动作和选中值清楚可辨。
- [ ] 验证浅/深色、中英文、320/390px 手机及桌面中栏宽度，弹窗和图表不溢出。
- [ ] 将本轮已验证规则补充进 AGENTS.md，不改用户未跟踪的 design.md。
- [ ] 通过本阶段检查并创建中文分点提交。

本阶段门禁：`i18n:check`、`lint`、`build`、`check:admin-mobile`、
`check:admin-editor`、`check:automation-runtime`、`check:toast`，
并对生产包做中英文、明暗、桌面/手机的实际页面截图检查。

## 最终审查与证据

- [ ] 独立审查仅接收本合同、仓库规则、起点/终点 SHA 和原始 diff，
  在 detached worktree 只读检查；阻断项修复后重审受影响路径。
- [ ] 全部机械门禁真实通过，保留命令结果和截图路径；不删除断言、延长超时或跳过失败场景。
- [ ] 明确浏览器检查使用本地模拟 Gateway 数据，不代表生产/真实 provider 联调。
- [ ] 最终提交仅包含本轮改动，原有用户修改完整保留。

## 执行记录

- 实施前已定位遮挡原因：聊天宽度动态可超过 640px，而布局占位被 640px 封顶；
  在 1440px 视口、256px 左栏、864px 聊天时，中栏约 216px 被覆盖。
- 实施前左栏 `sidebar_state` 只写 cookie，初始化未恢复；AppShell 默认展开。
- 当前生产与测试入口均为本地 checkout；本轮无发布或生产写入。
- Phase 1：布局按真实 `#root` 宽度计算，扣除中栏 480px 与壳层 16px 边距；
  1024px 全局断点保留，可用宽度低于 1052px 且聊天打开时，左导航使用已有抽屉，
  避免 256px 导航与最小 300px 聊天挤占中栏。左栏动画目标一次提交，CSS 同步执行。
- `preferredWidth` 只由用户操作更新；viewport、根容器、左栏约束只派生生效值。
  指针/键盘越界保存当时可显示的边界，双击恢复的 384px 偏好可在约束解除后恢复。
- 真实回归发现原 Sidebar 在桌面/Sheet 切换时重挂聊天并丢失草稿；已用唯一稳定
  portal host 保留 React 子树，并在 Sheet autofocus 中协调内部焦点与原生 selection。
  保留 Radix 模态约束，覆盖外部关闭、嵌套 Popover/Dropdown、Escape、焦点恢复和 toast。
- Phase 1 门禁已通过：i18n、lint（0 errors/0 warnings）、build、responsive-layout、
  shell-performance 开发/生产、workbench-layout 开发/生产、toast（390/844/1440px）。
  新几何门禁已接入 Frontend Quality 开发/生产步骤。构建仍有既有图片模块分包提示。
- 新几何回归还覆盖根容器减少 15px 的可用宽度及恢复，避免把浏览器滚动条空间
  当作可分配宽度；本地使用 Chrome 与模拟 Gateway，未声称已在 Linux/生产服务运行。
- Phase 1 截图与逐帧/尺寸证据：系统临时目录下的
  `ineffable-workbench-layout-{development,production}.{png,json}`。
- Phase 2/3 为缩短等待，在隔离 worktree 并行实施；主线仍按阶段顺序合入，
  其它工作树不写本阶段代码，性能测量期间已暂停其它浏览器重负载。
