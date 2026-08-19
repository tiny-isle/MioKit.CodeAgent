# 附加到搜索框

附着流程、`SearchCommands` / `UserSearchCommands`、`SearchScopeFeatureBase` 与宿主调度均见本文。

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

`ISearchBoxWindow`（`MioIoc.Resolve`）：`SetAttachedPanelAsync` · `ShowWindowAsync` / `HideWindowAsync` / `ToggleWindowAsync` / `RefreshAsync` · 内容宿主与 Dialog 见下文和 [search-box-dialog.md](search-box-dialog.md)。

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

## 7. `/` 入口发现

用户输入以 `/` 开头时，宿主预览列出根树上所有 `ISearchScopeFeature`：

- 仅 `/`：按 `Name` 排序列出全部作用域
- `/关键词`：按 `Name` 与 **command 别名**（`SearchCommands` + `UserSearchCommands`）文本匹配过滤

选中结果执行 `InvokeAsync` → `SetAttachedPanelAsync`。作用域节点的 `Name` / `Description`（`IFeature` 接口成员）会显示在预览列表中。

---

## 8. command 模式（SearchCommands + UserSearchCommands）

### 8.1 插件声明：`SearchCommands`

任意实现 `IAttachPanelFeature` 的节点可在代码中声明多个 `SearchCommands`；每项须符合 `^[a-z]+(?:[-_][a-z]+)*$`。继承 `SearchScopeFeatureBase` 时 **override** 属性：

```csharp
public override IReadOnlyList<string> SearchCommands { get; } = ["app", "app-launch"];
```

宿主与 `SearchHelper.TryMatch` 通过 `EnumerateSearchCommandMatchCandidates()` 合并 `SearchCommands` 与 `GetUserSearchCommands()` 得到匹配候选；插件一般无需直接调用，但自定义匹配逻辑时可复用。

### 8.2 用户配置：`UserSearchCommands`（EAV）

宿主为所有 `IAttachPanelFeature` 提供 EAV 扩展属性，供用户在设置界面等场景追加别名：

| 项 | 说明 |
|----|------|
| 扩展类 | `AttachPanelExtension` |
| 属性 | `UserSearchCommandsProperty` — `EavProperty<List<string>>`，`SearchCommandListConvert` 序列化 |
| 缓存 | `EavCachePolicy.Absolute` + `ForcePersistence`；`SearchScopeFeatureBase.PreloadPropertySource` 已包含，持久化节点加载或内存节点挂树时预读 |
| 同步读 | `this.GetUserSearchCommands()`（`SearchScopeFeatureBase` 已预加载；**MioObject 子类内须 `this.`**） |
| 写入 | `this.SetUserSearchCommands(list)`；非法项由 `SearchCommandValidation` 按分隔符规则过滤 |
| 变更 | `SetUserSearchCommands` 后宿主自动刷新 command 注册表 |

```csharp
// 设置界面等：为用户追加自定义 command（在 MioObject 子类内须 this.）
scopeFeature.SetUserSearchCommands(["my-app", "go_now"]);

// 同步读取（SearchScopeFeatureBase 预加载后）
var userCommands = this.GetUserSearchCommands();
```

### 8.3 宿主合并规则

| 规则 | 说明 |
|------|------|
| 合并 | `SearchCommands` + `GetUserSearchCommands()` 去重后进入注册表；`EnumerateSearchCommandMatchCandidates()` 为同一合并逻辑的公开 API |
| 插件职责 | 声明 `SearchCommands`；**不**解析输入、**不**处理触发键；用户别名由宿主 EAV 管理 |
| 触发时机 | 用户输入别名（或合法前缀）后**按下宿主配置的触发键**（与 `SearchAsync` 搜索管线分离） |
| 前缀补全 | 输入合法前缀时显示幽灵补全；触发键支持**最短前缀匹配**附着 |
| 分隔符前缀 | 输入可暂时以单个 `-` 或 `_` 结尾；例如已注册 `my-color` 时，输入 `my-` 即显示补全 |
| 宿主行为 | 用当前 `SearchText` 匹配注册表；命中则取消进行中的搜索并 `SetAttachedPanelAsync` |
| 注册时机 | 节点挂到 RootNode 子树（`IsAttachRootTree`）时自动注册；`UserSearchCommands` 变更时重新注册；下树时注销 |
| 冲突 | 同一 command 被多个节点声明时，**先上树者优先**；其余保留在队列，前者下树后自动回落 |
| 未命中 | 不附着；不影响当前搜索状态 |
| 与 `/` | `Name` 与 command 别名均可参与 `/` 预览的文本匹配；触发键 command 模式匹配合并后的全部别名 |

**附着后插件需做的：** 在 `OnAttachSearchBox` / `OnDetachSearchBox` 维护 UI 或状态；若实现 `IAttachPanelSearchFeature`，在 `SearchAsync` 内产出该范围内的搜索结果。

仅 `IAttachPanelFeature`（无 `SearchAsync`）也可注册 command；附着后输入仍禁用，与手动附着行为一致。

---

## 9. 挂树与注册

1. 在 `*Const` 中定义作用域节点固定 `Id` 与 `[EavType]` Guid
2. 在 `RegisterBase<T>.RegisterService` 中 `RegisterType<AppSearchScopeFeature>().AsSelf()`
3. 在 `StartCoreAsync` 中 `EnsureTreeLoadedAsync<AppSearchScopeFeature>(固定Id)` 或 `StoreAsync` 后 `SetParent` 挂到插件子树
4. 节点必须 **已挂到 RootNode 子树**（`IsAttachRootTree`）后，`/` 与 `SearchCommands` 入口才生效

---

## 10. 选型

| 需求 | 实现 |
|------|------|
| 仅附着 UI/状态，不参与搜索输入 | 实现 `IAttachPanelFeature` |
| 附着后由该节点驱动 `SearchAsync` | `IAttachPanelSearchFeature` 或 `ISearchScopeFeature` |
| 可执行项 + 一键附着 + 多组搜索 | 继承 `SearchScopeFeatureBase` |
| 快捷 command 附着 | 在 `SearchCommands` 声明默认别名；允许用户通过 `SetUserSearchCommands` 追加 |

---

## 11. 与 search.md 的分工

- [search.md](search.md) — 通用 `ISearchableFeature`、`SearchRequest`/`SearchResult`、匹配排序
- 本文 — 附着生命周期、`SearchScopeFeatureBase`、`SearchCommands` / `UserSearchCommands`、`/` 与 command 模式入口、搜索范围切换

---

## 12. 检查清单

- [ ] 作用域节点有固定 `Id`、唯一 `[EavType]`、`Name`/`Description` 便于 `/` 发现
- [ ] 需要 command 模式入口时 override `SearchCommands`（如 `["app", "app-launch"]`，遵循分隔符规则）
- [ ] 若提供用户自定义别名 UI，使用 `GetUserSearchCommands` / `SetUserSearchCommands`（非法项会被过滤）
- [ ] `GetSearchableFeatures()` 返回的作用域内搜索组已挂树
- [ ] `InvokeAsync` 未重写时基类会 await `SetAttachedPanelAsync(this)`
- [ ] 附着后需搜索时实现 `IAttachPanelSearchFeature.SearchAsync`（或继承 `SearchScopeFeatureBase`）
- [ ] 节点已挂树，`/` 与 command 注册才会生效
