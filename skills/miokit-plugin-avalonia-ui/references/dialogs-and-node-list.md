# 通用对话框与节点选择

以下控件由 MioKit.Extensions 提供，命名空间均为 `MioKit.Sdk.Controls`；
节点搜索辅助类型位于 `MioKit.Sdk`。插件项目通过 MioKit.Extensions 引用即可使用。

| 需求 | API |
|---|---|
| 通用卡片布局、嵌入式对话框 | MioDialogPanel |
| 独立模态对话框 | MioDialogWindow、MioDialogOptions |
| 带搜索的节点列表 | MioNodeList |
| 无 UI 的节点匹配与排序 | MioNodeSearch、MioNodeMatch、MioNodeSearchResult |

## 对话框

MioDialogPanel 只管理布局和发出 CloseRequested / PrimaryRequested 事件，不自动关闭或保存。
Body 放内容，BodyPadding 控制内边距；标题、副标题、头尾可见性、按钮、ErrorText 和 IsBusy
均可绑定。Buttons 是 MioDialogButtons.None / Close / CloseAndPrimary。

MioDialogWindow(content, options) 封装面板与窗口行为，在 UI 线程创建并调用
ShowDialogAsync(owner)，返回主按钮是否成功。OnPrimary 是 Func<Task>；
运行时防止重复提交，异常显示在面板内并保留窗口；IsBusy 可接外部状态，忙碌时拒绝用户关闭。
普通插件顶层窗口仍使用 ShadWindow，本控件用于模态对话框。
搜索框内部对话框继续使用 ISearchBoxWindow.TryShowDialogAsync，见
[search-box-dialog.md](search-box-dialog.md)。

## 节点列表

```csharp
using MioKit.Sdk;
using MioKit.Sdk.Controls;

var list = new MioNodeList
{
    NodesProvider = () => candidates,
    DisplayLimit = 50,
    PlaceholderText = "搜索节点"
};
list.NodeActivated += (_, node) => SelectNode(node);
```

示例中的 candidates 为当前候选节点列表，SelectNode 为调用方选择逻辑；
控件只选择节点，不自动 InvokeAsync。SelectedNode 可双向绑定；SelectionChanged
通知选中变化，NodeActivated 对应回车/双击。动态候选变化后调用 Refresh /
RequestRefresh，FocusSearch 聚焦输入框。

默认搜索使用 MioNodeSearch.Search(nodes, query, limit)，按 Id 去重、匹配名称/别名/
搜索命令并结合使用频率排序，描述与来源为次级匹配。MioNodeMatch 带节点、标题、
byte[] 高亮下标和分数；MioNodeSearchResult.TotalCount 为截断前总数。

自定义 Search 的签名是
ValueTask<MioNodeSearchResult> (string query, int limit, CancellationToken token)；
设置后替代 NodesProvider。尊重 token，返回结果不要超过 limit；控件会取消过时搜索并忽略晚到结果。
SourceSelector 可自定义来源标签，返回空字符串隐藏；不设置时显示节点所属插件名称。