# 常用公开 API 索引

这是插件开发最常用的**公开 NuGet API**入口。所有 Sdk 类型默认使用 `using MioKit.Sdk;`；Avalonia 控件位于 `MioKit.Sdk.Controls`，插件窗口扩展位于 `MioKit.Extensions.Extensions`，WebView2 类型位于 `MioKit.Webview2`。此索引用于定位主题，不替代每个主题中的约束和示例。

| 目标 | 首选类型 / 成员 | 继续阅读 |
|---|---|---|
| 插件入口、生命周期与卸载清理声明 | `PluginBase`、`IPlugin`、`IPluginContext`、`[PluginAccess]`、`IPluginDataCleanupProvider`、`PluginDataCleanupPlan`、`RegisterBase<T>`、`MioIoc`、`IPluginLifecycleComponent` | [plugin-core.md](plugin-core.md) |
| 跨插件方法调用 | `IPluginCallClient`、`IPluginCallStrategy`、`PluginCallRequest`、`PluginCallResponse`、`PluginCallErrorCodes` | [plugin-calls.md](plugin-calls.md) |
| 节点、树、持久化 | `MioObject`、`RootNode`、`IMioDataProvider`、`MioObjectExtensions`、`EavQuery` | [nodes-and-tree.md](nodes-and-tree.md) |
| 节点能力组合 | `IFeature`、`IInvokeFeature`、`IInvocationPresentationFeature`、`IRequireTargetWindowFeature`、`ISearchableFeature`、`IAliasNameFeature`、`IPinnedFeature`、`IUseFeature` | [features.md](features.md) |
| EAV / 内存属性 | `EavProperty<T>`、`SettingEavProperty<T>`、`MemoryProperty<T>`、`EavPropertyBuilder<T>`、`SettingEavPropertyBuilder<T>`、`MemoryPropertyBuilder<T>`、`MemoryPropertyBuilder<T>.WithId`、`MioObject.ReadPropertyAsync<T>`、`[EavRelation]`、`[MemoryRelation]`、`SettingEditorKind` | [extension-properties.md](extension-properties.md) |
| 搜索与匹配 | `SearchRequest`、`SearchResult`、`IWriteOnlyResultList<T>`、`SearchHelper.TryMatch`、`ITextMatcher` | [search.md](search.md) |
| 作用域/命令式搜索 | `IAttachPanelFeature`、`IAttachPanelSearchFeature`、`ISearchScopeFeature`、`SearchScopeFeatureBase` | [attach-search-panel.md](attach-search-panel.md) |
| 执行环境 | `InvokeContext.CancellationToken`、`InvocationSnapshot`、`IInvocationSnapshotProvider`、`IInvocationCaptureService` | [invocation-snapshot.md](invocation-snapshot.md) |
| 入口交互声明 | `IInvocationPresentationFeature`、`IInvocationPresentationProvider`、`InvocationPresentation`、`InvocationPresentationRequest`、`InvocationInteraction` | [invocation-presentation.md](invocation-presentation.md) |
| 结果附加操作 | `IResultActionProviderFeature`、`ISearchResultAction`、`SearchResultActionBase`、`IResultActionExtensionRegistry`、`IResultActionExtensionHandler`、`ResultActionExtensionContext`、`ClipboardContextNodeTypes` | [result-action.md](result-action.md) |
| 模态对话框 / 节点选择 | `MioDialogPanel`、`MioDialogWindow`、`MioNodeList`、`MioNodeSearch` | `miokit-plugin-avalonia-ui` 的 [对话框与节点列表](../../miokit-plugin-avalonia-ui/references/dialogs-and-node-list.md) |
| 搜索框内编辑 UI | `ISearchBoxWindow`、`IDialogContext`、`DialogResult` | `miokit-plugin-avalonia-ui` |
| 热键与输入 Hook | `IHotkeyFeature`、`IGlobalHotKeyService`、`IKeyboardHook`、`IMouseHook`、`IKeyboardInputHandler`、`IMouseInputHandler`、`MouseEventArgs` | [input-hooks.md](input-hooks.md) |
| 图标、文件和窗口 | `IconRequest`、`IIconLease`、`IconLease`、`IIconProviderFeature`、`IIconService`、`IconSource`、`ShellHelper`、`WindowManager`、`PluginWindowExtensions.SetPluginIcon` | [sdk-helpers.md](sdk-helpers.md)；Avalonia 控件见 `miokit-plugin-avalonia-ui` |
| 桌面通知 | `IToastService`、`ToastOptions`、`ToastAction`、`ToastProgress` | [notifications.md](notifications.md) |
| 插件 Scope 服务 | `IPluginServiceContext`、`GetRequiredService<T>()`、`TryGetService<T>()` | [host-services.md](host-services.md) |
| 宿主服务和事件 | `IMioEventBus`、`IForegroundWindowMonitor`、`ForegroundWindowChangedEventArgs`、`IImageService`、`IFocusRequestService`、`ILocalWebhostClient` | [host-services.md](host-services.md) |
| 可选任务登记、查询和取消 | `IMioTaskService`、`MioTaskOptions`、`MioTaskSnapshot`、`MioTaskCancellationReason`、`IPluginServiceContext`、`IPluginContext.GetTaskService()` / `TryGetTaskService()` | [managed-tasks.md](managed-tasks.md) |
| WebView2 + Vue + 共享 JS runtime | `MioWebview2`、`[JsService]`、`ServiceBridge`、`MioAppContext.Current.Environment.JavaScriptRuntimeDirectory` | `miokit-plugin-webview2` |
| 打包与依赖 | `plugin.json`、MSBuild `Pack` 项、MCP `pack_plugin` / `inspect_plugin_nupkg`（不 push） | [packaging.md](packaging.md)、[nuget.md](nuget.md) |

## 使用规则

1. 先按表定位主题；只读当前功能需要的文档。
2. 文档未列出的类型或成员，不要根据名称猜测。先在已安装 NuGet 包的 IDE metadata/XML documentation 中确认，再使用。
3. 遇到跨主题场景（例如可搜索节点 + EAV + 热键），分别遵守各主题的生命周期、预加载与线程约束。
4. 不要按 NuGet 包内磁盘路径推断命名空间：绝大多数 API 都在 `MioKit.Sdk` 根命名空间。
