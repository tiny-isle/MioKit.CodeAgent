# 插件入口与生命周期

Const、Register、IoC 边界、`PluginBase` 管道与可解析宿主服务，均见本文。

## Const 常量

所有固定标识集中在 `XxxConst`，**禁止 magic string / magic Guid**。Guid 身份必须成对：`const string` 是不可变真源，`Guid` 成员**只能** `Guid.Parse` 该字符串。需要 string 的地方（如 `[EavType]`）引用 `XxxTypeId`；需要 Guid 的地方（如 `override Guid MioType`、EAV `WithId`）引用成对的 Guid 成员。

新增 Type / EAV 身份时先调 MCP `generate_guid`（大写、带连字符），把结果填进 `const string`。禁止 `Guid.Parse("……")` 内联字面量，禁止只写 Guid、不写字符串同伴。不要手写 Guid，不要复用本文示例里的 Guid。已发布的不可改。

| 类型 | 用途 |
|------|------|
| `PluginId` | plugin.json `id` |
| `XxxTypeId` | Guid **字符串**，不可变真源 → `[EavType(XxxTypeId)]` |
| `XxxType` | **只能** `Guid.Parse(XxxTypeId)` → `override Guid MioType` |
| `XxxPropertyId` / `XxxPropertyGuid` | EAV / SettingEav `WithId` 的身份，同样成对；Guid 侧用 `XxxPropertyGuid`，避免与扩展类字段 `PathProperty` 撞名 |
| `XxxGroupId` 等 | 固定 **string** 实例 Id（如 `"desktop-app-search-group"`），**不是** Guid → `EnsureTreeLoadedAsync` / 首次 `StoreAsync` |

```csharp
using MioKit.Sdk;

public static class MyPluginConst
{
    public const string PluginId = "com.example.plugin.desktop-app";

    public const string PluginTypeId = "C2336285-C853-41C0-9934-08514BAEBB8D";
    public static readonly Guid PluginType = Guid.Parse(PluginTypeId);

    public const string DesktopAppSearchGroupTypeId = "9A619236-8D1F-402F-857B-EA6162F14C38";
    public static readonly Guid DesktopAppSearchGroupType = Guid.Parse(DesktopAppSearchGroupTypeId);

    public const string DesktopAppNodeTypeId = "DAC0912A-4CD1-4601-87C5-EE52281F56F4";
    public static readonly Guid DesktopAppNodeType = Guid.Parse(DesktopAppNodeTypeId);

    public const string PathPropertyId = "7F3A9C21-4E18-4B6D-9A02-1C8E5D7B4F30";
    public static readonly Guid PathPropertyGuid = Guid.Parse(PathPropertyId);

    public const string DesktopAppSearchGroupId = "desktop-app-search-group";
}
```

---

## 插件入口与 DI

每个插件程序集**必须有且仅有一个** `RegisterBase<T>` 实现（`T` 为自身类型）。`PluginManager` 通过 `T.Instance` 取得注册器单例，在宿主 `MioIoc.Container` 下创建**插件子 Scope**，调用 `RegisterService` 后把 `ComponentContext` 注入该单例。

```csharp
using MioKit.Sdk;

public class MyPlugin : PluginBase
{
    public MyPlugin() : base(MyPluginConst.PluginId) { }
    public override Guid MioType => MyPluginConst.PluginType;

    protected override async Task StartCoreAsync(CancellationToken ct)
    {
        await EnsureTreeLoadedAsync<DesktopAppSearchGroup>(
            MyPluginConst.DesktopAppSearchGroupId);
    }
}

public class MyPluginRegister : RegisterBase<MyPluginRegister>
{
    public override void RegisterService(ContainerBuilder builder, IServiceCollection services)
    {
        var plugin = new MyPlugin();
        builder.RegisterInstance(plugin)
            .As<IPlugin>().Keyed<IPlugin>(MyPluginConst.PluginId).As(plugin.GetType());
        builder.RegisterType<DesktopAppSearchGroup>().AsSelf().InstancePerDependency();
        builder.RegisterType<DesktopAppNode>().AsSelf().InstancePerDependency();

        // 插件私有服务示例
        builder.RegisterType<MyPluginService>().AsSelf().SingleInstance();
        services.AddSingleton<MyMsDiService>();

        // 随插件启停自动调用 StartAsync / StopAsync
        builder.RegisterType<MyLifecycleWorker>()
            .AsSelf()
            .As<IPluginLifecycleComponent>()
            .SingleInstance();
    }
}
```

### PreloadPropertySource 扩展

`PreloadPropertySource` 为 `protected init`（非 virtual，**不可 override**）。`PluginBase` 构造器已通过 spread 语法添加 `PluginExtension.IsEnabledProperty`，子类无需重复添加。如需额外预加载属性，在自己的构造器中扩展：

```csharp
public class MyPlugin : PluginBase
{
    public MyPlugin() : base(MyPluginConst.PluginId)
    {
        // PreloadPropertySource = [..PreloadPropertySource, MyExtension.PathProperty];
    }
    public override Guid MioType => MyPluginConst.PluginType;
}
```

| 规则 | 说明 |
|------|------|
| `RegisterBase<T>` | **必需**；程序集内只能有一个 `IRegister` 实现 |
| 构造函数 | `PluginBase` 仅 `base(PluginId)`，不访问 Container / Context |
| `Keyed<IPlugin>(PluginId)` | 必须 = plugin.json `id` |
| `RegisterService` | 注册 `IPlugin`、节点类型、**仅本插件使用**的服务；需随启停自动初始化的实现 `As<IPluginLifecycleComponent>()` |

### 统一使用插件 DI

插件业务代码统一从插件 DI 获取服务，优先构造注入。插件 Scope 继承宿主全局注册，
所以 Hook、搜索窗口、匹配器、插件私有服务及插件绑定的图标/任务/通知都通过同一
入口获取，不需要按服务注册位置选择容器。不要自行覆盖宿主绑定服务。

| 使用位置 | 获取方式 |
|----------|----------|
| 由插件 DI 创建的业务类、生命周期组件、ViewModel | 构造注入所需服务 |
| `PluginBase` 生命周期方法 | `Container!.Resolve<T>()`；可选服务用 `TryResolve<T>` |
| 无插件实例的节点或回调 | `MyPluginRegister.Instance.ComponentContext.Resolve<T>()`（或 `ComponentContextInstance`） |
| 仅持有 Context（需对应 1.3.0 开发版） | `context.GetRequiredService<T>()` / `TryGetService<T>()`，解析同一个插件 Scope |

`MioIoc` 是宿主根容器 API，保留用于理解宿主实现和旧代码；插件示例与新业务代码
不把它作为常规入口。统一解析不改变共享服务的生命周期：只清理自己的订阅/注册，
不停止或释放共享 Hook 等宿主服务。插件 Scope 本身由宿主管理。

```csharp
using Autofac;

// PluginBase 方法内：同样可以解析宿主全局注册。
var matcher = Container!.Resolve<ITextMatcher>();

// 插件私有服务 — 节点、Service 等无 Plugin 实例时
var svc = MyPluginRegister.Instance.ComponentContext.Resolve<MyPluginService>();

// 插件生命周期内（InitializeCoreAsync / StartCoreAsync 等）
var svc2 = Container!.Resolve<MyPluginService>();

// 节点/回调只有 PluginContext 时（通用入口需对应 1.3.0 开发版）。
var svc3 = PluginContext!.GetRequiredService<MyPluginService>();
```

| ✅ 应做 | ❌ 禁止 |
|--------|--------|
| 所有服务统一使用插件 DI，业务类优先构造注入 | 在 `RegisterService` 里改 `MioIoc.Container` 或覆盖宿主绑定服务 |
| 插件私有服务在 `RegisterService` 注册到子 Scope | 把插件单例注册到宿主根容器 |
| 无 `PluginBase` 引用时用 `XxxRegister.Instance.ComponentContext` | 构造函数 / 字段初始化器里 `Resolve` |
| `services.Add*` 与 `builder.Register*` 可混用（宿主会 `Populate`） | 程序集内多个 `IRegister` 实现 |

---

## 生命周期

### 宿主加载时序

```
验证 DLL → 加载程序集 → EavFactory.RegisterAssembly(assembly)
→ 扫描唯一 RegisterBase<T>
→ MioIoc.Container.BeginLifetimeScope → RegisterService → 绑定 Context.Services
→ ResolveKeyed<IPlugin> → 注入 Context / Container
→ InitializeAsync → [GetIsEnabledAsync() == false? 跳过] → StartAsync → Running
```

宿主服务初始化先于插件加载，但宿主服务启动与插件加载并行，不能假定插件
`StartCoreAsync` 时 Hook 已启动。需要底层输入就绪的组件应等待对应 `StartAsync`。

Runtime 注入插件绑定的图标服务（1.3.0 开发版本）、任务服务与（支持时的）通知服务；
`Context.Icons` 保留原签名和同一图标实例，标记弃用；通用 `IPluginServiceContext`
替代任务专用接口，不再在 Context 保存 `IMioTaskService`。任务便捷扩展保留为通用包装，
新业务代码统一优先 DI。通用入口与图标 DI 的版本前提见 [sdk-api-index.md](sdk-api-index.md)。
初始化能取得服务，但任务/通知的
登记入口到插件 `StartAsync` 前才打开。停止/卸载先关闭通知和任务入口、请求取消并
等待活动排空，之后才进入插件停止管道；排空失败会保留 Scope，不能当作已经卸载。
托管工作不能依赖后执行的停止钩子才退出。详细语义见
[managed-tasks.md](managed-tasks.md)、[toast.md](toast.md)。

Context 的 `Services` 公开 `IComponentContext`，Scope 构建后即可用于解析插件构造所需
服务，但注册阶段不能提前解析。普通停止保留 Scope；卸载清理时解除 Context 绑定再
释放 Scope。旧 Context 在卸载后不能继续解析，重新加载使用新的 Context/Scope。
激活失败或排空超时而保留 Scope 时，不提前解除仍被活动工作使用的绑定。
通用 Required/Try 的错误语义见 [host-services.md](host-services.md)。

### PluginBase 管道（勿重复实现）

```csharp
// InitializeAsync（EavFactory.RegisterAssembly 已在 PluginManager 加载程序集时完成）
await EnsurePluginStoreAsync();   // StoreAsync(this) + BatchLoad(PreloadPropertySource)
await InitializeCoreAsync(ct);

// StartAsync
await StartCoreAsync(ct);         // 调用 EnsureSubTreeLoadedAsync() / 加载组子树等
SetParent(MioAppContext.Current.RootNode);
// → 依次调用容器中所有 IPluginLifecycleComponent.StartAsync

// StopAsync
await StopCoreAsync(ct);
SetParent(null);
// → 依次调用容器中所有 IPluginLifecycleComponent.StopAsync
```

### IPluginLifecycleComponent（推荐：插件级后台逻辑）

将**随插件启停**的后台任务、事件订阅、定时器、Hook 注册等从 `PluginBase` 子类拆到独立服务，由框架自动驱动。

```csharp
public interface IPluginLifecycleComponent
{
    Task StartAsync(CancellationToken cancellationToken = default);
    Task StopAsync(CancellationToken cancellationToken = default);
}
```

| 项 | 说明 |
|----|------|
| 注册 | `RegisterService` 中 `.As<IPluginLifecycleComponent>()`（可与 `AsSelf()` 并存） |
| 解析 | `PluginBase` 通过 `Container.Resolve<IEnumerable<IPluginLifecycleComponent>>()` 获取全部实现 |
| 实例 | 建议 `SingleInstance()`，与插件子 Scope 同寿命 |
| 适用 | 后台轮询、监听 EAV/事件总线、注册非节点级资源、WebView/网络客户端预热 |
| 不适用 | 节点挂树（仍在 `StartCoreAsync` + `EnsureTreeLoadedAsync`）、创建或启停宿主共享服务（可注入使用，自己的订阅/注册随组件清理） |

**调用顺序**

| 阶段 | 顺序 |
|------|------|
| 启动 | `StartCoreAsync` → 挂树 `SetParent(RootNode)` → 各 `IPluginLifecycleComponent.StartAsync` |
| 停止 | `StopCoreAsync` → 摘树 `SetParent(null)` → 各 `IPluginLifecycleComponent.StopAsync` |

启动时组件已挂树，可安全访问插件子树；停止时先摘树再停组件，避免组件仍依赖树上的节点。

```csharp
public sealed class MyLifecycleWorker : IPluginLifecycleComponent
{
    private CancellationTokenSource? _cts;
    private Task? _loop;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _cts = new CancellationTokenSource();
        _loop = RunLoopAsync(_cts.Token);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _cts?.Cancel();
        try
        {
            if (_loop is not null)
                await _loop;
        }
        catch (OperationCanceledException) when (_cts?.IsCancellationRequested == true) { }
        finally
        {
            _cts?.Dispose();
            _cts = null;
            _loop = null;
        }
    }

    private static async Task RunLoopAsync(CancellationToken ct)
    {
        while (true)
            await Task.Delay(TimeSpan.FromSeconds(1), ct); // 换成支持 token 的业务工作。
    }
}
```

```csharp
// RegisterService
builder.RegisterType<MyLifecycleWorker>()
    .AsSelf()
    .As<IPluginLifecycleComponent>()
    .SingleInstance();
```

`InitializeCoreAsync` **不会**调用生命周期组件；仅 `StartAsync` / `StopAsync` 管道触发。

上例为组件自行管理的局部循环，需要观察启动后的 `_loop` 故障并记录日志，停止时等待
真实退出再释放资源。需要宿主查询/取消时改用 [managed-tasks.md](managed-tasks.md)：
保留并观察 `RunAsync` 的 Task，循环直接响应其 token，不能等待组件 `StopAsync` 才取消。

### 各阶段职责

| 阶段 | 插件应做 | 禁止 |
|------|----------|------|
| `InitializeCoreAsync` | 轻量初始化 | 挂树、长阻塞 |
| `StartCoreAsync` | `EnsureTreeLoadedAsync<Group>(Const.GroupId)`（或重写 `EnsureSubTreeLoadedAsync` 集中管理多个子树） | 在 `StartCoreAsync` 里启动长期后台任务（改用 `IPluginLifecycleComponent`） |
| `StopCoreAsync` | 轻量清理；组件自行管理的循环在组件 Stop 中取消并等待，托管任务此前已排空 | 让托管任务依赖此阶段才退出，或忽略 `CancellationToken` |
| `IPluginLifecycleComponent` | 注册到插件容器，自动随启停调用 | 在 `InitializeCoreAsync` 阶段依赖已挂树的节点 |
| `CreateDataCleanupPlanAsync` | 声明未挂在插件根树下的额外持久化 EAV 根 ID | 返回路径、SQL、表名或执行删除操作 |

`PluginExtension.IsEnabledProperty` 默认 `true`；Initialize 后 `await GetIsEnabledAsync() == false` 则宿主跳过 `StartAsync`。

> 模板生成的 `*Const` 仅含 `PluginId` / `PluginType`；搜索组、节点、EAV `WithId` 等身份由开发者按业务添加（见上例 `DesktopApp*`、`PathPropertyId`），一律 `const string` + `Guid.Parse` 成对。`GroupId` 不是 Guid。

### PluginBase 成员速查

| 成员 / 方法 | 说明 |
|-------------|------|
| `Context` | `IPluginContext` |
| `Container` | 插件子 `ILifetimeScope?` |
| `InitializeAsync` / `StartAsync` / `StopAsync` | 宿主管道（内部调 Core 钩子） |
| `EnsureTreeLoadedAsync<T>(id)` | 从库加载子树并 `SetParent(this)` |
| `EnsureSubTreeLoadedAsync()` | 可重写；默认空 |
| `GetIconAsync(request, ct)` | 返回独立 `IIconLease`；默认打开已导入的 `plugin.json` 图标 |
| `PreloadPropertySource` | `protected init`；含 `IsEnabledProperty`；spread 扩展 |

可重写钩子：`InitializeCoreAsync` · `StartCoreAsync` · `StopCoreAsync` · `CreateDataCleanupPlanAsync` · `EnsureSubTreeLoadedAsync`。

Initialize 后 `GetIsEnabledAsync() == false` → 宿主跳过 `StartAsync`。

### 声明式卸载清理（SDK 1.0）

`IPlugin` 不包含卸载回调。Reload、Unload 和应用退出只执行 `StopAsync` 与资源释放，不会删除持久化数据。用户选择“同时删除插件数据”时，宿主读取并冻结清理计划，退出后由独立维护进程执行清理。

`PluginBase` 已实现 `IPluginDataCleanupProvider`，默认返回空扩展计划。宿主始终自动清理插件根 EAV 子树、入口程序集登记的全部 `[EavType]` 类型及其后代，以及整个 `plugin_data/<PluginId>`（含 data、logs）；插件只需声明脱离插件根树的额外 EAV 根：

```csharp
public override ValueTask<PluginDataCleanupPlan> CreateDataCleanupPlanAsync(
    CancellationToken cancellationToken)
{
    return ValueTask.FromResult(new PluginDataCleanupPlan
    {
        // 仅填写未挂在插件根节点下的额外持久化根 ID。
        AdditionalEavRootObjectIds = [MyPluginConst.DetachedDataRootId]
    });
}
```

清理计划只能包含 MioKit 托管的 EAV 对象 ID。禁止插件提供卸载 DLL、原始 SQL、表名、文件系统路径、注册表路径或任意删除回调；也禁止在生命周期方法中直接修改共享数据库。Provider 抛出异常时宿主不会排队卸载。旧插件或损坏插件没有 Provider 时仍可执行标准清理，但设置中心会提示可能存在未声明残留。

### IPluginContext

| 成员 | 说明 |
|------|------|
| `Metadata` | plugin.json |
| `Logger` | 插件 Serilog |
| `PluginDataPath` | 插件私有数据目录 |
| `PluginPath` | 插件 DLL 所在目录 |
| `Icons` | 已弃用的兼容入口；与插件 DI 使用同一 `IPluginIconService`，新代码优先构造注入 |
| `RuntimeState` | Created / Initialized / Running / Stopped / Faulted / Unloaded |

### `[PluginAccess]` 生成访问器

需要在服务、视图模型或其他插件类中访问插件实例及其上下文时，可以给 `partial` 类添加：

```csharp
using MioKit.Sdk;

[PluginAccess(typeof(MyPluginRegister), typeof(MyPlugin))]
public partial class MyService
{
    public void WriteLog(string message)
    {
        Logger?.Information("{Message}", message);
    }
}
```

目标类必须是非静态 `partial` 类。如果目标类嵌套在其他类中，所有外层类也必须声明为
`partial`，且不能使用 file-local 类。特性参数必须分别指向具体、非抽象的
`IRegister` 实现和具体、非抽象的 `IPlugin` 实现。

源生成器会提供以下可空属性：

| 属性 | 类型 | 说明 |
|------|------|------|
| `Plugin` | `MyPlugin?` | 从 `MyPluginRegister` 的插件 IOC 按具体类型解析 |
| `PluginContext` | `IPluginContext?` | `Plugin?.Context` |
| `Logger` | `Serilog.ILogger?` | `PluginContext?.Logger` |

这些属性不缓存实例。插件 IOC 尚未创建或插件已卸载时会返回 `null`；插件加载并完成 IOC 注册后即可使用，包括 `InitializeCoreAsync`、`StartCoreAsync` 和生命周期组件。插件必须将具体插件类型注册到自身 IOC，例如同时使用 `.As<IPlugin>()` 和 `.As(plugin.GetType())`，并继续使用与 plugin.json 一致的 `Keyed<IPlugin>(PluginId)` 注册约定。仅注册 `IPlugin` 接口或只注册 keyed 服务，无法解析生成的具体 `Plugin` 属性。

生成器会在目标类中加入 `Plugin`、`PluginContext` 和 `Logger` 成员，因此目标类不能已经声明同名成员；如需自定义同名成员，应改用其他名称或不要使用 `[PluginAccess]`。

### MioIoc / RegisterBase（速查）

| API | 说明 |
|-----|------|
| `MioIoc.Resolve<T>()` / `TryResolve` / `ResolveOptional` / `ResolveKeyed` / `IsRegistered` | 宿主根容器 API；插件代码统一通过插件 DI 解析 |
| `RegisterBase<T>.Instance` | 注册器单例 |
| `ComponentContext` / `ComponentContextInstance` | 插件子容器 |
| `RegisterService(builder, services)` | 必须实现 |

宿主可 Resolve 服务清单 → [sdk-helpers.md](sdk-helpers.md) §5。
