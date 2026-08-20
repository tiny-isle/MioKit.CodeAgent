---
name: miokit-plugin-core
description: >-
  MioKit 已有插件项目的核心开发规范。用于插件入口、plugin.json、RegisterBase、PluginBase、DI、生命周期、MioObject 节点、Feature、EAV、搜索、宿主服务、输入 Hook、NuGet 依赖、打包和验包；当工作区已经存在 plugin/plugin.json 或插件 Register 类时使用。新建插件解决方案请使用 miokit-plugin-new；Avalonia AXAML 使用 miokit-plugin-avalonia-ui；MioWebview2、JsService 或 Vue 使用 miokit-plugin-webview2。
---

# MioKit 插件核心开发

本 Skill 负责已有 MioKit 插件项目的非 UI 能力。参考文档同时包含 API 约定和使用规范，
它们是实现插件时的规范真源。

**上下文边界：** 先从主题索引打开与当前改动直接对应的一篇文档。只有它明确链接的能力
也是当前任务的一部分时，才继续打开下一篇；不要预读节点、Feature、搜索或 EAV 文档。
一个主题的“路由”页只用于选择其下的一篇细分文档，不替代细分文档本身。

## 路由

- 没有 `plugin/plugin.json`、插件 `*Register.cs` 或已有解决方案时，停止并使用
  `miokit-plugin-new`；不要手写插件骨架。
- 出现 `.axaml`、`Ti.Avalonia.Shadcn`、Avalonia 控件、Dialog 或 Preview 时，和本
  Skill 一起使用 `miokit-plugin-avalonia-ui`。
- 出现 `MioWebview2`、`MioKit.Webview2`、`[JsService]`、Vue、`vue-ui`、`ui/dist`
  或 `pnpm` 时，和本 Skill 一起使用 `miokit-plugin-webview2`。
- 搜索、节点、Feature、服务和插件生命周期始终归本 Skill；不要为这些能力另造 UI
  层实现。

## SDK 命名空间约定

绝大多数 SDK 类型位于 `MioKit.Sdk`，插件代码通常统一使用：

```csharp
using MioKit.Sdk;
```

不要根据磁盘目录臆造命名空间。`MioKit.Sdk.Controls` 只包含少数 Avalonia 控件；
`MioWebview2` 和 `[JsService]` 位于 `MioKit.Webview2`，详见 WebView2 Skill。

## 阅读流程

1. 确认工作区已经由 `miokit-plugin-new` 创建，并按需建立 `Features`、`Models`、
   `Nodes`、`Services` 和 `Views` 目录；不要添加空占位文件。
2. 按主题索引选择**一项**与当前改动直接相关的参考并实现。入口或生命周期改动才读
   `plugin-core.md`；新增节点才读 `nodes-and-tree.md`；搜索改动才读 `search.md`。
3. 文档涉及某一 Feature、属性或搜索框附着时，先打开该主题的路由页，再只选一个细分
   文档。不要因为创建节点就预读全部 Feature、搜索和 EAV 规则。
4. 交付前仅按改动范围补读检查项；打包时使用 MCP 工具校验 `plugin.json`、生成所需
   Guid、打包并检查 nupkg。工具入口和参数以当前 MCP schema 为准，不自行执行仓库脚本
   或 `dotnet pack`。

## 主题索引

| 主题 | 参考文档 |
|---|---|
| 插件入口、DI、生命周期 | [plugin-core.md](references/plugin-core.md) |
| `plugin.json` | [plugin-json.md](references/plugin-json.md) |
| 节点、挂树、数据访问 | [nodes-and-tree.md](references/nodes-and-tree.md) |
| Feature（先选基础或搜索/UI） | [features.md](references/features.md) |
| EAV、Setting、Memory（先选定义或高级） | [extension-properties.md](references/extension-properties.md) |
| 搜索 | [search.md](references/search.md) |
| 附着到搜索框（先选基础或 command） | [attach-search-panel.md](references/attach-search-panel.md) |
| 结果菜单 | [result-action.md](references/result-action.md) |
| 调用快照 | [invocation-snapshot.md](references/invocation-snapshot.md) |
| 宿主服务和事件 | [host-services.md](references/host-services.md) |
| 输入 Hook 和热键 | [input-hooks.md](references/input-hooks.md) |
| SDK 辅助 API 和反模式 | [sdk-helpers.md](references/sdk-helpers.md) |
| NuGet 与加载边界 | [nuget.md](references/nuget.md) |
| 打包、验包和发布 | [packaging.md](references/packaging.md) |
| 常用公开 API 索引 | [sdk-api-index.md](references/sdk-api-index.md) |

## 核心检查

- [ ] `RegisterBase<T>` 在程序集内唯一；入口使用 `PluginBase` 和
  `Keyed<IPlugin>(PluginId)`，构造函数不解析容器。
- [ ] 后台逻辑通过 `IPluginLifecycleComponent` 注册，不塞进
  `StartCoreAsync` 或 `StopCoreAsync`。
- [ ] 宿主服务使用 `MioIoc.Resolve<T>()`；插件私有服务使用插件容器。
- [ ] 搜索组实现 `ISearchableFeature`，可执行节点实现 `IInvokeFeature`，启动后调用
  `EnsureTreeLoadedAsync`。
- [ ] EAV / Memory / Setting 选择符合 [extension-properties.md](references/extension-properties.md)。
- [ ] `plugin.json` 不包含 `pluginVersion`、`releaseState`、`releaseDate`；包版本由
  NuGet SemVer 决定。
- [ ] 打包后根目录包含正确的 DLL 和 `plugin.json`，不携带宿主共享 DLL。
- [ ] SDK / 模板依赖从 nuget.org 还原；不要为 MioKit 包添加私有源或本地 nupkg。
- [ ] 异常通过 `Context.Logger` 记录，插件私有数据使用 `Context.PluginDataPath`。
- [ ] 不确定 API 时先查 [sdk-api-index.md](references/sdk-api-index.md)，不要猜测未列出的成员。
