# 搜索参考

实现 `ISearchableFeature`、构造 `SearchResult`、匹配与预览搜索时查阅本文（含 API）。类型在 `MioKit.Sdk`。

---

## 1. 搜索管线概览

```
用户输入
  → 宿主创建 SearchRequest
  → [可选] IPreviewSearch.HandleSearchAsync（按 Priority 排序，可 Blocked 阻断后续）
  → 并行 ISearchableFeature.SearchAsync（全部搜索组）
  → IWriteOnlyResultList<SearchResult> 收集结果
  → 宿主计算 Score 并排序
  → UI 展示 / 回车 InvokeAsync
```

| 阶段 | 负责方 | 插件参与点 |
|------|--------|------------|
| 请求构建 | 宿主搜索管线 | 读取 `request.Context`（`InvocationSnapshot`，见 [invocation-snapshot.md](invocation-snapshot.md)） |
| 预搜索 | `IPreviewSearch` 实现 | 注册到 `ISearchPipelineRegistry`（少见） |
| 主搜索 | 各 `ISearchableFeature` 组 | **实现 `SearchAsync`** |
| 排序 | 宿主搜索结果排序 | 设置 `MatchResult`、`PinMode` |
| 执行 | `IInvokeFeature.InvokeAsync` | `OwnerObject` 须为可执行节点 |

**搜索范围：**

搜索范围根据当前有无搜索框附着节点及其类型决定：

| 附着状态 | 宿主搜索行为 |
|----------|-------------|
| 无附着（默认） | 预览搜索（`IPreviewSearch`）+ 并行各 `ISearchableFeature.SearchAsync` |
| `IAttachPanelFeature`（无 `SearchAsync`） | 不搜索，输入禁用 |
| `IAttachPanelSearchFeature` | **仅**调用附着节点自身的 `SearchAsync`，跳过预览搜索与全树枚举 |

> `IAttachPanelSearchFeature` 扩展自 `IAttachPanelFeature`，增加了 `SearchAsync` 方法。
> 当某个实现了此接口的节点被附加到搜索框后，用户的所有输入都只在该节点范围内搜索，
> 不再触发全局的 `ISearchableFeature` 并行搜索。这在实现「作用域搜索」（如：仅搜索应用、仅搜索文件、仅搜索设置项）时非常有用。
>
> 插件通常使用 `ISearchScopeFeature`（继承自 `IAttachPanelSearchFeature` + `IInvokeFeature`）或继承 `SearchScopeFeatureBase` 来实现作用域搜索。
> 详见 **[attach-search-panel.md](attach-search-panel.md)** §1、§2。

插件组须在 `StartCoreAsync` 中 `EnsureTreeLoadedAsync` 并挂树，否则不进索引。

---

## 2. ISearchableFeature 实现

```csharp
[EavType(MyPluginConst.SearchGroupTypeId)]
public class MySearchGroup : MioObject, ISearchableFeature
{
    public MySearchGroup(string id) : base(id) { }
    public override Guid MioType => MyPluginConst.SearchGroupType;

    public async ValueTask SearchAsync(
        SearchRequest request,
        IWriteOnlyResultList<SearchResult> results,
        CancellationToken ct)
    {
        // 空输入通常直接返回（首页模式由框架处理）
        if (request.IsEmptyText) return;

        foreach (var node in this.GetDescendants<MyNode>())
        {
            ct.ThrowIfCancellationRequested();

            // 节点标记忽略搜索时跳过
            if (node is IIgnoreSearchFeature ig && ig.GetIgnoreSearch() == true)
                continue;

            // 推荐：已 BatchLoad 后用同步 GetName + SearchHelper
            if (!node.TryMatch(request.SearchText!, out var match, out var title))
                continue;

            results.Add(new SearchResult(request, node)
            {
                Title = title,
                Description = node.GetDescription(),
                MatchResult = match!.Value,
                PinMode = SortPriority.Normal,
                Source = "我的插件"
            });
        }
    }
}
```

### 性能约束（必读）

搜索在每次按键时触发，**`SearchAsync` 循环内禁止打库**。搜索会用到的 EAV 字段必须在搜索发生前全部进内存，循环里只用同步 `GetXxx()`（及基于它的 `TryMatch`）。

| ✅ 应做 | ❌ 禁止 |
|--------|--------|
| 启动 / 挂树后 `BatchLoadValueAsync` 或节点 `PreloadPropertySource` 覆盖**全部**搜索参与字段 | `SearchAsync` 内 `GetXxxAsync()`、`GetValueAsync` |
| 循环内 `GetName()`、`GetDescription()`、`GetAliasName()`、`GetPath()` 等同步 Get | 循环内按节点逐条异步读库 |
| `TryMatch`（`IFeature` 扩展；内部同步读 `Name` + 别名） | 未 BatchLoad 就 `TryMatch` |
| 新增搜索字段时同步加入 BatchLoad 列表 | 仅 BatchLoad Name，循环里再 `GetDescriptionAsync` |

典型搜索参与属性：`Name`、`Description`、`AliasName`，以及用于匹配/展示/过滤的自定义 EAV（如路径、标签）。

```csharp
// StartCoreAsync 或组加载子树后 — 一次性预加载
await dp.BatchLoadValueAsync(
    group.GetDescendants<MyNode>(),
    [
        MioFeatureExtensions.NameProperty,
        MioFeatureExtensions.DescriptionProperty,
        AliasNameExtension.AliasNameProperty,
        MyExtension.PathProperty   // 若 SearchAsync 会读
    ]);

// SearchAsync — 仅同步 Get
foreach (var node in this.GetDescendants<MyNode>())
{
    if (!node.TryMatch(request.SearchText!, out var match, out var title)) continue;
    results.Add(new SearchResult(request, node)
    {
        Title = title,
        Description = node.GetDescription(),  // Get，非 GetDescriptionAsync
        MatchResult = match!.Value
    });
}
```

→ 预加载与 Get/Async 区别：[extension-properties.md](extension-properties.md) §3

### 实现要点

| 规则 | 说明 |
|------|------|
| `OwnerObject` | **必须是可被用户执行的节点**（通常实现 `IInvokeFeature`），不要填搜索组自身 |
| `Title` | 列表主标题；有别名时用 `TryMatch` 返回的 `title` |
| `Description` | 副标题，可选 |
| `MatchResult` | 用 `SearchHelper` / `ITextMatcher` 生成，影响排序分 |
| `Source` | 模块名，显示在结果角标 |
| `PinMode` | 控制置顶/压底（见 §5） |
| `ct` | 循环内 `ThrowIfCancellationRequested()` |
| 预加载 | **搜索用到的属性须事先全部 BatchLoad**；循环内只用 `GetXxx()`，禁止 `GetXxxAsync()` |

### 节点需实现 IInvokeFeature

用户回车或双击结果时，框架对 `OwnerObject` 调用 `InvokeAsync(InvokeContext.FromSearchBox(result))`。

---

## 3. SearchRequest

一次搜索的上下文，由宿主创建并传入各 `SearchAsync`。

| 成员 | 类型 | 设置方 | 说明 |
|------|------|--------|------|
| `SearchId` | `Guid` | 自动 | 本次搜索唯一 Id |
| `SearchNumber` | `int` | 宿主 | 会话内递增序号，用于日志与取消判定 |
| `SearchText` | `string?` | 宿主 | 用户输入原文 |
| `IsEmptyText` | `bool` | 自动 | `SearchText` 为空时为 `true` |
| `IsEmptySearchText` | `bool` | 自动 | 同 `IsEmptyText`（兼容别名） |
| `Context` | `InvocationSnapshot` | 宿主 | 打开搜索框时采集的环境快照 → [invocation-snapshot.md](invocation-snapshot.md) |
| `CancellationToken` | `CancellationToken` | 宿主 | 搜索取消令牌 |
| `Timestamp` | `DateTimeOffset` | 自动/宿主 | 请求创建时间（UTC） |
| `IsFirstOpenWindowSearch` | `bool` | 宿主 | 是否搜索框首次打开触发的搜索 |

> **command 模式附着**不在搜索管线内：用户输入别名（或合法前缀）后按下宿主配置的触发键，宿主匹配 `SearchCommands` + `UserSearchCommands` 合并注册表并自动附着；输入时显示前缀幽灵补全。详见 **[attach-search-panel.md](attach-search-panel.md)** §7。

### InvocationSnapshot（`request.Context`）

搜索框打开时由 `IInvocationSnapshotProvider`（默认 `SearchRequestCollector`）采集，包含前台窗口、剪贴板、资源管理器等。完整类型说明、嵌套类字段与 `InvokeContext` 传递路径 → **[invocation-snapshot.md](invocation-snapshot.md)**。

```csharp
var fg = request.Context.ForegroundWindow;
var clip = request.Context.Clipboard;
var explorer = request.Context.Explorer;
```

---

## 4. SearchResult

单条搜索结果。构造：`new SearchResult(request, ownerObject)`。

| 成员 | 类型 | 插件可写 | 说明 |
|------|------|----------|------|
| `Request` | `SearchRequest` | 构造注入 | 所属搜索请求 |
| `OwnerObject` | `MioObject` | 构造注入 | **可执行节点**；框架对其调用 `IInvokeFeature` |
| `Title` | `string` | ✅ `init` | 主标题 |
| `Description` | `string?` | ✅ `init` | 副标题 |
| `MatchResult` | `TextMatchResult` | ✅ `set` | 文本匹配详情，影响排序 |
| `PinMode` | `SortPriority` | ✅ `init` | 置顶/压底优先级 |
| `Source` | `string?` | ✅ `set` | 来源模块名（UI 角标） |
| `Payload` | `object?` | ✅ `set` | 插件自定义附加数据 |
| `RenderControlFunc` | `Func<object?>?` | ✅ `set` | 自定义 Avalonia 渲染；默认用 `GeneralSearchResultItem` |
| `Score` | `double` | ❌ 框架 | 排序分，由宿主在展示前计算 |

### 最小示例

```csharp
results.Add(new SearchResult(request, node)
{
    Title = "记事本",
    Description = @"C:\Windows\notepad.exe",
    MatchResult = TextMatchResult.Success(TextMatchType.Contains, [0, 1]),
    Source = "应用启动"
});
```

### OwnerObject 约定

```csharp
// ✅ 正确：叶子节点，实现 IInvokeFeature
results.Add(new SearchResult(request, appNode) { Title = name });

// ❌ 错误：搜索组本身无法被用户执行
results.Add(new SearchResult(request, searchGroup) { Title = name });
```

---

## 5. SortPriority（PinMode）

控制结果在列表中的相对位置（优先于 `Score`）：

| 值 | 含义 |
|----|------|
| `AlwaysTop` (5) | 永远置顶 |
| `TopHigh` (4) | 高优先级置顶 |
| `Top` (3) | 普通置顶 |
| `TopLow` (2) | 轻度置顶 |
| `NormalHigh` (1) | 默认偏高 |
| `Normal` (0) | 默认 |
| `NormalLow` (-1) | 默认偏低 |
| `Bottom` (-2) | 压底 |
| `BottomHigh` (-3) | 较高优先级压底 |
| `AlwaysBottom` (-4) | 永远最后 |

实现 `IPinnedFeature` 的节点置顶状态由框架单独处理；`PinMode` 用于搜索时临时调整顺序。

---

## 6. 文本匹配（同步）

`SearchHelper` **仅一个**扩展方法；搜索管线内**同步**匹配，勿在 `SearchAsync` 循环里 `await` 匹配。

```csharp
public static bool TryMatch(
    this IFeature feature,
    string matchText,
    out TextMatchResult? result,
    out string title);
```

| 项 | 说明 |
|----|------|
| 调用方 | 任意 `IFeature`（通常为 `MioObject` 节点） |
| `title` | 实际命中的展示文本（`Name` 或某条别名中更优者） |
| 别名 | 节点实现 `IAliasNameFeature` 时，**内部**合并 `Name` + `GetAliasName()` 候选并取最优匹配；**无**单独的 `IAliasNameFeature.TryMatch` |
| command 别名 | 节点实现 `IAttachPanelFeature` 时，**内部**合并 `SearchCommands` + `GetUserSearchCommands()` 并取最优匹配 |
| 底层 | `ITextMatcher.Match`（宿主注入 `SearchHelper.TextMatcher`） |
| 前提 | `Name`、别名、用户 command 等已 BatchLoad 或可同步 `Get`；未进内存会导致匹配失败或隐式读库 |

```csharp
// 唯一推荐写法
if (node.TryMatch(request.SearchText!, out var match, out var title))
{
    results.Add(new SearchResult(request, node)
    {
        Title = title,
        MatchResult = match!.Value
    });
}
```

节点需支持别名搜索时：实现 `IAliasNameFeature` + 搜索前 BatchLoad `AliasNameExtension.AliasNameProperty`，仍只调用 `node.TryMatch(...)`。

### ITextMatcher（底层 / 自定义字段匹配）

```csharp
var matcher = /* 通常不直接解析，用 SearchHelper */;
var result = matcher.Match("微信", "wx");
// result.IsSuccess, result.Type, result.MatchedIndexes
```

### TextMatchType（优先级从高到低用于同类型比较）

| 类型 | 含义 | 基础分 |
|------|------|--------|
| `Exact` | 完全相同 | 100 |
| `FirstLetter` | 首字母/缩写 | 75 |
| `Succession` | 连续子串 | 75 |
| `Contains` | 包含全部字符（可不连续） | 35 |
| `None` | 无匹配 | 0 |

`MatchedIndexes`：命中字符在标题中的下标数组，供 UI 高亮。

### 排序分构成

宿主计算 `SearchResult.Score` 时会考虑：

1. 匹配类型 + 命中位置 + 标题长度
2. 若 `OwnerObject` 实现 `IUseFeature`：叠加使用次数与最近使用时间

最终按 `PinMode` → `Score` → 标题长度 → 字典序排序。

---

## 7. IWriteOnlyResultList

搜索管线中的结果收集器，插件只写不读：

```csharp
results.Add(item);
results.AddRange(items);
// Count / IsEmpty / ToList() 由框架在搜索结束后使用
```

具体实现由宿主提供；插件只依赖 `IWriteOnlyResultList<T>` 接口。

---

## 8. IPreviewSearch（高级）

非常规插件场景。实现 `IPreviewSearch` 并注册到 `ISearchPipelineRegistry`，在正式搜索组之前执行：

```csharp
public interface IPreviewSearch
{
    string Key => GetType().FullName!;
    string? OwnerPluginId => null;
    ushort Priority { get; }
    bool IsAvailable(SearchRequest request, CancellationToken ct) => true;
    ValueTask<PreviewSearchResult> HandleSearchAsync(
        SearchRequest request,
        IWriteOnlyResultList<SearchResult> results,
        CancellationToken ct);
}
```

返回 `PreviewSearchResult.Suppressed()` 可阻断后续搜索源。

---

## 9. 实现参照

| 场景 | 做法 |
|------|------|
| 组遍历 | 在 `Nodes/*SearchGroup.cs` 中遍历子树，调用 `TryMatch` 后添加 `SearchResult` |
| 名称/别名匹配 | 使用 SDK 的 `SearchHelper.TryMatch` 扩展方法 |
| 排序 | 填写 `MatchResult`、`PinMode`、`Source`，排序由宿主搜索管线完成 |

---

## 10. 检查清单

- [ ] 搜索组实现 `ISearchableFeature`，`StartCoreAsync` 已 `EnsureTreeLoadedAsync` 并挂树
- [ ] `SearchAsync` 中空输入、`CancellationToken` 已处理
- [ ] `OwnerObject` 为可执行叶子节点（`IInvokeFeature`）
- [ ] 搜索用到的 EAV **已全部** `BatchLoadValueAsync`（或 `PreloadPropertySource`）；`SearchAsync` 循环内**仅用** `GetXxx()` / `TryMatch`，**禁止** `GetXxxAsync()`
- [ ] 设置 `MatchResult`（影响排序）与 `Source`（影响展示）
- [ ] 需要环境感知时读取 `request.Context`（见 [invocation-snapshot.md](invocation-snapshot.md)）
- [ ] 需要 command 模式入口时声明 `SearchCommands`；用户自定义别名走 `SetUserSearchCommands` → [attach-search-panel.md](attach-search-panel.md) §7
