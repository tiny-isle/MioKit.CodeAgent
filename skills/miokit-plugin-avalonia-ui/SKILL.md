---
name: miokit-plugin-avalonia-ui
description: >-
  MioKit 插件的 Avalonia UI 开发规范。用于 .axaml、Avalonia UserControl/Window、Ti.Avalonia.Shadcn、DynamicResource 主题、MioKit.Sdk.Controls、Preview 项目、SearchBox Dialog、插件窗口、图标和 UI 线程问题；通常与 miokit-plugin-core 一起使用。不要用于 MioWebview2、JsService 或 Vue 前端。
---

# MioKit Avalonia UI

本 Skill 只负责 MioKit 的 Avalonia 壳层和控件。插件生命周期、节点、搜索、Feature、
服务和打包基础由 `miokit-plugin-core` 负责；需要这些能力时同时使用核心 Skill。

## 路由

- 看到 `.axaml`、`Avalonia.Controls`、`Ti.Avalonia.Shadcn`、`MioKit.Sdk.Controls`、
  `DynamicResource`、Preview 或 Dialog 时使用本 Skill。
- `MioWebview2`、`[JsService]`、Vue 组件和 `pnpm` 任务使用
  `miokit-plugin-webview2`，不要把网页 UI 当成普通 AXAML 控件处理。
- 主题资源由宿主加载；不要在插件 `App.axaml` 重复挂载宿主主题。

## 参考文档

- [shadcn-theme.md](references/shadcn-theme.md)：AXAML 命名空间、语义颜色、透明度、圆角、阴影和主题约定。
- [search-box-dialog.md](references/search-box-dialog.md)：SearchBox Dialog、焦点、键盘和自定义 Dialog 控件。
- [avalonia-controls.md](references/avalonia-controls.md)：MioKit 控件、插件窗口、Avalonia 图像和 UI 辅助 API。

## 工作约定

1. 先确认宿主已提供 `ShadTheme`，在 AXAML 中使用已注册的语义
   `DynamicResource`，不要硬编码跨主题颜色。
2. 视图只负责展示和交互；数据访问、搜索和长耗时工作放在核心 Feature 或服务中，
   不在 UI 线程执行阻塞操作。
3. 插件顶层窗口优先使用 `shad:ShadWindow`，不要无理由退回原生 `Window`。在窗口的
   `Interaction.Behaviors` 中挂载 `PluginWindowBehavior`，将 `Type` 设置为插件节点 Id，
   由 Behavior 统一设置 Owner、AUMID 和窗口图标；不要自行读取 `IconPath`、手动调用
   `GetIconAsync` 或维护全局窗口字典、图标 lease。
4. 插件窗口默认设置 `CanPin="True"`，让用户可以使用 ShadWindow 的置顶功能。当前
   `ShadWindow` 的实际属性名是 `CanPin`，不要写不存在的 `IsPin`。
5. 需要在搜索框内编辑时，使用宿主 `ISearchBoxWindow` 与 `IDialogContext`，不要
   自建脱离宿主生命周期的顶层窗口。
