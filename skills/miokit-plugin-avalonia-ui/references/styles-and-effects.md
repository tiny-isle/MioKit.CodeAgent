# 常用 Classes、Style 与视觉效果

本文件只列出当前 `Ti.Avalonia.Shadcn` 主题真实定义、且对 MioKit 插件常用的变体。
`Classes` 大小写敏感，多个 class 用空格组合。MioKit 宿主已加载 `ShadTheme`，插件不要
在自己的 `App.axaml` 再注册一次主题。

## 快速选择

### 操作控件

| 控件 | 已验证 Classes | 效果与选择 |
|---|---|---|
| `Button` / `RepeatButton` | `Secondary`、`Outline`、`Ghost`、`Destructive`、`Link`；尺寸 `Xs`、`Sm`、`Lg`；图标尺寸 `Icon`、`IconXs`、`IconSm`、`IconLg` | 默认主操作；次级、描边、透明、危险、链接语义按场景选一个 |
| `ToggleButton` | `Outline`、`Sm`、`Lg`、`Icon`、`IconSm`、`IconLg` | `Outline` 在 `:checked` 时显出选中背景；图标可用 `ShadIcon` 附加属性切换 |
| `SplitButton` | `Secondary`、`Outline`、`Ghost`、`Destructive`、`Xs`、`Sm`、`Lg` | “主要动作 + 更多动作”，不要用两个普通按钮硬拼 |
| `shad:IconButton` | `Primary`、`Accent`、`Success`、`Warning`、`Error` | 预设 Lucide 图标按钮；设置 `Kind`，图标-only 仍需 `ToolTip.Tip` 或可访问名称 |

```xml
<StackPanel Orientation="Horizontal" Spacing="8">
    <Button Content="保存" />
    <Button Classes="Secondary" Content="取消" />
    <Button Classes="Outline Sm" Content="更多" />
    <Button Classes="Ghost IconSm"
            ToolTip.Tip="搜索"
            shad:ShadIcon.Icon="⌕" />
    <Button Classes="Destructive" Content="删除" />
</StackPanel>
```

语义外观 class 只选一个，不要组合 `Secondary Destructive`、`Ghost Outline` 等互斥
变体。尺寸 class 可以组合，例如 `Outline Sm`、`Ghost IconSm`。有文字的按钮不要使用
`Icon*`，否则内容布局会按正方形图标按钮处理。

### 输入与选择

| 控件 | 已验证 Classes | 效果与选择 |
|---|---|---|
| `TextBox` | `Invalid`、`Sm`、`Embedded` | 错误、紧凑、嵌入式输入；`Embedded` 只用于外层已提供背景和边框的组合控件 |
| `ComboBox` / `AutoCompleteBox` | `Invalid`、`Sm` | 错误或紧凑选择器 |
| `NumericUpDown` | `Invalid`、`Sm` | 错误或紧凑数字输入 |
| `CalendarDatePicker` | `Invalid` | 可输入日期的验证反馈 |
| `DatePicker` / `TimePicker` | `Sm` | 紧凑日期/时间选择 |
| `RadioButton` | `ChoiceCard` | 整项呈现为单选卡片 |
| `ToggleSwitch` | `Sm`、`ChoiceCard` | 紧凑开关或设置项卡片 |

验证 class 可以由 ViewModel 状态切换：

```xml
<TextBox Text="{Binding Email, Mode=TwoWay}"
         Classes.Invalid="{Binding HasEmailError}"
         shad:ShadInfo.Title="邮箱"
         shad:ShadInfo.Description="{Binding EmailHint}" />
```

`Invalid` 只负责视觉状态，错误文案仍由表单/验证层提供。不要用 converter 把超范围值
偷偷裁剪；数字、日期和时间范围优先通过控件属性和 ViewModel 验证表达。

### 容器、集合与导航

| 控件 | 已验证 Classes | 效果与选择 |
|---|---|---|
| `Border` | `Card`、`Shadow` | `Card` 提供卡片表面、边框、圆角和轻阴影；`Shadow` 只加浮起阴影 |
| `GroupBox` / `Expander` | `Small`、`Muted`、`Card` | 紧凑、弱化或完整卡片分组 |
| `GridSplitter` | `WithHandle` | 显示明确的拖动把手 |
| `TabControl` | `Line` | 页面级下划线标签，选中背景保持透明 |
| `ListBox` / `TreeView` | `Outline`；TreeView 另有 `Compact` | 有边框容器；紧凑树间距 |
| `DataGrid` | `CenterAlign`、`RightAlign` | 状态/短列居中，数字列右对齐 |
| `MenuItem` | `Inset`、`Destructive` | 缩进菜单项；不可逆动作使用危险样式 |

`ListBoxItem`、`TreeViewItem`、`MenuItem` 的悬停、选中和焦点已由主题负责。普通插件
不要再硬编码状态背景；需要业务区分时增加语义内容、图标或局部 class。

### 反馈与排版

| 控件 | 已验证 Classes | 效果与选择 |
|---|---|---|
| `ProgressBar` | `Accent`、`Information`、`Warning`、`Danger`、`Sm`、`Lg` | 语义状态色和高度 |
| `Slider` | `Information`、`Warning`、`Danger` | 轨道与 Thumb 的语义色 |
| `shad:Skeleton` | `Circle` | 圆形头像占位；普通文本骨架直接设置宽高 |
| `TextBlock` | `H1`、`H2`、`H3`、`H4`、`P`、`Lead`、`Large`、`Small`、`Muted`、`Blockquote`、`InlineCode` | 使用语义排版，说明文字优先 `Muted` |

### Shad 专用控件

| 控件 | 常用 Classes | 用途 |
|---|---|---|
| `shad:Alert` | `Destructive` | 普通提示或危险/错误提示 |
| `shad:Badge` | `Secondary`、`Destructive`、`Outline`、`Ghost`、`Link`、`Selected` | 状态、标签和可选择徽章 |
| `shad:Card` | `Small` | 带 Header/Description/Action/Footer 的卡片；`Small` 紧凑 |
| `shad:Skeleton` | `Circle` | 加载占位 |

## 常用表面与效果

| 场景 | 背景/前景 | 圆角/阴影 |
|---|---|---|
| 页面根 | `ShadBackgroundBrush` / `ShadForegroundBrush` | 通常无阴影 |
| 卡片 | `ShadCardBrush` / `ShadCardForegroundBrush` | `ShadCornerRadius` + `ShadShadowSm` |
| Popup / Flyout | `ShadPopoverBrush` / `ShadPopoverForegroundBrush` | `ShadCornerRadius` + `ShadShadowMd` |
| 弱化分区 | `ShadMutedBrush` / `ShadMutedForegroundBrush` | 按容器语义选择 |
| 危险浅底 | `ShadDangerBrush-20` / `ShadDangerBrush` | 可配 `ShadDangerBrush-40` 边框 |
| 焦点 | 保持控件语义色 | `ShadShadowFocusRing` 或 `ShadRingBrush` |

```xml
<Border Background="{DynamicResource ShadCardBrush}"
        BorderBrush="{DynamicResource ShadBorderBrush}"
        BorderThickness="1"
        CornerRadius="{DynamicResource ShadCornerRadius}"
        BoxShadow="{DynamicResource ShadShadowSm}"
        Padding="16">
    <StackPanel Spacing="6">
        <TextBlock Classes="Large" Text="插件设置" />
        <TextBlock Classes="Muted" Text="更改会在保存后生效。" />
    </StackPanel>
</Border>
```

Popup/Flyout 的阴影若由内部 `Border` 绘制，把
`Margin="{DynamicResource ShadShadowMdMargin}"` 设置到同一个 Border，为阴影预留布局
空间；不要设到 Presenter、动画容器或浮层控件本身。

完整主题键、透明度后缀和语义映射见 [shadcn-theme.md](shadcn-theme.md)。

## 透明空闲态的正确过渡

当空闲状态应透明、悬停/选中才出现颜色时，不要让 `Background` 从 `Transparent`
过渡到主题画刷，也不要把空闲背景改成 `ShadBackgroundBrush`。保持一个稳定的目标画刷，
只切换模板背景层 `Opacity`：

```xml
<Button Content="移除" Classes="QuietDanger">
    <Button.Styles>
        <Style Selector="^">
            <Setter Property="Background"
                    Value="{DynamicResource ShadDangerBrush-20}" />
            <Setter Property="Foreground"
                    Value="{DynamicResource ShadDangerBrush}" />
        </Style>
        <Style Selector="^ /template/ Border#PART_Background">
            <Setter Property="Opacity" Value="0" />
        </Style>
        <Style Selector="^:pointerover /template/ Border#PART_Background">
            <Setter Property="Opacity" Value="1" />
        </Style>
    </Button.Styles>
</Button>
```

这适用于 Ghost、Link、Outline、列表行、日历项、命令项等“空闲透明、状态显色”的视觉。
卡片、输入框、Popup、菜单表面、进度轨道等真实表面不使用这个模式。

Shadcn 1.2.3 的 `MultiComboBoxItem`、`PaginationButton` 已使用独立的
`Border#PART_Background` 承载状态透明度；不要把控件整体 `Opacity` 改为 0，否则文字
和交互内容也会消失。`SplitButton.Ghost` 的主/次按钮和 Flyout 打开状态已由主题各自
管理，优先使用内置 `Ghost`，不要用多层 `/template/` 选择器穿透内部 Button。
滚动条翻页 RepeatButton 使用独立透明主题，不把它改回普通带背景按钮。

## 局部 Style 约定

- 插件特有外观放在 View/控件的局部 `Styles` 中，选择器带控件类型或专用 class，避免
  污染全局原生控件。
- 主题敏感颜色、圆角、阴影使用 `DynamicResource`；不要固定浅色/深色 hex。
- Brush 属性用 `*Brush`，`GradientStop.Color` 等 Color 属性用 `*Color`。
- 透明度资源后缀只能是 0～100 且能被 5 整除，例如 `-20`、`-50`、`-90`。
- 一个 `Style Selector` 最多包含一个 `/template/`。不要写多层 template selector，
  也不要用逗号合并多个带 `/template/` 的选择器；它们可能编译成功后在运行期崩溃。
- `:focus-visible` 使用焦点环；不要只依赖 `:pointerover` 表达可交互状态。

```xml
<UserControl.Styles>
    <Style Selector="Border.SettingsSection">
        <Setter Property="Background"
                Value="{DynamicResource ShadCardBrush}" />
        <Setter Property="BorderBrush"
                Value="{DynamicResource ShadBorderBrush}" />
        <Setter Property="BorderThickness" Value="1" />
        <Setter Property="CornerRadius"
                Value="{DynamicResource ShadCornerRadius}" />
        <Setter Property="Padding" Value="16" />
    </Style>
</UserControl.Styles>
```

## 常见误用

| 不要 | 应改为 |
|---|---|
| 猜测 `PrimaryButton`、`Dangerous`、`Medium` 等 class | 使用本文件已验证名称，或定义插件局部 class |
| 一个按钮叠加两个语义 class | 一个语义 class + 可选尺寸 class |
| 给 Ghost/列表空闲态设置 `ShadBackgroundBrush` | 稳定状态画刷 + 背景层 `Opacity` |
| 在插件内复制整个 Shad ControlTheme | 先用内置 class；差异放局部 Style |
| 固定灰色、圆角、阴影 | 使用 `ShadMuted*`、`ShadCornerRadius*`、`ShadShadow*` |
| 用颜色代替验证、禁用或选择状态 | 绑定真实状态，让主题伪类/`Invalid` class 呈现 |
