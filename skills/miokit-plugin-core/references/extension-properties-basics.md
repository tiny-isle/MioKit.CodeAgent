# 扩展属性：定义与读写

本文涵盖 EAV/Memory 选型、builder、生成 API 与预加载。缓存、通知、内置属性、设置页和高级读写 → [extension-properties-advanced.md](extension-properties-advanced.md)。节点数据经 **附加属性** 挂在 `MioObject` 上；`MioKit.SourceGenerate` 分析 `[EavRelation]` / `[MemoryRelation]` 并生成 `GetXxx` / `SetXxx`（EAV 另有 `GetXxxAsync`）。**勿手写** Get/Set。

```csharp
using MioKit.Sdk;
```

---

## 1. 选型：什么时候用什么

| 机制 | 类型 | 持久化 | 典型场景 |
|------|------|--------|----------|
| **EAV** | `EavProperty<T>` + `[EavRelation]` | ✅ 跨会话写库 | 名称、路径、热键、开关、配置 |
| **设置页配置 EAV** | `SettingEavProperty<T>` + `[EavRelation(IPluginFeature)]` | ✅ 同上，并自动生成设置 UI | 插件配置项（int/string/枚举/路径/字符串列表等） |
| **Memory** | `MemoryProperty<T>` + `[MemoryRelation]` | ❌ 仅进程内 | 已加载图像、运行时 UI 状态；需要跨插件只读时可配置稳定 Guid |
| **整节点内存** | `IMemoryNodeFeature` 标记 | 默认不落库；`ForcePersistence` 可例外 | 临时节点上的少量用户偏好（见 [features-basics.md](features-basics.md)） |
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
| Guid | 每个 EAV / SettingEav `WithId` **全局唯一**，发布后不可改；Memory 只有需要跨插件只读寻址时才配置可选 Guid。身份放进 `XxxConst`：`const string XxxPropertyId` + `static readonly Guid XxxPropertyGuid = Guid.Parse(XxxPropertyId)`。`.WithId(XxxConst.XxxPropertyGuid)`；禁止 `Guid.Parse("……")`。新值先调 MCP `generate_guid` 填 `const string` |
| 多 Feature | 同一属性可 `[EavRelation(typeof(IA), typeof(IB))]`（少见） |
| 文档 | 新增属性同步 `docs/features-and-properties.md` |

### EAV 示例

```csharp
public static partial class MyExtension
{
    [EavRelation(typeof(IMyNodeFeature))]
    public static EavProperty<string> PathProperty { get; } =
        EavPropertyBuilder<string>.Create()
            .WithId(MyPluginConst.PathPropertyGuid)
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

### 跨插件只读属性

需要让其他插件按稳定 Guid 读取属性时，EAV 属性直接使用已有的 `EavProperty.Id`；
只有确实需要跨插件寻址的 Memory 属性才调用 `MemoryPropertyBuilder<T>.WithId(Guid)`。
未配置 Id 的 Memory 属性仍可在拥有者插件内正常读写，但不能被其他插件按 Guid 读取。

```csharp
[MemoryRelation(typeof(IMyRuntimeStateFeature))]
public static MemoryProperty<string> StatusProperty { get; } =
    MemoryPropertyBuilder<string>.Create()
        .WithId(MyPluginConst.StatusPropertyGuid)
        .WithName("Status")
        .Build();

// 调用方不需要引用属性拥有者的程序集，只需持有发布的稳定 Guid。
var result = await context.TargetObject.ReadPropertyAsync<string>(
    MyPluginConst.StatusPropertyGuid,
    cancellationToken);

if (result.IsSuccess)
{
    var status = result.Value;
}
```

`ReadPropertyAsync<T>` 是只读 API，泛型 `T` 必须与属性声明的值类型匹配。宿主扫描带有
`[EavRelation]` 或 `[MemoryRelation]` 的公开静态属性，并使用拥有者声明的原始属性实例读取，
因此 EAV 的存储类型、转换器、缓存/默认值和 Memory 属性的原有索引行为保持不变。当前
不提供跨插件写入 API；需要修改目标插件状态时使用目标插件公开的 Plugin Call。

| 错误码 | 含义 |
|---|---|
| `property.not_registered` | Guid 未登记，包括未配置 Id 的 Memory 属性 |
| `property.type_mismatch` | 请求的泛型类型与属性声明类型不一致 |
| `property.ambiguous` | 多个已加载属性声明了相同 Guid，读取被拒绝 |
| `property.read_failed` | 属性读取过程失败 |

取消会继续抛出 `OperationCanceledException`，不会转换成普通 `Result` 失败；其他读取异常
会以 `Result<T?>.Failure(...)` 返回。`MioType` 和公开属性 Guid 都是跨插件稳定契约，
发布后不要随意更换。

### EAV 构建器常用项

| 方法 | 说明 |
|------|------|
| `WithId(Guid)` | EAV / SettingEav **必填**；Memory 仅跨插件只读寻址时可选；引用 `XxxConst.XxxPropertyGuid`，禁止内联字面量 |
| `WithName(string)` | 逻辑名 |
| `WithPolicy(EavCachePolicy)` | 缓存策略（见 [扩展属性高级用法](extension-properties-advanced.md) §1） |
| `WithStoreType(MioStoreType)` | 库列类型映射 |
| `WithPropertyConvert(IMioPropertyConvert)` | 复杂类型序列化（如 `HotKeyConvert`、`AliasNameConvert`） |
| `WithDefaultValue(T)` | 未存库时的默认值 |
| `WithForcePersistence(bool = true)` | 仅绕过 `IMemoryNodeFeature` 的 EAV 写入过滤；仍走宿主异步批处理，不保证同步落盘 |

`SettingEavPropertyBuilder<T>` 另有：`WithDisplayName` · `WithDescription` · `WithGroup` · `WithOrder` · `WithEditor`（见 [设置页自动配置](extension-properties-advanced.md)）。默认 `Absolute` 缓存；`StringList` / `Enum` / `Boolean` 会按需自动选择 Convert 与 StoreType。

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

