# Behavior、附加属性与常用扩展

本文件记录 MioKit 插件可直接使用的 `Ti.Avalonia.Shadcn` Behavior、附加属性及少量
常用 C# 扩展。插件窗口元数据 Behavior 来自 `MioKit.Sdk`，与 Shadcn Behavior
不是同一命名空间。

## AXAML 命名空间

`Ti.Avalonia.Shadcn` 已把 `Behaviors`、`AttachedProperties`、控件、转换器和
MarkupExtension 映射到统一的 `shad:` 命名空间；挂载 Behavior 还需要 Avalonia
Interactivity：

```xml
xmlns:i="using:Avalonia.Xaml.Interactivity"
xmlns:shad="https://github.com/tiny-isle/Ti.Avalonia.Shadcn"
```

MioKit 插件窗口 Behavior 另行声明：

```xml
xmlns:behaviors="using:MioKit.Sdk.Behaviors"
```

## Behavior 选择

| Behavior | 挂载对象 | 关键属性 | 使用条件 |
|---|---|---|---|
| `ClickCommandBehaviors` | 任意 `InputElement` | `Command`、`CommandParameter` | 把非 Button 元素的左键点击映射为命令；拖动超过 6px 或在元素外释放时不执行 |
| `DocumentTextBindingBehavior` | AvaloniaEdit `TextEditor` | `Text` | `TextEditor.Document.Text` 与 ViewModel 字符串双向同步 |
| `ListItemDragBehavior` | `ListBoxItem` 内的可交互控件 | `Orientation`、水平/垂直阈值 | 在同一个 `ItemsControl` 内重排；数据源必须是可修改的 `IList` |
| `WindowMoveBehavior` | `Window` | `BorderName` | 自定义窗口 chrome；默认查找 `PART_MoveBorder` |
| `WindowResizeBehavior` | `Window` | `BorderName`、`ResizeBorderPx` | Windows 自定义窗口 chrome；默认查找 `PART_RootBorder`，边缘宽 8px |
| `PluginWindowBehavior` | 插件 `ShadWindow` | `Type` | MioKit SDK Behavior；统一设置 OwnerId、AUMID 和插件图标 |

`ClickCommandBehaviors` 的类名当前确实是复数，AXAML 中不要改写成
`ClickCommandBehavior`。`TagInput.LostFocusBehavior` 是 `TagInput` 的枚举属性类型，
不是可挂载 Behavior。

### 点击映射为命令

当控件本身没有 `Command` 时使用；原生 `Button`、`MenuItem` 等已有命令属性的控件
直接绑定命令。

```xml
<Border Padding="8"
        Background="{DynamicResource ShadCardBrush}">
    <i:Interaction.Behaviors>
        <shad:ClickCommandBehaviors
            Command="{Binding OpenCommand}"
            CommandParameter="{Binding}" />
    </i:Interaction.Behaviors>
    <TextBlock Text="{Binding Title}" />
</Border>
```

Behavior 会捕获左键指针，先调用 `CanExecute`，只在未形成拖拽且释放点仍位于元素内部时
执行命令。需要键盘可访问性时优先改用 `Button` 或给控件补充等价的键盘交互。

### AvaloniaEdit 文本双向绑定

```xml
<avaloniaEdit:TextEditor>
    <i:Interaction.Behaviors>
        <shad:DocumentTextBindingBehavior
            Text="{Binding DocumentText, Mode=TwoWay}" />
    </i:Interaction.Behaviors>
</avaloniaEdit:TextEditor>
```

ViewModel 只保存字符串，不持有 `TextEditor` 或 `TextDocument`。大文本的解析、保存和
搜索应在后台服务中执行；不要在 `TextChanged` 链路做同步 I/O。

### 列表项拖动排序

把 Behavior 放在 `DataTemplate` 内的拖动把手或内容根上，使其能向上找到所属
`ListBoxItem`：

```xml
<ListBox ItemsSource="{Binding Items}">
    <ListBox.ItemTemplate>
        <DataTemplate>
            <Border Padding="8">
                <i:Interaction.Behaviors>
                    <shad:ListItemDragBehavior
                        Orientation="Vertical"
                        VerticalDragThreshold="4" />
                </i:Interaction.Behaviors>
                <TextBlock Text="{Binding Name}" />
            </Border>
        </DataTemplate>
    </ListBox.ItemTemplate>
</ListBox>
```

- `ItemsSource` 使用可修改、可观察的列表，通常为 `ObservableCollection<T>`。
- Behavior 直接对列表执行 `RemoveAt` / `Insert`，不适用于只读、分页或虚拟排序结果。
- 拖动期间容器会获得 `:dragging` 伪类，可在局部样式中提供反馈。
- 若排序还要持久化，在集合变更或单独命令中异步保存，不在指针事件中同步写盘。

### 自定义窗口移动与缩放

`ShadWindow` 已提供完整标题栏和窗口能力时不要重复挂载。只有自绘原生 `Window`
chrome 时才组合使用：

```xml
<Window xmlns:i="using:Avalonia.Xaml.Interactivity"
        xmlns:shad="https://github.com/tiny-isle/Ti.Avalonia.Shadcn"
        ExtendClientAreaToDecorationsHint="True">
    <i:Interaction.Behaviors>
        <shad:WindowMoveBehavior BorderName="TitleDragRegion" />
        <shad:WindowResizeBehavior
            BorderName="WindowRootBorder"
            ResizeBorderPx="8" />
    </i:Interaction.Behaviors>

    <Border x:Name="WindowRootBorder">
        <Grid RowDefinitions="Auto,*">
            <Border x:Name="TitleDragRegion" Height="36" />
            <ContentPresenter Grid.Row="1" />
        </Grid>
    </Border>
</Window>
```

`WindowResizeBehavior` 依赖 Win32 `WM_NCHITTEST`，不要把它当作跨平台缩放方案；最大化
状态下不会提供缩放命中。用于拖动/缩放的命名 `Border` 必须存在于窗口视觉树中。

插件 `ShadWindow` 的标准 `PluginWindowBehavior` 模板见
[avalonia-controls.md](avalonia-controls.md)。

## 通用附加属性

附加属性虽然可设置在其注册基类上，但只有消费它的 Shad 主题/控件会产生视觉效果。
例如 `ShadInfo.Title` 能设置在任意 `Control` 上，不代表任意控件模板都会自动渲染标题。

| 附加属性 | 类型 | 常见消费方 | 用法 |
|---|---|---|---|
| `ShadIcon.Icon` | `object?` | Button、RepeatButton、SplitButton、ToggleButton | 普通状态图标；可传字符串、`LucideIcon` 或其他可显示内容 |
| `ShadIcon.ToggledIcon` | `object?` | ToggleButton | 选中状态图标；未设置时通常沿用普通图标 |
| `ShadLoading.IsLoading` | `bool` | Button、SplitButton | 切换模板中的加载指示；业务侧仍应避免重复提交 |
| `ShadInfo.Title` | `string?` | 输入、选择、日期时间、开关等 Field 风格主题 | 字段标题 |
| `ShadInfo.Description` | `string?` | 同上 | 辅助说明 |
| `ShadElement.MinHeight` | `double` | TextBox、AutoCompleteBox、ColorPicker 等指定主题 | 调整模板内部输入区域最小高度 |

### 字段标题、说明与校验

```xml
<TextBox shad:ShadInfo.Title="邮箱"
         shad:ShadInfo.Description="用于接收登录和安全提醒。"
         Text="{Binding Email, Mode=TwoWay}" />
```

优先把短、稳定的 UI 文案写在 AXAML；会变化或需要本地化的数据再绑定 ViewModel。
`Description` 是辅助说明，不代替 Avalonia 的数据验证错误展示。

### 图标与加载状态

```xml
<Button Command="{Binding SaveCommand}"
        shad:ShadLoading.IsLoading="{Binding IsSaving}">
    保存
</Button>

<ToggleButton IsChecked="{Binding IsPinned}"
              shad:ShadIcon.Icon="○"
              shad:ShadIcon.ToggledIcon="●" />
```

图标属性是 `object` 内容槽，不要把平台文件路径当作自动加载的图像。优先使用
`LucideIcon`、宿主图标服务返回的 `IImage` 或已有 Shad 图标内容。

## 专用附加属性

### `ButtonGroup.ItemCornerRadius`

`ButtonGroup` 会按横向/纵向位置为子项写入 `ItemCornerRadius`，主题再读取它形成连续
圆角。插件通常只设置组的 `CornerRadius` 与 `Orientation`，不要手工给子项写
`ItemCornerRadius`，因为刷新项目时会被覆盖。

```xml
<shad:ButtonGroup Orientation="Horizontal"
                  CornerRadius="{DynamicResource ShadCornerRadius}">
    <Button Content="左" />
    <Button Content="中" />
    <Button Content="右" />
</shad:ButtonGroup>
```

### `MenuPopupSizing`

`MenuPopupSizing.ConstrainToScreen` 用于菜单 Popup 模板中的可滚动区域，根据当前屏幕
工作区设置 `MaxHeight`；`ScreenInset` 默认 48。它是主题实现辅助属性，不是普通页面
`ScrollViewer` 的通用尺寸策略。

```xml
<ScrollViewer themes:MenuPopupSizing.ConstrainToScreen="True"
              themes:MenuPopupSizing.ScreenInset="48" />
```

直接使用时需声明 `xmlns:themes="using:Ti.Avalonia.Shadcn.Themes"`。普通插件菜单通常已由
Shad 主题配置，无需重复设置。

## 常用 C# 扩展

引入 `using Ti.Avalonia.Shadcn.Extensions;`。

### 插件/View 常用

| API | 适用时机 | 注意 |
|---|---|---|
| `control.GetShadDialogManager()` | 从已挂到视觉树的控件打开 Dialog | 解析出的 Hosts 必须含 `ShadDialogHost` |
| `control.GetShadDrawerManager()` | 打开 Drawer | 解析出的 Hosts 必须含 `ShadDrawerHost` |
| `control.GetShadToastManager()` | 发布窗口内 Toast | 解析出的 Hosts 必须含 `ShadToastHost`；不同于宿主 `IToastService` |
| `control.GetShadWindow()` | 从当前控件取得顶层 `ShadWindow` | 未挂到对应视觉树时返回 `null` |
| `control.FindShadHost<T>()` / `GetRequiredShadHost<T>()` | 查找自定义或内置 Host | `Find` 返回 `null`；`Required` 缺失时抛异常 |
| `control.FindRequiredControl<T>(name)` | 自定义控件模板/名称作用域中的必需部件 | 找不到会抛异常；普通 View 优先 `x:Name` 生成字段或绑定 |
| `host.FindRequiredResource(key)` | 控件/主题实现读取必需资源 | 找不到会抛异常；主题敏感 AXAML 仍优先 `DynamicResource` |
| `window.GetHostScreen()` / `GetRenderScaling()` | 自定义窗口定位、按 DPI 计算尺寸 | 屏幕可能为空；缩放值包含项目对 macOS 的兼容处理 |
| `window.CenterOnScreen()` | 自定义窗口显示前后居中 | 仅正常窗口状态生效 |
| `window.ConstrainMaxSizeToScreenRatio(w, h)` | 限制窗口相对工作区最大尺寸 | 比例应在 0～1；全屏/最大化时解除限制 |
| `await window.LaunchLinkAsync(link)` | 用平台 Launcher 打开文件、目录或 URI | 返回 `false` 表示输入无效或无法按支持类型处理 |
| `color.WithAlpha(alpha)` | 从已有 `Color` 派生透明度变体 | `double` 重载的 `alpha` 使用 0～1；主题 AXAML 仍优先现成的 `Shad*Color-N` |
| `EnumExtensions.GetValues<T>()` | 枚举选择项 | `orderByName=true` 才按名称排序；默认保持枚举声明顺序 |
| `flags.GetSetFlags()` | 展开 `[Flags]` 枚举 | 值为 0 的枚举项总会匹配；需要排除时用 `GetSetFlagsIgnoring` |

Shadcn 1.2.3 基准下，Host 查找先使用顶层 `ShadWindow.Hosts`；顶层不是 ShadWindow 时，
查找当前控件所在的 `ShadMainHost`，再回退到同一 TopLevel 中首个 `ShadMainHost` 的
Hosts。顶层是 ShadWindow 但缺少目标 Host 时不会继续回退。`FindShadHost<T>()` 可为空，
`GetRequiredShadHost<T>()` / manager 获取在缺失时抛异常。`GetShadWindow()` 本身仍只
返回顶层 ShadWindow，不因存在 ShadMainHost 而成功。

Host manager 从当前已挂树的 View/Control 取得，不要存进 ViewModel。
宿主桌面 `IToastService` 无此视觉树要求，可注入业务服务/ViewModel。
窗口与通知的完整约定见 [avalonia-controls.md](avalonia-controls.md)。

### 控件、Behavior 与主题实现

下列 API 是公开的，但通常只在编写自定义控件、Behavior 或主题时使用：

| API 组 | 用途 | 生命周期/约束 |
|---|---|---|
| `observable.Subscribe(Action<T>)` | 简化 Avalonia observable 订阅 | 保存返回的 `IDisposable`，在卸载/`OnDetaching` 时释放 |
| `RoutedEventExtension.AddHandler` / `RemoveHandler` | 给多个 `Interactive` 批量注册路由事件 | 注册和注销对象集合必须对应 |
| `RoutedEventExtension.AddDisposableHandler` | 注册一个或多个路由事件并返回组合释放对象 | 优先用于需要明确卸载的 Behavior/控件 |
| `AvaloniaPropertyExtension.SetValue` | 给一组 `AvaloniaObject` 批量写同一属性 | 不用于替代普通绑定 |
| `AvaloniaPropertyExtension.AffectsPseudoClass` | bool AvaloniaProperty 变化时同步伪类，可选抛出路由事件 | 在控件静态初始化阶段注册一次 |
| `AcquireMainHostPseudoClass` / `ReleaseMainHostPseudoClass` | Overlay/Host 协调 `ShadMainHost` 伪类 | 必须成对调用；普通插件 View 不应占用宿主内部状态 |
| `color.ToFloatArray()` / `ToFloatArrayNonAlloc` | 将 RGB 转为 0～1 浮点数组供 shader uniform 使用 | `NonAlloc` 的目标数组长度至少为 3 |

`FindRequiredControl`、`FindRequiredResource` 和所有 `Required` API 会在前置条件不满足时
抛异常。它们适合固定 ControlTemplate 契约，不适合处理可选元素或可选资源。

## Windows 版本 MarkupExtension

`OnWindowsVersion` 只适合 AXAML 中的视觉差异；非 Windows 使用默认值：

```xml
<Setter Property="CornerRadius"
        Value="{shad:OnWindowsVersion 10,
                Win10=0,
                Win11=10,
                x:TypeArguments=CornerRadius}" />
```

不要用它分支业务能力或插件生命周期；业务平台判断放在服务层。
