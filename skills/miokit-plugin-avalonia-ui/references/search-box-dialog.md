# SearchBox Dialog

搜索框内 Dialog 用 `ISearchBoxWindow.TryShowDialogAsync`。不要自行 `new Window`；需要替换搜索框主内容区时使用 `SetContent(Control?)`，而不是把页面伪装成 Dialog。

## API

```csharp
Task<DialogResult> TryShowDialogAsync<T>(T control, CancellationToken ct = default)
    where T : Control, IDialogContext;

Task<DialogResult> TryShowDialogAsync<T>(Control control, T dialogContext, CancellationToken ct = default)
    where T : IDialogContext;

void ResetOverlay(); // 关闭 Dialog / ActionBar
```

| 接口 | 作用 |
|------|------|
| `IDialogContext`（Shadcn） | Dialog 完成事件 |
| `ISearchBoxFocusTargetProvider.RequestInitialFocus()` | 可选；未实现则 `Focus()` 根控件 |

内置：`SearchBoxAliasNameControl`、`SearchBoxHotkeyControl`。

---

## 1. 使用场景

| 场景 | 做法 |
|------|------|
| 搜索结果 Alt 操作需要编辑别名 / 热键 / 参数 | 在 action 的 `ExecuteAsync` 中解析 `ISearchBoxWindow` 并 `TryShowDialogAsync` |
| Dialog 需要关闭按钮 | 调用由插件 DI 提供的 `ISearchBoxWindow.ResetOverlay()` |
| Dialog 打开后需要指定初始焦点 | 控件实现 `ISearchBoxFocusTargetProvider.RequestInitialFocus()` |
| Dialog 有确认 / 取消结果 | 控件实现 `IDialogContext` 并触发 `DialogComplete` |

宿主已有 `SearchBoxAliasNameControl`、`SearchBoxHotkeyControl` 作为内置例子：它们是 `UserControl` + `IDialogContext`，关闭时调用 `ResetOverlay()`。

---

## 2. 基本流程

`SearchResultActionBase` 的 `Icon` 属性可以直接设置 `LucideIconKind` 枚举值，宿主的
搜索操作 UI 会自动渲染对应的 Lucide 图标。插件不需要在 Action 中手动创建图标控件。

```csharp
using Lucide.Avalonia;
using MioKit.Sdk;
using MioKit.Sdk.Controls;

public sealed class EditAliasAction : SearchResultActionBase
{
    private readonly ISearchBoxWindow _searchBox;

    public EditAliasAction(ISearchBoxWindow searchBox)
    {
        _searchBox = searchBox;
        Text = "别名管理";
        Icon = LucideIconKind.Tags;
    }

    public override async Task ExecuteAsync(
        SearchResult result,
        InvokeContext context,
        CancellationToken cancellationToken)
    {
        if (result.OwnerObject is not IAliasNameFeature aliasNode)
            return;

        var dialog = new SearchBoxAliasNameControl
        {
            AliasNameNode = aliasNode
        };

        await _searchBox.TryShowDialogAsync(dialog, cancellationToken);
    }
}
```

由插件 DI 创建 Action，或创建时传入已从插件 DI 获取的 `ISearchBoxWindow`，再从
`IResultActionProviderFeature.GetActionAsync` 返回。插件 Scope 会继承宿主窗口服务注册。
用户按 Alt 打开操作弹层后执行 Dialog。Action 规范见核心 Skill 的 `result-action.md`。

---

## 3. 自定义 Dialog 控件

```csharp
using Avalonia.Controls;
using MioKit.Sdk;
using Ti.Avalonia.Shadcn.Models;

public partial class MyDialog : UserControl, IDialogContext, ISearchBoxFocusTargetProvider
{
    private readonly ISearchBoxWindow _searchBox;
    public event EventHandler<DialogResult>? DialogComplete;

    public MyDialog(ISearchBoxWindow searchBox)
    {
        _searchBox = searchBox;
        InitializeComponent();
    }

    public void RequestInitialFocus()
    {
        InputTextBox.Focus();
    }

    private void Close()
    {
        _searchBox.ResetOverlay();
    }
}
```

该示例由插件 DI 或运行时组合代码创建 Dialog，并传入窗口服务。若 AXAML/设计器需要
无参构造，保留设计时构造路径，将运行时服务通过 ViewModel 或显式初始化传入。

| 接口 | 作用 |
|------|------|
| `IDialogContext` | Shadcn Dialog 上下文；宿主 `TryShowDialogAsync` 要求 |
| `ISearchBoxFocusTargetProvider` | 可选；Dialog 显示后宿主调用 `RequestInitialFocus()` |

---

## 4. 键盘与焦点

Dialog 打开后，宿主将搜索框 overlay 状态切到 Dialog：

- `Esc` 只关闭当前 Dialog，不直接隐藏搜索框。
- 宿主焦点目标变为 `SearchPanelFocusTarget.Dialog`。
- 若 Dialog 内容实现 `ISearchBoxFocusTargetProvider`，宿主调用 `RequestInitialFocus()`；否则对根控件尝试 `Focus()`。

---

## 5. 不要这样做

| 不要 | 原因 / 替代 |
|------|-------------|
| 插件自行 new `Window` 做搜索框内编辑 | 会绕过搜索框 overlay、焦点和 Esc 分层；用 `TryShowDialogAsync` |
| 用 Dialog 承载长期扩展页面 | Dialog 适合短暂交互；页面式扩展请用 `SetContent(Control?)`，其会显示在搜索输入框下方 |
| Dialog 内直接操作宿主内部 ViewModel | 只使用 `ISearchBoxWindow`、`IDialogContext`、`ISearchBoxFocusTargetProvider` |
| 打开 Dialog 后不处理关闭 | 提供关闭按钮并调用 `ResetOverlay()`，或通过 `IDialogContext.DialogComplete` 完成 |
