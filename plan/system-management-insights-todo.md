# 系统管理洞察升级 TODO

目标：四个系统管理页统一从“配置列表”升级为“可判断、可排障、可行动”的管理视图。主表保持单列扫描，趋势、压力和风险信息进入图表区、行内展开或弹窗，不新增无职责中转层。

## 模型管理：模型维度的 usage / 能力 / 可用性

- [x] 保留模型 usage 趋势图，继续使用 `AppLineChart`。
- [x] 主表展示模型能力、状态、倍率和操作。
- [x] 行内详情补充模型可用性风险：上游配置、密钥引用、上下文/输出限制、能力开关。
- [x] 排序和筛选继续围绕 usage、能力、状态。

## 用户管理：用户维度的 usage / 套餐 / workspace / 风险

- [x] 用户详情增加月度 usage 趋势图，使用 `AppLineChart`。
- [x] 主表展示用户、角色/状态、套餐记录、本月 usage、workspace 汇总。
- [x] 行内详情展示套餐记录、workspace usage、月度 usage 明细。
- [x] 增加用户风险判断：无套餐、workspace 接近 quota、usage 异常增长。

## 套餐管理：套餐维度的 quota / 分配 / 消耗压力

- [x] 接入用户、用户套餐分配、用户月度 usage 和 workspace usage 的已有 API。
- [x] 增加套餐压力概览图，展示 credit limit、分配用户数、workspace storage 压力。
- [x] 主表展示 quota、分配数、模型权限和状态。
- [x] 行内详情展示 credit quota、workspace quota、model access policy 和消耗压力。

## 密钥管理：provider/key 维度的健康度 / 调用量 / 错误率

- [x] 接入模型档案，按 `upstream_api_key_ref` 汇总密钥引用关系。
- [x] 增加密钥健康概览图，展示 active/missing/unused/risky 数量。
- [x] 主表展示 secret_ref、引用模型数、保存状态、健康状态和操作。
- [x] 行内详情展示引用模型、provider/base url、metadata 和安全说明。
- [x] 当前没有 secret 级调用量/错误率 API 时，不在前端伪造错误率；以“暂无调用健康聚合”明确标注后端缺口。

## 验证

- [x] `npm run lint`
- [x] `npm run build`
- [x] 提交规范中文分点 commit。
