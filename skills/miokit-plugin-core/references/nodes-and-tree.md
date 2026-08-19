# 节点、挂树与数据访问

节点建模、挂树语义、树遍历 / Feature 检索与 `IMioDataProvider` 均见本文。类型在 `MioKit.Sdk`。树查询**唯一推荐入口**是下列扩展，勿手写递归。

> **模板说明：** `dotnet new` 生成的项目**不预置**搜索组或可执行节点；以下示例中的 `DesktopApp*` 等为教学用命名，需自行在 Const、Register 与 `Nodes/` 中实现。

---

## 1. MioObject 核心

每个插件节点/组均继承 `MioObject`，实现 `IFeature`（含 `Name` / `Description` 接口成员）与 `INotifyPropertyChanged`。

| 成员 | 说明 |
|------|------|
| `Id` | 全局唯一字符串，构造时传入 |
| `MioType` | `override Guid`，对应 `[EavType]` 类型 Guid |
| `Name` | `IFeature.Name`；可通知，底层 EAV；**可直接用于 Avalonia MVVM 绑定** |
| `Description` | `IFeature.Description`；可通知，底层 EAV；**可直接用于 Avalonia MVVM 绑定** |
| `PreloadPropertySource` | `protected init IAttachEavProperty[]`；插件启动 / `StoreAsync` 时批量预加载的 EAV；内存节点挂树时也会加载其中标记 `ForcePersistence` 的属性；子类可用 spread 扩展 `[..PreloadPropertySource, MyProperty]` |
| `Parent` | 当前父节点；**仅通过 `SetParent` 修改** |
| `Children` | `IReadOnlyCollection<MioObject>`，由 `SetParent` 自动维护，**只读** |
| `IsAttachRootTree` | 是否已连接到 `RootNode` 子树；决定 Feature 索引是否生效 |
| `EnsureSubTreeLoadedAsync()` | `virtual Task`；确保所有需要的子节点树已加载并挂好；基类返回 `CompletedTask` |
| `EnsureTreeLoadedAsync<T>(id)` | `protected Task`；从库加载 `FindFirstDescendant` 未命中的子树并 `SetParent(this)` |
| `Store` | 内部属性缓存（插件通过生成方法或 `GetValue*` / `SetValue` 访问） |

### 挂树钩子

子类可重写，在节点**连上 / 离开根树**时触发（`IsAttachRootTree` 变更时）：

```csharp
protected override void OnAttachedRootTree() { /* 已进 RootNode 索引 */ }
protected override void OnDetachedRootTree() { /* 已出 RootNode 索引 */ }
```

典型用途：挂树后注册监听、摘树时释放资源。全局热键等仍推荐依赖 `AttachedTreeEventMessage`（见 [input-hooks.md](input-hooks.md)）。

### 属性读写（底层）

有 `[EavRelation]` / `[MemoryRelation]` 的属性**优先用源生成扩展**（`GetXxx` / `SetXxx`）。无生成方法时：

| 方法 | 说明 |
|------|------|
| `GetValue<T>(MemoryProperty<T>)` | 同步读 Memory |
| `GetValueAsync<T>(EavProperty<T>)` | 异步读 EAV |
| `TryGetValue<T>(EavProperty<T>, out T?)` | 尝试读 EAV |
| `SetValue<T>(AttachProperty<T>, T?)` | 写入任意 Attach 属性 |

→ 完整说明：[extension-properties.md](extension-properties.md)

### Avalonia MVVM 绑定

`MioObject` 实现 `INotifyPropertyChanged` / `IMioNotifyPropertyChanged`，且 `IFeature` 根接口已声明 `Name` / `Description`，因此节点实例**可直接作为 `DataContext`**，无需为显示名单独建 ViewModel：

```xml
<!-- DataContext 为 MioObject 子类实例 -->
<TextBox Text="{Binding Name, Mode=TwoWay}" />
<TextBlock Text="{Binding Description}" />
```

`Name` / `Description` 赋值会触发 `PropertyChanged`；持久化仍经 EAV `SetName` / `SetDescription`。自定义 EAV 属性若需 UI 绑定，须自行实现 `INotifyPropertyChanged` 或在 ViewModel 中桥接（见 [extension-properties.md](extension-properties.md) §变更通知）。

---

## 2. 组与节点

```
RootNode.Root
  └── MyPlugin                         ← StartAsync 自动挂树
        └── DesktopAppSearchGroup      ← EnsureTreeLoadedAsync，ISearchableFeature
              ├── DesktopAppNode       ← IInvokeFeature + EAV
              └── DesktopAppNode
```

| 角色 | Feature | 职责 |
|------|---------|------|
| **组** | `ISearchableFeature` | `SearchAsync` 遍历**组子树**筛选结果 |
| **节点** | `IInvokeFeature` 等 | 承载 EAV，被搜索到后执行 |

```csharp
using MioKit.Sdk;

[EavType(MyPluginConst.DesktopAppSearchGroupTypeId)]
public class DesktopAppSearchGroup : MioObject, ISearchableFeature
{
    public DesktopAppSearchGroup(string id) : base(id) { }
    public override Guid MioType => MyPluginConst.DesktopAppSearchGroupType;

    public async Task SearchAsync(SearchRequest request,
        IWriteOnlyResultList<SearchResult> results, CancellationToken ct)
    {
        foreach (var node in this.GetDescendants<DesktopAppNode>())
        {
            if (!node.TryMatch(request.SearchText!, out var match, out var title))
                continue;
            results.Add(new SearchResult(request, node)
            {
                Title = title,
                MatchResult = match!.Value
            });
        }
    }
}

[EavType(MyPluginConst.DesktopAppNodeTypeId)]
public class DesktopAppNode : MioObject, IInvokeFeature, IAliasNameFeature
{
    public DesktopAppNode(string id) : base(id) { }
    public override Guid MioType => MyPluginConst.DesktopAppNodeType;
    public Task InvokeAsync(InvokeContext ctx) { /* ... */ return Task.CompletedTask; }
}
```

- 必须 `public Xxx(string id) : base(id)`
- `SearchResult.OwnerObject` 须为可执行**节点**，非搜索组 → [search.md](search.md)

---

## 3. 树遍历扩展（`MioObjectExtensions`）

所有方法均在 **`MioObject` 实例**上调用。默认 `TreeTraversalOrder.BreadthFirst`（按层）；可传 `DepthFirst`（前序深度优先）。均为迭代实现，无递归栈溢出。

### `TreeTraversalOrder`

| 值 | 访问顺序 |
|----|----------|
| `BreadthFirst` | 先同一层全部子节点，再下一层 |
| `DepthFirst` | 进入子节点后先遍历整棵子树，再访问兄弟 |

### 后代（Descendants）

| 方法 | 返回 | 说明 |
|------|------|------|
| `GetDescendants(order, includeSelf)` | `IEnumerable<MioObject>` | 所有后代 |
| `GetDescendants<T>(order, includeSelf)` | `IEnumerable<T>` | 按运行时类型过滤 |
| `GetDescendantsWithFeature<TFeature>(order, includeSelf)` | `IEnumerable<TFeature>` | 实现指定 Feature 的后代；父接口 Feature 亦命中 |
| `FindFirstDescendant<T>(match, order, includeSelf)` | `T?` | 第一个匹配的后代，可带 `Predicate<T>` |
| `FindFirstDescendantWithFeature<TFeature>(order, includeSelf)` | `TFeature?` | 第一个匹配 Feature 的后代 |

```csharp
// 搜索组内全部可执行叶子（默认广度优先）
foreach (var node in group.GetDescendants<DesktopAppNode>()) { }

// 深度优先找第一个匹配
var first = group.FindFirstDescendant<DesktopAppNode>(n => n.GetName()?.StartsWith("A") == true,
    TreeTraversalOrder.DepthFirst);

// 子树内所有热键节点
foreach (var hotkey in plugin.GetDescendantsWithFeature<IHotkeyFeature>()) { }
```

### 祖先（Ancestors）

| 方法 | 返回 | 说明 |
|------|------|------|
| `GetAncestors(includeSelf)` | `IEnumerable<MioObject>` | 沿 `Parent` 向上至 `RootNode` |
| `FindAncestor<T>(includeSelf)` | `T?` | 第一个指定类型的祖先 |
| `FindAncestorWithFeature<TFeature>(includeSelf)` | `TFeature?` | 第一个实现 Feature 的祖先 |

```csharp
var plugin = node.FindAncestor<MyPlugin>();
var searchable = node.FindAncestorWithFeature<ISearchableFeature>();
```

### 直接子节点（Children）

| 方法 | 返回 | 说明 |
|------|------|------|
| `GetChildren<T>(includeSelf)` | `IEnumerable<T>` | 直接子节点中类型为 `T` 的 |
| `GetChildrenWithFeature<TFeature>(includeSelf)` | `IEnumerable<TFeature>` | 直接子节点中实现 Feature 的 |
| `GetFirstChild<T>(includeSelf)` | `T?` | 第一个类型匹配的子节点 |
| `GetFirstChildWithFeature<TFeature>(includeSelf)` | `TFeature?` | 第一个 Feature 匹配的子节点 |

```csharp
foreach (var child in group.GetChildren<DesktopAppNode>()) { }
var first = group.GetFirstChildWithFeature<IInvokeFeature>();
```

---

## 4. Feature 查询扩展（`MioFeatureExtensions`）

基于 `FeatureRegistry` 缓存，O(1) 判断类型是否实现某 Feature（含父接口继承）。

### 实例方法（`MioObject` 上）

| 方法 | 说明 |
|------|------|
| `GetFeatureTypes()` | 该对象类型实现的所有 `IFeature` 子接口（不含 `IFeature` 自身） |
| `HasFeature<TFeature>()` | 是否实现指定 Feature |
| `GetFeature<TFeature>()` | 转为 Feature 接口；未实现返回 `default` |

```csharp
if (node.HasFeature<IInvokeFeature>())
{
    var invoke = node.GetFeature<IInvokeFeature>();
    await invoke!.InvokeAsync(ctx);
}
```

### 类型方法（`Type` 上）

| 方法 | 说明 |
|------|------|
| `type.GetMioFeatureTypes()` | 类型实现的 Feature 集合 |
| `type.HasMioFeature<TFeature>()` | 泛型判断是否实现 |
| `type.HasMioFeature(featureType)` | 非泛型重载 |

### 静态泛型（`MioFeatureExtensions` 类上）

| 方法 | 说明 |
|------|------|
| `GetFeatureTypes<T>()` | 等价于 `typeof(T).GetMioFeatureTypes()` |
| `HasFeature<T, TFeature>()` | 编译期判断 `T` 是否实现 `TFeature` |

---

## 5. RootNode 全局检索

单例 `RootNode.Root` 维护 **Feature 桶**（按 Feature 类型）与 **节点 Id 缓存**。仅 `IsAttachRootTree == true` 的节点在索引中。

| 方法 | 说明 |
|------|------|
| `GetFeatureInstances<TFeature>()` | 树上所有实现该 Feature 的节点，O(1) 桶查找 |
| `GetFeatureInstances(Type)` | 非泛型重载 |
| `GetNodeById(id)` | 按 Id 取节点 |
| `GetNodeById<T>(id)` | 按 Id 取并转型 |

```csharp
// 宿主搜索：全部搜索组
foreach (var group in MioAppContext.Current.RootNode.GetFeatureInstances<ISearchableFeature>())
    await group.SearchAsync(request, results, ct);

var node = MioAppContext.Current.RootNode.GetNodeById<MyNode>(Const.NodeId);
```

`SetParent` 返回前会 **同步** 完成索引更新（`WaitForAll`），可立即 `GetFeatureInstances`。

---

## 6. SetParent 与挂树语义

```csharp
group.SetParent(this);     // 组 → 插件根
node.SetParent(group);     // 节点 → 组
child.SetParent(null);     // 从父节点 Children 移除并卸载
```

### 两阶段变更

`SetParent(newParent)` 在父节点变化时：

1. **断开**：从旧父 `Children` 移除；若旧父已在根树上 → 发布 `DetachedTreeEventMessage`，子树 `IsAttachRootTree = false`
2. **挂载**：加入新父 `Children`；若新父已在根树上 → 发布 `AttachedTreeEventMessage`，子树 `IsAttachRootTree = true`

无论是否在根树上，均发布 `ParentChangedMessage`（供 Runtime 持久化 `ParentId`）。

| 概念 | 说明 |
|------|------|
| `IsAttachRootTree` | 仅当祖先链连到 `RootNode` 时为 `true`；**未挂根树不进 `GetFeatureInstances`** |
| `Children` | 只读视图；勿直接修改列表 |
| 事件 | `AttachedTreeEventMessage` / `DetachedTreeEventMessage` 含扁平化后代列表 |
| `IMemoryNodeFeature` | `StoreAsync` / `SetParent` 不落库；EAV 默认不落库，但 `ForcePersistence` 属性例外 → [features.md](features.md) |

### 持久化归属与卸载

插件持久化节点应优先挂在插件根节点下。用户选择删除插件数据时，宿主会自动删除插件根子树、该插件登记的 `[EavType]` 对象及后代，以及插件根子树内内存节点的 `ForcePersistence` 属性。

确实需要脱离插件根树保存节点时，必须在 `CreateDataCleanupPlanAsync` 的 `AdditionalEavRootObjectIds` 中声明这些根 ID。不要在插件代码中直接删除共享 EAV 表，也不要把其他插件根、`RootNode` 或 Framework 根加入清理计划；宿主会拒绝越权计划。完整契约见 [plugin-core.md](plugin-core.md)。

---

## 7. 启动与搜索

搜索管线、`SearchRequest` / `SearchResult` → **[search.md](search.md)**

### 典型 StartCoreAsync

```csharp
protected override async Task StartCoreAsync(CancellationToken cancellationToken)
{
    await EnsureTreeLoadedAsync<DesktopAppSearchGroup>(
        MyPluginConst.DesktopAppSearchGroupId);
}
```

### 多重子树加载（重写 `EnsureSubTreeLoadedAsync`）

当一个节点需要加载多个子节点树时，可重写 `EnsureSubTreeLoadedAsync` 集中管理：

```csharp
public override async Task EnsureSubTreeLoadedAsync()
{
    await EnsureTreeLoadedAsync<MyHotkeyNode>(MyPluginConst.HotkeyNodeId);
    // 可添加更多子树
}
```

`EnsureTreeLoadedAsync<T>(id)` 语义：先 `FindFirstDescendant<T>` 查找子树中是否已有该节点，若命中则跳过加载；否则调用 `QueryObjectAsync<T>(id, preload: true, loadChild: true)` 从库加载并 `SetParent(this)`。加载后自动挂树并发布树事件。

内存节点的自定义 `ForcePersistence` 属性也必须显式加入 `PreloadPropertySource`；标记本身只决定能否写库，不会自动修改节点的预加载列表。

### 扩展基类的 PreloadPropertySource

若节点继承自已有预加载属性的基类，可在构造函数中用 spread 语法扩展而非完全替换：

```csharp
public MyGroupNode(string id) : base(id)
{
    Name = "My Group";
    PreloadPropertySource =
    [
        ..PreloadPropertySource,
        MyGroupExtension.SomeProperty,
        // ...
    ];
}
```

| 场景 | 做法 |
|------|------|
| 固定 Id 组 + 持久化子树 | `EnsureTreeLoadedAsync<Group>(Const.GroupId)` |
| 按类型批量加载 | `QueryObjectByTypeAsync` + `BatchLoadValueAsync` + `SetParent` |
| 运行时新建叶子 | `new Node(...)` + `StoreAsync` + `SetParent(group)` |
| 首次安装创建组 | `new Group(Const.GroupId)` + `StoreAsync` + `SetParent(this)` |

---

## 8. 数据访问（`IMioDataProvider`）

`Container!.Resolve` / `MioIoc.Resolve<IMioDataProvider>()`。

### 对象 CRUD

| 方法 | 说明 |
|------|------|
| `StoreAsync` / `StoreManyAsync` | UPSERT；`IMemoryNodeFeature` 主表跳过，只有标记 `ForcePersistence` 的 EAV 可单独写入属性表 |
| `SaveObjectsAsync(objects, propertyValues?)` | 主表+属性同事务 |
| `DeleteAsync` / `DeleteManyAsync` / `DeleteByTypeAsync` | 删节点及子树 |
| `ExistsAsync` / `CountByTypeAsync` | 存在性 / 计数 |

### 查询

| 方法 | 说明 |
|------|------|
| `QueryObjectAsync<T>(id, preload?, loadChild?)` | 按 Id；`loadChild` 还原子树 |
| `QueryObjectByTypeAsync<T>(mioType, …)` | 同类型；可分页 |
| `QueryChildrenAsync` / `QueryDescendantsAsync` | 直接子 / 整棵后代 |
| `UpdateParentAsync` / `UpdateParentsAsync` | 仅回写 ParentId |
| `BatchLoadValueAsync(nodes, properties)` | 搜索前预加载 |
| `GetValueAsync` / `SetValueAsync` / `GetValuesAsync` / `SetValuesAsync` | 属性读写 |

### `EavQuery`（常规列表筛选，勿手写 SQL）

```csharp
var page = await dp.SearchAsync<MyNode>(new EavQuery()
    .OfType(MyConst.NodeType)
    .Where(MyExtension.NameProperty, EavFilterOperator.Contains, keyword)
    .OrderBy(MyExtension.SortProperty, descending: true)
    .WithPage(new PageRequest(1, 20)));
var total = await dp.CountAsync(query);
```

`SearchByPropertyAsync` 为单属性便捷重载；`QueryByRawSqlAsync` 为逃生口。

```csharp
var dp = Container!.Resolve<IMioDataProvider>();
var node = new DesktopAppNode(Guid.NewGuid().ToString());
node.SetName("记事本");
await dp.StoreAsync(node);
await dp.BatchLoadValueAsync(node, [MioFeatureExtensions.NameProperty, MyExtension.PathProperty]);
node.SetParent(group);
```

---

## 9. 检查清单

- [ ] 节点 `public Xxx(string id) : base(id)` + `[EavType]` + `override MioType`
- [ ] 搜索遍历用 `GetDescendants<T>()` / `GetDescendantsWithFeature<T>()`，勿手写递归
- [ ] 全局检索用 `RootNode.Root.GetFeatureInstances<T>()` / `GetNodeById<T>()`
- [ ] `SetParent` 后依赖 `IsAttachRootTree` 与 Feature 索引；需要时用 `OnAttachedRootTree` / `OnDetachedRootTree` 或事件总线
- [ ] 多重子树加载重写 `EnsureSubTreeLoadedAsync()`，内调 `EnsureTreeLoadedAsync<T>(id)`
- [ ] 扩展基类预加载属性用 `PreloadPropertySource = [..PreloadPropertySource, MyProperty]` 构造函数赋值
- [ ] 搜索前 `BatchLoadValueAsync`，循环内 `GetXxx()` / `TryMatch`
- [ ] Feature 判断用 `HasFeature<T>()` / `GetFeature<T>()`，勿 `is` 散落各处
