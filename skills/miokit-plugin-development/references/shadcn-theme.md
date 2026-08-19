# Shadcn 主题与 DynamicResource

MioKit 宿主在 `Application.Styles` 中加载 `ShadTheme`，`ShadColorTheme` 注册的 `DynamicResource` 键在插件 AXAML 中**全局可用**；插件切换浅色/深色或语义色时，只要使用已注册键，UI 会自动跟随宿主主题。

编写插件 Avalonia 视图、ControlTheme 或自定义样式时，以本文为准。

---

## 1. AXAML 命名空间

使用 Shadcn 控件或主题资源时声明：

```xml
xmlns:shad="https://github.com/tiny-isle/Ti.Avalonia.Shadcn"
```

示例：

```xml
<UserControl xmlns="https://github.com/avaloniaui"
             xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
             xmlns:shad="https://github.com/tiny-isle/Ti.Avalonia.Shadcn"
             Background="{DynamicResource ShadBackgroundBrush}">
    <shad:ShadButton Content="保存" />
</UserControl>
```

插件**不需要**在自身 `App.axaml` 重复挂载 `ShadTheme`——宿主已加载。

---

## 2. 必需模式

- 主题敏感的颜色、画刷、圆角和阴影一律使用 **`DynamicResource`**，禁止硬编码 `#RRGGBB` 或固定 `CornerRadius`。
- 需要 `IBrush` 的属性用 **Brush 键**：`Background`、`Foreground`、`BorderBrush`、`Fill`、`Stroke`。
- 仅在 Avalonia 要求 `Color` 的位置用 **Color 键**（如 `GradientStop.Color`）。
- **不要发明** `ShadForeground`、`ShadBorder`、`ShadCornerRadiusMedium` 等未注册键；只用下文已注册键。
- 悬停、选中、按下、弱化、危险、焦点等状态优先用 **透明度变体**（`ShadMutedBrush-50`），不要手写 alpha 颜色。

---

## 3. 语义颜色资源

每个语义 token 同时注册 `*Color` 与 `*Brush`：

```xml
<Setter Property="Background" Value="{DynamicResource ShadPrimaryBrush}" />
<GradientStop Color="{DynamicResource ShadPrimaryColor}" />
```

| Token 前缀 | Color 键 | Brush 键 |
|------------|----------|----------|
| Background | `ShadBackgroundColor` | `ShadBackgroundBrush` |
| Foreground | `ShadForegroundColor` | `ShadForegroundBrush` |
| Card | `ShadCardColor` | `ShadCardBrush` |
| Card 前景 | `ShadCardForegroundColor` | `ShadCardForegroundBrush` |
| Popover | `ShadPopoverColor` | `ShadPopoverBrush` |
| Popover 前景 | `ShadPopoverForegroundColor` | `ShadPopoverForegroundBrush` |
| Primary | `ShadPrimaryColor` | `ShadPrimaryBrush` |
| Primary 前景 | `ShadPrimaryForegroundColor` | `ShadPrimaryForegroundBrush` |
| Secondary | `ShadSecondaryColor` | `ShadSecondaryBrush` |
| Secondary 前景 | `ShadSecondaryForegroundColor` | `ShadSecondaryForegroundBrush` |
| Muted | `ShadMutedColor` | `ShadMutedBrush` |
| Muted 前景 | `ShadMutedForegroundColor` | `ShadMutedForegroundBrush` |
| Accent | `ShadAccentColor` | `ShadAccentBrush` |
| Accent 前景 | `ShadAccentForegroundColor` | `ShadAccentForegroundBrush` |
| Information | `ShadInformationColor` | `ShadInformationBrush` |
| Information 前景 | `ShadInformationForegroundColor` | `ShadInformationForegroundBrush` |
| Warning | `ShadWarningColor` | `ShadWarningBrush` |
| Warning 前景 | `ShadWarningForegroundColor` | `ShadWarningForegroundBrush` |
| Danger | `ShadDangerColor` | `ShadDangerBrush` |
| Danger 前景 | `ShadDangerForegroundColor` | `ShadDangerForegroundBrush` |
| Border | `ShadBorderColor` | `ShadBorderBrush` |
| Input | `ShadInputColor` | `ShadInputBrush` |
| Ring（焦点环） | `ShadRingColor` | `ShadRingBrush` |
| Low 文本 | `ShadLowTextColor` | `ShadLowTextBrush` |
| Mute 文本 | `ShadMuteTextColor` | `ShadMuteTextBrush` |
| Disabled 文本 | `ShadDisabledTextColor` | `ShadDisabledTextBrush` |

---

## 4. 透明度变体

每个语义颜色还注册 **0～100、步进 5** 的透明度变体。

```xml
<Setter Property="Background" Value="{DynamicResource ShadMutedBrush-50}" />
<Setter Property="Foreground" Value="{DynamicResource ShadDangerBrush-80}" />
<GradientStop Color="{DynamicResource ShadRingColor-50}" />
```

有效后缀：

`-0`, `-5`, `-10`, `-15`, `-20`, `-25`, `-30`, `-35`, `-40`, `-45`, `-50`, `-55`, `-60`, `-65`, `-70`, `-75`, `-80`, `-85`, `-90`, `-95`, `-100`

### 常见状态映射

| 场景 | 推荐资源 |
|------|----------|
| 行悬停 | `ShadMutedBrush-50` |
| 选中行 | `ShadMutedBrush` |
| 轻量危险背景 | `ShadDangerBrush-20` 或 `ShadDangerBrush-25` |
| 强危险悬停 | `ShadDangerBrush-40` |
| 主按钮悬停 | `ShadPrimaryBrush-90` |
| 焦点环颜色 | `ShadRingBrush` 或 `ShadShadowFocusRing`（见 §6） |

---

## 5. 圆角资源

| 键 | 用途 |
|----|------|
| `ShadRadiusSize` | 数值半径 |
| `ShadRadius` | 默认半径 |
| `ShadRadiusSmall` | 小半径 |
| `ShadRadiusLarge` | 大半径 |
| `ShadCornerRadius` | 默认 `CornerRadius` |
| `ShadCornerRadiusSmall` | 小圆角 |
| `ShadCornerRadiusLarge` | 大圆角 |
| `ShadCornerRadiusBigLarge` | 超大圆角 |

```xml
<Setter Property="CornerRadius" Value="{DynamicResource ShadCornerRadius}" />
<Setter Property="CornerRadius" Value="{DynamicResource ShadCornerRadiusSmall}" />
```

---

## 6. 阴影资源

已注册的 `BoxShadows`：

| 键 | 用途 |
|----|------|
| `ShadShadowXs` | 输入框、按钮、复选框等轻量控件 |
| `ShadShadowSm` | 卡片、选中标签页 |
| `ShadShadowMd` | 弹出层、悬停卡片 |
| `ShadShadowFocusRing` | `:focus-visible` 焦点环 |

```xml
<Style Selector="^:focus-visible /template/ Border#PART_Border">
    <Setter Property="BoxShadow" Value="{DynamicResource ShadShadowFocusRing}" />
</Style>
```

---

## 7. Token 选择速查

| 场景 | 背景 | 前景/文本 |
|------|------|-----------|
| 页面或面板根 | `ShadBackgroundBrush` | `ShadForegroundBrush` |
| 卡片表面 | `ShadCardBrush` | `ShadCardForegroundBrush` |
| 浮层 / Popover | `ShadPopoverBrush` | `ShadPopoverForegroundBrush` |
| 主操作按钮 | `ShadPrimaryBrush` | `ShadPrimaryForegroundBrush` |
| 次操作按钮 | `ShadSecondaryBrush` | `ShadSecondaryForegroundBrush` |
| 弱化轨道、柔和行 | `ShadMutedBrush` | `ShadMutedForegroundBrush` |
| 中性悬停 / 激活 | `ShadAccentBrush` | `ShadAccentForegroundBrush` |
| 普通边框 | `ShadBorderBrush` | — |
| 输入框边框 | `ShadInputBrush` | — |
| 焦点指示 | `ShadRingBrush` 或 `ShadShadowFocusRing` | — |
| 危险 / 删除 | `ShadDangerBrush` | `ShadDangerForegroundBrush` |
| 次要说明文字 | — | `ShadMuteTextBrush` / `ShadLowTextBrush` |
| 禁用文字 | — | `ShadDisabledTextBrush` |

---

## 8. 插件约定

| ✅ 应做 | ❌ 禁止 |
|--------|--------|
| 视图根 `Background="{DynamicResource ShadBackgroundBrush}"` | 固定 Light/Dark 色值 |
| 优先复用 `shad:` 控件（Button、TextBox 等已有 ControlTheme） | 在插件内重复定义与 Shadcn 冲突的全局主题 |
| 自定义样式只用本文已注册键 | 在插件 AXAML 发明新的 `Shad*` 键 |
| 需要新全局 token | 向 MioKit / Ti.Avalonia.Shadcn 上游贡献新键 |

新增全局主题资源应在上游 `ShadColorTheme` 注册，以保证浅色/深色切换仍通过 `DynamicResource` 生效。

---

## 9. 相关

- WebView2 + Vue UI：[vue-bridge.md](vue-bridge.md)
- NuGet（Sdk 捆绑 Shadcn 相关包）：[nuget.md](nuget.md) §3.1
