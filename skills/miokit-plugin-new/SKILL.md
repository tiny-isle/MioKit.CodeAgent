---
name: miokit-plugin-new
description: >-
  创建 MioKit 插件解决方案时使用。负责判断新建场景、选择插件模板和调用
  MioKit MCP；不适用于已有插件项目的日常开发。
---

# MioKit 插件创建入口

本 skill 只负责创建阶段的 Agent 路由与选择。插件骨架、模板安装、环境检查和实际创建统一通过 MioKit MCP 完成；详细参数以 MCP tool schema 为准。

## 何时使用

工作区尚无 MioKit 插件解决方案时使用，通常表现为同时缺少：

- `plugin/plugin.json`
- 插件项目中的 `*Register.cs`
- 包含 `plugin/` 项目的解决方案文件

如果插件项目已经存在，停止使用本 skill，转入 `miokit-plugin-core`；若任务涉及 Avalonia 或 WebView2，再按需加载对应 UI Skill。

## 模板选择

- `miokit-plugin`：标准插件，无 WebView2 UI。
- `miokit-plugin-webview2`：包含 WebView2 + Vue UI 的插件。

根据用户是否需要 WebView2 UI 选择对应的 `template` 参数。除非用户明确要求，否则使用标准模板。

## 创建流程

1. 确认目标输出目录不是已有插件项目；不得覆盖已有的 `plugin/plugin.json`。
2. 调用 `check_dev_environment` 检查本机开发环境。
3. 环境通过后调用 `create_plugin`，传入 `template`、`name`、`output` 以及用户提供的可选元数据。
4. 未提供 `pluginId` 时，可先调用 `suggest_plugin_id`，再将结果传给 `create_plugin`。
5. 创建完成后，转入 `miokit-plugin-core` 继续实现核心功能；Avalonia 或 WebView2 UI 按需加载对应 Skill。

`create_plugin` 会从 nuget.org 检查 / 安装 / 更新 `MioKit.Plugin.Templates`，再生成项目。Agent 不要自行执行 `dotnet new install`、`dotnet new`，也不要从本地文件夹、本地 nupkg 或私有 NuGet 源安装模板。

## 行为约束

- 不要手写或复制插件解决方案骨架。
- 不要在已有插件项目上重复初始化。
- `pluginId` 应保持全局唯一；推荐使用 `com.<组织>.plugin.<短名>` 形式。
- `name` 和其它创建参数的具体语义、默认值及校验规则，以 `create_plugin` 的当前 schema 为准。
- 创建后的核心开发、校验、打包和发布规范不属于本 skill；按 `miokit-plugin-core` 执行，UI 任务按需加载 `miokit-plugin-avalonia-ui` 或 `miokit-plugin-webview2`。
