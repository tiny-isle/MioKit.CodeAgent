# MioKit.CodeAgent

给写 MioKit 插件的 Agent 用的能力仓库：**Skill** 管约定与选型，**MCP** 管创建、校验、打包。

## 目录

```text
mcp/       Node.js MCP 服务（npm 包名 miokit-mcp）
skills/    Agent Skills（skills.sh 发现入口）
docs/      分工、能力清单、Skill → MCP 映射
```

## 安装 Skill

```bash
npx skills add tiny-isle/MioKit.CodeAgent
```

只装某一个：

```bash
npx skills add tiny-isle/MioKit.CodeAgent --skill miokit-plugin-new
npx skills add tiny-isle/MioKit.CodeAgent --skill miokit-plugin-development
```

| Skill | 何时用 |
|-------|--------|
| `miokit-plugin-new` | 尚无插件解决方案，要新建 |
| `miokit-plugin-development` | 已有 `plugin/`，写 SDK / 节点 / 打包 |

`npx skills add` **不会**安装 MCP。

## 运行 MCP

```bash
cd mcp
npm install
npm start
```

本仓库 `.cursor/mcp.json` 已指向 `mcp/`。在 Cursor Settings → MCP 中启用 `miokit-mcp` 后，Agent 即可调工具。开发、工具表与 Inspector 见 [mcp/README.md](mcp/README.md)。

## 分工

Agent **读** skill 做选型；**调** MCP 做环境检查、创建插件、生成 GUID、校验清单、打包并验包。打好的 `.nupkg` 如何上传由用户决定。详见 [docs/README.md](docs/README.md)。
