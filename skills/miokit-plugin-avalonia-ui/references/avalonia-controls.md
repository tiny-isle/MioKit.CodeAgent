# Avalonia 控件与窗口辅助 API

本文件只记录 MioKit 插件使用 Avalonia 控件、窗口和图像时的约定。通用插件服务解析、
Feature 和图标 Provider 语义见 `miokit-plugin-core` 的对应参考文档。

## 控件与窗口

| API | 用途 |
|---|---|
| `shad:ShadWindow` | 插件顶层窗口的首选窗口基类/根元素，提供 MioKit Shadcn 标题栏和窗口能力 |
| `HighlightedTextBlock` / `MioObjectImage` / `KeyControl` | `MioKit.Sdk.Controls` 中的宿主兼容控件 |
| `TopLevelHelper.GetMainWindowTopLevel()` | 获取对话框父级 |
| `WindowManager.ShowUniqueWindow<T>(...)` | 显示单例窗口 |
| `WindowManager.SetOwnerId` / `GetOwnerId` | 标记窗口所属插件 |
| `WindowManager.CloseWindowsByOwnerIdAsync` | 插件停止时关闭所属窗口 |
| `PluginWindowExtensions.SetPluginIcon` | 使用插件图标设置窗口图标 |
| `PluginWindowExtensions.SetAppUserModelId` | 设置 Windows 任务栏分组 |
| `PluginWindowBehavior` | 在 AXAML 中聚合 Owner、AUMID 和图标行为 |

### 插件窗口标准模板

插件窗口优先使用 `ShadWindow`。将 `PluginWindowBehavior` 挂到窗口的
`Interaction.Behaviors`，并把 `Type` 设置为插件节点 Id；Behavior 会负责窗口所有者、
Windows 任务栏 AUMID 和插件图标。插件窗口默认开启置顶能力：当前 `ShadWindow` API
使用 `CanPin="True"`，不是 `IsPin`。

```xml
<shad:ShadWindow xmlns="https://github.com/avaloniaui"
                 xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
                 xmlns:i="using:Avalonia.Xaml.Interactivity"
                 xmlns:behaviors="using:MioKit.Sdk.Behaviors"
                 xmlns:shad="https://github.com/tiny-isle/Ti.Avalonia.Shadcn"
                 CanPin="True"
                 Title="插件窗口">
    <i:Interaction.Behaviors>
        <behaviors:PluginWindowBehavior Type="com.example.plugin.foo" />
        <!-- Type 也可以绑定，但值必须是插件节点 Id。 -->
    </i:Interaction.Behaviors>

    <!-- 页面内容 -->
</shad:ShadWindow>
```

`PluginWindowBehavior` 只负责插件窗口元数据与图标，不替代窗口状态、Owner 或业务
生命周期管理。窗口仍应通过宿主的 `WindowManager` 打开/关闭；插件停止时依赖已设置的
OwnerId 自动关闭。窗口图标加载失败不应阻塞窗口打开。

同一插件的窗口应将 `AppUserModelID` 直接设为插件 Id。窗口必须通过
`PluginWindowBehavior` 或 `SetOwnerId` 注册所有者，否则宿主停止插件时无法自动关闭。
不要使用进程级 `SetCurrentProcessExplicitAppUserModelID`。

## 图像与图标

`HighlightedTextBlock` 当前只提供 `Text` 与 `byte[] HighlightIndices` 作为高亮输入，
`HighlightBrush` / `HighlightBrushProperty` 已移除，不要设置；高亮前景由控件内部管理，
不会单独加粗。普通字重继承 TextBlock，索引不能表达 255 之后的位置。

`MioObjectImage` 切换到新节点时先清空，同一节点刷新时保留旧图直到替换就绪，Provider
依次返回空或发生异常后使用默认图；取消不应用本次结果。不要在 View 再实现默认图闪切、
重复请求或手工释放其 lease。

- `IImageService.GetIconAsync(IStorable, ct)` 返回 Avalonia `IImage`。
- `IconSource.Folder`、`IconSource.File` 等提供宿主缓存的 Avalonia 图像。
- `IIconLease` 必须由调用方按 SDK 约定释放；不要自行释放 lease 内部由宿主管理的共享图像。
- 图标 Provider 在后台执行，必须遵守取消令牌，不得读取控件或假设当前线程是 UI 线程。

## 节点拖放接收

SDK / Extensions 1.2.3+。在 View 处理视觉事件，把解析成功的节点交给 ViewModel；
协议、分类、类型核验及失效情况见核心 skill 的
[node-drag-drop.md](../../miokit-plugin-core/references/node-drag-drop.md)。

```xml
<Border DragDrop.AllowDrop="True"
        DragDrop.DragOver="OnDragOver"
        DragDrop.Drop="OnDrop"
        Background="{DynamicResource ShadCardBrush}"
        Padding="16">
    <TextBlock Text="从节点面板拖入节点" />
</Border>
```

code-behind 使用核心参考中的 `OnDragOver` / `OnDrop`：`Contains(e.DataTransfer)` 只是
轻量提示，Drop 必须 `TryGetNode` 并核验业务 Feature。代码注册事件时在脱树/关闭时解除，
重新挂载时再注册，不累积 Handler。不使用旧的 `e.Data` / 自行反序列化节点对象。

## 两种 Toast 与 Host

- **窗口内反馈**：已挂视觉树的 Control 使用 `GetShadToastManager()`，目标 Host 为
  `ShadToastHost`。Dialog / Drawer 分别需要自己的 Host；查找规则见
  [behaviors-and-attached-properties.md](behaviors-and-attached-properties.md)。
- **宿主桌面通知**：SDK 1.3.0+ 的 `IToastService` 从插件 Scope 注入，可后台调用，
  不要求插件窗口存在；完整版本前提、归属和操作规则见核心 skill 的
  [toast.md](../../miokit-plugin-core/references/toast.md)。

需要自定义通知消息区时：

```csharp
using Avalonia.Controls;
using MioKit.Sdk;

public static Guid ShowDeviceStatus(IToastService toasts) => toasts.Show(new ToastOptions
{
    Title = "设备状态",
    ContentFactory = () => new TextBlock { Text = "设备已连接" },
    Duration = TimeSpan.FromSeconds(6)
});
```

工厂在 UI 线程创建新的、未挂载的普通 Control，不返回 Window。宿主保留统一标题、
进度、按钮和外壳，不激活通知窗口；需要键盘输入时打开插件窗口。
关闭/替换会脱树并解除引用，宿主不 Dispose 控件或共享 DataContext。
订阅/计时器在 Attached/Detached 成对建立和解除；屏幕迁移/高度变化也可能导致同一
内容脱树后再挂载，不能在 Detached 假定永久销毁。

## UI 线程

- 不要在构造函数、属性 getter 或 AXAML 事件处理中执行同步 I/O。
- 后台结果回到 UI 线程后再修改控件绑定状态；业务服务不要直接持有 View 引用。
- 优先使用绑定、`ObservableObject` 和宿主焦点服务，不要自行维护跨窗口控件状态。
