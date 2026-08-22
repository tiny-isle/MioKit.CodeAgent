# 搜索结果操作（ResultAction）

实现规范、内置 action、Alt 弹层与接口均见本文。类型在 `MioKit.Sdk`。

ResultAction 为某条 `SearchResult` 提供额外操作，例如固定到首页、忽略搜索、管理别名、设置全局快捷键或插件自定义命令。

---

## 1. 何时需要

| 需求 | 做法 |
|------|------|
| 仅执行默认结果（回车） | 节点实现 `IInvokeFeature` 即可 |
| 结果项需要固定、忽略、别名、热键等通用菜单 | 节点实现对应 Feature，并在 `GetActionAsync` 返回 SDK 内置 Action |
| 插件需要自定义菜单项 | 节点实现 `IResultActionProviderFeature`，自定义 action 继承 `SearchResultActionBase` |

宿主在当前选中结果变化时检查 `SearchResult.OwnerObject`。若其实现 `IResultActionProviderFeature`，宿主调用 `GetActionAsync` 取得操作列表；用户按 `Alt` 打开操作弹层后可搜索、选择并执行操作。

---

## 2. 核心类型

### `IResultActionProviderFeature`

```csharp
public interface IResultActionProviderFeature : IFeature
{
    ValueTask<IEnumerable<ISearchResultAction>> GetActionAsync(SearchResult searchResult);
}
```

约定：

- 通常在**可执行叶子节点**上实现，并与 `IInvokeFeature` 同节点。
- 根据当前节点状态返回可用操作，例如已固定时返回 `CancelPinAction`，未固定时返回 `PinAction`。
- 结果为空时宿主不显示操作弹层。
- 无异步 IO 时返回 `ValueTask.FromResult<IEnumerable<ISearchResultAction>>(actions)`。

### `ISearchResultAction`

```csharp
public interface ISearchResultAction : IShadCommandItem
{
    Task ExecuteAsync(
        SearchResult result,
        InvokeContext context,
        CancellationToken cancellationToken);
}
```

UI 读取的常用属性来自 `IShadCommandItem` / `SearchResultActionBase`：

| 属性 | 用途 |
|------|------|
| `Text` | 操作标题；也是 Alt 弹层筛选匹配字段 |
| `Group` | 分组标题；相同分组按首次出现顺序聚合 |
| `Icon` | 图标；内置 action 使用 `LucideIconKind` |
| `Shortcut` | 快捷键提示文本 |
| `IsEnabled` | 操作启用状态 |
| `Classes` | UI 样式类 |

### `SearchResultActionBase`

自定义操作推荐继承此基类。它已提供 `Text` / `Group` / `Icon` / `Shortcut` / `IsEnabled` / `Classes` 等 UI 绑定属性，并创建默认异步 `Command` 管道。插件通常只需设置显示属性并实现 `ExecuteAsync`。

宿主当前直接调用 `ExecuteAsync(result, InvokeContext.FromAction(result), ct)`；不要依赖手动设置 `CommandParameter`。

---

## 3. SDK 内置操作

| 类 | 单例入口 | 前置 Feature | 默认分组 | 行为 |
|----|----------|--------------|----------|------|
| `PinAction` | `PinAction.Instance` | `IPinnedFeature` | `通用设置` | 固定到首页，设置 `IsPinned` |
| `CancelPinAction` | `CancelPinAction.Instance` | `IPinnedFeature` | `通用设置` | 取消固定 |
| `IgnoreAction` | `IgnoreAction.Instance` | `IIgnoreSearchFeature` | `通用设置` | 标记忽略搜索 |
| `AliasNameAction` | `AliasNameAction.Instance` | `IAliasNameFeature` | `通用设置` | 打开别名管理对话框 |
| `HotKeyAction` | `HotKeyAction.Instance` | `IHotkeyFeature` | `通用设置` | 打开全局快捷键设置对话框 |

节点须实现对应 Feature。SourceGenerate 会为内置 EAV 生成 `GetIsPinned` / `SetIsPinned` 等方法；在 `MioObject` 子类内调用时须写 `this.GetIsPinned()` 等（见 [extension-properties.md](extension-properties.md) §3、§6）。

内置 action 无单次结果状态，普通场景直接返回 `*.Instance`。如果插件需要改显示名、分组、图标或启用状态，可创建自己的实例或继承 `SearchResultActionBase` 实现自定义 action。

---

## 4. 宿主交互行为

```text
SearchAsync → SearchResult(OwnerObject = 可执行叶子节点)
  → 当前结果变化 → OwnerObject.GetActionAsync(result)
  → 用户按 Alt → 打开操作弹层
  → 输入筛选文本 → 按 action.Text 模糊匹配
  → 上/下移动，Enter 或鼠标点击
  → action.ExecuteAsync(result, InvokeContext.FromAction(result), ct)
```

操作弹层规则：

- 只在搜索结果列表模式、当前结果有 action、未附着搜索框、未显示右侧内容时打开。
- 弹层按 `Group` 分组渲染；空 `Group` 不显示分组标题。
- 筛选只匹配 `Text`。
- `Esc` 收起操作弹层，不隐藏搜索框。
- 执行 action 后宿主关闭操作弹层；action 内可调用宿主服务显示对话框或重置 overlay。

---

## 5. 节点示例

```csharp
public class ActionNode : MioObject,
    IInvokeFeature,
    IPinnedFeature,
    IIgnoreSearchFeature,
    IAliasNameFeature,
    IHotkeyFeature,
    IResultActionProviderFeature
{
    public ValueTask<IEnumerable<ISearchResultAction>> GetActionAsync(SearchResult searchResult)
    {
        var isPinned = this.GetIsPinned() == true;
        var ignoreSearch = this.GetIgnoreSearch() == true;

        var actions = new List<ISearchResultAction>
        {
            isPinned ? CancelPinAction.Instance : PinAction.Instance,
            AliasNameAction.Instance,
            HotKeyAction.Instance
        };

        if (!ignoreSearch)
            actions.Add(IgnoreAction.Instance);

        return ValueTask.FromResult<IEnumerable<ISearchResultAction>>(actions);
    }
}
```

若自定义 action 带有本次搜索结果相关状态，不要复用实例，把状态放在 `SearchResult.Payload` 或在 `ExecuteAsync` 中从 `result` / `context` 读取。

---

## 6. 自定义操作

```csharp
public sealed class OpenDataFolderAction : SearchResultActionBase
{
    public OpenDataFolderAction()
    {
        Text = "打开数据目录";
        Group = "我的插件";
        Icon = LucideIconKind.FolderOpen;
        Shortcut = "Enter";
    }

    public override Task ExecuteAsync(
        SearchResult result,
        InvokeContext context,
        CancellationToken cancellationToken)
    {
        var plugin = result.OwnerObject.FindAncestor<MyPlugin>();
        if (plugin is null)
            return Task.CompletedTask;

        ShellHelper.OpenFolderOrSelectFile(plugin.Context.PluginDataPath);
        return Task.CompletedTask;
    }
}
```

实现建议：

- `Text` 必填；否则 Alt 弹层难以搜索和识别。
- `Group` 用稳定短名，例如 `通用设置`、`文件`、插件显示名。
- `ExecuteAsync` 接收的 `context.Source == InvokeSource.Action`。
- 需要跨搜索与执行传递数据时，优先使用 `SearchResult.Payload`。
- 长耗时操作应尊重 `cancellationToken`，不要阻塞 UI 线程。

---

## 7. 跨插件 ResultAction 扩展

如果一个插件需要为另一个插件的节点追加操作，不要让目标节点实现调用方插件的
`IResultActionProviderFeature`。使用宿主全局的
`IResultActionExtensionRegistry`，按目标节点的稳定 `MioType` 注册
`IResultActionExtensionHandler`。

### 注册与释放

扩展处理器应随插件生命周期注册和释放，避免插件程序集卸载后注册表仍持有处理器实例：

```csharp
using MioKit.Sdk;

public sealed class ResultActionExtensionComponent : IPluginLifecycleComponent
{
    private IDisposable? _registration;

    public Task StartAsync(CancellationToken cancellationToken = default)
    {
        var registry = MioIoc.Resolve<IResultActionExtensionRegistry>();
        _registration = registry.Register(
            targetMioType: TargetPluginConst.TargetNodeType,
            handler: new TargetNodeActionHandler(),
            priority: 0);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken = default)
    {
        _registration?.Dispose();
        _registration = null;
        return Task.CompletedTask;
    }
}
```

`Register` 返回的 `IDisposable` 是该次注册的令牌；重复 `Dispose` 安全。`priority` 越小
越先返回，相同 priority 按注册顺序稳定排列。`targetMioType` 必须是目标节点发布的
稳定 `MioType`，不要使用运行时类型名或插件内部实例 Id。

### 扩展处理器

处理器接收当前 `SearchResult` 和目标 `MioObject`，返回需要追加的操作：

```csharp
public sealed class TargetNodeActionHandler : IResultActionExtensionHandler
{
    public ValueTask<IEnumerable<ISearchResultAction>> GetActionsAsync(
        ResultActionExtensionContext context,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (context.TargetObject is not TargetNode)
            return ValueTask.FromResult<IEnumerable<ISearchResultAction>>([]);

        IEnumerable<ISearchResultAction> actions = [new OpenTargetSettingsAction()];
        return ValueTask.FromResult(actions);
    }
}
```

搜索面板会先取得节点自身的 `IResultActionProviderFeature` 操作，再追加扩展注册表返回
的操作。多个扩展处理器彼此独立调用；单个处理器抛出普通异常时记录日志并返回空列表，
不会阻止其他扩展。处理器必须尊重取消令牌；切换当前结果会取消旧查询，注册或注销处理器
会通过 `ExtensionsChanged` 刷新当前结果。

扩展 Action 如果需要修改目标插件状态，应通过 [plugin-calls.md](plugin-calls.md)
调用目标插件公开的方法。不要直接解析目标插件容器、写入目标插件的属性或依赖目标插件
的内部类型。

---

## 8. 与搜索 / 执行的关系

ResultAction 不替代 `InvokeAsync`：

| 用户行为 | 调用 |
|----------|------|
| 回车 / 双击搜索结果 | `OwnerObject.InvokeAsync(...)` |
| 打开 Alt 操作弹层并执行菜单项 | `ISearchResultAction.ExecuteAsync(...)` |

`SearchResult.OwnerObject` 必须是可执行叶子节点，不能是搜索组。否则默认执行和结果操作都缺少明确目标。

---

## 9. 检查清单

- [ ] 需要菜单的节点实现 `IResultActionProviderFeature`
- [ ] `GetActionAsync` 返回 `ValueTask<IEnumerable<ISearchResultAction>>`
- [ ] `SearchResult.OwnerObject` 是可执行叶子节点（通常实现 `IInvokeFeature`）
- [ ] 使用内置固定/忽略/别名/热键 action 时，节点实现对应 Feature
- [ ] `GetActionAsync` 根据 EAV 状态决定显示哪些项
- [ ] 自定义类继承 `SearchResultActionBase`，设置清晰的 `Text` / `Group` / `Icon`
- [ ] Action 不保存 per-result 可变状态；需要状态时从 `result` / `context` / `Payload` 读取
- [ ] 跨插件 Action 按目标 `MioType` 注册，并在插件停止时释放 `IDisposable` 令牌
- [ ] 跨插件扩展处理器尊重取消，不直接写目标插件属性；需要修改状态时使用 Plugin Call
- [ ] 已在 `docs/features-and-properties.md` 记录节点 Feature
