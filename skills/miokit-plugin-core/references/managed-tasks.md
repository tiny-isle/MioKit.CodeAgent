# 插件托管任务

需要 SDK 1.2.3 或更高，以及提供任务服务的宿主。包与发布状态见
[sdk-api-index.md](sdk-api-index.md) 的同步基准。

`IMioTaskService` 为需要查询耗时、手动取消或随插件停止取消的异步工作提供可选登记。
它不自动登记所有 `IInvokeFeature`，也不替代普通 `Task` / `CancellationToken`。

## 获取插件绑定的服务

插件业务服务通过插件子 Scope 构造注入 `IMioTaskService`；只注册业务类，不自行注册
任务服务。宿主已经提供当前插件实例的服务。

```csharp
using MioKit.Sdk;

// 在现有 RegisterService 中注册 ManagedFileReader，再由插件容器解析。
public sealed class ManagedFileReader(IMioTaskService tasks)
{
    public Task<string> ReadAsync(string path, CancellationToken cancellationToken = default) =>
        tasks.RunAsync(
            new MioTaskOptions { Name = "读取文件", Description = path, Source = "文件工具" },
            token => File.ReadAllTextAsync(path, token),
            cancellationToken);
}
```

新代码优先构造注入；在 `PluginBase` 方法内可用 `Container!.Resolve<IMioTaskService>()`
（`using Autofac;`）。包含通用服务入口的 1.3.0 开发版本中，也可使用
`Context.GetRequiredService<IMioTaskService>()`；节点通过 `[PluginAccess]` 生成的
`PluginContext` 调用同一扩展。其余容器规则见
[plugin-core.md](plugin-core.md)。

```csharp
// 通用 Context 入口需要对应 SDK / 宿主 1.3.0 开发版本。
// context 是当前插件的 IPluginContext。
if (context.TryGetService<IMioTaskService>(out var tasks))
{
    await tasks.RunAsync(
        new MioTaskOptions { Name = "等待示例", NodeId = nodeId },
        token => Task.Delay(TimeSpan.FromSeconds(10), token),
        cancellationToken);
}
```

`IPluginServiceContext` 是通用可选能力，未修改原有 `IPluginContext` 必需成员；
任务专用 `IPluginTaskContext` 已移除。`GetTaskService()` / `TryGetTaskService()` 仍保留，
只是通用解析的薄包装。服务本身的 DI 接入最低仍为 1.2.3，新增通用入口需要 1.3.0。
旧 Context 不支持通用能力或缺少任务注册时，Try 返回 `false`；绑定前、卸载后及服务
激活失败会报错，不等同于缺失能力。所有入口都不会退回根服务或自动执行未管理任务。
不要从
`MioIoc.Resolve<IMioTaskService>()` 获取插件服务：根服务能管理所有任务，丢失插件范围。

## 执行、查询与取消

- `RunAsync` / `RunAsync<T>` 返回实际工作的 Task，保留正常结果、异常和取消语义。
  委托必须返回代表全部工作的 Task，调用方应等待或保留并观察它。
- 委托从调用线程开始；服务不自动 `Task.Run`，不排队、不限流、不重试。CPU 密集工作
  显式使用 `Task.Run(..., token)`，UI 状态仍按 Avalonia 线程约束更新。
- `MioTaskOptions.Name` 必填且非空白；`Description`、`Source`、`NodeId` 只作展示。
  插件身份由宿主绑定，不能靠元数据转移所有权。
- `Timeout` 默认 `null`；设置时必须为正，且不超过 4,294,967,294 毫秒。到期只请求取消。
- `GetActiveTasks()` 返回独立快照，包含 `TaskId`、`PluginId`、`Elapsed`、
  `IsCancellationRequested`、`CancellationReason` 等，不保留业务结果或委托。

```csharp
var longRunning = tasks.GetActiveTasks()
    .Where(task => task.Elapsed >= TimeSpan.FromMinutes(1))
    .ToArray();
foreach (var task in longRunning)
    tasks.RequestCancellation(task.TaskId);
```

`RequestCancellation(id)` 仅在首次接受请求时返回 `true`；未知、已结束、不属于当前
实例或已请求取消的任务返回 `false`。`RequestCancellationAll()` 返回本次新接受的数量，
不会关闭后续登记入口。取消原因包含 `Manual`、`Caller`、`Timeout`、`PluginStopping`、
`HostStopping`。

请求取消不等于工作已结束。任务保留在活跃列表直到执行体实际退出；忽略取消而正常返回
仍视为成功。已完成任务立即移出列表，当前无历史持久化或管理 UI。

## 插件生命周期

初始化阶段可以取得服务，但不能登记任务。Runtime 在调用插件 `StartAsync` 前打开
任务入口；停止/卸载时关闭入口，请求取消并等待所属任务退出，随后才执行插件停止逻辑。
排空失败会保留 Scope，不能假定插件已经卸载。重新加载的新实例不继承旧实例的任务。

长期循环放在 `IPluginLifecycleComponent.StartAsync` 中启动，保留并观察返回的 Task，
不要让启动方法一直等待循环结束。循环必须仅凭任务 token 就能退出；例如 channel 读取、
网络 I/O、延迟直接传入 token，不能等待 `StopCoreAsync` 才关闭 channel 或释放信号，
否则排空阶段会先超时。生命周期组件仍负责自己的订阅、计时器及其他资源清理。

任务登记不改变 `IInvokeFeature.InvokeAsync(InvokeContext)` 签名，也不会增加调用上下文
取消参数。普通局部操作可继续使用原有 Task；需要宿主管理时才接入本服务。
