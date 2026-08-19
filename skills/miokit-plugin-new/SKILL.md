---
name: miokit-plugin-new
description: >-
  【创建插件时优先使用】通过 MioKit MCP 创建插件解决方案：检查环境、
  安装 MioKit.Plugin.Templates、选择 miokit-plugin / miokit-plugin-webview2、填写参数。
  在用户要新建插件、尚未生成 plugin/ 解决方案、或询问模板参数时使用；优先于
  miokit-plugin-development。不适用于已存在的插件仓库内开发。
---

# MioKit 插件创建指南

通过 NuGet 模板包 `MioKit.Plugin.Templates` 创建插件**解决方案**（`.slnx` + `plugin/` + `preview/`）。  
Agent **不要**自己拼 `dotnet new`，也**不要**从本地源码文件夹 `dotnet new install`。创建、装模板、查环境一律调本仓库 MCP（`mcp/`）。

## 0. Agent 路由（最高优先级）

工作区**尚无** MioKit 插件项目时（无 `plugin/plugin.json`、无继承 `RegisterBase<T>` 的 `*Register.cs`、无含 `plugin/` 项目的 `.slnx`）：

1. **只用本 skill** 做模板与参数选型；禁止手抄骨架。
2. **不要**读取 `miokit-plugin-development`。
3. 调 MCP：`check_dev_environment` → `create_plugin`（内部会 `ensure_plugin_templates`）。未传 `pluginId` 时可先 `suggest_plugin_id`。
4. 创建成功后进入 `miokit-plugin-development` 开发。不要提示 `update-skills.ps1`。

模板**不预置**搜索组或可执行节点；节点与搜索逻辑在创建后按 development skill 自行添加。

## 1. 环境与模板（MCP）

| 步骤 | MCP | 说明 |
|------|-----|------|
| 本机 .NET 10 SDK；WebView2 再加 Runtime | `check_dev_environment` | `create_plugin` 内部会再跑；也可单独问「环境够不够」 |
| 检查 / 安装 / 更新 `MioKit.Plugin.Templates` | `ensure_plugin_templates` | 默认 nuget.org。文件夹路径安装会失败，须先卸掉 |
| `dotnet new miokit-plugin` / `miokit-plugin-webview2` | `create_plugin` | 输出目录已有 `plugin/plugin.json` 则拒绝覆盖 |

Agent 不要自己跑 `dotnet new install` / `list` / `uninstall`。若用户问 CLI 语义，以模板 `-h` 为准，但仍用 MCP 执行创建。

## 2. 选择模板

| shortName | 名称 | 场景 |
|-----------|------|------|
| `miokit-plugin` | MioKit Plugin | 标准插件，无 WebView2 |
| `miokit-plugin-webview2` | MioKit Plugin With WebView2 UI | WebView2 + Vue（含 `plugin/vue-ui/`） |

对应 `create_plugin` 的 `template`。

## 3. 参数（用户可传；对齐 `create_plugin`）

| 参数 | 对应 MCP | 类型 | 默认值 | 说明 |
|------|----------|------|--------|------|
| `--name` / `-n` | `name` | string | 当前目录名 | **解决方案名**；同时驱动下方派生命名（见 §4） |
| `--output` / `-o` | `output` | string | 当前目录 | 输出目录 |
| `--pluginId` | `pluginId` | string | 见下表 | 插件全局唯一 ID；须与 `plugin.json`、`PluginBase` 构造参数、Autofac Keyed 注册一致 |
| `--displayName` | `displayName` | string | （派生） | `plugin.json` 的 `name`；未传时见 §4 |
| `--description` | `description` | string | 见下表 | `plugin.json` 的 `description` |
| `--pluginAuthor` | `pluginAuthor` | string | `your-name` | `plugin.json` 的 `author` |
| （无 CLI） | `org` | string | — | 未传 `pluginId` 时，与 `name` 一起生成 `com.<org>.plugin.<slug>` |

**`pluginId` 默认值**

| 模板 | 默认 `pluginId` |
|------|-----------------|
| `miokit-plugin` | `com.example.plugin.miokit-plugin` |
| `miokit-plugin-webview2` | `com.example.plugin.miokit-webview2-plugin` |

**`description` 默认值**

| 模板 | 默认文案 |
|------|----------|
| `miokit-plugin` | `A MioKit plugin.` |
| `miokit-plugin-webview2` | `A MioKit plugin with WebView2 UI.` |

## 4. 由 `name`（`-n`）自动派生（勿手写参数）

| 派生项 | 规则 | 示例 `name`: `MioKit.Clipboard` |
|--------|------|---------------------------|
| 解决方案文件 | `{name}.slnx` | `MioKit.Clipboard.slnx` |
| 插件程序集 / csproj | `{name}.csproj` → `plugin/` | `plugin/MioKit.Clipboard.csproj` |
| C# 命名空间与类型前缀 | `name` **最后一个 `.` 之后**；无 `.` 则用全名 | 命名空间 `Clipboard` |
| 预览项目 | `{name}.Preview.csproj` → `preview/` | `preview/MioKit.Clipboard.Preview.csproj` |
| `displayName`（未传） | 同「类型前缀」规则 | `Clipboard` |

## 5. 模板自动生成（不可传参）

| 项 | 说明 |
|----|------|
| `pluginTypeId` | 新 Guid，写入插件根 EAV 类型（`*Const.cs`） |

## 6. 创建示例

**标准插件** — 调 `create_plugin`：

- `template`: `miokit-plugin`
- `name`: `MioKit.Clipboard`
- `output`: `D:\Projects\MioKit.Clipboard`
- `pluginId`: `com.example.plugin.clipboard`（或先 `suggest_plugin_id`）
- `displayName`: `剪贴板`
- `description`: `剪贴板管理插件`
- `pluginAuthor`: `your-name`

**最简**：`template` + `name` + `output` 即可。

**WebView2 插件**：`template` 为 `miokit-plugin-webview2`，其余同上。

## 7. 生成后的解决方案结构

```text
{name}/
├── {name}.slnx
├── plugin/                    # 插件项目（业务代码、plugin.json）
│   ├── {name}.csproj
│   └── ...
├── preview/                   # Avalonia + Ti.Avalonia.Shadcn 控件预览
│   ├── {name}.Preview.csproj
│   └── App.axaml              # 含 <shad:ShadTheme />
```

WebView2 模板在 `plugin/` 下额外含 `vue-ui/`（含 `vue-ui/.agents/skills/miokit-ui-template/`）、`Views/PluginWebView.*` 等。

`plugin/` 模板只生成必要文件，不再用占位 README 创建空目录。业务代码按需采用以下常用结构：

```text
plugin/
├── Assets/       # icon、图片、静态资源
├── Features/     # IMyFeature.cs + IMyFeature.Extensions.cs
├── Models/       # DTO、配置、缓存记录
├── Nodes/        # MioObject 搜索组、可执行节点、树结构
├── Services/     # 扫描、同步、缓存、桥接等服务
└── Views/        # Avalonia/WebView2 视图
```

**生成后常用命令**（用户本机；不是 MCP）

```powershell
# 编译整个解决方案
dotnet build {name}.slnx

# 运行 Shadcn 预览宿主
dotnet run --project preview/{name}.Preview.csproj

# WebView2 前端（在解决方案根目录）
cd plugin/vue-ui
pnpm install
pnpm dev
```

**生成发布包**

`plugin/*.csproj` 已包含 MioKit 插件的 nupkg 根目录布局。完成开发后，用 `miokit-plugin-development`：调 MCP `pack_plugin`（默认接着 `inspect_plugin_nupkg`）。不要手抄 ZIP 包或把 DLL 直接复制给用户。上传打好的 `.nupkg` 由用户决定，MCP 不推源。

## 8. Agent 行为约定

- 用户要**新建**插件 → 调 `create_plugin`，不要手抄模板骨架，不要自己拼 `dotnet new`。
- `pluginId` 必须全局唯一，建议 `com.<组织>.plugin.<短名>`；可用 `suggest_plugin_id`。
- `name` 含点时，向用户说明 C# 命名空间取最后一段，程序集名保留完整 `name`。
- 插件**已存在**后 → 用 `miokit-plugin-development`，**不要**再用本 skill 做初始化。
- 已生成项目且用户要打包 → 转 development skill，调 `pack_plugin`，不要重建模板。

## 9. 故障排查

| 现象 | 处理 |
|------|------|
| 环境不够 | 看 `check_dev_environment` 的 errors / hints |
| 找不到模板 / 模板是文件夹安装 | 调 `ensure_plugin_templates`；文件夹来源须先卸载，只留 NuGet 包 |
| 输出目录已有插件 | `create_plugin` 拒绝覆盖；不要删用户工程 |
| 参数不确定 | 以本 skill §3–§4 与 `create_plugin` 入参为准 |
| 没有 development skill | `npx skills add tiny-isle/MioKit.CodeAgent --skill miokit-plugin-development` |
