# MCP 能力清单

每条写清：名称、形态、对应 skill 主题、Agent 何时该调、为何不适合只靠 skill。优先级 P0–P3。P0 工具与 `miokit://plugin-json-schema` / `miokit://packaging-hints` 已实现；P1–P3 待实现。

规范来自 skill 的**规则**（字段、布局、禁止项、CLI 参数语义），不把 skill 里的仓库脚本当成 MCP 依赖。

---

## P0 — 创建 / 标识 / 打包检查（已实现）

开发主路径。创建前必须先保证本机模板包可用且为 NuGet 来源的最新版。

### `ensure_plugin_templates`

| 项 | 内容 |
|----|------|
| 形态 | tool |
| 来源 | `miokit-plugin-new` §1 |
| 何时调 | 创建插件之前；或用户问「模板装了没 / 要不要更新」 |
| 为何 MCP | 本机状态 + NuGet 源版本必须实际查询和安装，skill 写步骤无法保证各机器一致 |

流程：

1. `dotnet new list miokit` 判断是否已安装 `MioKit.Plugin.Templates`
2. 若 list 出现**文件夹路径**安装：失败，并 hint 先卸载文件夹来源，只保留 NuGet 包
3. 未安装：`dotnet new install MioKit.Plugin.Templates`，**默认公共 NuGet 源**（nuget.org），不传 `--nuget-source`
4. 仅当显式配置了非公共源（环境变量 `miokit-nuget-url`）时才加 `--nuget-source`；未配置则不要失败、不要猜测自建源地址
5. 已安装：对照公共源检查更新（`dotnet new update`，或按源上最新版本再 install），返回当前版本与是否发生了更新

禁止 `dotnet new install <本地文件夹>`。官方 Sdk / Templates 以 nuget.org 为准，自建测试源不是默认路径。

### `create_plugin`

| 项 | 内容 |
|----|------|
| 形态 | tool |
| 来源 | `miokit-plugin-new` §2–§6 |
| 何时调 | 工作区尚无 `plugin/plugin.json`，用户要新建插件 |
| 为何 MCP | 必须先更新模板再 `dotnet new`；手抄骨架会与模板漂移。MCP 一升级，所有项目用同一套创建流程 |

**先跑** `ensure_plugin_templates`，成功后再创建。

- 模板：`miokit-plugin` 或 `miokit-plugin-webview2`
- 参数对齐 CLI：`name`、`output`、`pluginId`、`displayName`、`description`、`pluginAuthor`
- 未传 `pluginId` 时按 skill 默认，或先走 `suggest_plugin_id`
- 输出目录已有 `plugin/plugin.json` 则拒绝覆盖
- 禁止手抄解决方案骨架
- 返回：生成路径、选用的模板、实际 `pluginId`

Agent 不要自己拼 `dotnet new` 命令。

### `generate_guid`

| 项 | 内容 |
|----|------|
| 形态 | tool |
| 来源 | `plugin-core.md` Const；`extension-properties.md` EAV `WithId` |
| 何时调 | 需要 TypeId、EavProperty Guid、其它稳定标识 |
| 为何 MCP | 标识必须真随机且格式稳定；模型手写 Guid 会碰撞或大小写不一致 |

默认大写、带 `8-4-4-4-12` 连字符。实现见 [`src/tools/generate-guid.ts`](../../src/tools/generate-guid.ts)。

### `validate_plugin_json`

| 项 | 内容 |
|----|------|
| 形态 | tool |
| 来源 | `plugin-json.md` |
| 何时调 | 改完 `plugin.json` 后、打包前、inspect 前 |
| 为何 MCP | 必填 / 禁止字段和 `System.Version` 规则容易写错，适合确定性校验 |

检查：

- 必填非空：`metadataVersion`、`id`、`name`、`assembly`、`minSdkVersion`
- `minSdkVersion` / `maxSdkVersion` / 宿主版本字段可被 `System.Version` 解析，无 SemVer 后缀
- 禁止 `pluginVersion`、`releaseState`、`releaseDate`
- `id` 形态建议 `com.<org>.plugin.<slug>`

### `suggest_plugin_id`

| 项 | 内容 |
|----|------|
| 形态 | tool |
| 来源 | `miokit-plugin-new` |
| 何时调 | 创建前尚未定 `pluginId`；`create_plugin` 可内部复用 |
| 为何 MCP | 从组织名 + 短名生成稳定 slug，避免 Agent 每次拼法不同 |

输出 `com.<org>.plugin.<slug>`。

### `pack_plugin`

| 项 | 内容 |
|----|------|
| 形态 | tool |
| 来源 | `packaging.md`、`nuget.md` 的规则（nupkg 根布局、PackageId / PackageVersion） |
| 何时调 | 本地要打出可安装的 `.nupkg` |
| 为何 MCP | 打包命令与输出目录必须全项目一致；MCP 同时负责确认产物符合规范，规则升级只改 MCP |

入参：插件解决方案根路径。`PackageVersion` 必填；未传 `PackageId` 时用 csproj 项目名。

1. 定位 `plugin/plugin.json` 与 `plugin/*.csproj`（找不到则报错并 hint）
2. `dotnet pack <csproj> -c Release -p:PackageId=… -p:PackageVersion=… -o <solution>/artifacts`
3. 不手抄 ZIP。入口 DLL / `plugin.json` 进 nupkg 根目录仍靠模板 **csproj Pack / MSBuild**
4. WebView2：打包前探测 `plugin/vue-ui` / `plugin/ui/dist`，缺前端产物则 warning，hint 先 `pnpm build`
5. 默认接着跑 `inspect_plugin_nupkg`；有 `errors` 则整体失败。成功时返回 nupkg 路径与检查报告

Agent 打包后必须立刻 `inspect_plugin_nupkg`。**打包不算完成，除非检查通过。** 实现时 `pack_plugin` 应默认带 `inspect: true`：先 `dotnet pack`，再跑同一套规范检查，有 `errors` 则整体失败并返回 hints。MCP 不上传、不 `nuget push`；产物路径交给用户自行决定怎么分发。

### `inspect_plugin_nupkg`

| 项 | 内容 |
|----|------|
| 形态 | tool |
| 来源 | `packaging.md` 本地检查项、`nuget.md` 禁止宿主 DLL、`plugin-json.md` |
| 何时调 | 刚 pack 完，或用户丢来一个 `.nupkg` 要审 |
| 为何 MCP | 检查规则写在 MCP 内，升级后所有插件立刻用同一套；skill 清单无法解压验包 |

将 `.nupkg` 按 zip 解压后检查：

- 根目录有 `plugin.json` 与 `assembly` 指向的 DLL
- `plugin.json` 可解析；必填字段非空；禁止三个旧发布字段
- `icon` 等相对资源在包内存在；nuspec `icon` 与 `plugin.json.icon` 路径一致
- WebView2 应有已构建前端静态资源（`ui/dist` 等）
- 包内没有 `MioKit.Sdk.dll`、`MioKit.SourceGenerate.dll`、`MioKit.Webview2.dll` 等宿主共享 DLL
- 无私有依赖 DLL 与 `nugetDependents` 双源冲突；无私有依赖只打 DLL 不写 `nugetDependents`
- 无独立卸载 DLL / 脚本 / SQL
- 能读到 nuspec description 时，检查是否为 `miokit.plugin-package` v1 JSON 信封

结果结构：`errors` / `warnings` / `hints`。hints 面向开发修复（例如图标须同时 CopyToOutputDirectory + Pack，且 `PackageIcon` 与 `plugin.json.icon` 同路径），不只报失败。无 `errors` 才视为产物符合规范。

---

## P1 — 骨架片段

### `generate_plugin_const`

| 项 | 内容 |
|----|------|
| 形态 | tool |
| 来源 | `plugin-core.md` Const |
| 何时调 | 新建插件后补 TypeId / GroupId，或新增节点类型 |
| 为何 MCP | 禁止 magic Guid；片段必须带新 GUID 和 `Guid.Parse` 配对 |

输出 `XxxConst`：`PluginId`、TypeId 字符串 + `Guid.Parse`、固定 GroupId 字符串。内部复用 `generate_guid`。

### `generate_eav_property`

| 项 | 内容 |
|----|------|
| 形态 | tool |
| 来源 | `extension-properties.md` |
| 何时调 | 新增 EAV / SettingEav / Memory 属性 |
| 为何 MCP | `WithId` 必须新 Guid 且发布后不可改；builder 样板容易漏 `Features/` 成对文件 |

三选一：EAV、SettingEav、Memory。输出 `Features/` 成对文件风格片段（含新 `WithId`）。

---

## P2 — 其它校验 / 速查

### `get_js_service_constraints`

| 项 | 内容 |
|----|------|
| 形态 | tool |
| 来源 | `vue-bridge.md` §4.0 |
| 何时调 | 编写或审查 `[JsService]` 公开 API |
| 为何 MCP | 允许/禁止成员是硬限制，适合按表返回，避免模型发明 `async void` / 自定义委托 |

### `lookup_sdk_api`

| 项 | 内容 |
|----|------|
| 形态 | tool |
| 来源 | `sdk-api-index.md` |
| 何时调 | 知道类型或关键词、不确定该读哪篇 skill |
| 为何 MCP | 把「类型 → 主题」做成查询，避免通读全部 reference |

---

## P3 — 可选片段

skill 示例已够用，实现优先级低。

### `generate_register_snippet` / `generate_node_snippet`

| 项 | 内容 |
|----|------|
| 形态 | tool |
| 来源 | `plugin-core.md`、`nodes-and-tree.md`、`features.md` |
| 何时调 | 新增 Register 注册、搜索组或可执行节点 |
| 为何 MCP | 可选；模板不预置节点，片段能减少 DI / `EnsureTreeLoadedAsync` 漏项 |

### `map_store_type`

| 项 | 内容 |
|----|------|
| 形态 | tool |
| 来源 | `extension-properties.md` |
| 何时调 | 为 CLR 类型选 `MioStoreType` |
| 为何 MCP | 映射表适合查询；判断「该不该持久化」仍留 skill |

---

## Resources（只读速查）

| URI | 内容 | 来源 | 何时读 |
|-----|------|------|--------|
| `miokit://plugin-json-schema` | 最小有效清单 + 禁止字段（已实现） | `plugin-json.md` | 写或改 `plugin.json` |
| `miokit://packaging-hints` | nupkg 不是 `lib/<TFM>/`、PackageId ≠ `plugin.json.id`、版本只走 NuGet SemVer、禁止三个旧字段、图标双路径（已实现） | `packaging.md`、`nuget.md` | pack / inspect 前后 |
| `miokit://sdk-api-index` | 公开类型 → 主题文档 | `sdk-api-index.md` | 不确定 API 归属 |
| `miokit://shadcn-resource-keys` | 已注册 `DynamicResource` 键（禁止发明键名） | `shadcn-theme.md` | 写 AXAML 主题 |
| `miokit://icon-source-names` | `IconSource.*` 与 `*DataUrl` | `sdk-helpers.md` | 节点/WebView 图标 |
| `miokit://host-services` | 需求 → `MioIoc.Resolve` / `Context.Icons` / `TryResolve` | `host-services.md` | 解析宿主服务 |
| `miokit://antipatterns` | 需求 → 该用的 Sdk API | `sdk-helpers.md` §1 | 避免重复造轮 |

不要把 skill 全文再挂成 MCP resource（重复且易过期）。

---

## 明确不进 MCP

- 搜索管线、挂树语义、`InvokeContext` 选型
- 何时用 EAV vs Memory vs SettingEav
- AXAML / Vue 布局与控件用法（键名表除外；JsService 硬限制除外）
- 热键 / Hook 实现细节
- 结果菜单、SearchBox Dialog、搜索框附着的交互设计
- 操控运行中的 MioKit 宿主
- 商店人工登记
- 上传 / `nuget push` 打好的插件包（由用户决定传到哪）
- 手抄插件解决方案骨架
- 从本地文件夹安装模板
- 臆造 `host-nuget-versions.md` 版本表（skill 引用了该文件但当前 skills 包里没有）
- 在目标宿主上安装验证
