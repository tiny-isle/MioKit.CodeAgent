# 宿主服务与事件

宿主全局服务通过 `MioIoc.Resolve<T>()` 获取；插件私有服务通过插件 `ComponentContext` 获取，容器边界见 [plugin-core.md](plugin-core.md)。不要把宿主服务注册进插件容器，也不要从构造函数或字段初始化器解析任何服务。

## 常用服务

| 需求 | 服务 / API | 注意事项 |
|---|---|---|
| 数据库存取 | `IMioDataProvider` | 节点查询、`StoreAsync`、批量预加载；搜索热路径禁止逐条异步读取。 |
| 搜索匹配 | `ITextMatcher` | 常规节点搜索优先 `SearchHelper.TryMatch`；仅自定义字段匹配时直接使用。 |
| 搜索框 UI | `ISearchBoxWindow` | 对话框使用 `TryShowDialogAsync`；Avalonia Dialog 约定见 `miokit-plugin-avalonia-ui`。 |
| 搜索框焦点 | `IFocusRequestService` | 请求焦点，不要直接操纵宿主窗口控件。 |
| 图标资产 | `IPluginContext.Icons` | 所有者绑定的读写入口；`OpenFileAsync` / `OpenStoredAsync` / `OpenRemoteAsync` 返回有生命周期的 lease，插件不能重建全库或修改其他插件记录。 |
| 系统图片 | `IImageService` | 需要从宿主存储项取得图标时使用。 |
| 全局热键 | `IGlobalHotKeyService` | 节点快捷键优先 `IHotkeyFeature`，见 [input-hooks.md](input-hooks.md)。 |
| 键盘/鼠标 Hook | `IKeyboardHook`、`IMouseHook` | 自定义拦截需实现对应 Handler，避免在 UI 线程执行耗时工作。 |
| 事件总线 | `IMioEventBus` | 发布/订阅跨模块事件；局部属性观察优先使用 `EavProperty.Changed`。 |
| 调用快照 | `IInvocationSnapshotProvider` | 通常由宿主生成 `SearchRequest.Context`，插件很少主动替换。 |

## 解析模式

```csharp
using MioKit.Sdk;

// 在方法体内解析宿主服务。
var dataProvider = MioIoc.Resolve<IMioDataProvider>();
var eventBus = MioIoc.Resolve<IMioEventBus>();

// 图标服务不从根容器解析，使用宿主绑定到当前插件的能力。
var icons = Context.Icons;

// 不确定可选服务是否存在时，先探测。
if (MioIoc.TryResolve<ILocalWebhostClient>(out var webhost) && webhost is not null)
{
    // 使用 webhost
}
```

`MioIoc.Resolve<T>()` 适合宿主公开服务；若未注册会抛出异常。`TryResolve<T>` 适合可选能力；`IsRegistered<T>` 可用于分支判断。不要用 `MioIoc` 解析仅在 `RegisterService` 中注册的插件私有类型。

## 事件总线

`IMioEventBus` 提供 `PublishAsync`、`RegisterEventHandle`、`UnregisterEventHandle`。事件处理器实现 `IMioEventHandler<TEvent>`，其中事件类型实现 `IEvent`。

常见树事件：

- `AttachedTreeEventMessage`：节点或子树接入根树。
- `DetachedTreeEventMessage`：节点或子树离开根树。
- `ParentChangedMessage`：父级变化。
- `MioPropertyChangedEventMessage`：持久化附加属性变化。

节点自身的属性变化优先监听 `XxxProperty.Changed` 或 `MioObject.PropertyChanged`；只有需要跨插件、跨节点协调时才使用总线。处理器应尽快返回，耗时工作自行尊重 `CancellationToken`。

## 可选本地 Web 服务

`ILocalWebhostClient` 用于可选的本地站点生命周期与状态查询。它不是所有宿主环境都保证提供的服务，因此必须 `TryResolve` / `IsRegistered` 后再用。它不替代 WebView2 的 `MioWebview2` 与 `[JsService]`；后者见 `miokit-plugin-webview2`。

## 检查清单

- [ ] 宿主服务在方法体或生命周期钩子中通过 `MioIoc` 获取
- [ ] 图标通过 `Context.Icons` 访问，没有解析兼容 `IIconService`
- [ ] 插件私有服务只从插件 `ComponentContext` / `PluginBase.Container` 获取
- [ ] 可选服务使用 `TryResolve` 或 `IsRegistered`
- [ ] 只在跨模块事件时使用 `IMioEventBus`；普通属性变化使用属性观察
- [ ] 异常记录到 `Context.Logger`，不吞掉关键错误
