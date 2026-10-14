# 宿主服务与事件

插件代码统一从插件 DI 获取服务，业务类优先构造注入；方法内可从插件
`ComponentContext` / `PluginBase.Container` 解析。插件 Scope 继承宿主全局注册，
因此 Hook、搜索窗口、数据服务等也通过同一入口获取，无需按注册位置选择容器。
宿主为 `IPluginIconService` / `IMioTaskService` / `IToastService` 提供插件绑定实例，
使用插件 DI 即可保留正确归属，不要自行覆盖宿主注入项。
`Context.Icons` 已弃用但保留兼容；图标 DI 需要支持该注册的 1.3.0 宿主。
容器与生命周期约定见 [plugin-core.md](plugin-core.md)。构造函数/字段初始化器不主动
`Resolve`；构造注入的类应由插件 DI 创建。

## 通用 Context 服务入口

包含该改动的 SDK / 宿主 1.3.0 开发版本提供 `IPluginServiceContext`，其只读
`Services` 类型为 Autofac `IComponentContext`。原 `IPluginContext` 不增加必需成员。
两种接口在插件 Scope 中注册为同一个 Context 实例。
业务服务仍优先构造注入；节点、回调或仅有 Context 的位置可使用扩展：

```csharp
using MioKit.Sdk;

// context 是当前插件的 IPluginContext。
var icons = context.GetRequiredService<IPluginIconService>();
var tasks = context.GetRequiredService<IMioTaskService>();
var toasts = context.GetRequiredService<IToastService>();

if (context.TryGetService<MyPluginService>(out var service))
{
    // 使用已在插件 RegisterService 中注册的业务服务。
}
```

以后新增服务只需由宿主或插件注册到相应容器，不为每个服务增加 Context 接口/属性。
解析使用当前插件 Scope，可继承宿主全局注册；图标/任务/通知由宿主在子 Scope 绑定
正确所有者。扩展方法不主动回退 `MioIoc`。

- 旧 Context 不实现该能力：`TryGetService` 返回 `false`，`GetRequiredService` 抛
  `NotSupportedException`。缺少注册时，Try 返回 `false`，Required 抛 Autofac 注册错误。
- 服务工厂/构造函数失败会继续抛出，Try 不把激活错误伪装成“没有服务”。
- Scope 构建完成后、解析插件实例之前绑定。`RegisterService` 阶段不能通过 Context
  解析服务；绑定前和卸载清理后访问（含 Try）会抛 `InvalidOperationException`。
- 普通 Stop/Start 保留同一 Scope；服务可解析不代表任务/通知入口仍处于启用状态。
  卸载/重新加载解除旧绑定，新实例使用新 Context；不要缓存容器或跨重载复用服务。
- Scope 的释放由宿主负责。`Services` 只公开解析接口，插件不得转为 `ILifetimeScope`
  后 Dispose 宿主 Scope；需要清理的自有工作仍遵守插件生命周期。

`IPluginTaskContext` 已收敛移除。`GetTaskService()` / `TryGetTaskService()` 保留为通用
解析的便捷包装，不再依赖任务专用 Context 字段。新入口的发布条件见
[sdk-api-index.md](sdk-api-index.md)。

## 常用服务

| 需求 | 服务 / API | 注意事项 |
|---|---|---|
| 数据库存取 | `IMioDataProvider` | 节点查询、`StoreAsync`、批量预加载；搜索热路径禁止逐条异步读取。 |
| 搜索匹配 | `ITextMatcher` | 常规节点搜索优先 `SearchHelper.TryMatch`；仅自定义字段匹配时直接使用。 |
| 搜索框 UI | `ISearchBoxWindow` | 对话框使用 `TryShowDialogAsync`；Avalonia Dialog 约定见 `miokit-plugin-avalonia-ui`。 |
| 搜索框焦点 | `IFocusRequestService` | 请求焦点，不要直接操纵宿主窗口控件。 |
| 图标资产 | `IPluginIconService` | 插件 Scope 构造注入（1.3.0 开发版本）；所有者绑定，图像 lease 需释放，不能修改其他插件记录；旧 `Context.Icons` 仅兼容。 |
| 系统图片 | `IImageService` | 需要从宿主存储项取得图标时使用。 |
| 全局热键 | `IGlobalHotKeyService` | 节点快捷键优先 `IHotkeyFeature`，见 [input-hooks.md](input-hooks.md)。 |
| 键盘/鼠标 Hook | `IKeyboardHook`、`IMouseHook` | 自定义拦截需实现对应 Handler，避免在 UI 线程执行耗时工作。 |
| 事件总线 | `IMioEventBus` | 发布/订阅跨模块事件；局部属性观察优先使用 `EavProperty.Changed`。 |
| 调用快照 | `IInvocationSnapshotProvider` | 通常由宿主生成 `SearchRequest.Context`，插件很少主动替换。 |
| 前台窗口变更 | `IForegroundWindowMonitor` | SDK 1.2.3+；只通知句柄，回调尽快返回、停止时退订；详见 [invocation-snapshot.md](invocation-snapshot.md)。 |
| 插件托管任务 | `IMioTaskService` | SDK 1.2.3+；优先插件 Scope 构造注入，Context 扩展保留；见 [managed-tasks.md](managed-tasks.md)。 |
| 宿主 Toast | `IToastService` | SDK 1.3.0+；插件 Scope 注入，版本发布条件及用法见 [toast.md](toast.md)。 |

## 解析模式

```csharp
using MioKit.Sdk;
using Autofac;

// PluginBase 方法内：全局注册与插件注册都通过插件容器解析。
var dataProvider = Container!.Resolve<IMioDataProvider>();
var eventBus = Container!.Resolve<IMioEventBus>();

// PluginBase 方法内的图标入口；业务服务优先构造注入 IPluginIconService。
var icons = Container!.Resolve<IPluginIconService>();

// 不确定可选服务是否存在时，先探测。
if (Container!.TryResolve<ILocalWebhostClient>(out var webhost))
{
    // 使用 webhost
}
```

插件容器的 `Resolve<T>()` 在缺少注册时抛出异常；可选能力用 `TryResolve<T>` 或
`ResolveOptional<T>`。仅持有 Context 时用通用扩展（需对应新 SDK/宿主）。
`MioIoc` 是宿主根容器入口，不作为插件业务代码的常规解析方式；插件 Scope 已继承
全局注册，无需再次到根容器查找。解析成功也不改变共享服务的所有权，插件只解除
自己的订阅/注册，不停止或释放共享服务。

`IMioTaskService` / `IToastService` 的根实例是应用范围；即使根容器能解析，也不能用于
插件归属的工作。Context 能力用 `TryGetService<T>` 探测；Toast 需要对应
SDK/宿主，不能用根实例作为兼容回退。

## 事件总线

`IMioEventBus` 提供 `PublishAsync`、`RegisterEventHandle`、`UnregisterEventHandle`。事件处理器实现 `IMioEventHandler<TEvent>`，其中事件类型实现 `IEvent`。

常见树事件：

- `AttachedTreeEventMessage`：节点或子树接入根树。
- `DetachedTreeEventMessage`：节点或子树离开根树。
- `ParentChangedMessage`：父级变化。
- `MioPropertyChangedEventMessage`：持久化附加属性变化。

节点自身的属性变化优先监听 `XxxProperty.Changed` 或 `MioObject.PropertyChanged`；需要
跨模块事件广播时使用总线。若需要请求另一个运行中插件执行明确方法并返回结果，应使用
[plugin-calls.md](plugin-calls.md) 中的跨插件方法调用，而不是把请求/响应伪装成事件。
事件处理器应尽快返回，耗时工作自行尊重 `CancellationToken`。

## 可选本地 Web 服务

`ILocalWebhostClient` 用于可选的本地站点生命周期与状态查询。它不是所有宿主环境都保证提供的服务，因此必须 `TryResolve` / `IsRegistered` 后再用。它不替代 WebView2 的 `MioWebview2` 与 `[JsService]`；后者见 `miokit-plugin-webview2`。

## 检查清单

- [ ] 所有服务统一通过插件 DI 获取；业务类优先构造注入，方法内使用插件容器或 Context
- [ ] 图标优先注入插件绑定 `IPluginIconService`，没有解析兼容 `IIconService`；
      新代码不使用已弃用 `Context.Icons`
- [ ] 插件私有服务只从插件 `ComponentContext` / `PluginBase.Container` 获取
- [ ] 插件图标/任务/通知使用宿主注入的插件实例服务，不解析根实例或自行注册替代项
- [ ] 可选服务使用 `TryResolve` 或 `IsRegistered`
- [ ] 只在跨模块事件时使用 `IMioEventBus`；跨插件方法请求使用
      [plugin-calls.md](plugin-calls.md)，普通属性变化使用属性观察
- [ ] 异常记录到 `Context.Logger`，不吞掉关键错误
