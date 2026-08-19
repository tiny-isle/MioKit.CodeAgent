# MioKit MCP 文档

本目录是 **miokit-mcp** 的能力规划：哪些工作由 MCP 执行，哪些继续留给 MioKit skill。本文只规划，不复制 skill 全文。

当前仓库已实现 **P0** 工具与配套 resource，见下表。P1–P3 仍是待实现清单，见 [mcp-capability-catalog.md](mcp-capability-catalog.md)。

## 阅读顺序

1. 本文：skill 与 MCP 怎么分工
2. [mcp-capability-catalog.md](mcp-capability-catalog.md)：tool / resource、入参意图、P0–P3
3. [skill-to-mcp-mapping.md](skill-to-mcp-mapping.md)：每个 skill 主题对应哪些 MCP 项、哪些明确不进 MCP

## 分工

本仓库是 **Node.js MCP**，给写插件的 Agent 调用硬能力。它**不连接**正在运行的 MioKit 宿主。

| 放 MCP | 留 skill |
|--------|----------|
| 可参数化、可校验、可生成的确定性操作 | 长文约定、选型判断、API 示例、反模式叙事 |
| 创建插件、打包、检查 nupkg 是否符合规范 | 主题文档全文（`references/*.md`） |
| 结构化速查（schema、键名表、类型索引） | 「何时用 EAV / Memory / 搜索管线」这类判断 |

Skill 仍是规范真源：

- `miokit-plugin-new`：模板 shortName、CLI 参数语义、`pluginId` 形态、禁止手抄骨架
- `miokit-plugin-development`：SDK 用法、生命周期、节点 / EAV / 搜索等主题文档

Agent **读** skill 做选型；**调** MCP 做创建、生成 GUID、校验清单、打包，并确认产物符合规范。打好的 `.nupkg` 如何上传由用户自己决定，MCP 不推源。

```text
Agent
  ├─ skill：约定与选型
  └─ MCP：ensure 模板 → create → 开发中校验/生成 → pack → inspect
           │
           ├─ NuGet.org：安装或更新 MioKit.Plugin.Templates（及模板带入的 Sdk）
           └─ 插件工作区：dotnet new / dotnet pack；解压检查 nupkg
```

## NuGet 源

`MioKit.Sdk`、`MioKit.Plugin.Templates` 等**官方包发布到公共 NuGet 源**（nuget.org）。MCP 安装模板、还原 SDK 时默认走公共源，**不要**把自建测试源写成必填。

| 场景 | 行为 |
|------|------|
| 安装 / 更新模板、还原 Sdk | 默认 nuget.org，不传 `--nuget-source` |
| 临时用非公共源（极少） | 才读 `miokit-nuget-url` 作为覆盖 |
| 把打好的插件包传到哪 | **不进 MCP**；inspect 通过后由用户决定 |

自建测试源只属于早期开发，规划与实现都按公共源为默认。

## 脚本入口只在 MCP

创建、打包、检查全部由 MCP 在 Node 内调用 `dotnet` 完成。规划与实现都按插件模板**不含仓库内打包脚本**处理：

- 不调用、不探测、不推荐仓库内脚本作为入口或回退
- 禁止从本地文件夹 `dotnet new install` 模板；只从**公共 NuGet 源**安装已发布的 `MioKit.Plugin.Templates`
- 已有插件解决方案时不要手抄骨架；尚未创建时走 `create_plugin`
- 不 `nuget push`、不上传商店；MCP 只保证打包过程与产物规范

## 已实现

| 名称 | 形态 | 说明 |
|------|------|------|
| `ensure_plugin_templates` | tool | 从 NuGet 安装或更新 `MioKit.Plugin.Templates`；文件夹来源则失败 |
| `suggest_plugin_id` | tool | `com.<org>.plugin.<slug>` |
| `create_plugin` | tool | 先 ensure，再 `dotnet new`；已有 `plugin.json` 则拒绝覆盖 |
| `generate_guid` | tool | RFC 4122 UUID v4。默认大写、带连字符，对齐 C# `Guid` 字面量（Const `TypeId`、EAV `WithId`） |
| `validate_plugin_json` | tool | 必填 / 禁止字段与 `System.Version` |
| `pack_plugin` | tool | `dotnet pack` 到 `artifacts/`；默认 inspect，有 errors 则失败 |
| `inspect_plugin_nupkg` | tool | 解压检查 nupkg 根布局、宿主 DLL、图标、信封 |
| `miokit://plugin-json-schema` | resource | 最小有效清单 + 禁止字段 |
| `miokit://packaging-hints` | resource | 根布局、PackageId ≠ `plugin.json.id`、图标双路径 |
