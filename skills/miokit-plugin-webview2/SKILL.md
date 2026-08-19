---
name: miokit-plugin-webview2
description: >-
  MioKit 插件的 WebView2 与 Vue UI 开发规范。用于 MioKit.Webview2、MioWebview2、[JsService]、ServiceBridge、Vue 3、vue-ui、ui/dist、pnpm 构建、主题同步和 WebView2 静态资源打包；通常与 miokit-plugin-core 一起使用。不要用于纯 Avalonia AXAML UI。
---

# MioKit WebView2 UI

本 Skill 负责 WebView2 宿主和 Vue 前端之间的边界。插件生命周期、节点、Feature、
服务注册和通用 NuGet/打包规则由 `miokit-plugin-core` 负责；网页组件、主题和交互规范
由本 Skill 的 `vue-ui.md` 参考文档定义，不依赖生成项目内的 `.agents` 文档。

## 路由

- 看到 `MioWebview2`、`MioKit.Webview2`、`[JsService]`、`ServiceBridge`、Vue、
  `vue-ui`、`ui/dist` 或 `pnpm` 时使用本 Skill。
- 纯 `.axaml`、Avalonia 控件、Shadcn 宿主主题和 Preview 任务使用
  `miokit-plugin-avalonia-ui`。
- C# 业务逻辑仍放在核心 Feature/Service；Vue 不直接访问文件系统、Win32 或插件数据。

## 参考文档

- [vue-bridge.md](references/vue-bridge.md)：C# `[JsService]`、Vue bridge、属性/集合/事件、主题同步和调试。
- [vue-ui.md](references/vue-ui.md)：Vue 工程结构、主题、组件、快捷键、样式与交互规范。
- [webview2-packaging.md](references/webview2-packaging.md)：前端构建、`ui/dist`、运行时加载和 Pack 配置。

## 工作约定

1. 使用模板生成的 `plugin/vue-ui/`，通过 `pnpm dev` 开发、`pnpm build` 生成发布产物；
   不把 `node_modules` 打入插件包。
2. `[JsService]` 对外方法只使用同步返回值或标准 `Task` / `ValueTask`；不要使用
   `async void`、自定义 awaitable 或自定义 delegate 事件。
3. 属性、集合和事件通过现有 bridge 同步；不要绕过 bridge 自己实现轮询或随意发送
   `postMessage`。
4. 发布前确保 `ui/dist/index.html` 和静态资源被复制到输出目录并进入 nupkg；不要把
   `MioKit.Webview2.dll` 或其他宿主共享 DLL 手动打包。
5. Vue 界面文案直接写中文，不引入 i18n；优先复用 `components/ui/`，并采用 Tailwind
   语义化主题类（`bg-background`、`text-foreground`、`border-border` 等）。
