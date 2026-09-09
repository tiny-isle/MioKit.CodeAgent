# MioKit.CodeAgent

给写 MioKit 插件的 Agent 用的能力仓库：**Skill** 管约定与选型，**MCP** 管创建、校验、打包。

仓库根是一份 [Agent Plugins](https://agent-plugins.org) 包：Cursor 和 Codex 可以把它当插件安装，一次拿到 Skill 和 MCP。

## 目录

```text
plugin.json   Agent Plugins 清单（Cursor / Codex 插件身份）
mcp.json      插件内 MCP 启动方式（npx @tiny-isle/miokit-mcp）
mcp/          Node.js MCP 服务（npm 包名 @tiny-isle/miokit-mcp）
skills/       Agent Skills（插件自动发现；也是 skills.sh 入口）
```

## 作为 Cursor / Codex 插件安装

这是同时获得 Skill 和 MCP 的方式。宿主会读根目录 `plugin.json`、扫描 `skills/`、并用 `mcp.json` 启动 MCP。

本机需要 Node 20+ 和 .NET 10 SDK。MCP 通过已发布的 `@tiny-isle/miokit-mcp` 启动，不依赖本仓库里的 `mcp/` 源码。

### Cursor

- **本地**：把本仓库放到 `~/.cursor/plugins/local/miokit-code-agent`（或该目录下的克隆），然后在 Customize 里启用。
- **团队**：Dashboard → Plugins → Import from GitHub，导入 `tiny-isle/MioKit.CodeAgent`。
- **Marketplace**：官方上架需另提审；未上架前用上面两种方式。

### Codex / ChatGPT

把本仓库加为 marketplace 源后安装：

```bash
codex plugin marketplace add tiny-isle/MioKit.CodeAgent
```

或在使用方仓库写 `.agents/plugins/marketplace.json`，`source.path` 指向本插件目录。公开 Plugins Directory 上架需另提交。

## 只装 Skill

`npx skills add` **不会**安装 MCP。只需要约定文档、自己已经配好 MCP 时用：

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

## 只配 MCP

已经通过插件装过 MCP 时不必再写一遍。未装插件、只想给现有客户端加工具时，在客户端 MCP 配置里加入：

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

本仓库开发（改 MCP 代码不必先发版）：

```bash
cd mcp
npm install
npm start
```

开发、发布、工具表与 Inspector 见 [mcp/README.md](mcp/README.md)。

## 分工

Agent **读** skill 做选型；**调** MCP 做环境检查、创建插件、生成 GUID、校验清单、打包并验包。打好的 `.nupkg` 如何上传由用户决定。工具表见 [mcp/README.md](mcp/README.md)。
