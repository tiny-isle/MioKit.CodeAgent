# Skill → MCP 映射

Skill 仍是规范真源。本表只标：该主题里哪些适合做成 MCP，哪些继续只存在于 skill。

MCP 取代的是 **Agent 自己执行创建 / 打包 / 验包**。skill 文中若仍写仓库脚本或「Agent 直接跑 `dotnet new`」，规划上视为将删除、由下表 MCP 项取代，**不要当成 MCP 的依赖或回退**。上传打好的包由用户决定，不映射为 MCP tool。

---

## `miokit-plugin-new`

| Skill 内容 | MCP | 说明 |
|------------|-----|------|
| 本机开发环境（.NET 10 SDK；WebView2 再加 Runtime） | `check_dev_environment` | 创建 / 打包前的第一道门；`create_plugin` / `ensure_plugin_templates` / `pack_plugin` 内部复用 |
| 检查 / 安装 / 更新 `MioKit.Plugin.Templates` | `ensure_plugin_templates` | 先环境检查。默认 nuget.org；无包则安装，有则更新。文件夹路径安装要卸载 |
| `dotnet new miokit-plugin` / `miokit-plugin-webview2` | `create_plugin` | 先 check 环境，再 ensure，再按 `name` / `output` / `pluginId` 等创建 |
| `pluginId` 形态 `com.<org>.plugin.<slug>` | `suggest_plugin_id` | 创建前生成；`create_plugin` 可复用 |
| 禁止手抄骨架；禁止本地文件夹 `dotnet new install` | 约束写入上述 tools | 输出目录已有 `plugin.json` 则拒绝覆盖 |
| `-n` 派生命名、模板 shortName 选型 | **留 skill** | 判断用哪套模板、如何起解决方案名 |
| 创建后读 development skill、补节点 | **留 skill** | 模板不预置搜索组 / 可执行节点 |

Agent 不要自己拼 `dotnet new`。工作区尚无插件时：先 `check_dev_environment`，再调 `create_plugin`，不要改去手写 `plugin/`。

---

## `miokit-plugin-development`

### plugin-json.md

| Skill 内容 | MCP |
|------------|-----|
| 必填字段、禁止 `pluginVersion` / `releaseState` / `releaseDate`、`System.Version` | `validate_plugin_json`；resource `miokit://plugin-json-schema` |
| `id` 与 Const / `PluginBase` / Keyed 一致 | 校验工具可提示；跨文件对照仍可辅以 Agent 读代码 |
| 字段含义、Markdown description、商店信封叙事 | **留 skill** |

### packaging.md / nuget.md

| Skill 内容 | MCP |
|------------|-----|
| 目标框架 `net10.0-windows…`；WebView2 本机 Runtime | `check_dev_environment` |
| nupkg 根布局、PackageId / PackageVersion、`dotnet pack` 调用 | `pack_plugin`（先 `check_dev_environment`） |
| 解压检查、禁止宿主共享 DLL、图标双路径、`nugetDependents`、卸载产物 | `inspect_plugin_nupkg`；resource `miokit://packaging-hints` |
| 安装 Sdk / Templates（公共 NuGet 源） | `ensure_plugin_templates`（及模板还原）。默认 nuget.org；`miokit-nuget-url` 只作非公共源覆盖 |
| 把插件 nupkg 推到商店、nuget.org 或其它源 | **不进 MCP**；inspect 通过后由用户决定如何上传 |
| skill 中的仓库打包脚本、Agent 自行 `dotnet pack` 作为入口 | **不映射为依赖**；由 `pack_plugin` + `inspect_plugin_nupkg` 取代 |
| 目标宿主上安装验证 | **不进 MCP**（无运行中宿主通道） |
| `host-nuget-versions.md` 版本表 | **不进 MCP**（当前 skills 包无此文件，禁止编造版本） |

`inspect` 的 hints 对应开发修复，例如：图标同时 CopyToOutputDirectory + Pack，且 `PackageIcon` 与 `plugin.json.icon` 同路径。

### plugin-core.md

| Skill 内容 | MCP |
|------------|-----|
| Const：PluginId、TypeId 字符串 + `Guid.Parse`、固定 GroupId | `generate_plugin_const`（内部 `generate_guid`） |
| Register / `PluginBase` 骨架 | P3 `generate_register_snippet` |
| IoC 边界、生命周期管道、卸载清理契约 | **留 skill** |

### extension-properties.md

| Skill 内容 | MCP |
|------------|-----|
| EAV / SettingEav / Memory builder 片段 + 新 `WithId` | `generate_eav_property` |
| CLR 类型 → `MioStoreType` | P3 `map_store_type` |
| 何时用 EAV vs Memory vs SettingEav、缓存策略、变更通知 | **留 skill** |
| 勿手写 Get/Set | **留 skill**（源生成约定） |

### sdk-api-index.md

| Skill 内容 | MCP |
|------------|-----|
| 类型 / 关键词 → 主题文档 | `lookup_sdk_api`；resource `miokit://sdk-api-index` |
| 「未列出的成员不要猜」 | **留 skill** |

### vue-bridge.md

| Skill 内容 | MCP |
|------------|-----|
| `[JsService]` 允许 / 禁止的公开成员（§4.0） | `get_js_service_constraints` |
| Vue 工程结构、组合式 API、主题与页面写法 | **留 skill** |

### shadcn-theme.md

| Skill 内容 | MCP |
|------------|-----|
| 已注册 `DynamicResource` 键 | resource `miokit://shadcn-resource-keys` |
| 何时用 Brush vs Color、控件用法、禁止硬编码颜色 | **留 skill** |

### sdk-helpers.md

| Skill 内容 | MCP |
|------------|-----|
| 需求 → Sdk API 反模式表 §1 | resource `miokit://antipatterns` |
| `IconSource.*` / `*DataUrl` | resource `miokit://icon-source-names` |
| Shell、窗口、lease 生命周期叙事 | **留 skill** |

### host-services.md

| Skill 内容 | MCP |
|------------|-----|
| 需求 → `MioIoc.Resolve` / `Context.Icons` / `TryResolve` | resource `miokit://host-services` |
| 事件总线何时用、处理器要尽快返回 | **留 skill** |

### nodes-and-tree.md / features.md

| Skill 内容 | MCP |
|------------|-----|
| 组 / 节点类骨架 | P3 `generate_node_snippet` |
| 挂树语义、`EnsureTreeLoadedAsync`、Feature 组合、勿手写递归 | **留 skill** |

### search.md / attach-search-panel.md / search-box-dialog.md / result-action.md / invocation-snapshot.md / input-hooks.md

全部 **留 skill**（管线、交互设计、热键实现）。不做成 MCP tool 或把全文挂成 resource。

---

## 明确不进 MCP（汇总）

- 搜索管线、挂树、`InvokeContext` 选型
- EAV / Memory / SettingEav 选型判断
- AXAML / Vue 布局（键名表与 JsService 硬限制除外）
- 热键 / Hook、结果菜单、SearchBox Dialog、附着搜索框
- skill 全文当 MCP resource
- 操控运行中的 MioKit 宿主
- 商店人工登记、`nuget push`、把插件包传到任意源（inspect 通过后由用户决定）
- 手抄插件解决方案骨架
- 从本地文件夹 `dotnet new install` 模板
- 把仓库内打包脚本当作 MCP 入口或回退
- 臆造宿主 NuGet 版本表
- 在目标宿主上安装验证
