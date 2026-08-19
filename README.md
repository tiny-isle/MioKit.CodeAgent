# miokit-mcp

MioKit 的 Node.js MCP 服务。P0 工具覆盖插件创建、标识、`plugin.json` 校验、打包与验包；P1 及之后的能力见 [`.cursor/docs/README.md`](.cursor/docs/README.md)。

## 要求

- Node.js 20+
- 本机 `dotnet` SDK（`ensure_plugin_templates` / `create_plugin` / `pack_plugin`）

## 开发

```bash
npm install
npm start
npm test
npm run typecheck
```

stdio 上 stdout 是协议通道，日志请用 `console.error`。

用 Inspector 手动调工具：

```bash
npm run inspect
```

## Cursor

项目已包含 `.cursor/mcp.json`。在 Cursor Settings → MCP 中启用 `miokit-mcp` 后即可在 Agent 对话里调用工具。

## 工具

| 名称 | 说明 |
|------|------|
| `ensure_plugin_templates` | 从 NuGet 检查 / 安装 / 更新 `MioKit.Plugin.Templates`；拒绝本地文件夹安装 |
| `suggest_plugin_id` | 生成 `com.<org>.plugin.<slug>` |
| `create_plugin` | 先 ensure，再 `dotnet new miokit-plugin` / `miokit-plugin-webview2` |
| `generate_guid` | TypeId / EAV `WithId` 等稳定 GUID |
| `validate_plugin_json` | 必填字段、禁止旧发布字段、`System.Version` |
| `pack_plugin` | `dotnet pack` 到 `artifacts/`；默认接着 inspect |
| `inspect_plugin_nupkg` | 解压检查 nupkg 是否符合插件包规范 |

## Resources

| URI | 说明 |
|-----|------|
| `miokit://plugin-json-schema` | 最小有效清单 + 禁止字段 |
| `miokit://packaging-hints` | 根布局、PackageId、SemVer、图标双路径 |

## 目录

```
src/
  index.ts              入口，stdio 传输
  server.ts             创建 McpServer
  lib/                  校验、dotnet、打包、验包逻辑
  resources/            只读 MCP resource
  tools/                每个 MCP tool 一个文件
    index.ts            集中注册
```
