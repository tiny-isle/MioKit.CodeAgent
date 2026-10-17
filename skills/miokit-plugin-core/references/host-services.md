# 宿主服务与事件

宿主全局服务通过 `MioIoc.Resolve<T>()` 获取；插件私有服务和绑定当前插件所有者的服务通过插件 Scope 获取，容器边界见 [plugin-core.md](plugin-core.md)。宿主提供的服务不需要重复注册；服务可以通过构造函数注入，不要在构造函数或字段初始化器中主动解析容器。

## 常用服务

| 需求 | 服务 / API | 注意事项 |
|---|---|---|
| 数据库存取 | `IMioDataProvider` | 节点查询、`StoreAsync`、批量预加载；搜索热路径禁止逐条异步读取。 |
| 搜索匹配 | `ITextMatcher` | 常规节点搜索优先 `SearchHelper.TryMatch`；仅自定义字段匹配时直接使用。 |
| 搜索框 UI | `ISearchBoxWindow` | 对话框使用 `TryShowDialogAsync`；Avalonia Dialog 约定见 `miokit-plugin-avalonia-ui`。 |
| 搜索框焦点 | `IFocusRequestService` | 请求焦点，不要直接操纵宿主窗口控件。 |
| 图标资产 | `IPluginContext.Icons` | 所有者绑定的读写入口；`OpenFileAsync` / `OpenStoredAsync` / `OpenRemoteAsync` 返回有生命周期的 lease，插件不能重建全库或修改其他插件记录。 |
| 可选任务管理 | `Context.GetTaskService()`、`IMioTaskService` | 插件使用 Context 或 Scope 中的专属服务，显式登记、查询、请求取消；见 [managed-tasks.md](managed-tasks.md)。 |
| 桌面通知 | `IToastService` | 构造注入或 `Context.GetRequiredService<IToastService>()`；使用插件 Scope，见 [notifications.md](notifications.md)。 |
| 系统图片 | `IImageService` | 需要从宿主存储项取得图标时使用。 |
| 全局热键 | `IGlobalHotKeyService` | 节点快捷键优先 `IHotkeyFeature`，见 [input-hooks.md](input-hooks.md)。 |
| 键盘/鼠标 Hook | `IKeyboardHook`、`IMouseHook` | 自定义拦截需实现对应 Handler，避免在 UI 线程执行耗时工作。 |
| 前台窗口变化 | `IForegroundWindowMonitor` | 只通知新句柄；标题和进程按需用调用快照采集。 |
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

// 任务服务同样绑定当前插件，不解析根容器中的全局任务服务。
var tasks = Context.GetTaskService();

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

节点自身的属性变化优先监听 `XxxProperty.Changed` 或 `MioObject.PropertyChanged`；需要
跨模块事件广播时使用总线。若需要请求另一个运行中插件执行明确方法并返回结果，应使用
[plugin-calls.md](plugin-calls.md) 中的跨插件方法调用，而不是把请求/响应伪装成事件。
事件处理器应尽快返回，耗时工作自行尊重 `CancellationToken`。

## 前台窗口变更

宿主注册唯一的 `IForegroundWindowMonitor`。插件在生命周期里订阅，停止时退订，不要自己安装 `EVENT_SYSTEM_FOREGROUND` 钩子。

| 成员 | 说明 |
|---|---|
| `CurrentHandle` | 最近一次观察到的前台句柄；没有前台窗口时为 `0` |
| `Changed` | 前台窗口变化；参数 `ForegroundWindowChangedEventArgs.Handle` 是新句柄 |

事件只带句柄。标题、进程名、路径和类名仍通过 `IInvocationSnapshotProvider` 按需采集，见 [invocation-snapshot.md](invocation-snapshot.md)。搜索和执行应继续读当次 `InvocationSnapshot`，不要用这个实时句柄代替快照。

回调运行在安装钩子的线程上，不是 UI 线程。处理程序必须立刻返回；更新界面或做 I/O 要自行切走。某个订阅者抛出的异常会被记录，且不会挡住其余订阅者。

```csharp
using MioKit.Sdk;

public sealed class ForegroundWatchComponent : IPluginLifecycleComponent
{
    private IForegroundWindowMonitor? _monitor;

    public Task StartAsync(CancellationToken cancellationToken = default)
    {
        _monitor = MioIoc.Resolve<IForegroundWindowMonitor>();
        _monitor.Changed += OnForegroundChanged;
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken = default)
    {
        if (_monitor is not null)
            _monitor.Changed -= OnForegroundChanged;
        _monitor = null;
        return Task.CompletedTask;
    }

    private void OnForegroundChanged(object? sender, ForegroundWindowChangedEventArgs args)
    {
        if (args.Handle == 0)
            return;

        // 立刻返回。需要标题或进程时，稍后调用 IInvocationSnapshotProvider。
    }
}
```

启动器和主面板是否必须先切回目标窗口，由节点上的 `IRequireTargetWindowFeature` 决定，见 [features-basics.md](features-basics.md)。

## 可选本地 Web 服务

`ILocalWebhostClient` 用于可选的本地站点生命周期与状态查询。它不是所有宿主环境都保证提供的服务，因此必须 `TryResolve` / `IsRegistered` 后再用。它不替代 WebView2 的 `MioWebview2` 与 `[JsService]`；后者见 `miokit-plugin-webview2`。

## 检查清单

- [ ] 宿主服务在方法体或生命周期钩子中通过 `MioIoc` 获取
- [ ] 图标通过 `Context.Icons` 访问，没有解析兼容 `IIconService`
- [ ] 任务服务通过当前插件 Context / Scope 获取，按 [managed-tasks.md](managed-tasks.md)
      显式登记并传递取消 token，没有解析全局根任务服务
- [ ] 插件私有服务只从插件 `ComponentContext` / `PluginBase.Container` 获取
- [ ] 可选服务使用 `TryResolve` 或 `IsRegistered`
- [ ] 只在跨模块事件时使用 `IMioEventBus`；跨插件方法请求使用
      [plugin-calls.md](plugin-calls.md)，普通属性变化使用属性观察
- [ ] 前台变化订阅 `IForegroundWindowMonitor`，回调立即返回，停止时退订
- [ ] 异常记录到 `Context.Logger`，不吞掉关键错误

## 插件 Scope 服务

宿主通过可选的 `IPluginServiceContext.Services` 暴露当前插件容器，优先构造函数注入；
节点或入口中可用 Context 扩展：

```csharp
var toasts = Context.GetRequiredService<IToastService>();
if (Context.TryGetService<IToastService>(out var optionalToasts))
    optionalToasts.Show("操作完成");
```

`GetRequiredService<T>()` 在旧 Context 不支持 Scope 时抛出 NotSupportedException；
未注册或激活失败的异常继续传出。`TryGetService<T>()` 只对旧 Context / 未注册返回
false，不吞掉激活或生命周期异常。不会回退到根容器。
Scope 由宿主管理，普通 stop/start 保留，卸载时清理；插件不得 Dispose 它。
