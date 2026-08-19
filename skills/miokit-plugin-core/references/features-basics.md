# Feature：节点与基础行为

本文涵盖节点与基础行为。需要结果操作、附着搜索框、插件或窗口 Feature → [features-search-and-ui.md](features-search-and-ui.md)；生成 Get/Set、内置 EAV → [extension-properties.md](extension-properties.md)。

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

