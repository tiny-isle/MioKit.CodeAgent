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

- `IImageService.GetIconAsync(IStorable, ct)` 返回 Avalonia `IImage`。
- `IconSource.Folder`、`IconSource.File` 等提供宿主缓存的 Avalonia 图像。
- `IIconLease` 必须由调用方按 SDK 约定释放；不要自行释放 lease 内部由宿主管理的共享图像。
- 图标 Provider 在后台执行，必须遵守取消令牌，不得读取控件或假设当前线程是 UI 线程。

## UI 线程

- 不要在构造函数、属性 getter 或 AXAML 事件处理中执行同步 I/O。
- 后台结果回到 UI 线程后再修改控件绑定状态；业务服务不要直接持有 View 引用。
- 优先使用绑定、`ObservableObject` 和宿主焦点服务，不要自行维护跨窗口控件状态。
