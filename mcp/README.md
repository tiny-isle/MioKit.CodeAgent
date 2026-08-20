# @tiny-isle/miokit-mcp

用于 MioKit 插件开发的 MCP 服务。配置到支持 MCP 的 AI 客户端后，AI 可以帮助你检查开发环境、创建插件、生成插件标识、校验 `plugin.json`、打包和检查 `.nupkg` 文件。

## 前置要求

- Node.js 20 或更高版本
- .NET 10 SDK
- 如果开发 WebView2 插件，还需要安装 Microsoft Edge WebView2 Runtime
- `ensure_plugin_templates` 会从 NuGet 检查或安装 `MioKit.Plugin.Templates`

`pnpm` 缺失只会产生警告，不会阻止标准插件操作。

## 配置 MCP 客户端

在 MCP 客户端的配置文件中加入以下服务器配置。以 Cursor 为例，可以放在项目的 `.cursor/mcp.json` 或用户级 MCP 配置中：

```json
{
  "mcpServers": {
    "miokit-mcp": {
      "command": "npx",
      "args": ["-y", "@tiny-isle/miokit-mcp@latest"]
    }
  }
}
```

配置后重启或重新加载 MCP 客户端。服务器通过 stdio 工作，不需要配置端口，也不需要设置 `cwd`。

如果希望固定版本，可以把 `@latest` 改成具体版本，例如：

```json
"args": ["-y", "@tiny-isle/miokit-mcp@0.0.1"]
```

## 怎么使用

配置完成后，直接在 AI 客户端中描述你的目标即可。例如：

- “检查当前机器是否可以开发标准 MioKit 插件。”
- “帮我创建一个名为 `DemoPlugin` 的标准 MioKit 插件，放到 `D:\Projects\DemoPlugin`。”
- “帮我为组织 `tinyisle` 的 `Inventory` 插件生成插件 ID。”
- “校验这个插件的 `plugin/plugin.json`，并告诉我需要修改什么。”
- “把这个插件打成 1.0.0 版本的 NuGet 包，并检查包内容。”
- “给这个 EAV 属性生成一个稳定的 GUID。”

涉及创建、安装模板或打包时，AI 会先检查本机开发环境；如果检查失败，会返回具体缺少的组件或修复提示。

## 提供的工具

| 工具 | 用途 |
| --- | --- |
| `check_dev_environment` | 检查 .NET 10 SDK；WebView2 插件还会检查 WebView2 Runtime |
| `ensure_plugin_templates` | 从 NuGet 安装或更新 `MioKit.Plugin.Templates` |
| `suggest_plugin_id` | 生成 `com.<org>.plugin.<slug>` 格式的插件 ID |
| `create_plugin` | 使用 MioKit 模板创建新的标准插件或 WebView2 插件 |
| `generate_guid` | 生成 TypeId、EAV `WithId` 等场景使用的 GUID |
| `validate_plugin_json` | 检查 `plugin.json` 的必填字段、版本和禁止字段 |
| `pack_plugin` | 使用 `dotnet pack` 生成 NuGet 插件包，并默认自动检查包内容 |
| `inspect_plugin_nupkg` | 检查已有 `.nupkg` 的目录结构、程序集、图标和发布元数据 |

## 常见工作流

### 创建新插件

1. 确认已安装 Node.js、.NET 10 SDK，以及 WebView2 Runtime（仅 WebView2 插件需要）。
2. 告诉 AI 插件类型、名称、输出目录和可选的组织名。
3. AI 会检查环境、确保模板可用，然后创建插件解决方案。

### 检查并打包已有插件

1. 让 AI 校验 `plugin/plugin.json`。
2. 让 AI 使用 `pack_plugin` 打包，并提供插件解决方案根目录和版本号。
3. 默认情况下，打包完成后会继续检查生成的 `.nupkg`。

`pack_plugin` 只负责生成和检查包，不会把 NuGet 包发布到远程仓库。

## Resources

服务还提供以下只读资源，AI 客户端可以按需读取：

- `miokit://plugin-json-schema`：`plugin.json` 的最小有效结构和禁止字段
- `miokit://packaging-hints`：插件目录、`PackageId`、版本和图标相关要求

## 常见问题

### 找不到 `npx` 或 Node.js

安装 Node.js 20+ 后，重启 AI 客户端，使客户端能够读取更新后的 PATH。

### 缺少 .NET 10 SDK

安装 .NET 10 SDK，并在终端运行 `dotnet --list-sdks` 确认已安装。仅安装运行时是不够的。

### WebView2 插件检查失败

除了 .NET 10 SDK，还需要安装 Microsoft Edge WebView2 Runtime。标准插件不需要此运行时。

### 模板安装失败

模板从 NuGet 获取，需要网络连接。如果模板曾经通过本地文件夹安装，先移除该本地安装，再让 AI 重新运行 `ensure_plugin_templates`。

### 路径相关错误

涉及文件读取、创建或打包时，建议提供插件目录和文件的绝对路径，尤其是在 Windows 环境中。

## 安全提示

这个 MCP 服务会在本机调用 `dotnet`、安装 MioKit 模板，并根据 AI 的请求创建或修改文件。请只在你信任的 AI 客户端和工作区中启用它，并在执行创建、安装和打包操作前检查 AI 使用的路径。

## 相关链接

- [npm package](https://www.npmjs.com/package/@tiny-isle/miokit-mcp)
- [MioKit.CodeAgent repository](https://github.com/tiny-isle/MioKit.CodeAgent)
