# 插件打包与发布

本文描述 MioKit 插件 nupkg 的布局与检查约定。Agent **不要**自己跑仓库脚本或 `dotnet pack` 作为入口；调 MCP `pack_plugin`（默认接着 `inspect_plugin_nupkg`）。上传打好的包由用户决定，MCP 不推源。

## 1. 交付物与命令

生成的 `plugin/*.csproj` 已配置为把入口 DLL 与 `plugin.json` 放到 nupkg **根目录**。这是 MioKit 插件包的安装布局，不是普通类库 NuGet 的 `lib/<TFM>/` 布局。

Agent 调 MCP `pack_plugin`：

| 参数 | 说明 |
|------|------|
| `solutionRoot` | 插件解决方案根（含 `plugin/` 的目录） |
| `packageVersion` | 必填。稳定版 `1.2.0`，预发布 `1.3.0-beta.1` 等 NuGet SemVer |
| `packageId` | 可选。默认用插件 csproj 项目名 |
| `inspect` | 默认 `true`；有 errors 则打包未完成 |

输出为 `artifacts/<PackageId>.<PackageVersion>.nupkg`。`PackageId` 是**分发包**身份，和 `plugin.json` 的运行时 `id` 不同；两者都应稳定且全局唯一。

## 2. 清单与包版本

`plugin.json` 是运行时清单；`PackageId` / `PackageVersion` 是 NuGet 分发身份。当前运行时要求下列字段非空：

```json
{
  "metadataVersion": "1.0",
  "id": "com.contoso.plugin.my-plugin",
  "name": "My Plugin",
  "assembly": "MyPlugin.dll",
  "minSdkVersion": "2.0.0"
}
```

`assembly` 必须等于项目构建出的 DLL 文件名。`pluginVersion`、`releaseState`、`releaseDate` 均禁止出现；在线商店的正式/预发布语义完全由 NuGet 包版本决定。完整字段见 [plugin-json.md](plugin-json.md)。

## 3. 把资源放进包和运行输出

模板默认保证 DLL 与 `plugin.json`。图标、配置文件、数据库种子、WebView2 前端产物等额外文件必须同时复制到构建输出并标记为 Pack；路径应和代码/`plugin.json` 中使用的相对路径一致。

图标同时承担两个角色：`plugin.json.icon` 是安装后的运行时路径，NuGet nuspec 的 `icon`（MSBuild `PackageIcon`）用于生成目录 `iconUrl`。当前模板会从 `plugin.json.icon` 动态设置 `PackageIcon`；仅把图片 Pack 进包但缺少该元数据时，商店列表仍不会显示图标。自定义或旧版 csproj 应补充等值配置：

```xml
<PropertyGroup>
  <PackageIcon>Assets/icon.png</PackageIcon>
</PropertyGroup>
```

```xml
<ItemGroup>
  <!-- plugin.json 使用 "icon": "Assets/icon.png" 时 -->
  <None Update="Assets\icon.png">
    <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
    <Pack>true</Pack>
    <PackagePath>Assets</PackagePath>
  </None>

  <None Update="Assets\defaults.json">
    <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
    <Pack>true</Pack>
    <PackagePath>Assets</PackagePath>
  </None>
</ItemGroup>
```

WebView2 模板会把存在的 `ui/dist/**` 复制到构建输出；在打包前先完成前端构建。若项目将前端目录改为其他位置，必须为该目录补充等价的 `CopyToOutputDirectory` 与 `Pack` 配置。

不要把 `MioKit.Sdk.dll`、`MioKit.SourceGenerate.dll`、`MioKit.Webview2.dll` 或宿主已有共享库手动塞进包；加载时必须复用宿主程序集。私有第三方依赖的声明见 [nuget.md](nuget.md)。

SDK 1.0 的卸载清理由插件入口类返回声明式 `PluginDataCleanupPlan`。`plugin.json` 没有 cleanup DLL 字段，包内也不得增加独立卸载 DLL、卸载脚本或 SQL；模板只打包入口 DLL 与运行资源。

## 4. 本地检查

调 MCP `inspect_plugin_nupkg`（`pack_plugin` 默认已跑）。检查项由工具执行，失败时看 errors / hints：

- 根目录有 `plugin.json` 与 `assembly` 指向的 DLL。
- `plugin.json` 可被 JSON 解析，且 `id`、`name`、`assembly`、`metadataVersion`、`minSdkVersion` 非空。
- `icon` 与其他声明的相对资源在包内实际存在；nuspec `icon` 与 `plugin.json.icon` 路径完全一致。
- WebView2 插件包含已构建的前端静态资源。
- 包内没有 `MioKit.Sdk.dll` 等宿主共享 DLL。

hints 对应开发修复，例如：图标同时 CopyToOutputDirectory + Pack，且 `PackageIcon` 与 `plugin.json.icon` 同路径。结构化约定见 MCP resource `miokit://packaging-hints`。

## 5. 发布到 NuGet 源

**不进 MCP。** `inspect_plugin_nupkg` 通过后，由用户决定把 `.nupkg` 传到哪（商店、nuget.org 或其它源）。Agent 不要 `nuget push`、不要跑 `publish.ps1`。

发布新版本时递增 `PackageVersion`；同一包 ID 下不要覆盖已发布版本。商店侧登记的包 ID、源地址与运行时 `plugin.json.id` 是不同层的数据。

## 6. 发布前清单

- [ ] `dotnet build plugin/<name>.csproj -c Release` 成功
- [ ] `plugin.json` 与 DLL 文件名、插件 `PluginId`、`Keyed<IPlugin>` 一致
- [ ] `PackageId` / `PackageVersion` 已明确且版本递增
- [ ] 清单不含三个旧发布字段，nuspec description 是 `miokit.plugin-package` v1 JSON 信封
- [ ] 图标、静态资源、WebView2 前端产物已经同时复制和 Pack；NuGet `PackageIcon` 与 `plugin.json.icon` 一致
- [ ] 已检查 nupkg 根目录并排除宿主共享 DLL
- [ ] 未打包独立卸载 DLL / 脚本 / SQL；额外持久化 EAV 根已通过 `PluginDataCleanupPlan` 声明
- [ ] 已在目标宿主版本上安装验证后再发布
