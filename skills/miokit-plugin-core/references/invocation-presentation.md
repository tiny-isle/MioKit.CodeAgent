# 入口交互声明

`IInvokeFeature.InvokeAsync` 与 `ISearchResultAction.ExecuteAsync` 只负责业务执行。
宿主入口负责固定目标、构造上下文、交接窗口与焦点。节点和动作可通过可选接口声明
**入口交互意图**；窗口隐藏、焦点与采集仍由宿主协调。直接调用执行方法不会自动关闭入口。

分阶段采集与快照字段见 [invocation-snapshot.md](invocation-snapshot.md)。
结果菜单动作约定见 [result-action.md](result-action.md)。

## 接口分工

| 主体 | 接口 | 说明 |
|------|------|------|
| 可执行节点 | `IInvocationPresentationFeature` | 继承 `IFeature` 与 `IInvocationPresentationProvider`，与 `IInvokeFeature` 组合实现 |
| 结果菜单动作 | `IInvocationPresentationProvider` | 动作不继承 `IFeature`，不必实现节点上的 Feature |

宿主使用**当前执行主体**的声明：动作用动作自身意图，不继承所属节点；未实现接口时按
`Default` 处理。

## 请求与返回

```csharp
InvocationPresentation GetPresentation(InvocationPresentationRequest request);
```

`GetPresentation` 必须**同步、无副作用**：不读剪贴板、前台窗口或其他桌面资源，不捕获
窗口句柄，不修改 UI。

`InvocationPresentationRequest` 仅包含已有调用数据：

| 成员 | 说明 |
|------|------|
| `Source` | `InvokeSource` |
| `SearchResult` | 可选当前搜索结果 |
| `Payload` | 可选载荷 |
| `Items` | 可选附加字典 |

不包含窗口、采集服务或未完成快照。

返回 `InvocationPresentation`，当前主要字段：

| 成员 | 说明 |
|------|------|
| `Interaction` | `InvocationInteraction`，默认 `Default` |

## InvocationInteraction

| 值 | 含义 |
|----|------|
| `Default` | 保留该入口原有规则；未实现接口时同样处理 |
| `Continue` | 继续搜索/面板交互；轮盘、手势仍按自身确认后的生命周期收起 |
| `CompleteBeforeExecution` | 执行前结束本次入口交互 |

搜索窗在 `CompleteBeforeExecution` 时由宿主立即隐藏；非固定面板遵循原执行隐藏设置；
固定面板可保持显示。目标窗口激活属于独立的执行前提，固定显示不会覆盖焦点要求。
未知枚举值按 `Default` 处理。

## 节点示例

启动类节点通常在执行前结束入口交互：

```csharp
public class LaunchAppNode : MioObject, IInvokeFeature, IInvocationPresentationFeature
{
    public LaunchAppNode(string id) : base(id) { }

    public InvocationPresentation GetPresentation(InvocationPresentationRequest request) => new()
    {
        Interaction = InvocationInteraction.CompleteBeforeExecution
    };

    public Task InvokeAsync(InvokeContext context)
    {
        // 业务执行；不要在这里隐藏搜索窗
        return Task.CompletedTask;
    }
}
```

## 结果动作示例

动作实现 `IInvocationPresentationProvider`，使用自身声明：

```csharp
public sealed class CopyPathAction : SearchResultActionBase, IInvocationPresentationProvider
{
    public CopyPathAction()
    {
        Text = "复制路径";
    }

    public InvocationPresentation GetPresentation(InvocationPresentationRequest request) => new()
    {
        Interaction = InvocationInteraction.CompleteBeforeExecution
    };

    public override Task ExecuteAsync(
        SearchResult result, InvokeContext context, CancellationToken cancellationToken)
        => Task.CompletedTask;
}
```

未声明意图的动作保持入口默认行为；`ExecuteAsync` 签名不变。

## 组合与代理转发

组合/代理节点在最外层协调一次；内部转发同一上下文，不重复协调窗口。可将目标声明透传：

```csharp
public InvocationPresentation GetPresentation(InvocationPresentationRequest request) =>
    (TargetNode as IInvocationPresentationProvider)?.GetPresentation(request) ?? new();
```

目标未实现时 `new()` 等价于 `Default`。

## 硬规则

- 节点不得因交互声明自行查找、隐藏或清空搜索窗。
- 交互声明不改变 `InvokeAsync` / `ExecuteAsync` 的签名。
- 交互声明不决定采集资源、执行线程或目标焦点要求。
- 直接调用执行方法只执行业务；入口协调由宿主入口路径完成。
- 公共接口不追加必需成员；以后通过有默认值的属性扩展，枚举数值不重排。

## 版本要求

使用这些类型的插件须在 `plugin.json` 声明实际依赖的最低 SDK 和宿主版本。旧宿主可能在
加载类型时失败，不能通过节点执行时检查 `HostVersion` 规避。

## 检查清单

- [ ] 需要执行前收起入口时，节点实现 `IInvocationPresentationFeature` 并返回明确 `Interaction`
- [ ] 结果动作需要独立意图时实现 `IInvocationPresentationProvider`，不依赖节点声明
- [ ] `GetPresentation` 同步、无副作用，只使用 `InvocationPresentationRequest` 已有字段
- [ ] 不在 `InvokeAsync` / `ExecuteAsync` 中自行操作搜索窗或入口 UI
- [ ] 组合节点只在最外层声明或转发一次，内部转发上下文
- [ ] `plugin.json` 已声明包含该 API 的最低 SDK / 宿主版本
