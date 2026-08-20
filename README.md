# MioKit.CodeAgent

给写 MioKit 插件的 Agent 用的能力仓库：**Skill** 管约定与选型，**MCP** 管创建、校验、打包。

## 目录

```text
mcp/       Node.js MCP 服务（npm 包名 @tiny-isle/miokit-mcp）
skills/    Agent Skills（skills.sh 发现入口）
```

## 安装 Skill

```bash
npx skills add tiny-isle/MioKit.CodeAgent
```

只装某一个：

```bash
npx skills add tiny-isle/MioKit.CodeAgent --skill miokit-plugin-new
npx skills add tiny-isle/MioKit.CodeAgent --skill miokit-plugin-core
npx skills add tiny-isle/MioKit.CodeAgent --skill miokit-plugin-avalonia-ui
npx skills add tiny-isle/MioKit.CodeAgent --skill miokit-plugin-webview2
```

| Skill | 何时用 |
|-------|--------|
| `miokit-plugin-new` | 尚无插件解决方案，要新建 |
| `miokit-plugin-core` | 已有 `plugin/`，写 SDK / 节点 / 搜索 / 服务 / 打包 |
| `miokit-plugin-avalonia-ui` | `.axaml`、Avalonia、Shadcn 主题、Dialog、Preview |
| `miokit-plugin-webview2` | `MioWebview2`、`JsService`、Vue、`vue-ui`、前端打包 |

`npx skills add` **不会**安装 MCP。

## 运行 MCP

本仓库开发（改代码不必先发版）：

```bash
cd mcp
npm install
npm start
```

本仓库 `.cursor/mcp.json` 已指向 `mcp/`。在 Cursor Settings → MCP 中启用 `miokit-mcp` 后，Agent 即可调工具。

别人用已发布包（不必 clone 本仓库）：

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

本机需要 Node 20+ 和 .NET 10 SDK。开发、发布、工具表与 Inspector 见 [mcp/README.md](mcp/README.md)。

## 分工

Agent **读** skill 做选型；**调** MCP 做环境检查、创建插件、生成 GUID、校验清单、打包并验包。打好的 `.nupkg` 如何上传由用户决定。工具表见 [mcp/README.md](mcp/README.md)。
