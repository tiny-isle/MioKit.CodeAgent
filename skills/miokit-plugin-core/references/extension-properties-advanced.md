# 扩展属性：缓存、通知与高级用法

本文用于已经定义属性后的缓存、事件、SDK 内置属性、设置页和低层读写。普通 EAV/Memory 定义、生成访问器和预加载 → [extension-properties-basics.md](extension-properties-basics.md)。

---

## 1. EAV 缓存策略 `EavCachePolicy`

| 值 | 行为 | 建议 |
|----|------|------|
| `None` | 每次访问可打库 | 极少用 |
| `Absolute` | 加载后常驻内存直至变更 | **Name、热键、配置**等高频读 |
| `Sliding` | 访问后一段时间内缓存，超时淘汰 | 大字段、低频读 |

搜索/展示字段建议 `Absolute` + 启动时 `BatchLoadValueAsync`。

---

## 2. 变更通知

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

## 3. SDK 内置属性速查

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

## 4. 插件自定义属性

```csharp
// Features/IMyFeature.cs
public interface IMyFeature : IFeature;

// Features/IMyFeature.Extensions.cs
public static partial class MyExtension
{
    [EavRelation(typeof(IMyFeature))]
    public static EavProperty<string> PathProperty { get; } =
        EavPropertyBuilder<string>.Create()
            .WithId(MyPluginConst.PathPropertyGuid)
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
public static class MyPluginConst
{
    // 与 Type 相同成对。示例 Guid 勿抄；真实插件先 generate_guid 再填 const string。
    public const string MaxItemsPropertyId = "B8D41E06-2C9A-4F71-8E3B-5A17C0D94E62";
    public static readonly Guid MaxItemsPropertyGuid = Guid.Parse(MaxItemsPropertyId);
    public const string ScanDirectoriesPropertyId = "3C5E7A91-8B24-4D06-A1F0-9E6B2C48D735";
    public static readonly Guid ScanDirectoriesPropertyGuid = Guid.Parse(ScanDirectoriesPropertyId);
    public const string ModePropertyId = "E2F09B47-1A53-4C8D-B6E4-0D7A83F15C29";
    public static readonly Guid ModePropertyGuid = Guid.Parse(ModePropertyId);
}

public interface IMyPluginFeature : IPluginFeature;

public static partial class MyPluginExtension
{
    [EavRelation(typeof(IMyPluginFeature))]
    public static SettingEavProperty<int?> MaxItemsProperty { get; } =
        SettingEavPropertyBuilder<int?>.Create()
            .WithId(MyPluginConst.MaxItemsPropertyGuid)
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
            .WithId(MyPluginConst.ScanDirectoriesPropertyGuid)
            .WithName("ScanDirectories")
            .WithDisplayName("扫描目录")
            .WithEditor(SettingEditorKind.StringList)
            // 默认使用 JsonLongTextConvert<List<string>>
            .WithDefaultValue([])
            .Build();

    [EavRelation(typeof(IMyPluginFeature))]
    public static SettingEavProperty<MyMode?> ModeProperty { get; } =
        SettingEavPropertyBuilder<MyMode?>.Create()
            .WithId(MyPluginConst.ModePropertyGuid)
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

## 5. 与 `IMemoryNodeFeature` 的关系

实现 `IMemoryNodeFeature` 的节点默认跳过 EAV 写入、`StoreAsync` 与 `SetParent` 落库。属性定义调用 `.WithForcePersistence()` 后，该 EAV 可绕过内存节点过滤，仍由宿主异步批处理写入。

强制属性若要在新节点实例挂树时同步可读，必须显式加入该节点的 `PreloadPropertySource`；插件自定义属性不会被宿主自动加入。插件内存节点应位于插件根子树中，宿主才能记录清理所有权；用户卸载插件并选择删除数据时，这些属性会一并删除。

`MemoryProperty` 是**单属性**内存；`IMemoryNodeFeature` 是**整节点**不落库。二者可叠加理解，详见 [features-basics.md](features-basics.md) 的 `IMemoryNodeFeature`。

---

## 6. 检查清单

- [ ] `Features/IMyFeature.cs` + `Features/IMyFeature.Extensions.cs`；`partial` 扩展类 + `Property` 后缀；EAV `WithId` 用 Const 成对 Guid（`generate_guid` 填 `const string`，禁止内联字面量）
- [ ] 持久化字段用 `EavProperty`；仅运行时缓存用 `MemoryProperty`
- [ ] 内存节点上确需跨重启的偏好使用 `.WithForcePersistence()`，并加入 `PreloadPropertySource`
- [ ] 搜索字段 `Absolute` + `PreloadPropertySource`（构造器内 `[..PreloadPropertySource, MyProperty]`）/ `BatchLoadValueAsync`
- [ ] 搜索循环 `this.GetXxx()`（类体内须 `this.`）；首次展示 `GetXxxAsync()`
- [ ] 监听变更用 `XxxProperty.Changed` 或节点 `PropertyChanged`
- [ ] 插件设置自动表单用 `SettingEavProperty` + `[EavRelation(typeof(IPluginFeature派生))]`；快捷键用 `IHotkeyFeature`
- [ ] 已更新 `docs/features-and-properties.md`
