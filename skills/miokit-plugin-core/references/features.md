# IFeature 参考

Feature 语义、组合与接口成员均见本文。生成 Get/Set、内置 EAV → [extension-properties.md](extension-properties.md)。

**图例：** 标记 = 仅声明接口；行为 = 须实现方法。存储：EAV / Memory / 无。

**目录约定：** Sdk 将 Feature 接口与 `partial` 扩展类**成对放在** `Features/`。插件同样在 `plugin/Features/` 成对定义。

---

## IFeature（根接口）

```csharp
public interface IFeature
{
    MioObject CoreObject { get; }
    string? Name { get; set; }
    string? Description { get; set; }
}
```

所有 `MioObject` 均实现 `IFeature`（`CoreObject` 返回自身）。`FeatureRegistry` **不**将 `IFeature` 自身作为可检索 Feature 注册。

树遍历、`HasFeature` / `GetFeature`、RootNode 检索 → **[nodes-and-tree.md](nodes-and-tree.md)** §3–§5。扩展属性 Get/Set、变更通知 → **[extension-properties.md](extension-properties.md)**。

### Name / Description（接口成员 + EAV 持久化）

| 层 | 说明 |
|----|------|
| **接口** | `IFeature.Name` / `Description` 为根接口成员，凡实现 `IFeature` 的类型均可读写 |
| **EAV 定义** | `MioFeatureExtensions.NameProperty` / `DescriptionProperty`（`[EavRelation(typeof(IFeature))]`） |
| **`MioObject` 实现** | CLR 属性 `get => this.GetName()` / `set => this.SetName(value)`，赋值触发 `INotifyPropertyChanged` |
| **MVVM** | **`MioObject` 可直接作 Avalonia 绑定源**（`DataContext = node`，绑定 `Name` / `Description`），无需额外 ViewModel 包装 |

```csharp
// 构造 / 代码赋值
node.Name = "标题";
node.Description = "说明";

// AXAML 绑定（preview 或插件内 Avalonia 视图）
// <TextBox Text="{Binding Name}" />
// <TextBlock Text="{Binding Description}" />

// 异步读库（持久化节点、尚未 BatchLoad 时）
await node.GetNameAsync();
```

自定义 Feature 接口继承 `IFeature` 即自动拥有 `Name` / `Description` 成员；勿在子接口重复声明。

---

## IRootNodeFeature

| 项 | 说明 |
|----|------|
| 类型 | 标记 |
| 实现者 | `RootNode`（全局单例根） |
| 功能 | 标识根节点 |

插件节点一般**不**实现此接口。

---

## IMemoryNodeFeature

| 项 | 说明 |
|----|------|
| 类型 | 标记 |
| 扩展类 | 无 |
| 持久化 | EAV 与父子关系默认不写库；EAV 可用 `ForcePersistence` 显式例外 |

实现此接口的 `MioObject` 表示**内存节点**：进程内可正常挂树、读写 EAV、参与搜索与 `InvokeAsync`，但宿主 **不会** 将以下内容落库：

| 操作 | 持久化节点 | 内存节点（`IMemoryNodeFeature`） |
|------|------------|----------------------------------|
| `StoreAsync` | ✅ 写入 `MioObjects` | ❌ 跳过 |
| `SetXxx()` / EAV 变更 | ✅ 批量写 `MioPropertyValues` | 默认跳过；属性 `.WithForcePersistence()` 时异步写入 |
| `SetParent(...)` | ✅ 更新 `MioObjects.ParentId` | ❌ 跳过 |
| 进程重启后 | 从数据库恢复 | 默认丢失；强制属性加入 `PreloadPropertySource` 后可恢复 |

适用：会话级临时节点、运行时动态组装的树、无需跨重启保留的配置。

```csharp
using MioKit.Sdk;

[EavType(MyPluginConst.TempNodeTypeId)]
public class TempRuntimeNode : MioObject, IMemoryNodeFeature, IInvokeFeature
{
    public TempRuntimeNode(string id) : base(id) { }
    public override Guid MioType => MyPluginConst.TempNodeType;

    public Task InvokeAsync(InvokeContext ctx) => Task.CompletedTask;
}

// 仅内存：挂树有效，但不会写 ParentId / EAV
var node = new TempRuntimeNode(Guid.NewGuid().ToString());
node.SetName("临时项");           // 仅内存
node.SetParent(group);            // 仅内存，不写 MioObjects.ParentId
```

### 与单属性 Memory 的区别

| 机制 | 粒度 | 说明 |
|------|------|------|
| **MemoryProperty** | 单属性 | `[MemoryRelation]`，见 [extension-properties.md](extension-properties.md) |
| **IMemoryNodeFeature** | **整节点** | 主表与父子关系不刷盘；EAV 默认不刷盘，`ForcePersistence` 可例外 |

内存节点仍可 `GetXxx` / `SetXxx`；Runtime 跳过 `StoreAsync`，仅让标记 `ForcePersistence` 的 EAV 进入原有异步批处理。自定义强制属性必须加入 `PreloadPropertySource`，且插件内存节点需处在插件根子树中才能在“卸载并删除数据”时自动清理。

---

## IAliasNameFeature

| 项 | 说明 |
|----|------|
| 类型 | 标记 |
| 扩展类 | `AliasNameExtension` |
| 属性 | `AliasName` — `EavProperty<List<string>>`，经 `AliasNameConvert` 序列化 |
| 搜索匹配 | 对节点调用 `IFeature.TryMatch`，`SearchHelper` 内部读取 `GetAliasName()` 与 `Name` 一并匹配 |

```csharp
feature.SetAliasName(new List<string> { "别名1" });
// 搜索前 BatchLoad AliasNameProperty，循环内：
if (node.TryMatch(request.SearchText!, out var match, out var title)) { ... }
```

→ 详见 [search.md](search.md) §6

---

## IHotkeyFeature

| 项 | 说明 |
|----|------|
| 类型 | 标记，**继承 `IInvokeFeature`** |
| 扩展类 | `HotkeyExtension` |
| 属性 | `Hotkey` — `EavProperty<HotKeyInfo>` |

热键触发时走 `InvokeAsync`，上下文为 `InvokeContext.FromHotKey`，其中 `Context` 为 `IInvocationSnapshotProvider.GetContextAsync()` 返回的 `InvocationSnapshot`（见 [invocation-snapshot.md](invocation-snapshot.md)）。节点 **挂树** 后由宿主节点热键桥接服务自动向 `IGlobalHotKeyService` 注册（Id = 节点 Id）。

**Hook / 匹配 / 自定义 Handler 细节** → [input-hooks.md](input-hooks.md)

---

## IIgnoreSearchFeature

| 项 | 说明 |
|----|------|
| 类型 | 标记 |
| 扩展类 | `IgnoreSearchExtension` |
| 属性 | `IgnoreSearch` — `EavProperty<bool>` |

---

## ISearchableFeature

| 项 | 说明 |
|----|------|
| 类型 | **行为** |
| 方法 | `ValueTask SearchAsync(SearchRequest, IWriteOnlyResultList<SearchResult>, CancellationToken)` |
| 检索 | `RootNode.Root.GetFeatureInstances<ISearchableFeature>()` |

完整搜索约定、`SearchRequest`/`SearchResult` 字段、匹配与排序 → [search.md](search.md)

在 `SearchAsync` 中匹配 `request.SearchText` 并 `results.Add(new SearchResult(request, node) { Title = ... })`。`OwnerObject` 须为可执行节点，非搜索组。

---

## IInvokeFeature

| 项 | 说明 |
|----|------|
| 类型 | **行为** |
| 方法 | `Task InvokeAsync(InvokeContext context)` |

用户选中并执行（回车/运行）时调用。`InvokeContext` 携带 `InvocationSnapshot`（环境快照）、来源与可选 `SearchResult` → [invocation-snapshot.md](invocation-snapshot.md)。

---

## IPinnedFeature

| 项 | 说明 |
|----|------|
| 类型 | 标记，继承 `IInvokeFeature` |
| 扩展类 | `PinnedExtension` |
| 属性 | `IsPinned` (`bool`)、`PinnedOrder` (`int`，越小越靠前) |

---

## IUseFeature

| 项 | 说明 |
|----|------|
| 类型 | 标记，继承 `IInvokeFeature` |
| 扩展类 | `RecentExtension` |
| 属性 | `LastUseTime` (`DateTime?`)、`UseCount` (`int`) |
| 便捷 | `await feature.IncreaseAsync()` — 次数 +1，更新 `LastUseTime` |

---

## IIconProviderFeature

| 项 | 说明 |
|----|------|
| 类型 | **行为** + EAV + 非持久化 revision |
| 扩展类 | `IconExtensions` |
| EAV | `CachedIconId` — host `IIconService` 中的稳定图标 ID |
| Memory | `IconRevision` — 图标来源变化通知，不保存解码图片 |
| 方法 | `ValueTask<IIconLease?> GetIconAsync(IconRequest, CancellationToken)` |

```csharp
public ValueTask<IIconLease?> GetIconAsync(
    IconRequest request,
    CancellationToken cancellationToken)
{
    // 插件长期持有的共享图片：每次调用仍返回一个新的无所有权 lease。
    if (_sharedImage is not null)
        return ValueTask.FromResult<IIconLease?>(IconLease.Borrowed(_sharedImage));

    // 冷图标交给宿主从磁盘打开；最后一个 lease 释放后 Bitmap 可被回收。
    return _iconService.OpenFileAsync(_cachedFilePath, request, cancellationToken);
}

// 图标文件、鉴权状态或生成参数变化后通知可见控件重新请求。
this.InvalidateIcon();
```

`Owned` 用于本次调用新建且应随控件释放的图片，引用计数资源使用
`IconLease.Create(image, release)`。Provider 由宿主在后台调度，不能依赖 UI 线程；
返回 `null`、抛出异常或加载失败时，UI 会继续尝试祖先 Provider 并最终显示 MioKit 默认图标。
图标缓存、在线来源与 lease 规则 → [sdk-helpers.md](sdk-helpers.md)。

---

## IResultActionProviderFeature

| 项 | 说明 |
|----|------|
| 类型 | **行为** |
| 方法 | `ValueTask<IEnumerable<ISearchResultAction>> GetActionAsync(SearchResult searchResult)` |

完整规范、内置 action 与 Alt 弹层 → **[result-action.md](result-action.md)**。

## IAttachPanelFeature

| 项 | 说明 |
|----|------|
| 类型 | **行为** |
| 属性 | `SearchCommands` — 插件声明的 command 别名，规则为 `^[a-z]+(?:[-_][a-z]+)*$` |
| EAV | `AttachPanelExtension.UserSearchCommandsProperty` — 用户自定义 command 别名（`List<string>`） |
| 方法 | `Task OnAttachSearchBox(ISearchBoxWindow)`、`Task OnDetachSearchBox(ISearchBoxWindow)` |

附着/分离搜索框时的生命周期回调。单独实现此接口**不会**接管用户输入搜索；附着后若未实现 `IAttachPanelSearchFeature`，宿主**不触发**主搜索（输入框也可能被禁用）。

```csharp
public interface IAttachPanelFeature : IFeature
{
    IReadOnlyList<string> SearchCommands { get; }
    Task OnAttachSearchBox(ISearchBoxWindow searchBoxWindow);
    Task OnDetachSearchBox(ISearchBoxWindow searchBoxWindow);
}

// EAV（源码生成 Get/Set/Async；在 MioObject 子类内须 this.）
this.GetUserSearchCommands();
this.SetUserSearchCommands(["myalias"]);
```

| 入口 | 匹配字段 | 说明 |
|------|----------|------|
| `/关键词` | `Name` + command 别名（`ISearchScopeFeature`） | 预览列表，选中后 `InvokeAsync` → 附着 |
| command 模式 | `SearchCommands` + `UserSearchCommands` | 触发键；支持前缀最短匹配与幽灵补全 |

节点挂树后宿主维护 command 注册表（合并声明与用户别名）；同一 command 冲突时**先上树者优先**，其余保留排队，先上树者下树后自动回落到下一个。`UserSearchCommands` 变更时注册表自动刷新。

完整流程见 **[attach-search-panel.md](attach-search-panel.md)** §6–§7。

---

## IAttachPanelSearchFeature

| 项 | 说明 |
|----|------|
| 类型 | **行为** |
| 继承 | `IAttachPanelFeature` |
| 方法 | `ValueTask SearchAsync(SearchRequest, IWriteOnlyResultList<SearchResult>, CancellationToken)` |

附着状态下，宿主**只调用附着节点的 `SearchAsync`**，不再遍历全树 `ISearchableFeature`。实现方负责写入 `writeOnlyResultList`（通常委托给子树搜索组，或完全自定义逻辑）。

```csharp
public interface IAttachPanelSearchFeature : IAttachPanelFeature
{
    ValueTask SearchAsync(
        SearchRequest request,
        IWriteOnlyResultList<SearchResult> writeOnlyResultList,
        CancellationToken cancellationToken);
}
```

| 与 `ISearchableFeature.SearchAsync` | 说明 |
|-----------------------------------|------|
| 签名 | 相同三参数，均返回 `ValueTask` |
| 调用时机 | `ISearchableFeature`：无附着时由宿主并行调度各搜索组；`IAttachPanelSearchFeature`：**有附着时唯一入口** |
| 推荐实现 | 继承 `SearchScopeFeatureBase`，重写 `GetSearchableFeatures()`，基类 `SearchAsync` 已遍历各组 |

自定义实现示例（不继承基类时）：

```csharp
public class MyAttachSearchPanel : MioObject, IAttachPanelSearchFeature
{
    public IReadOnlyList<string> SearchCommands { get; } = [];

    public async ValueTask SearchAsync(
        SearchRequest request,
        IWriteOnlyResultList<SearchResult> results,
        CancellationToken ct)
    {
        var group = MioAppContext.Current.RootNode
            .GetNodeById<MySearchGroup>(MyPluginConst.MySearchGroupId);
        if (group != null)
            await group.SearchAsync(request, results, ct);
    }

    public Task OnAttachSearchBox(ISearchBoxWindow w) => Task.CompletedTask;
    public Task OnDetachSearchBox(ISearchBoxWindow w) => Task.CompletedTask;
}
```

---

## ISearchScopeFeature

| 项 | 说明 |
|----|------|
| 类型 | **行为** |
| 继承 | `IAttachPanelSearchFeature` + `IInvokeFeature` |

可执行项 + 附着 + 搜索三合一；`/` 入口发现、`InvokeAsync` 一键附着等场景的标准组合。

```csharp
public interface ISearchScopeFeature : IAttachPanelSearchFeature, IInvokeFeature { }
```

推荐基类 **`SearchScopeFeatureBase`**：默认 `InvokeAsync` → `await SetAttachedPanelAsync(this)`；`SearchAsync` → `GetSearchableFeatures()`。

完整流程、`/` 与 command 别名入口、挂树与检查清单 → **[attach-search-panel.md](attach-search-panel.md)**

---

## IPluginFeature

| 项 | 说明 |
|----|------|
| 类型 | 标记 |
| 扩展类 | `PluginExtension` |
| 属性 | `IsEnabled` — `EavProperty<bool?>`，默认 `true` |
| 方法 | `GetIsEnabledAsync()` — Initialize 后若为 `false`，宿主跳过 `StartAsync` |

`IPlugin : IPluginFeature`，含 `InitializeAsync` / `StartAsync` / `StopAsync`。SDK 1.0 不再提供卸载回调；插件通过 `IPluginDataCleanupProvider.CreateDataCleanupPlanAsync` 声明额外 EAV 根，由宿主维护进程在退出后验证并删除，详见 [plugin-core.md](plugin-core.md)。

---

## IWindowStateFeature

| 项 | 说明 |
|----|------|
| 类型 | 标记 |
| 扩展类 | `WindowStateFeatureExtensions` |
| 属性 | `WindowState` — 一个版本化的 `WindowStateSnapshot` EAV 值 |
| UI 行为 | `WindowStateBehavior`（根命名空间 `MioKit.Sdk`） |

让需要持久化窗口状态的节点实现该 Feature，并在窗口的 `Interaction.Behaviors` 中将节点绑定给 `StateFeature`。行为会在 `Opened` 后恢复位置、客户区尺寸、显示器和 Normal/Maximized 状态；拖拽、缩放与状态变更会以默认 500ms 防抖写回。每个独立窗口应使用独立的 Feature 实例。

```csharp
public sealed class SettingsWindowNode(string id) : MioObject(id), IWindowStateFeature
{
    public override Guid MioType => MyPluginConst.SettingsWindowNodeType;
}
```

```xml
<Window xmlns:i="using:Avalonia.Xaml.Interactivity"
        xmlns:mio="using:MioKit.Sdk">
  <i:Interaction.Behaviors>
    <mio:WindowStateBehavior StateFeature="{Binding SettingsWindowNode}"
                             SaveDebounceMilliseconds="500" />
  </i:Interaction.Behaviors>
</Window>
```

`WindowStateSnapshot` 的位置使用物理屏幕像素、客户区尺寸使用 Avalonia DIP，并保存显示设备名与最后一次 Normal 边界。最小化和全屏不会持久化：重启后以 Normal 打开。已保存的屏幕缺失、分辨率变化或坐标不可见时，行为会回退到主屏工作区并夹紧位置与尺寸。没有状态、状态不完整或反序列化失败时，窗口保持其 XAML 默认值。

---

## 组合速查

| Feature | 标记/行为 | 主要用途 |
|---------|----------|----------|
| `IRootNodeFeature` | 标记 | 根节点 |
| `IMemoryNodeFeature` | 标记 | 内存节点（EAV 默认不落库，`ForcePersistence` 例外；SetParent 不落库） |
| Name/Description on `IFeature` | EAV | 显示名、描述 |
| `IAliasNameFeature` | 标记 | 搜索别名 |
| `IHotkeyFeature` | 标记 + Invoke | 全局热键 |
| `IIgnoreSearchFeature` | 标记 | 排除搜索 |
| `ISearchableFeature` | 行为 | 贡献搜索结果 |
| `IInvokeFeature` | 行为 | 可执行 |
| `IPinnedFeature` | 标记 | 置顶排序 |
| `IUseFeature` | 标记 | 最近使用 |
| `IIconProviderFeature` | 行为 | 图标 |
| `IResultActionProviderFeature` | 行为 | 结果项操作 |
| `IAttachPanelFeature` | 行为 | 搜索框附着生命周期 |
| `IAttachPanelSearchFeature` | 行为 | 附着后接管 `SearchAsync` |
| `ISearchScopeFeature` | 行为 | 可执行 + 附着 + 范围搜索 |
| `IPluginFeature` | 标记 | 插件启用 |
| `IWindowStateFeature` | 标记 + EAV | 绑定窗口的位置、尺寸与 Normal/Maximized 状态 |

---

## 插件自定义 Feature

定义接口 + `partial` 扩展类 + `[EavRelation]` / `[MemoryRelation]`，**同放 `Features/`** → 见 **[extension-properties.md](extension-properties.md)** §7。

自定义 Feature 进入 `GetFeatureInstances<T>()` 需节点 **已挂树**；宿主加载时会扫描插件程序集。
