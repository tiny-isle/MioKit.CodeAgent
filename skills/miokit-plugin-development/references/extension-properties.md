# 扩展属性（Attach Property）

EAV/Memory 设计、builder、生成 API、内置属性与变更通知均见本文。节点数据经 **附加属性** 挂在 `MioObject` 上；`MioKit.SourceGenerate` 分析 `[EavRelation]` / `[MemoryRelation]` 并生成 `GetXxx` / `SetXxx`（EAV 另有 `GetXxxAsync`）。**勿手写** Get/Set。

```csharp
using MioKit.Sdk;
```

---

## 1. 选型：什么时候用什么

| 机制 | 类型 | 持久化 | 典型场景 |
|------|------|--------|----------|
| **EAV** | `EavProperty<T>` + `[EavRelation]` | ✅ 跨会话写库 | 名称、路径、热键、开关、配置 |
| **设置页配置 EAV** | `SettingEavProperty<T>` + `[EavRelation(IPluginFeature)]` | ✅ 同上，并自动生成设置 UI | 插件配置项（int/string/枚举/路径/字符串列表等） |
| **Memory** | `MemoryProperty<T>` + `[MemoryRelation]` | ❌ 仅进程内 | 已加载图像、运行时 UI 状态 |
| **整节点内存** | `IMemoryNodeFeature` 标记 | 默认不落库；`ForcePersistence` 可例外 | 临时节点上的少量用户偏好（见 [features.md](features.md)） |
| **无 Relation** | 直接 `EavProperty` 字段 | ✅ 但不生成扩展 | 极少用；读写走 `MioObject.GetValueAsync` / `SetValue` |

```
需要跨重启保留？ ──是──► 需要设置中心自动表单？ ──是──► SettingEavProperty（仅 IPluginFeature）
        │                          │
        │                          否──► EavProperty
        否──► 仅单个字段临时？ ──是──► MemoryProperty
                    │
                    否──► 整节点临时？ ──是──► IMemoryNodeFeature
```

---

## 2. 定义规范

| 要求 | 说明 |
|------|------|
| 目录与文件 | Feature 接口与 `partial` 扩展类与复杂值转换器**成对同目录** `Features/`（与 Sdk `Features/` 布局一致 |
| 扩展类 | `public static partial class XxxExtension` |
| 字段名 | 以 `Property` 结尾，如 `PathProperty` → 生成 `GetPath` / `SetPath` |
| EAV | `[EavRelation(typeof(IFeature))]` + `EavPropertyBuilder<T>.Create()...Build()` |
| Memory | `[MemoryRelation(typeof(IFeature))]` + `MemoryPropertyBuilder<T>.Create()...Build()` |
| Guid | 每个 EAV `WithId` **全局唯一**；插件发布后不可改 |
| 多 Feature | 同一属性可 `[EavRelation(typeof(IA), typeof(IB))]`（少见） |
| 文档 | 新增属性同步 `docs/features-and-properties.md` |

### EAV 示例

```csharp
public static partial class MyExtension
{
    [EavRelation(typeof(IMyNodeFeature))]
    public static EavProperty<string> PathProperty { get; } =
        EavPropertyBuilder<string>.Create()
            .WithId(Guid.Parse("新 GUID"))
            .WithName("Path")
            .WithPolicy(EavCachePolicy.Absolute)
            .WithStoreType(MioStoreType.String)
            .Build();
}
```

### Memory 示例

```csharp
[MemoryRelation(typeof(IMyRuntimeStateFeature))]
public static MemoryProperty<long> RevisionProperty { get; } =
    MemoryPropertyBuilder<long>.Create().WithName("Revision").Build();
```

Memory 适合轻量运行时状态。解码图片应由 `IIconLease` 管理，不要长期挂在节点属性上。

### EAV 构建器常用项

| 方法 | 说明 |
|------|------|
| `WithId(Guid)` | **必填**；对应库表属性主键 |
| `WithName(string)` | 逻辑名 |
| `WithPolicy(EavCachePolicy)` | 缓存策略（见 §4） |
| `WithStoreType(MioStoreType)` | 库列类型映射 |
| `WithPropertyConvert(IMioPropertyConvert)` | 复杂类型序列化（如 `HotKeyConvert`、`AliasNameConvert`） |
| `WithDefaultValue(T)` | 未存库时的默认值 |
| `WithForcePersistence(bool = true)` | 仅绕过 `IMemoryNodeFeature` 的 EAV 写入过滤；仍走宿主异步批处理，不保证同步落盘 |

`SettingEavPropertyBuilder<T>` 另有：`WithDisplayName` · `WithDescription` · `WithGroup` · `WithOrder` · `WithEditor`（见 §7 设置页自动配置）。默认 `Absolute` 缓存；`StringList` / `Enum` / `Boolean` 会按需自动选择 Convert 与 StoreType。

### 值类型 / 引用类型与可空声明

源生成器为 **Get / GetAsync / Set** 统一生成**可空 API 类型**（例如 `bool?`、`string?`、`HotKeyInfo?`），以便 `SetXxx(null)` 表示清除或未设置。

底层 `AttachProperty<T>.SetValue(MioObject, T? value)` 的可空语义取决于**属性定义时的泛型 `T`**，声明方式不同：

| 值种类 | 推荐属性声明 | 生成 API 示例 | 说明 |
|--------|--------------|---------------|------|
| **引用类型**（`string`、`List<string>` 等） | `EavProperty<string>` 或 `EavProperty<string?>` | `GetName()` → `string?`；`SetName(string? value)` | 引用类型可直接用；语义上允许 `null` 时建议泛型写 `string?` |
| **值类型**（`bool`、`int`、`DateTime` 等） | `EavProperty<bool?>`、`EavProperty<int?>` | `SetIsPinned(bool? value)` | **必须**把泛型声明为 `T?`，否则生成的 `SetXxx` 无法传入 `null` |
| **struct**（`HotKeyInfo` 等） | `EavProperty<HotKeyInfo?>` | `SetHotkey(HotKeyInfo? value)` | 同值类型，需 `T?` 才能 Set 可空 |
| **已是可空泛型** | `EavProperty<DateTime?>` | `SetLastUseTime(DateTime? value)` | 不要写成 `DateTime??` |

```csharp
// ✅ 引用类型 — 可直接 Set null
[EavRelation(typeof(IFeature))]
public static EavProperty<string> NameProperty { get; } = ...;
// 生成: SetName(string? value)

// ✅ bool / int — 泛型必须是 T?
[EavRelation(typeof(IIgnoreSearchFeature))]
public static EavProperty<bool?> IgnoreSearchProperty { get; } =
    EavPropertyBuilder<bool?>.Create()
        .WithStoreType(MioStoreType.Boolean)
        .WithPropertyConvert(BoolPropertyConvert.Instance)
        .Build();
// 生成: SetIgnoreSearch(bool? value)

// ✅ struct — 泛型必须是 T?
[EavRelation(typeof(IHotkeyFeature))]
public static EavProperty<HotKeyInfo?> HotkeyProperty { get; } =
    EavPropertyBuilder<HotKeyInfo?>.Create()
        .WithPropertyConvert(HotKeyConvert.Instance)
        .Build();
// 生成: SetHotkey(HotKeyInfo? value)

// ❌ 值类型 / struct 不要只写非可空 T
public static EavProperty<bool> FlagProperty { get; } = ...;
// 生成 SetFlag(bool? value) 将与 SetValue(..., bool? value) 不兼容
```

**Memory 属性**（`MemoryProperty<T>` + `[MemoryRelation]`）规则相同：值类型与 struct 请声明为 `MemoryProperty<bool?>` 等；生成 `SetXxx` 同样为可空参数。

**读取**：`GetXxx()` / `GetXxxAsync()` 始终返回可空类型；值类型未命中时可配合 `?? defaultValue` 使用（见 `RecentExtension.IncreaseAsync`）。

### `MioStoreType` 常用值

`String` · `Integer` · `LongInteger` · `Float` · `Decimal` · `Boolean` · `DateTime` · `LongText` · `Binary`

---

## 3. 生成 API 与读写时机

源生成器为每个 `[EavRelation]` / `[MemoryRelation]` 绑定生成扩展方法，接收者为 **Feature 接口**（非 `MioObject`），内部通过 `obj.CoreObject` 访问 Store。

### 在 `MioObject` 子类内调用：必须带 `this.`

生成方法是 C# **扩展方法**，挂在 `IPinnedFeature`、`IIconProviderFeature` 等接口上，**不会**变成节点类的实例成员。在 `class MyNode : MioObject, IPinnedFeature` 的方法体里：

```csharp
// ✅ 正确
var pinned = this.GetIsPinned();
this.SetIgnoreSearch(true);
await this.GetPathAsync();

// ❌ 编译错误 — 当前类型没有名为 GetIsPinned 的方法
var pinned = GetIsPinned();
```

| 情况 | 说明 |
|------|------|
| 类体内读写本节点 EAV/Memory | 一律 `this.GetXxx()` / `this.SetXxx()` |
| 局部变量已是 `IPinnedFeature feature` | `feature.GetIsPinned()` 即可（接收者类型为接口） |
| `Name` / `Description` | `MioObject` 上的 CLR 属性，可直接赋值 `Name = "标题"` |
| `MioObjectExtensions`（`GetDescendants` 等） | 同样在子类体内须 `this.GetDescendants<T>()` |

### EAV（`PathProperty` → `Path`）

| 方法 | 说明 | 何时用 |
|------|------|--------|
| `GetPath()` | 同步读**内存缓存** | 已 `BatchLoad`、刚 `SetPath`、搜索热路径 |
| `GetPathAsync()` | 异步读，必要时落库加载 | 首次读、UI 展示、不确定已加载 |
| `SetPath(value)` | 写入并标记脏数据；宿主异步刷盘；参数可空（见 §2） | 任何业务写 |

### Memory（`RevisionProperty` → `Revision`）

| 方法 | 说明 |
|------|------|
| `GetRevision()` | 同步读内存 |
| `SetRevision(value)` | 写入内存；**无 Async** |

### 使用原则

1. **优先生成 API**，不要直接 `node.GetValueAsync(EavProperty)`（无 Relation 的私有属性除外）
2. **读**：不确定已加载 → `GetXxxAsync()`；搜索循环内已 BatchLoad → `GetXxx()`
3. **写**：一律 `SetXxx()`；不要手动 Save
4. 可在同一 `partial class` 手写便捷方法（如 `RecentExtension.IncreaseAsync`）

```csharp
// 启动 / 挂树后预加载搜索字段
await dp.BatchLoadValueAsync(nodes, [
    MioFeatureExtensions.NameProperty,
    AliasNameExtension.AliasNameProperty,
    MyExtension.PathProperty
]);

// 搜索循环 — 同步读（在 MioObject 子类 SearchAsync 等方法体内须 this.）
foreach (var node in group.GetDescendants<MyNode>())
{
    var path = node.GetPath();   // node 为局部变量，扩展接收者已是 MyNode
    if (node.TryMatch(request.SearchText!, out var match, out var title)) { ... }
}
```

### `PreloadPropertySource`

节点 / 插件重写 `PreloadPropertySource`，在 `StoreAsync` / `EnsurePluginStoreAsync` 时自动 `BatchLoad`。

属性声明为 `protected init`（非 virtual，**不可 override**），子类在构造函数中用 spread 语法扩展基类默认列表：

```csharp
public MyNode(string id) : base(id)
{
    PreloadPropertySource =
    [
        ..PreloadPropertySource,
        MyExtension.PathProperty,
    ];
}
```

基类默认值见 [nodes-and-tree.md](nodes-and-tree.md) §1 与 [plugin-core.md](plugin-core.md)。

---

## 4. EAV 缓存策略 `EavCachePolicy`

| 值 | 行为 | 建议 |
|----|------|------|
| `None` | 每次访问可打库 | 极少用 |
| `Absolute` | 加载后常驻内存直至变更 | **Name、热键、配置**等高频读 |
| `Sliding` | 访问后一段时间内缓存，超时淘汰 | 大字段、低频读 |

搜索/展示字段建议 `Absolute` + 启动时 `BatchLoadValueAsync`。

---

## 5. 变更通知

属性写入（`SetXxx` / `SetValue`）且值实际变化时，多层通知按序触发：

```
SetXxx(value)
  → Store 更新 ValueEntry（IsDirty）
  → [EAV] EventBus 发布 MioPropertyChangedEventMessage（宿主异步写库）
  → MioObject.PropertyChanged（属性名）
  → MioObject.MioPropertyChanged（粗粒度，无细节）
  → AttachProperty<T>.Changed（IObservable，含新旧值）
```

### `AttachProperty.Changed`（推荐：监听某一属性）

任意节点上该属性变更都会推送，适合全局桥接（如热键重新注册）：

```csharp
HotkeyExtension.HotkeyProperty.Changed.Subscribe(
    new AnonymousObserver<PropertyChangedArgs<HotKeyInfo?>>(args =>
    {
        var node = args.MioObject;
        if (node is IHotkeyFeature f && node.IsAttachRootTree)
            RegisterOrUpdate(f);
    }));
```

`PropertyChangedArgs<T>` 字段：

| 成员 | 说明 |
|------|------|
| `MioObject` | 发生变更的节点 |
| `AttachProperty` | 属性元数据实例 |
| `OldValue` / `NewValue` | 新旧值 |

### `MioObject` 实例事件

| 事件 | 说明 |
|------|------|
| `PropertyChanged` | 标准 `INotifyPropertyChanged`；`PropertyChangedEventArgs.PropertyName` 为属性名 |
| `MioPropertyChanged` | 任意 Attach 属性变更时触发；**无具体属性信息** |

适合 UI 绑定刷新整节点；细粒度监听优先用 `XxxProperty.Changed`。

### `MioPropertyChangedEventMessage`（宿主 / 高级）

EAV 写入时由 Runtime 发布到 `EventBus`。插件可实现 `IMioEventHandler<MioPropertyChangedEventMessage>` 做跨模块响应（少见；多数用 `Changed` 即可）。

---

## 6. SDK 内置属性速查

| 属性字段 | 绑定 Feature | 存储 | 生成方法 |
|----------|--------------|------|----------|
| `MioFeatureExtensions.NameProperty` | `IFeature` | EAV | `IFeature.Name`；`GetName` / `GetNameAsync` / `SetName` |
| `MioFeatureExtensions.DescriptionProperty` | `IFeature` | EAV | `IFeature.Description`；`GetDescription` / `GetDescriptionAsync` / `SetDescription` |
| `IconExtensions.CachedIconIdProperty` | `IIconProviderFeature` | EAV | `GetCachedIconId` / `GetCachedIconIdAsync` / `SetCachedIconId`；只保存 `IIconService` 返回的 `IconId` |
| `IconExtensions.IconRevisionProperty` | `IIconProviderFeature` | Memory | `InvalidateIcon()`；只用于通知控件重新请求 lease |
| `AliasNameExtension.AliasNameProperty` | `IAliasNameFeature` | EAV + Convert | `GetAliasName` / `GetAliasNameAsync` / `SetAliasName` |
| `AttachPanelExtension.UserSearchCommandsProperty` | `IAttachPanelFeature` | EAV + Convert + ForcePersistence | `GetUserSearchCommands` / `GetUserSearchCommandsAsync` / `SetUserSearchCommands` |
| `HotkeyExtension.HotkeyProperty` | `IHotkeyFeature` | EAV + Convert + ForcePersistence | `GetHotkey` / `GetHotkeyAsync` / `SetHotkey` |
| `PinnedExtension.IsPinnedProperty` | `IPinnedFeature` | EAV + ForcePersistence | `GetIsPinned` / `SetIsPinned` … |
| `PinnedExtension.PinnedOrderProperty` | `IPinnedFeature` | EAV + ForcePersistence | 同上 |
| `RecentExtension.UseCountProperty` | `IUseFeature` | EAV | `GetUseCount` / `SetUseCount` … |
| `RecentExtension.LastUseTimeProperty` | `IUseFeature` | EAV | `GetLastUseTime` / `SetLastUseTime` … |
| `IgnoreSearchExtension.IgnoreSearchProperty` | `IIgnoreSearchFeature` | EAV + ForcePersistence | `GetIgnoreSearch` / `SetIgnoreSearch` |
| `PluginExtension.IsEnabledProperty` | `IPluginFeature` | EAV | `GetIsEnabled` / `SetIsEnabled` |

手写便捷方法示例：`RecentExtension.IncreaseAsync(IUseFeature)`。

`HotKeyInfo`：`new HotKeyInfo(TypeExactMatch, KeyCode.Control, KeyCode.A)`；`IsValid()` / `Keys` / `Value`。

各 Feature 接口职责 → [features.md](features.md)。

---

## 7. 插件自定义属性

```csharp
// Features/IMyFeature.cs
public interface IMyFeature : IFeature;

// Features/IMyFeature.Extensions.cs
public static partial class MyExtension
{
    [EavRelation(typeof(IMyFeature))]
    public static EavProperty<string> PathProperty { get; } =
        EavPropertyBuilder<string>.Create()
            .WithId(Guid.Parse("..."))
            .WithName("Path")
            .WithPolicy(EavCachePolicy.Absolute)
            .WithStoreType(MioStoreType.String)
            .Build();
}

// Nodes/MyNode.cs — 实现 IMyFeature 后即可（类体内须 this.）：
this.SetPath(@"C:\app.exe");
var path = await this.GetPathAsync();
```

复杂类型实现 `IMioPropertyConvert`，在 `WithPropertyConvert` 中注册。插件内可按需放到 `Converters/` 或所属 `Features/` 附近；若只是 JSON 长文本，可优先使用 SDK 提供的 `JsonLongTextConvert<T>`。

### 插件设置页自动配置（`SettingEavProperty`）

需要在宿主「插件功能设置 → 配置」中自动生成可编辑表单项时，使用 `SettingEavProperty<T>`（继承 `EavProperty<T>`），且 **`[EavRelation]` 只能映射到 `IPluginFeature` 派生接口**（源生成器诊断 `MIOKIT001`）。`IPlugin` / 插件根本身就是 `IPluginFeature`，可直接挂插件级配置。

```csharp
public interface IMyPluginFeature : IPluginFeature;

public static partial class MyPluginExtension
{
    [EavRelation(typeof(IMyPluginFeature))]
    public static SettingEavProperty<int?> MaxItemsProperty { get; } =
        SettingEavPropertyBuilder<int?>.Create()
            .WithId(Guid.Parse("新 GUID"))
            .WithName("MaxItems")
            .WithDisplayName("最大条目数")
            .WithDescription("超过该数量时忽略新结果")
            .WithGroup("扫描")
            .WithOrder(10)
            .WithEditor(SettingEditorKind.Integer) // 可省略，按 T 推断
            .WithDefaultValue(100)
            .Build();

    [EavRelation(typeof(IMyPluginFeature))]
    public static SettingEavProperty<List<string>> ScanDirectoriesProperty { get; } =
        SettingEavPropertyBuilder<List<string>>.Create()
            .WithId(Guid.Parse("新 GUID"))
            .WithName("ScanDirectories")
            .WithDisplayName("扫描目录")
            .WithEditor(SettingEditorKind.StringList)
            // 默认使用 JsonLongTextConvert<List<string>>
            .WithDefaultValue([])
            .Build();

    [EavRelation(typeof(IMyPluginFeature))]
    public static SettingEavProperty<MyMode?> ModeProperty { get; } =
        SettingEavPropertyBuilder<MyMode?>.Create()
            .WithId(Guid.Parse("新 GUID"))
            .WithName("Mode")
            .WithDisplayName("模式")
            .WithEditor(SettingEditorKind.Enum)
            // 默认 EnumIntegerConvert<MyMode>；下拉显示 [Description]
            .Build();
}

public enum MyMode
{
    [Description("快速")]
    Fast,
    [Description("完整")]
    Full,
}
```

| `SettingEditorKind` | 典型 `T` | UI |
|---------------------|----------|----|
| `String` / `LongText` | `string` | 单行 / 多行文本 |
| `StringList` | `List<string>` | TagsInput；默认 `JsonLongTextConvert<List<string>>` |
| `Integer` / `Float` / `Boolean` | `int?` / `double?` / `bool?` | 数字框 / 开关 |
| `Enum` | `MyEnum?` | 下拉；标签优先 `[Description]` |
| `FilePath` / `FolderPath` | `string` | 路径输入 + 系统选择器 |

**约束与行为：**

- 仅插件 **Running** 后可在设置中心读写；未启动时配置 Tab 提示不可用。
- 宿主扫描插件程序集中的 `SettingEavProperty` 静态属性，按 Relation Feature 在插件子树中找实例生成表单。
- **快捷键不要用 SettingEavProperty**：节点实现 `IHotkeyFeature` 后，由「快捷键」Tab 自动扫描编辑。
- 复杂向导/表格 UI 仍用 `IPluginConfigWindowFeature` 自定义配置窗。

Builder 额外项：`WithDisplayName` · `WithDescription` · `WithGroup` · `WithOrder` · `WithEditor`。默认缓存策略为 `Absolute`。

### 无 Relation 的底层读写

| 方法 | 用途 |
|------|------|
| `GetValueAsync` / `TryGetValue` | EAV |
| `GetValue`（Memory） | Memory |
| `SetValue` | 任意 Attach |

未挂 Relation 时不生成扩展，直接：

```csharp
await node.GetValueAsync(MyExtension.PathProperty);
node.SetValue(MyExtension.PathProperty, value);
```

---

## 8. 与 `IMemoryNodeFeature` 的关系

实现 `IMemoryNodeFeature` 的节点默认跳过 EAV 写入、`StoreAsync` 与 `SetParent` 落库。属性定义调用 `.WithForcePersistence()` 后，该 EAV 可绕过内存节点过滤，仍由宿主异步批处理写入。

强制属性若要在新节点实例挂树时同步可读，必须显式加入该节点的 `PreloadPropertySource`；插件自定义属性不会被宿主自动加入。插件内存节点应位于插件根子树中，宿主才能记录清理所有权；用户卸载插件并选择删除数据时，这些属性会一并删除。

`MemoryProperty` 是**单属性**内存；`IMemoryNodeFeature` 是**整节点**不落库。二者可叠加理解，详见 [features.md](features.md) § IMemoryNodeFeature。

---

## 9. 检查清单

- [ ] `Features/IMyFeature.cs` + `Features/IMyFeature.Extensions.cs`；`partial` 扩展类 + `Property` 后缀 + 新 EAV Guid
- [ ] 持久化字段用 `EavProperty`；仅运行时缓存用 `MemoryProperty`
- [ ] 内存节点上确需跨重启的偏好使用 `.WithForcePersistence()`，并加入 `PreloadPropertySource`
- [ ] 搜索字段 `Absolute` + `PreloadPropertySource`（构造器内 `[..PreloadPropertySource, MyProperty]`）/ `BatchLoadValueAsync`
- [ ] 搜索循环 `this.GetXxx()`（类体内须 `this.`）；首次展示 `GetXxxAsync()`
- [ ] 监听变更用 `XxxProperty.Changed` 或节点 `PropertyChanged`
- [ ] 插件设置自动表单用 `SettingEavProperty` + `[EavRelation(typeof(IPluginFeature派生))]`；快捷键用 `IHotkeyFeature`
- [ ] 已更新 `docs/features-and-properties.md`
