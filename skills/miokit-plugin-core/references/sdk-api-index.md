# 常用公开 API 索引

这是插件开发最常用的**公开 NuGet API**入口。所有 Sdk 类型默认使用 `using MioKit.Sdk;`；Avalonia 控件位于 `MioKit.Sdk.Controls`，插件窗口扩展位于 `MioKit.Extensions.Extensions`。`MioWebview2` 位于 `MioKit.Webview2`，`JsServiceAttribute` / `ServiceBridge` 位于 `MioKit.Webview2.Core`。此索引用于定位主题，不替代每个主题中的约束和示例。

## 同步基准与可用条件

2026-10-14 对照 `MioKit-Code` 提交 `ff46e01bca14da0d21ab2b13cd6aa620edab0975`，
Shadcn 子模块 `40496d214124cefac1dfc538c3931196d989f9f2`。核对公开源码、Runtime
注册/生命周期、模板及实现测试；源码与旧文档冲突时以实现为准。

- 启动器目标窗口标记示例最低 SDK 1.2.2。
- 托管任务、节点面板/拖放、前台窗口通知、鼠标 `ExtraInfo`、可选 Hook 分发
  示例最低 SDK 1.2.3；拖放助手还需要 Extensions 1.2.3。
- `IToastService` 与 `MioAppContext.IsExternalForegroundFullscreen` 最低 SDK 1.3.0。
  源码当前将 SDK 版本准备为 1.3.0，配套 Extensions、WebView2、生成器和模板仍为
  1.2.3；未核实 nuget.org 发布状态，不能把此基准作为已发布声明。
- 此基准之后的本地开发改动：插件 Scope 注册 `IPluginIconService`，与 Context 兼容属性
  使用同一实例；`Context.Icons` 标记非错误弃用。新 DI 用法以包含该改动的 1.3.0 宿主为
  前提，发布状态未核实，旧宿主仍保留旧入口。
- 同一轮本地开发增加 `IPluginServiceContext` 与 `GetRequiredService<T>` / `TryGetService<T>`，
  Context 绑定插件 `IComponentContext`；替换任务专用接口和字段，任务便捷扩展保留为
  通用包装。新通用入口需要包含该改动的 SDK / 宿主 1.3.0，尚未核实发布状态。

版本下限已用本机缓存的 SDK / Extensions 1.2.2、1.2.3 与当前源码编译校验；
不能仅凭提交时 csproj 的版本号推定包内容。使用时仍需确认所还原包与目标宿主实现。
模板默认依赖不保证覆盖新能力；新增 API 按需提升 `minSdkVersion`，
确认包可用后再添加直接 SDK 引用。普通基础示例不要求统一升级到 1.3.0。

## 按能力定位

| 目标 | 首选类型 / 成员 | 继续阅读 |
|---|---|---|
| 插件入口、生命周期与卸载清理声明 | `PluginBase`、`IPlugin`、`IPluginContext`、`[PluginAccess]`、`IPluginDataCleanupProvider`、`PluginDataCleanupPlan`、`RegisterBase<T>`、`MioIoc`、`IPluginLifecycleComponent` | [plugin-core.md](plugin-core.md) |
| 插件 Context 通用服务解析 | `IPluginServiceContext.Services`（`IComponentContext`）、`GetRequiredService<T>`、`TryGetService<T>` | [host-services.md](host-services.md)、[plugin-core.md](plugin-core.md) |
| 跨插件方法调用 | `IPluginCallClient`、`IPluginCallStrategy`、`PluginCallRequest`、`PluginCallResponse`、`PluginCallErrorCodes` | [plugin-calls.md](plugin-calls.md) |
| 节点、树、持久化 | `MioObject`、`RootNode`、`IMioDataProvider`、`MioObjectExtensions`、`EavQuery` | [nodes-and-tree.md](nodes-and-tree.md) |
| 节点面板与拖放 | `NodePaletteAttribute`、`NodePalette`、`MioDragProtocol`、`MioDragPayload`、`MioNodeDragDrop`（`MioKit.Extensions.Helpers`） | [node-drag-drop.md](node-drag-drop.md) |
| 节点能力组合 | `IFeature`、`IInvokeFeature`、`ISearchableFeature`、`IAliasNameFeature`、`IPinnedFeature`、`IUseFeature` | [features.md](features.md) |
| EAV / 内存属性 | `EavProperty<T>`、`SettingEavProperty<T>`、`MemoryProperty<T>`、`EavPropertyBuilder<T>`、`SettingEavPropertyBuilder<T>`、`MemoryPropertyBuilder<T>`、`MemoryPropertyBuilder<T>.WithId`、`MioObject.ReadPropertyAsync<T>`、`[EavRelation]`、`[MemoryRelation]`、`SettingEditorKind` | [extension-properties.md](extension-properties.md) |
| 搜索与匹配 | `SearchRequest`、`SearchResult`、`IWriteOnlyResultList<T>`、`SearchHelper.TryMatch`、`ITextMatcher` | [search.md](search.md) |
| 作用域/命令式搜索 | `IAttachPanelFeature`、`IAttachPanelSearchFeature`、`ISearchScopeFeature`、`SearchScopeFeatureBase` | [attach-search-panel.md](attach-search-panel.md) |
| 执行环境 | `InvokeContext`、`InvocationSnapshot`、`IInvocationSnapshotProvider` | [invocation-snapshot.md](invocation-snapshot.md) |
| 前台变更、全屏状态与启动器目标 | `IForegroundWindowMonitor`、`ForegroundWindowChangedEventArgs`、`MioAppContext.Current.IsExternalForegroundFullscreen`、`IRequireTargetWindowFeature` | [invocation-snapshot.md](invocation-snapshot.md)、[features-basics.md](features-basics.md) |
| 结果附加操作 | `IResultActionProviderFeature`、`ISearchResultAction`、`SearchResultActionBase`、`IResultActionExtensionRegistry`、`IResultActionExtensionHandler`、`ResultActionExtensionContext` | [result-action.md](result-action.md) |
| 搜索框内编辑 UI | `ISearchBoxWindow`、`IDialogContext`、`DialogResult` | `miokit-plugin-avalonia-ui` |
| 热键与输入 Hook | `IHotkeyFeature`、`IGlobalHotKeyService`、`IKeyboardInputHandler`、`IMouseInputHandler`、`MouseEventArgs.ExtraInfo`、`IInputHookDispatcher`（可选） | [input-hooks.md](input-hooks.md) |
| 插件托管任务 | `IMioTaskService`、`MioTaskOptions`、`MioTaskSnapshot`；构造注入或通用 Context 解析，任务专用扩展仍可用 | [managed-tasks.md](managed-tasks.md) |
| 宿主通知 | `IToastService`、`ToastOptions`、`ToastLevel`、`ToastProgress`、`ToastAction` | [toast.md](toast.md) |
| 图标、文件和窗口 | 插件 DI 的 `IPluginIconService`、`IconRequest`、`IIconLease`、`IconLease`、`IIconProviderFeature`、`IconSource`、`ShellHelper`、`WindowManager`、`PluginWindowExtensions.SetPluginIcon` | [sdk-helpers.md](sdk-helpers.md)；Avalonia 控件见 `miokit-plugin-avalonia-ui` |
| 宿主服务和事件 | `IMioEventBus`、`IImageService`、`IFocusRequestService`、`ILocalWebhostClient` | [host-services.md](host-services.md) |
| WebView2 + Vue + 共享 JS runtime | `MioWebview2`、`[JsService]`、`ServiceBridge`、`MioAppContext.Current.Environment.JavaScriptRuntimeDirectory` | `miokit-plugin-webview2` |
| 打包与依赖 | `plugin.json`、MSBuild `Pack` 项、MCP `pack_plugin` / `inspect_plugin_nupkg`（不 push） | [packaging.md](packaging.md)、[nuget.md](nuget.md) |

## 使用规则

1. 先按表定位主题；只读当前功能需要的文档。
2. 文档未列出的类型或成员，不要根据名称猜测。先在已安装 NuGet 包的 IDE metadata/XML documentation 中确认，再使用。
3. 遇到跨主题场景（例如可搜索节点 + EAV + 热键），分别遵守各主题的生命周期、预加载与线程约束。
4. 不要按 NuGet 包内磁盘路径推断命名空间：绝大多数 API 都在 `MioKit.Sdk` 根命名空间。
