# 附着搜索框：基础与生命周期

本文涵盖附着流程、`SearchScopeFeatureBase`、宿主调度、内容宿主和挂树。`/` 入口、`SearchCommands` / `UserSearchCommands` 与冲突规则 → [attach-search-panel-commands.md](attach-search-panel-commands.md)。

搜索框可「附着」一个 `IAttachPanelFeature` 节点，改变后续搜索范围或接管输入行为。

---

## 1. 概念

| 状态 | 搜索行为 |
|------|----------|
| 无附着节点 | 预览搜索（`IPreviewSearch`）+ 并行各 `ISearchableFeature.SearchAsync` |
| 有附着且实现 `IAttachPanelSearchFeature` | **仅**调用附着节点自身的 `SearchAsync`（不自动遍历子树） |
| 有附着但仅为 `IAttachPanelFeature` | 搜索框输入禁用；`SearchAsync` 不执行 |

用户可通过两种方式附着搜索范围：

| 入口 | 匹配 | 行为 |
|------|------|------|
| **`/` 前缀** | `ISearchScopeFeature.Name` | 预览列出作用域，选中后 `InvokeAsync` → 附着 |
| **command 模式** | `SearchCommands` + `UserSearchCommands`（EAV） | 用户输入别名后按下宿主配置的触发键 → **自动** `SetAttachedPanelAsync`；支持前缀补全 |

command 模式的触发键由宿主内部配置，**插件无需关心**；声明 `SearchCommands` 和/或由用户在设置中写入 `UserSearchCommands`，并实现附着后的行为。

---

## 2. 接口分层

```text
IFeature
  └── IAttachPanelFeature          SearchCommands + UserSearchCommands（EAV）+ OnAttachSearchBox / OnDetachSearchBox
        └── IAttachPanelSearchFeature    SearchAsync(...)   ← 附着后的唯一搜索入口
              └── ISearchScopeFeature    + IInvokeFeature（/ 入口可发现、可执行附着）
```

### `IAttachPanelFeature`

```csharp
public interface IAttachPanelFeature : IFeature
{
    IReadOnlyList<string> SearchCommands { get; }
    Task OnAttachSearchBox(ISearchBoxWindow searchBoxWindow);
    Task OnDetachSearchBox(ISearchBoxWindow searchBoxWindow);
}
```

| 项 | 说明 |
|----|------|
| 类型 | **行为** |
| `SearchCommands` | 插件在代码中声明的 command 别名，规则为 `^[a-z]+(?:[-_][a-z]+)*$`（如 `"app-launch"`） |
| `UserSearchCommands` | 用户通过 EAV 配置的 command 别名（`AttachPanelExtension.UserSearchCommandsProperty`，`List<string>`）；读写时宿主过滤非法项 |
| 用途 | 附着/分离时的生命周期回调（刷新 UI、加载资源等） |
| 限制 | **无** `SearchAsync`；附着后搜索框**不可输入**，宿主不触发搜索 |

**command 别名来源：** 宿主将 `SearchCommands` 与 `GetUserSearchCommands()` **合并去重**后注册；用于 command 模式附着、`/` 预览文本匹配、输入框前缀幽灵补全。

**与 `/` 的分工：** `Name` 参与 `/` 预览发现；`SearchCommands` 与 `UserSearchCommands` 也参与 `/` 下的文本匹配（匹配命中时标题显示对应 command）。command 模式（触发键）则匹配合并后的全部别名。

### `IAttachPanelSearchFeature`

```csharp
public interface IAttachPanelSearchFeature : IAttachPanelFeature
{
    ValueTask SearchAsync(
        SearchRequest request,
        IWriteOnlyResultList<SearchResult> writeOnlyResultList,
        CancellationToken cancellationToken);
}
```

| 项 | 说明 |
|----|------|
| 类型 | **行为** |
| 与 `ISearchableFeature` | 签名相同（均为 `ValueTask SearchAsync(...)`），但语义不同：前者在**已附着到搜索框**时由宿主**单独**调用；后者作为搜索组参与全树并行搜索 |
| 宿主行为 | 搜索框已附着本接口节点时，用户输入 → **只**调附着节点的 `SearchAsync`，跳过预览搜索与全树 `ISearchableFeature` 枚举 |
| 实现职责 | 在 `SearchAsync` 内自行决定如何产出结果（直接匹配、或委托子树内 `ISearchableFeature`，见 `SearchScopeFeatureBase`） |

**自定义实现示例（委托多组）：**

```csharp
public class MyAttachSearchFeature : MioObject, IAttachPanelSearchFeature
{
    public MyAttachSearchFeature(string id) : base(id) { }
    public override Guid MioType => MyPluginConst.MyAttachType;

    public async ValueTask SearchAsync(
        SearchRequest request,
        IWriteOnlyResultList<SearchResult> results,
        CancellationToken ct)
    {
        foreach (var group in GetSearchGroups())
        {
            ct.ThrowIfCancellationRequested();
            await group.SearchAsync(request, results, ct);
        }
    }

    private IEnumerable<ISearchableFeature> GetSearchGroups() { /* ... */ }

    public Task OnAttachSearchBox(ISearchBoxWindow w) => Task.CompletedTask;
    public Task OnDetachSearchBox(ISearchBoxWindow w) => Task.CompletedTask;

    public IReadOnlyList<string> SearchCommands { get; } = [];
}
```

### `ISearchScopeFeature`

```csharp
public interface ISearchScopeFeature : IAttachPanelSearchFeature, IInvokeFeature { }
```

| 项 | 说明 |
|----|------|
| 类型 | **行为**（组合接口） |
| 用途 | `/` 入口可发现、可执行附着、附着后可搜索 — **插件最常用** |
| 推荐 | 继承 `SearchScopeFeatureBase`，无需手写 `SearchAsync` 委托逻辑 |

`SearchCommandValidation.TryNormalize(raw, out normalized)`：仅接受 `^[a-z]+(?:[-_][a-z]+)*$`；首尾/连续分隔符、大写、数字或空白均返回 `false`。

`ISearchBoxWindow`（`MioIoc.Resolve`）：`SetAttachedPanelAsync` · `ShowWindowAsync` / `HideWindowAsync` / `ToggleWindowAsync` / `RefreshAsync` · 内容宿主与 Avalonia Dialog 见 `miokit-plugin-avalonia-ui`。

---

## 3. Sdk 基类：`SearchScopeFeatureBase`

继承 `MioObject` 并实现 `ISearchScopeFeature` 的推荐起点：

```csharp
using MioKit.Sdk;

[EavType(MyPluginConst.AppSearchScopeTypeId)]
public class AppSearchScopeFeature : SearchScopeFeatureBase, IMemoryNodeFeature
{
    public AppSearchScopeFeature() : base(MyPluginConst.AppSearchScopeId)
    {
        Name = "应用";
        Description = "搜索桌面应用与自定义项";
    }

    public override IReadOnlyList<string> SearchCommands { get; } = ["app"];

    public override Guid MioType => MyPluginConst.AppSearchScopeType;

    protected override IEnumerable<ISearchableFeature> GetSearchableFeatures()
    {
        var root = MioAppContext.Current.RootNode;
        var group = root.GetNodeById<MySearchGroup>(MyPluginConst.MySearchGroupId);
        if (group != null)
            yield return group;
    }
}
```

| 成员 | 默认行为 |
|------|----------|
| `SearchCommands` | 空（子类 override，如 `["app"]`） |
| `PreloadPropertySource` | 含 `AttachPanelExtension.UserSearchCommandsProperty`（`EavCachePolicy.Absolute`） |
| `InvokeAsync` | `await MioIoc.Resolve<ISearchBoxWindow>().SetAttachedPanelAsync(this)` |
| `SearchAsync` | 遍历 `GetSearchableFeatures()` 并调用各组 `SearchAsync` |
| `GetSearchableFeatures()` | 空（子类重写） |
| `OnAttachSearchBox` / `OnDetachSearchBox` | 空（可按需重写） |

---

## 4. 宿主搜索调度

```
用户输入（文本）
  → 已附着搜索框节点?
       否 → 预览搜索（IPreviewSearch）+ 并行各 ISearchableFeature.SearchAsync（见 search.md）
       是 → 附着节点 is IAttachPanelSearchFeature?
              否 → 不搜索（输入亦可能禁用）
              是 → 仅 attachNode.SearchAsync(request, results, ct)

用户按下 command 触发键（与搜索管线独立）
  → 取当前 SearchText 作为 command 别名（支持前缀最短匹配）→ 查注册表
  → 命中 → 取消进行中的搜索 → SetAttachedPanelAsync → 清空输入 → 触发附着范围搜索
  → 未命中 → 吞掉按键，不改变附着状态

输入过程中（无附着节点）：合法前缀输入时，宿主在搜索框显示幽灵补全（合并后的最短匹配 command）；按触发键可附着。
```

附着成功后宿主清空搜索框并触发空搜；后续输入仅在附着范围内搜索。

---

## 5. 宿主 API

```csharp
// 插件侧附着（通常由 InvokeAsync 调用）
await MioIoc.Resolve<ISearchBoxWindow>().SetAttachedPanelAsync(scopeFeature);

// 清除附着
await MioIoc.Resolve<ISearchBoxWindow>().SetAttachedPanelAsync(null);
```

| 方法 | 说明 |
|------|------|
| `SetAttachedPanelAsync(IAttachPanelFeature?)` | 设置/清除附着节点；会等待旧节点分离和新节点附加完成，替换时清空结果并触发搜索 |
| `ShowWindowAsync` / `HideWindowAsync` / `ToggleWindowAsync` | 分别为幂等显示、幂等隐藏与显式切换；隐藏时立即清空搜索输入/结果/剪贴板预览，附加面板的卸载时机由用户设置决定 |

**输入框可用性：** 无附着节点，或附着节点实现 `IAttachPanelSearchFeature` 时，搜索框可输入；仅 `IAttachPanelFeature`（无 `SearchAsync`）时输入可能被禁用。

---

## 6. 扩展内容宿主

插件可在附加生命周期中把自己的 Avalonia 控件显示在搜索输入框下方。该控件会替换主页和结果列表，但不会替换搜索输入框或 Dialog overlay。

```csharp
public async Task OnAttachSearchBox(ISearchBoxWindow searchBox)
{
    searchBox.SetContent(new MyPluginPanel());
    await Task.CompletedTask;
}

public Task OnDetachSearchBox(ISearchBoxWindow searchBox)
{
    // 这里释放插件页面关联的状态或订阅；宿主随后会移除内容。
    return Task.CompletedTask;
}
```

| 方法 / 状态 | 说明 |
|---|---|
| `SetContent(Control?)` / `ClearContent()` | 设置或清除主内容区控件；清除后优先返回仍保留的搜索结果，否则回到主页 |
| `IsVisible` / `AttachedPanel` | 只读查询窗口显示状态和当前附加节点 |
| `Esc` | 内容存在时先清除内容；没有可返回的结果时隐藏搜索框 |

用户关闭搜索框后，宿主**立即**清空瞬时搜索态（输入文本、结果列表、剪贴板预览等）。仅**附加面板**按用户设置（立即 / 3 秒 / 10 秒 / 永不）延迟或保留卸载；重新打开会取消待卸载任务，并始终刷新调用快照（前台窗口、剪贴板、资源管理器）。插件不应假定 `OnDetachSearchBox` 会在窗口刚隐藏时立刻执行（除非用户选择「立即清除」）。

---

## 7. 挂树与注册

1. 在 `*Const` 中定义作用域节点固定 `Id` 与 `[EavType]` Guid
2. 在 `RegisterBase<T>.RegisterService` 中 `RegisterType<AppSearchScopeFeature>().AsSelf()`
3. 在 `StartCoreAsync` 中 `EnsureTreeLoadedAsync<AppSearchScopeFeature>(固定Id)` 或 `StoreAsync` 后 `SetParent` 挂到插件子树
4. 节点必须 **已挂到 RootNode 子树**（`IsAttachRootTree`）后，`/` 与 `SearchCommands` 入口才生效

---

## 8. 选型

| 需求 | 实现 |
|------|------|
| 仅附着 UI/状态，不参与搜索输入 | 实现 `IAttachPanelFeature` |
| 附着后由该节点驱动 `SearchAsync` | `IAttachPanelSearchFeature` 或 `ISearchScopeFeature` |
| 可执行项 + 一键附着 + 多组搜索 | 继承 `SearchScopeFeatureBase` |
| 快捷 command 附着 | 在 `SearchCommands` 声明默认别名；允许用户通过 `SetUserSearchCommands` 追加 |

---

## 9. 与 search.md 的分工

- [search.md](search.md) — 通用 `ISearchableFeature`、`SearchRequest`/`SearchResult`、匹配排序
- 本文 — 附着生命周期、`SearchScopeFeatureBase`、`SearchCommands` / `UserSearchCommands`、`/` 与 command 模式入口、搜索范围切换

---

## 10. 检查清单

- [ ] 作用域节点有固定 `Id`、唯一 `[EavType]`、`Name`/`Description` 便于 `/` 发现
- [ ] 需要 command 模式入口时 override `SearchCommands`（如 `["app", "app-launch"]`，遵循分隔符规则）
- [ ] 若提供用户自定义别名 UI，使用 `GetUserSearchCommands` / `SetUserSearchCommands`（非法项会被过滤）
- [ ] `GetSearchableFeatures()` 返回的作用域内搜索组已挂树
- [ ] `InvokeAsync` 未重写时基类会 await `SetAttachedPanelAsync(this)`
- [ ] 附着后需搜索时实现 `IAttachPanelSearchFeature.SearchAsync`（或继承 `SearchScopeFeatureBase`）
- [ ] 节点已挂树，`/` 与 command 注册才会生效
