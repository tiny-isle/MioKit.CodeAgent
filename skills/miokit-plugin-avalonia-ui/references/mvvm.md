# MioKit Avalonia MVVM 规范

MioKit Avalonia 插件默认使用 `CommunityToolkit.Mvvm`。本规范约束 View、ViewModel、
命令、集合与异步边界；插件生命周期、DI 和 Feature 仍以 `miokit-plugin-core` 为准。

## 基本结构

ViewModel 基类保持轻量，不放服务定位、窗口表或 View 引用：

```csharp
using CommunityToolkit.Mvvm.ComponentModel;

public abstract class ViewModelBase : ObservableObject
{
}
```

需要生成属性或命令的类型必须是 `partial`：

```csharp
using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

public partial class SettingsViewModel : ViewModelBase
{
    private readonly ISettingsService _settings;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SaveCommand))]
    private string? _name;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SaveCommand))]
    private bool _isBusy;

    public ObservableCollection<SettingItem> Items { get; } = [];

    public SettingsViewModel(ISettingsService settings)
    {
        _settings = settings;
    }

    private bool CanSave() =>
        !IsBusy && !string.IsNullOrWhiteSpace(Name);

    [RelayCommand(CanExecute = nameof(CanSave))]
    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        IsBusy = true;
        try
        {
            await _settings.SaveAsync(Name!, cancellationToken);
        }
        finally
        {
            IsBusy = false;
        }
    }
}
```

- `[ObservableProperty]` 生成字段统一使用 `_camelCase`，例如 `_name` 生成 `Name`；
  普通私有依赖字段也使用下划线前缀，例如 `_settings`。
- 可绑定状态用 `[ObservableProperty]` 或显式 `SetProperty`；不要手写遗漏通知的自动属性。
- 命令优先用 `[RelayCommand]` / `[RelayCommand]` 的异步方法生成，不在 code-behind
  调业务服务。
- 异步命令接收 `CancellationToken`；视图关闭或插件停止后不得继续回写失效状态。
- `async void` 仅限 Avalonia 事件处理器；ViewModel 命令返回 `Task`。

如果生成项目没有直接提供 CommunityToolkit 的 analyzer/source generator，按模板
`*.csproj` 的现有版本添加直接 `PackageReference`；不要自行猜版本。依赖策略见核心
Skill 的 `nuget.md`。

## View 与绑定

普通 View 使用编译绑定，声明 `x:DataType`：

```xml
<UserControl xmlns="https://github.com/avaloniaui"
             xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
             xmlns:vm="using:Example.Plugin.ViewModels"
             xmlns:shad="https://github.com/tiny-isle/Ti.Avalonia.Shadcn"
             x:Class="Example.Plugin.Views.SettingsView"
             x:DataType="vm:SettingsViewModel">
    <StackPanel Spacing="12">
        <TextBox Text="{Binding Name, Mode=TwoWay}"
                 shad:ShadInfo.Title="名称" />
        <Button Content="保存"
                Command="{Binding SaveCommand}"
                shad:ShadLoading.IsLoading="{Binding IsBusy}" />
    </StackPanel>
</UserControl>
```

Preview 项目的 `*.csproj` 保持
`<AvaloniaUseCompiledBindingsByDefault>true</AvaloniaUseCompiledBindingsByDefault>`。如果当前
项目没有启用这个选项，则在 View 根元素显式设置 `x:CompileBindings="True"`；只声明
`x:DataType` 仍不足以把普通 `{Binding ...}` 全部切换为编译绑定。

`Design.DataContext` 只服务设计器，不会设置运行时 `DataContext`。只有 ViewModel
本身可在设计期安全构造时，才可以直接放入 `<Design.DataContext>`；构造函数需要服务
时，不要为了设计器强加无参构造函数，可改用轻量设计数据类型或省略设计上下文。

运行时由插件组合根/DI 创建 ViewModel，再交给 View：

```csharp
public partial class SettingsView : UserControl
{
    public SettingsView()
    {
        InitializeComponent();
    }

    public SettingsView(SettingsViewModel viewModel) : this()
    {
        DataContext = viewModel;
    }
}
```

已有宿主工厂或导航服务时优先让它负责构造，不在多个 View 中重复 `Resolve`。不要在
AXAML 与 code-behind 同时创建两个 ViewModel 实例。

## 职责边界

| 层 | 应负责 | 不应负责 |
|---|---|---|
| View / code-behind | `InitializeComponent`、纯视觉事件、焦点、拖放、动画、必须访问控件的交互 | 数据访问、持久化、搜索、跨窗口业务状态 |
| ViewModel | 可绑定状态、命令、输入校验状态、调用业务服务、取消与错误状态 | 持有 `Control` / `Window`、遍历视觉树、读取 `DynamicResource` |
| 服务 / Feature | I/O、搜索、持久化、宿主 API、可测试业务逻辑 | 直接更新控件或依赖 View 生命周期 |

Dialog、Drawer 和窗口内部的 Shadcn Toast 需要当前视觉树中的 Host。ViewModel 不应持有这些 manager；可由
View 响应 ViewModel 请求，或注入不暴露 Avalonia 控件的 UI 协调服务。搜索框内 Dialog
遵循 [search-box-dialog.md](search-box-dialog.md) 的 `ISearchBoxWindow` 生命周期。

## 命令与事件

- 控件已有 `Command` / `CommandParameter` 时直接绑定。
- 非命令控件的点击可用
  [behaviors-and-attached-properties.md](behaviors-and-attached-properties.md) 中的
  `ClickCommandBehaviors`。
- 只有必须读取 `PointerEventArgs`、焦点、坐标或视觉树时才使用 code-behind 事件。
- `CanExecute` 依赖的属性变化后，用 `[NotifyCanExecuteChangedFor]` 或显式
  `NotifyCanExecuteChanged()` 刷新，不另建重复的 `IsSaveEnabled` 状态。
- 防止重复提交时让异步命令和 `IsBusy` 共同约束 `CanExecute`；加载视觉状态不等于业务
  命令自动禁用。

## 集合与选择

- UI 可变列表用 `ObservableCollection<T>`；只读快照可公开 `IReadOnlyList<T>`。
- 不要在 getter 每次创建新集合、执行 I/O 或做大规模 LINQ；先在服务中计算，再一次性
  更新绑定状态。
- 选择项使用可观察属性并进行 `Mode=TwoWay` 绑定；不要从 ViewModel 操作
  `ListBox.SelectedItems`。
- `ListItemDragBehavior` 会原地重排列表，数据源必须支持 `RemoveAt` / `Insert`。
- 从后台线程收到增量结果时，先切回 UI 线程，再修改
  `ObservableCollection<T>` 或与控件绑定的属性。

## 异步、取消与 UI 线程

服务层不假设调用线程，不读取控件。ViewModel 在 UI 发起的普通 `await` 之后通常会回到
UI 上下文，但后台回调、计时器、并行流和显式 `ConfigureAwait(false)` 不能依赖这一点。
需要更新绑定集合时显式调度：

```csharp
using Avalonia.Threading;

var items = await _service.SearchAsync(query, cancellationToken)
    .ConfigureAwait(false);

await Dispatcher.UIThread.InvokeAsync(() =>
{
    Items.Clear();
    foreach (var item in items)
        Items.Add(item);
});
```

- 不在 UI 线程调用 `.Wait()`、`.Result`、同步文件/网络 I/O 或长时间计算。
- 新请求开始时取消旧搜索；插件停止、View 卸载或窗口关闭时取消所属工作。
- 传递宿主给出的 `CancellationToken`，不要用 `CancellationToken.None` 截断取消链。
- 捕获取消时把 `OperationCanceledException` 视为正常结束；其他错误转换为可绑定错误状态
  或交给宿主日志/通知服务，不静默吞掉。

## DataContext 与生命周期

- `DataContext` 由窗口/页面的组合根设置一次，子控件默认继承。
- 只有局部、独立组件才覆盖自己的 `DataContext`；覆盖后确认没有切断父级命令绑定。
- 订阅事件、observable 或消息总线时保存 `IDisposable`，在对应的卸载/释放阶段取消。
- ViewModel 需要显式释放资源时实现合适的生命周期接口或由创建它的服务统一释放；不要
  依赖终结器。
- 插件顶层窗口通过 `WindowManager` 与 `PluginWindowBehavior` 管理，停止插件时由
  OwnerId 关闭；ViewModel 不维护静态窗口字典。

## 编译绑定、DataTemplate 与裁剪

`x:DataType` 应对应绑定实际来源。DataTemplate 内的数据类型变化时在模板上重新声明：

```xml
<ListBox ItemsSource="{Binding Items}">
    <ListBox.ItemTemplate>
        <DataTemplate x:DataType="vm:SettingItem">
            <TextBlock Text="{Binding DisplayName}" />
        </DataTemplate>
    </ListBox.ItemTemplate>
</ListBox>
```

只有确实无法静态确定绑定类型的局部视图才设置 `x:CompileBindings="False"`，不要把它
作为整个插件默认值。按 `ViewModel` → `View` 名称反射的 `ViewLocator` 在裁剪/AOT 下
可能失效；插件页面优先显式 DataTemplate、工厂或宿主导航注册。

## 不要照搬 Demo 的部分

`Ti.Avalonia.Shadcn.Desktop` 是控件目录，同时展示了 `ObservableObject`、
`[ObservableProperty]`、`RelayCommand<T>`、`x:DataType` 和 `Design.DataContext` 的
基本用法。但其中有为快速浏览控件而做的演示性简化：

- ViewModel 的导航项直接保存 `Control Page`。
- 个别页面在构造函数中 `new` 自己的 ViewModel。
- 个别视觉演示使用 code-behind 点击事件。

这些做法适合 demo，不是 MioKit 插件的默认架构。正式插件保持 ViewModel 与 Avalonia
控件解耦，并让 DI/导航/窗口服务负责创建和生命周期。

宿主桌面通知使用插件 Scope 中的 IToastService，可直接注入 ViewModel；见 [桌面通知](../../miokit-plugin-core/references/notifications.md)。
