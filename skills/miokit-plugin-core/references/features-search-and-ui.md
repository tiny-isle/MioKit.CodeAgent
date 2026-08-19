# Feature：搜索、插件与 UI 行为

本文仅覆盖搜索结果操作、附着搜索框、插件启用状态、窗口状态和组合速查。节点、内存节点、别名、热键、搜索组、执行、置顶、最近使用与图标 → [features-basics.md](features-basics.md)。

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

附着生命周期与内容宿主 → [attach-search-panel-basics.md](attach-search-panel-basics.md)；`/` 和 command 入口 → [attach-search-panel-commands.md](attach-search-panel-commands.md)。

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

完整流程、挂树与检查清单 → [attach-search-panel-basics.md](attach-search-panel-basics.md)；`/` 与 command 别名入口 → [attach-search-panel-commands.md](attach-search-panel-commands.md)。

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

定义接口 + `partial` 扩展类 + `[EavRelation]` / `[MemoryRelation]`，**同放 `Features/`** → 见 [扩展属性高级用法](extension-properties-advanced.md)。

自定义 Feature 进入 `GetFeatureInstances<T>()` 需节点 **已挂树**；宿主加载时会扫描插件程序集。
