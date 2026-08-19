---
name: miokit-plugin-development
description: >-
  MioKit 插件开发规范。仅在已有插件项目之后使用；创建项目请用
  miokit-plugin-new（MCP create_plugin）。入口 SKILL.md + references/ 分主题文档（规范与 API 同文件）。
  plugin.json→plugin-json.md，生命周期→plugin-core.md，节点/挂树→nodes-and-tree.md，
  扩展属性→extension-properties.md，搜索→search.md，附加到搜索框→attach-search-panel.md，
  打包发布→packaging.md，Vue UI→vue-bridge.md，辅助 API/反模式→sdk-helpers.md。
---

# MioKit 插件开发

编写或审查 MioKit 插件时**以本 skill 为准**。本 skill 与 `miokit-plugin-new` 同仓发布（`skills/`）；安装：`npx skills add tiny-isle/MioKit.CodeAgent`。创建、打包、验包走仓库 MCP（`mcp/`），不要自己拼 `dotnet new` / `dotnet pack`，也不要跑 `update-skills.ps1`。

每个 `references/*.md` **同时含用法约定与该类 API**；开发某一功能只读对应主题文档，不要再跳第二份速查。

按需读取，不要一次通读全部 reference。

## Agent 路由

| 工作区状态 | 使用 |
|------------|------|
| 尚无 `plugin/plugin.json` 或 `*Register.cs` | **停止**，转 `miokit-plugin-new` |
| 已有插件解决方案 | 本 skill；只打开与当前任务相关的主题文档 |

## MioKit.Sdk 命名空间

`MioKit.Sdk` 包中**绝大多数公开类型**均在根命名空间 **`MioKit.Sdk`** 下，与磁盘文件夹无关：

```csharp
using MioKit.Sdk;

// PluginBase、MioObject、IFeature、SearchRequest、IMioDataProvider、EavProperty<T> …
```

| 约定 | 说明 |
|------|------|
| 插件代码 | 统一 `using MioKit.Sdk;`，**不要**按文件夹臆造子命名空间 |
| 少数控件 | `HighlightedTextBlock` 等在 `MioKit.Sdk.Controls`（仅 Avalonia 控件） |
| WebView2 | `[JsService]`、`MioWebview2` 在 **`MioKit.Webview2`** 包，非 Sdk；方法可同步或返回标准 Task/ValueTask，另支持属性/可通知列表/`EventHandler`（见 [vue-bridge.md](references/vue-bridge.md) §4.0） |
| Feature 接口与扩展 | Sdk 与插件均采用 `Features/` 目录，接口与 `partial` 扩展类**成对同目录**（见 [extension-properties.md](references/extension-properties.md)） |

## 推荐项目结构

`dotnet new` 只生成必要骨架。创建须走 `miokit-plugin-new`（MCP `create_plugin`）。插件进入开发后按需创建：

```text
plugin/
├── Assets/       # icon、图片、静态资源
├── Features/     # IMyFeature.cs + IMyFeature.Extensions.cs
├── Models/       # DTO、配置、缓存记录
├── Nodes/        # MioObject 搜索组、可执行节点、树结构
├── Properties/   # _global.cs / AssemblyInfo.cs
├── Services/     # 扫描、同步、缓存、桥接等服务
└── Views/        # Avalonia/WebView2 视图
```

不要为了“预留”目录添加空占位文件。

## 主题索引（一类一文档）

| 主题 | 文档 |
|------|------|
| plugin.json | [plugin-json.md](references/plugin-json.md) |
| 打包、检查与发布 | [packaging.md](references/packaging.md) |
| 入口 / DI / 生命周期 | [plugin-core.md](references/plugin-core.md) |
| 节点 / 挂树 / 数据访问 | [nodes-and-tree.md](references/nodes-and-tree.md) |
| EAV / Memory / 内置属性 | [extension-properties.md](references/extension-properties.md) |
| 搜索 | [search.md](references/search.md) |
| 附加到搜索框 | [attach-search-panel.md](references/attach-search-panel.md) |
| SearchBox Dialog | [search-box-dialog.md](references/search-box-dialog.md) |
| 结果菜单 | [result-action.md](references/result-action.md) |
| 调用快照 / InvokeContext | [invocation-snapshot.md](references/invocation-snapshot.md) |
| IFeature | [features.md](references/features.md) |
| Vue 桥接 | [vue-bridge.md](references/vue-bridge.md) |
| AXAML 主题 | [shadcn-theme.md](references/shadcn-theme.md) |
| Hook / 热键 | [input-hooks.md](references/input-hooks.md) |
| NuGet | [nuget.md](references/nuget.md) |
| 图标 / Shell / 窗口 / 反模式 | [sdk-helpers.md](references/sdk-helpers.md) |
| 宿主服务 / 事件总线 / 可选服务 | [host-services.md](references/host-services.md) |
| 常用公开 API 索引 | [sdk-api-index.md](references/sdk-api-index.md) |

## 快速流程

1. 若尚无插件项目 → **停止**，用 `miokit-plugin-new`（MCP `create_plugin`）
2. 实现 [plugin-core.md](references/plugin-core.md) — Const、Register、`PluginBase`；新 TypeId / EAV `WithId` 用 MCP `generate_guid`
3. 实现 [nodes-and-tree.md](references/nodes-and-tree.md) — 搜索组 + 可执行节点 + 挂树（模板不预置）
4. 按需：[extension-properties.md](references/extension-properties.md)、[search.md](references/search.md)、[attach-search-panel.md](references/attach-search-panel.md)、[invocation-snapshot.md](references/invocation-snapshot.md)、[vue-bridge.md](references/vue-bridge.md)、[nuget.md](references/nuget.md)
5. 改 `plugin.json` 后可用 MCP `validate_plugin_json`；resource `miokit://plugin-json-schema`
6. 交付前：调 MCP `pack_plugin`（`packageVersion` 必填，默认接着 `inspect_plugin_nupkg`）。上传 `.nupkg` 由用户决定，不要 `nuget push`

## 检查清单

- [ ] 目录按需创建；常用业务代码归入 `Features` / `Models` / `Nodes` / `Services` / `Views`
- [ ] Const：PluginId、TypeId、`[EavType]`、固定 GroupId、EavProperty 新 Guid
- [ ] `plugin.json` 已声明 SDK / 宿主兼容范围，不含 `pluginVersion` / `releaseState` / `releaseDate`；版本与预发布状态只由 NuGet SemVer 决定
- [ ] 打包前已调 MCP `pack_plugin`（默认 inspect）；按 [packaging.md](references/packaging.md) 核对 `assembly`、`plugin.json`、图标/前端静态资源与 nupkg 根目录
- [ ] `RegisterBase<T>`（程序集唯一）+ `PluginBase` + `Keyed<IPlugin>(PluginId)`；构造函数不解析 Container
- [ ] 随启停的后台逻辑用 `IPluginLifecycleComponent` 注册到插件容器，而非塞进 `StartCoreAsync`/`StopCoreAsync`
- [ ] 宿主服务 `MioIoc.Resolve<T>()`；插件私有服务 `XxxRegister.Instance.ComponentContext` 或 `Container!.Resolve<T>()`
- [ ] 组 `ISearchableFeature` + 节点 `IInvokeFeature`；`StartCoreAsync` → `EnsureTreeLoadedAsync`；模板**不**预置节点，自行添加
- [ ] 需要结果菜单时：`IResultActionProviderFeature` → [result-action.md](references/result-action.md)
- [ ] 需要在搜索框内弹出编辑 UI 时：`ISearchBoxWindow.TryShowDialogAsync` + `IDialogContext` → [search-box-dialog.md](references/search-box-dialog.md)
- [ ] 需要搜索框附着模式时：`SearchScopeFeatureBase` + `SearchCommands`（可选 `SetUserSearchCommands`）→ [attach-search-panel.md](references/attach-search-panel.md)
- [ ] EAV 在 `Features/` 成对 `partial` Extension；已更新 `docs/features-and-properties.md` → [extension-properties.md](references/extension-properties.md)
- [ ] WebView2：`[JsService]` 异步方法仅返回 Task/ValueTask 标准形态；无 `async void`、自定义 awaitable 或自定义 delegate 事件 → [vue-bridge.md](references/vue-bridge.md) §4.0
- [ ] 异常用 `Context.Logger`；私有数据用 `Context.PluginDataPath`
- [ ] 不确定 API 时先查 [sdk-api-index.md](references/sdk-api-index.md)，再只打开该能力的主题文档；不要臆造未列出的类型或成员
