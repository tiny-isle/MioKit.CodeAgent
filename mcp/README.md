# @tiny-isle/miokit-mcp

MioKit 的 Node.js MCP 服务。工具覆盖开发环境检查、插件创建、标识、`plugin.json` 校验、打包与验包。代码骨架（Const / EAV builder / 节点类）不进 MCP，由 Agent 按 skill 示例写；新 Guid 只调 `generate_guid`。

## 要求

- Node.js 20+
- 本机 **.NET 10 SDK**（`check_dev_environment` / `ensure_plugin_templates` / `create_plugin` / `pack_plugin`）
- WebView2 插件另需本机 **Microsoft Edge WebView2 Runtime**；`pnpm` 缺失只警告

## 使用已发布包

在 Cursor 的 MCP 配置里（用户级或项目 `.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "miokit-mcp": {
      "command": "npx",
      "args": ["-y", "@tiny-isle/miokit-mcp"]
    }
  }
}
```

不需要 `cwd`。本机仍需 Node 20+ 和 .NET 10 SDK。

## 开发

在本目录执行：

```bash
npm install
npm start
npm test
npm run typecheck
npm run build
```

本仓库 `.cursor/mcp.json` 仍指向本地 `tsx src/index.ts`，改代码不必先发版。stdio 上 stdout 是协议通道，日志请用 `console.error`。

用 Inspector 手动调工具：

```bash
npm run inspect
```

## 发布

通过 GitHub Actions + [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) 发到 npmjs.org，不需要本机 npm token。

### 一次性：在 npm 绑定工作流

包还不存在时，在 npm 组织 [tiny-isle](https://www.npmjs.com/org/tiny-isle) 添加 Trusted Publisher（pending）；发过之后在包设置里改。字段必须和仓库一致：

- Organization or user: `tiny-isle`
- Repository: `MioKit.CodeAgent`
- Workflow filename: `publish-mcp.yml`（只要文件名，含 `.yml`）
- Environment: 留空
- Allowed actions: `npm publish`

先把 `.github/workflows/publish-mcp.yml` 推到 GitHub，再在 npm 上保存上述配置。

### 发一版

在本目录把 `package.json` / lockfile 改到目标版本，并同步 [`src/server.ts`](src/server.ts) 的 `SERVER_VERSION`：

```bash
npm version 0.1.1 --no-git-tag-version
```

然后提交、打 tag、推送（tag 必须是 `mcp-v` + 版本号）：

```bash
git add mcp/package.json mcp/package-lock.json mcp/src/server.ts
git commit -m "release: @tiny-isle/miokit-mcp 0.1.1"
git tag mcp-v0.1.1
git push origin HEAD mcp-v0.1.1
```

Actions 会跑 `prepublishOnly`（typecheck、test、build）再 `npm publish`。当前已改好版本、只想再发一次时，可在 GitHub 上手动跑 workflow `Publish MCP`，或推一个与 `package.json` 一致的 `mcp-v*` tag。

## 工具

| 名称 | 说明 |
|------|------|
| `check_dev_environment` | 先查 .NET 10 SDK；WebView2 再查本机 Runtime |
| `ensure_plugin_templates` | 从 NuGet 检查 / 安装 / 更新 `MioKit.Plugin.Templates`；拒绝本地文件夹安装 |
| `suggest_plugin_id` | 生成 `com.<org>.plugin.<slug>` |
| `create_plugin` | 先环境检查，再 ensure，再 `dotnet new miokit-plugin` / `miokit-plugin-webview2` |
| `generate_guid` | TypeId / EAV `WithId` 等稳定 GUID；写入 `XxxConst` 的 `const string` |
| `validate_plugin_json` | 必填字段、禁止旧发布字段、`System.Version` |
| `pack_plugin` | `dotnet pack` 到 `artifacts/`；先环境检查，默认接着 inspect |
| `inspect_plugin_nupkg` | 解压检查 nupkg 是否符合插件包规范 |

## Resources

| URI | 说明 |
|------|------|
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
