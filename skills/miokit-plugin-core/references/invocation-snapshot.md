# 调用快照（InvocationSnapshot）

环境快照用法、`InvokeContext` 字段与跨阶段传递均见本文。类型在 `MioKit.Sdk`。

用户**打开搜索框**、**执行节点**或**触发全局热键**时，宿主采集的桌面环境上下文。

---

## 1. 在管线中的位置

```
搜索框打开 / 热键 forceRefresh
        │
        ▼
IInvocationSnapshotProvider（默认 SearchRequestCollector）
        │  采集前台窗口、剪贴板、Explorer
        ▼
InvocationSnapshot
        ├─► SearchRequest.Context          （整次搜索共用）
        └─► InvokeContext.Context          （执行节点时传入）
```

| 场景 | 如何拿到快照 |
|------|----------------|
| `ISearchableFeature.SearchAsync` | `request.Context` |
| 用户回车执行结果 | `InvokeContext.FromSearchBox(result)` → `context.Context`（与 `result.Request.Context` 相同） |
| 全局热键 | `InvokeContext.FromHotKey(snapshot)`；宿主 `GetContextAsync()` |
| 固定项 / 最近使用 | `InvokeContext.FromFixed` / `FromRecentUsed` |
| 结果动作 | `InvokeContext.FromAction(result)` |

插件**通常只读**快照字段；若需在搜索与执行间传递自定义数据，可用 `InvocationSnapshot.Payload` 或 `SearchResult.Payload`。

---

## 2. IInvocationSnapshotProvider

```csharp
public interface IInvocationSnapshotProvider
{
  InvocationSnapshot? CurrentContext { get; }
  Task<InvocationSnapshot?> GetContextAsync(
      bool forceRefresh = false,
      CancellationToken cancellationToken = default);
}
```

| 成员 | 说明 |
|------|------|
| `CurrentContext` | 搜索框打开后缓存的快照；未打开时可能为 `null` |
| `GetContextAsync` | 默认返回缓存；`forceRefresh: true` 时重新采集（热键等需最新前台窗口时） |

宿主在 Autofac 中注册默认实现。插件仅在需要主动刷新环境时解析：

```csharp
var provider = MioIoc.Resolve<IInvocationSnapshotProvider>();
var snapshot = await provider.GetContextAsync(forceRefresh: true);
```

---

## 3. InvocationSnapshot

一次环境采集的完整快照。

| 成员 | 类型 | 说明 |
|------|------|------|
| `ContextId` | `Guid` | 本次快照唯一 Id；搜索框重新打开或强制刷新时更新 |
| `CaptureTime` | `DateTimeOffset` | 采集完成时间 |
| `ForegroundWindow` | `ForegroundWindowInfo` | 采集时刻的前台窗口 |
| `Clipboard` | `ClipboardSnapshot` | 剪贴板快照；无数据时为 `ClipboardSnapshot.Empty` |
| `MousePosition` | `MousePosition` | 鼠标屏幕坐标（宿主可按需填充） |
| `Explorer` | `ExplorerContext?` | 资源管理器窗口列表与活动索引 |
| `Payload` | `Dictionary<string, object>?` | 插件/宿主扩展键值对 |
| `CaptureReport` | `InvocationCaptureReport?` | 单项资源采集状态与来源；旧快照可能为 null |

### 宿主采集规则（SearchRequestCollector）

| 字段 | 采集内容 |
|------|----------|
| `ForegroundWindow` | `GetForegroundWindow()` + 进程名/路径/类名；标记是否 Explorer 或桌面 |
| `Clipboard` | 仅当剪贴板在配置的时间窗内更新过，且非 MioKit 内部剪贴板格式时填充 Text/Files/Image/Html |
| `Explorer` | 枚举所有 Explorer 窗口，匹配前台句柄得到 `ActiveIndex` |
| `MousePosition` | 当前默认实现未设置 |

---

## 4. ForegroundWindowInfo

前台窗口信息。

| 成员 | 类型 | 说明 |
|------|------|------|
| `Handle` | `HWND?` | Win32 窗口句柄 |
| `Title` | `string?` | 窗口标题 |
| `ProcessId` | `uint?` | 进程 ID |
| `ProcessName` | `string?` | 进程名（如 `notepad`、`explorer`） |
| `ProcessPath` | `string?` | 可执行文件完整路径 |
| `ClassName` | `string?` | Win32 类名 |
| `IsExplorerWindow` | `bool` | 是否为资源管理器浏览窗口（`CabinetWClass` / `ExploreWClass`） |
| `IsDesktopWindow` | `bool` | 是否为桌面（`Progman` / `WorkerW`） |

```csharp
// 按前台应用过滤搜索结果
var fg = request.Context.ForegroundWindow;
if (string.Equals(fg.ProcessName, "code", StringComparison.OrdinalIgnoreCase))
{
    // 仅在 VS Code 前台时匹配...
}

// 执行时切回采集时的窗口
var hwnd = context.Context?.ForegroundWindow.Handle;
if (hwnd.HasValue)
    User32.SetForegroundWindow(hwnd.Value);
```

搜索和执行读的是采集时刻的快照。要在前台窗口每次切换时收到通知，订阅 `IForegroundWindowMonitor`；它只提供句柄，详情仍用 `IInvocationSnapshotProvider` 按需采集，见 [host-services.md](host-services.md)。

启动器执行实现了 `IRequireTargetWindowFeature` 的节点时，会先切回捕获的目标窗口；失败则不进入 `InvokeAsync`。未实现该标记时，没有有效目标也会执行，此时 `ForegroundWindow.Handle` 为空。见 [features-basics.md](features-basics.md)。

---

## 5. ClipboardSnapshot

剪贴板结构化副本；搜索 UI 可展示预览，插件可按内容类型分支。

| 成员 | 类型 | 说明 |
|------|------|------|
| `Empty` | `static` | 空快照单例 |
| `LastUpdateTime` | `DateTimeOffset` | 剪贴板最近变更时间 |
| `Formats` | `List<string>` | 可用格式名列表 |
| `HasData` | `bool` | `Formats.Count > 0` |
| `Text` | `string?` | 纯文本 |
| `Files` | `List<string>?` | 文件/文件夹路径列表 |
| `Image` | `ClipboardImageInfo?` | 位图元数据与临时文件 |
| `Html` | `string?` | HTML 片段 |
| `HasFiles` | `bool` | 是否包含文件路径 |

```csharp
var clip = request.Context.Clipboard;
if (!clip.HasData) return;

if (!string.IsNullOrEmpty(clip.Text))
    results.Add(/* 匹配剪贴板文本的节点 */);

if (clip.HasFiles)
    foreach (var path in clip.Files!)
        // 按路径生成结果...
```

搜索框 UI 在 `Clipboard.HasData` 时展示预览；用户可清空，宿主会将 `Clipboard` 置为 `Empty`。

---

## 6. ClipboardImageInfo

剪贴板图片的元数据；宿主将位图写入临时目录供预览与插件读取。

| 成员 | 类型 | 说明 |
|------|------|------|
| `Width` | `int` | 原始宽度（像素） |
| `Height` | `int` | 原始高度（像素） |
| `ByteLength` | `long?` | 落盘文件大小 |
| `TempFilePath` | `string?` | 完整图片临时路径 |
| `ThumbnailTempFilePath` | `string?` | 缩略图路径（约 320×180 PNG） |

---

## 7. MousePosition

| 成员 | 类型 | 说明 |
|------|------|------|
| `X` | `int` | 屏幕 X |
| `Y` | `int` | 屏幕 Y |

---

## 8. ExplorerContext

| 成员 | 类型 | 说明 |
|------|------|------|
| `ActiveIndex` | `int` | 前台 Explorer 在 `ExplorerWindowSource` 中的索引；无匹配为 `-1` |
| `ExplorerWindowSource` | `List<ExplorerWindowInfo>` | 已打开的资源管理器窗口 |
| `HasExplorerWindow` | `bool` | 列表非空 |

```csharp
var explorer = request.Context.Explorer;
if (explorer is { HasExplorerWindow: true } && explorer.ActiveIndex >= 0)
{
    var active = explorer.ExplorerWindowSource[explorer.ActiveIndex];
    var cwd = active.CurrentPath;
    var selected = active.SelectedPaths;
}
```

---

## 9. ExplorerWindowInfo

单个资源管理器窗口。

| 成员 | 类型 | 说明 |
|------|------|------|
| `Handle` | `HWND?` | 窗口句柄 |
| `Title` | `string?` | 窗口标题 |
| `CurrentPath` | `string?` | 当前目录路径 |
| `SelectedPaths` | `IReadOnlyList<string>` | 当前选中的文件/文件夹路径 |
| `IsDesktop` | `bool` | 是否为桌面视图 |

可将实例放入 `SearchResult.Payload`，执行时从 `InvokeContext.SearchResult.Payload` 读取：

```csharp
// SearchAsync
results.Add(new SearchResult(request, node)
{
    Title = window.CurrentPath!,
    Payload = window   // ExplorerWindowInfo
});

// InvokeAsync
if (context.SearchResult?.Payload is ExplorerWindowInfo info)
{
    var path = info.CurrentPath;
    var files = info.SelectedPaths;
}
```

这种模式适合“搜索时捕获窗口/路径，执行时使用同一份上下文”的节点。

---

## 10. InvokeContext 与快照

`InvokeContext` 是 `record struct`，除快照外还携带来源与搜索结果：

| 成员 | 类型 | 说明 |
|------|------|------|
| `Source` | `InvokeSource` | `SearchBox` / `HotKey` / `Fixed` / `RecentUsed` / `Customer` |
| `SearchResult` | `SearchResult?` | 搜索执行时有值 |
| `Context` | `InvocationSnapshot?` | 环境快照 |
| `Payload` | `object?` | 调用方附加数据 |
| `Items` | `IReadOnlyDictionary<string, object?>?` | 附加键值对 |
| `CancellationToken` | `CancellationToken` | 执行取消令牌；传递给异步操作和托管任务 |

| 工厂方法 | `Context` 来源 |
|----------|----------------|
| `FromSearchBox(result)` | `result.Request.Context` |
| `FromHotKey(snapshot)` | 参数或 `GetContextAsync()` |
| `FromFixed(snapshot)` | 当前搜索缓存 |
| `FromRecentUsed(snapshot)` | `GetContextAsync()` |
| `FromAction(result)` | `result.Request?.Context` |

```csharp
public Task InvokeAsync(InvokeContext context)
{
    var snapshot = context.Context;
    var fg = snapshot?.ForegroundWindow;

    switch (context.Source)
    {
        case InvokeSource.SearchBox:
            var text = context.SearchResult?.Request.SearchText;
            break;
        case InvokeSource.HotKey:
            break;
    }
    return Task.CompletedTask;
}
```

---

## 11. 与 SearchRequest 的关系

`SearchRequest.Context` 类型为 `InvocationSnapshot`（非空，由宿主在创建请求时注入）。详见 [search.md](search.md) §3。

---

## 12. 实现参照

| 场景 | 做法 |
|------|------|
| 快照类型 | 使用 SDK 中的 `InvocationSnapshot`、`ForegroundWindowInfo`、`ClipboardSnapshot`、`ExplorerWindowInfo` |
| 主动刷新 | 通过 `IInvocationSnapshotProvider.GetContextAsync(forceRefresh: true)` 获取最新环境 |
| 跨阶段传递 | 搜索阶段写入 `SearchResult.Payload`，执行阶段从 `InvokeContext.SearchResult.Payload` 读取 |

---

## 13. 检查清单

- [ ] 环境感知搜索读取 `request.Context`，而非自行 `GetForegroundWindow`
- [ ] 持续跟踪前台变化用 `IForegroundWindowMonitor`，不要用实时句柄替换当次快照
- [ ] 区分 `Clipboard.HasData` / `HasFiles` / `Text` 再分支
- [ ] Explorer 相关逻辑检查 `Explorer?.HasExplorerWindow` 与 `ActiveIndex`
- [ ] 执行阶段用 `InvokeContext.Context` 或 `SearchResult.Request.Context`（二者在搜索执行时一致）
- [ ] 跨阶段自定义数据用 `SearchResult.Payload` 或 `InvocationSnapshot.Payload`

## 14. 分阶段采集

上下文由宿主入口提供。搜索框在开始搜索前准备完整上下文，执行结果时复用该结果的
`SearchRequest.Context`。轮盘和手势展示期间只准备目标窗口/应用信息，确认动作后才
采集剪贴板、Explorer 等执行资源。因此目标身份来自触发时，非搜索资源来自确认执行时。
插件只消费传入快照，并处理缺失资源；不要默认强制刷新全局快照来补齐本次数据。
已有 `CaptureReport` 可区分未请求、空数据、策略跳过、不可用和失败。

入口交互意图（执行前收起搜索窗、继续面板等）由可选的
`IInvocationPresentationFeature` / `IInvocationPresentationProvider` 声明，详见
[invocation-presentation.md](invocation-presentation.md)。交互声明不决定采集资源。

## 15. 取消与显式资源采集

`InvokeAsync` 中将 `context.CancellationToken` 传给文件、网络、等待和
`IMioTaskService.RunAsync`。组合节点转发上下文时保留该 token，例如
`context with { Payload = value }`。五参数构造函数及原有五项解构仍可使用；需要
手动创建带取消的上下文时使用六参数构造函数或 `with { CancellationToken = token }`。
旧构造函数和工厂默认使用不取消的 token。

通常只消费宿主传入的快照。确需独立采集桌面资源时，通过
`IInvocationCaptureService.CaptureAsync(new InvocationCaptureRequest { Resources = ... }, token)`
请求所需资源；`CaptureResources` 可组合 WindowIdentity、WindowDetails、ClipboardText、
ClipboardFiles、Explorer 等。直接调用不设置 Existing，它只供原采集会话补采使用。
按 snapshot.CaptureReport 的单项资源状态判断结果，不能将空数据与采集失败混为一谈。
InvocationCaptureReport 索引器只查询单项标记，不聚合 Clipboard 等组合标记。
