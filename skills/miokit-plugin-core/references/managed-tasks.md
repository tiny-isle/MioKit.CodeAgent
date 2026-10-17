# 可选任务管理

需要在宿主任务列表中统一记录、按运行时长查找或手动停止的工作，可以显式使用
`IMioTaskService`。这不是节点必须实现的 Feature，也不会自动登记所有
`IInvokeFeature.InvokeAsync` 调用；不需要集中管理的工作仍可直接执行。

## 服务获取

```csharp
using MioKit.Sdk;

var tasks = Context.GetTaskService();
```

`Context` 是当前插件的 `IPluginContext`。节点已使用 `[PluginAccess]` 时，可以从生成的
`PluginContext` 获取：`PluginContext!.GetTaskService()`。普通插件服务也可以通过构造函数
注入宿主提供的 `IMioTaskService`；不要在插件里重新注册该服务。

插件服务绑定当前插件实例，只能查询、取消当前实例登记的任务。不要通过
`MioIoc.Resolve<IMioTaskService>()` 取得宿主根服务；根服务用于宿主全局管理，会丢失
当前插件的生命周期绑定。来源、名称和节点 ID 只是展示信息，不提供管理权限。

任务服务通过可选的 `IPluginServiceContext` 提供，不改变原有 `IPluginContext` 接口。需要兼容没有此
能力的 context 时，使用 `Context.TryGetTaskService(out var tasks)`；不可用返回 `false`。
`GetTaskService()` 不可用时抛出 `NotSupportedException`，不会隐式回退到全局服务。

宿主自己的模块可以从根容器取得全局 `IMioTaskService` 并调用相同的 `RunAsync` API；
这是宿主侧的管理入口，插件接入仍使用上述 Context / 插件 Scope 服务。

## 插件 DI 示例

在插件已有 `RegisterService` 中注册业务类，任务服务由宿主提供，不自行注册：

```csharp
builder.RegisterType<ManagedFileReader>().AsSelf();
```

```csharp
using MioKit.Sdk;

public sealed class ManagedFileReader(IMioTaskService tasks)
{
    public Task<string> ReadAsync(string path, CancellationToken cancellationToken = default) =>
        tasks.RunAsync(
            new MioTaskOptions
            {
                Name = "读取文件",
                Description = path,
                Source = "文件工具"
            },
            token => File.ReadAllTextAsync(path, token),
            cancellationToken);
}
```

## 节点执行示例

已有节点继续实现 `IInvokeFeature`。为它添加
`[PluginAccess(typeof(MyRegister), typeof(MyPlugin))]`，将类型替换为项目实际的具体
Register / 插件类型；节点及外层类声明为 `partial`。以下方法直接放入已有节点类，
该类保留自己的构造函数、`MioType` 和节点注册：

```csharp
public Task InvokeAsync(InvokeContext context)
{
    return PluginContext!.GetTaskService().RunAsync(
        new MioTaskOptions
        {
            Name = "可取消任务示例",
            Description = "等待十秒，可手动停止",
            Source = "示例插件",
            NodeId = Id
        },
        token => Task.Delay(TimeSpan.FromSeconds(10), token),
        context.CancellationToken);
}
```

将演示用 `Task.Delay` 替换成接受 token 的业务异步操作。入口仍然是
`InvokeAsync(InvokeContext)`，不修改 `InvokeContext`，不增加新的 Feature。

## 执行任务

```csharp
await tasks.RunAsync(
    new MioTaskOptions
    {
        Name = "整理文件",
        Description = "整理当前目录中的文件",
        Source = "文件工具",
        NodeId = nodeId,
        Timeout = TimeSpan.FromMinutes(2)
    },
    async token =>
    {
        foreach (var file in files)
        {
            token.ThrowIfCancellationRequested();
            await ProcessFileAsync(file, token);
        }
    },
    cancellationToken);

string content = await tasks.RunAsync(
    new MioTaskOptions { Name = "读取文件", Source = "文件工具" },
    token => File.ReadAllTextAsync(path, token),
    cancellationToken);
```

- `Name` 必填且不能是空白文本；`Description`、`Source`、`NodeId` 可选。
- 不提供 `PluginId` 输入；快照中的插件身份由宿主绑定。
- `Timeout` 默认为 `null`，不自动超时；指定时使用正时长且不超过 `4,294,967,294` 毫秒，
  到期只请求取消。
- `RunAsync` 在当前线程调用委托，不自动使用 `Task.Run`，不负责队列、并发限制或重试。
- 委托返回的 `Task` 必须代表全部工作；自行启动却未等待的任务不会自动加入管理。
- 把 token 传递给异步 API，并在循环/耗时阶段检查它；继续遵守 UI 与输入线程约定。
- 等待返回的 `Task` / `Task<T>`，按普通异步方法处理结果、异常和取消。

## 查询与取消

`GetActiveTasks()` 返回当前插件实例活跃任务的独立快照。可以按 `Elapsed` 筛选或排序，
再用 `RequestCancellation(snapshot.TaskId)` 请求停止某项工作，或用
`RequestCancellationAll()` 请求停止当前已有的全部工作。

单任务方法仅在新接受取消请求时返回 `true`；已经结束、已经请求取消、未知或超出当前
范围的 ID 返回 `false`。批量方法返回本次新接受请求的数量，不会阻止之后登记新任务。

快照包含 `TaskId`、`PluginId`、名称/描述/来源/节点 ID、`Timeout`、`StartedAt`、
`Elapsed`、`CancellationRequestedAt`、`CancellationReason` 和派生的
`IsCancellationRequested`。它不暴露节点、委托、任务结果或异常对象。

取消原因是 `MioTaskCancellationReason`：`Manual`、`Caller`、`Timeout`、
`PluginStopping`、`HostStopping`，只记录第一次接受的请求。取消请求不是实际结束；
未结束的任务仍在列表里。执行体忽略取消并成功返回时，返回任务仍是成功状态。

插件停止/卸载会由宿主请求取消所属托管任务，下一插件实例不会继承旧实例的任务。
任务入口在插件 `StartAsync` 前打开；`InitializeAsync` 能获取服务但不能新建托管任务，
停止后也不能新建，直到同一实例再次启动。后台工作放在 `StartCoreAsync` 或
`IPluginLifecycleComponent.StartAsync` 启动；长期循环应保留并观察返回 Task，
不要让启动方法一直等待循环结束。
Runtime 先取消并等待这些工作，再运行插件停止逻辑。任务必须能仅凭收到的 token 退出；
不能依赖 `StopCoreAsync` 关闭 channel、释放信号或销毁服务后才结束，否则排空会超时。
可取消的 channel 读取等 API 应直接传入任务 token。
已结束任务退出列表，不保存历史、不持久化。插件应声明实际依赖的 SDK/宿主最低版本；
原有节点、`InvokeContext` 和 `IInvokeFeature` 签名不变。

## 检查清单

- [ ] 通过当前插件 Context 或插件 Scope 使用宿主提供的服务，没有解析根任务服务。
- [ ] 只显式登记需要集中管理的工作，名称对用户有意义。
- [ ] 传递并检查 token，任务委托等待全部工作，调用方也等待返回任务。
- [ ] 不把取消请求误认为实际完成，不用展示元数据决定生命周期或权限。
- [ ] 兼容旧 context 时显式探测；未接入的工作继续自行管理。
