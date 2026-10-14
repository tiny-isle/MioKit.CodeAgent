# 节点面板与节点拖放

示例需要 SDK / Extensions 1.2.3 或更高及对应宿主实现；版本与发布条件见
[sdk-api-index.md](sdk-api-index.md)。设置中心的节点面板把已挂树的 `MioObject` 以
文本协议拖出，接收方绑定当前进程的现存节点，不创建对象副本。

## 节点面板分类

```csharp
using MioKit.Sdk;

[NodePalette("文件工具")]
public interface IFileToolFeature : IInvokeFeature;
```

节点类、基类或 Feature 接口可以重复声明 `[NodePalette("类别")]`。
`NodePalette.GetCategories(type)` / `GetContributions(type)` 读取贡献，类别按 Ordinal
跨类和接口去重，重复类别保留首次来源。当前源码的 `IInvokeFeature` 未附带
`NodePalette` 标记，需要分类的节点/自有 Feature 显式声明，不依赖自动“可执行”分类。
标记只是面板分类，不替代 `[EavType]`、节点注册或挂树。节点基础见
[nodes-and-tree.md](nodes-and-tree.md)。

## 协议与校验

WebView 的 `text/plain` 与 Avalonia 的 `DataFormat.Text` 传输：

```text
MIOKIT-DRAG/1\n + camelCase JSON
```

其中 `\n` 为实际换行；`MioDragProtocol.Prefix`、`FormatText`、`TryParse` 定义格式。
`MaxTextLength` 为 16 * 1024 个 .NET 字符（含前缀），不是 UTF-8 字节数。

- 固定 `protocol = "miokit.drag"`、`version = 1`、`kind = "mio-node"`、
  `operation = "copy"`、`source.app = "MioKit"`；`move` 会被拒绝。
- `source.instanceId` 标记拖出端实例；`item.nodeId` 定位节点，`item.mioTypeId` 描述类型。
- `item.name`、`description`、`category`、`categories`、`sourceContracts`、
  `ownerPluginId` 提供展示/筛选元数据，不是完整对象状态。
- `TryParse` 校验前缀、长度、JSON 与 `IsStructurallyValid` 规定的必填字段及列表限制。
  `FormatText` 只序列化，不自动完成结构校验。

## Avalonia 接收

在 View 的目标控件设置 `DragDrop.AllowDrop="True"`，成对注册/解除 DragOver 与 Drop
事件。以下方法放入 View/code-behind，使用 `MioKit.Extensions.Helpers`：

```csharp
using Avalonia.Input;
using MioKit.Extensions.Helpers;
using MioKit.Sdk;

private static void OnDragOver(object? sender, DragEventArgs e)
{
    e.DragEffects = MioNodeDragDrop.Contains(e.DataTransfer)
        ? DragDropEffects.Copy : DragDropEffects.None;
    e.Handled = true;
}

private void OnDrop(object? sender, DragEventArgs e)
{
    e.DragEffects = DragDropEffects.None;
    if (!MioNodeDragDrop.TryGetNode(e.DataTransfer, out var node, out var payload)
        || node is null || payload is null)
        return;

    // 实际能力以活节点为准；按业务换成需要的 Feature。
    if (!node.HasFeature<IInvokeFeature>())
        return;

    BoundNode = node; // View 的 MioObject? 属性，或通知 ViewModel 保存绑定。
    e.DragEffects = DragDropEffects.Copy;
    e.Handled = true;
}
```

`Contains` 仅做文本长度与前缀轻量判断，不能证明载荷或节点有效。
`TryGetNode` 先完整解析再按 `RootNode.Root.GetNodeById` 查找，要求当前已挂根树；
类型 GUID 无效或与 `node.MioType` 不符时失败。只要载荷用 `TryGetPayload`。
若已有载荷，先确保来自 `TryParse` / `TryGetPayload`，再调用 `TryResolveNode`；
后者不重新执行完整协议校验。

载荷类别、来源接口只是提示，硬性能力筛选再核验活节点 Feature。目标之后执行节点时也
应重新检查节点仍挂树。节点已卸载/摘树、类型不符或来自其他进程时不能保证解析成功；
协议没有跨进程实例认证，不能凭 `source.instanceId` 当作身份或权限保证。

WebView 自定义拖出端也使用同一格式；源宿主的节点面板已实现序列化，插件不要依赖宿主
内部前端文件路径或把载荷反序列化为 `MioObject`。
