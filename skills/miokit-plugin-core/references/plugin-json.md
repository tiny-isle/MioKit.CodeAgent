# plugin.json 参考

插件项目根目录必须包含 `plugin.json`。它声明运行时入口、SDK 兼容范围和插件依赖；打包后的 nupkg 根目录也必须保留同一份文件。打包命令与包内容检查见 [packaging.md](packaging.md)。

## 最小有效清单

当前运行时解析时要求以下字段非空：

```json
{
  "metadataVersion": "1.0",
  "id": "com.contoso.plugin.my-plugin",
  "name": "My Plugin",
  "assembly": "MyPlugin.dll",
  "minSdkVersion": "1.0.0"
}
```

| 必需字段 | 规则 |
|---|---|
| `metadataVersion` | 清单格式版本；当前写 `1.0`。 |
| `id` | 全局插件 ID；必须等于 `PluginBase(id)`、Const 中的 `PluginId` 与 `Keyed<IPlugin>(id)`。 |
| `name` | 显示名称。 |
| `assembly` | 包/插件目录根的入口 DLL 文件名，必须与构建产物一致。 |
| `minSdkVersion` | 可被 `System.Version` 解析的最低 SDK 版本；新插件写 `1.0.0`。 |

运行时还支持 `maxSdkVersion`（排他的最高 SDK 版本，必须大于 `minSdkVersion`）和 `dependencies`（依赖的插件 ID 列表）。商店目录还读取 `minHostVersion` / `maxHostVersion` 作兼容性筛选；需要发布到商店时应同时填写这两个宿主版本字段。例如 `minSdkVersion` `1.0.0`、`maxSdkVersion` `2.0.0` 表示兼容 1.x，不含 2.0.0。

## 常用可选字段

| 字段 | 用途 |
|---|---|
| `description` / `category` / `author` / `website` | 显示和介绍信息；`description` 支持 Markdown。 |
| `icon` | 相对插件目录的运行时图标路径；文件必须随构建与打包输出，并同步为 NuGet `PackageIcon`。 |
| `supportEmail` / `supportUrl` | 支持信息。 |
| `nugetDependents` | 宿主未提供的第三方 NuGet 依赖，安装器按它从 nuget.org（或指定源）下载；见 [nuget.md](nuget.md)。 |

当前运行时不会从 `plugin.json` 取得已安装包的精确 NuGet 版本或包身份；安装器将包 ID/版本作为安装记录注入元数据。分发包的 ID 与版本用 `dotnet pack -p:PackageId=… -p:PackageVersion=…` 控制，见 [packaging.md](packaging.md)。

在线目录的 `iconUrl` 来自 NuGet nuspec 的 `icon` 元数据，而不是扫描包内文件。仅把图片放进 nupkg 不足以让商店显示图标。当前模板会在打包时读取 `plugin.json.icon` 并设置等值的 NuGet `PackageIcon`；使用自定义或旧版 csproj 时也必须保持两者路径一致。

## 完整示例

```json
{
  "metadataVersion": "1.0",
  "id": "com.contoso.plugin.my-plugin",
  "name": "My Plugin",
  "description": "# My Plugin\n\n完整的 **Markdown** 使用说明。",
  "author": "Contoso",
  "website": "https://example.com/my-plugin",
  "icon": "Assets/icon.png",
  "assembly": "MyPlugin.dll",
  "minSdkVersion": "1.0.0",
  "maxSdkVersion": "2.0.0",
  "minHostVersion": "0.2.8",
  "maxHostVersion": "1.0",
  "dependencies": [],
  "nugetDependents": [
    { "id": "Contoso.MyPrivateLibrary", "version": "2.1.0" }
  ]
}
```

SDK/宿主范围使用 `System.Version` 格式，不接受 SemVer 后缀。`pluginVersion`、`releaseState`、`releaseDate` 是禁止字段；插件版本和正式/预发布状态只由发布者设置的 NuGet `PackageVersion` 决定：`1.2.0` 是正式版，`1.3.0-beta.1`、`rc` 等是预发布版。

## 在线目录清单

当前模板在 `dotnet pack` 时会把原始 `plugin.json` 放入 NuGet description 的版本化 JSON 信封：

```json
{
  "schema": "miokit.plugin-package",
  "schemaVersion": 1,
  "plugin": { "metadataVersion": "1.0", "id": "..." }
}
```

`schemaVersion` 管理包 description 格式，`plugin.metadataVersion` 管理运行时清单格式。商店只接受整个 description 都是该 JSON 信封，不兼容旧 HTML 注释；页面展示的是 `plugin.description` 的 Markdown，而不是信封原文。不要手写信封，也不要只修改 `.csproj` 而遗漏 `plugin.json`。

## 检查清单

- [ ] 五个运行时必填字段均非空，`assembly` 与 DLL 文件名一致
- [ ] `id` 与 `PluginBase`、Const、Autofac keyed 注册一致
- [ ] 版本范围可被 `System.Version` 解析，不带 `-beta` 等 SemVer 后缀
- [ ] 不包含 `pluginVersion`、`releaseState`、`releaseDate`
- [ ] 若配置 `icon`，同路径文件已标记为复制和 Pack，且 nuspec `icon` / NuGet `PackageIcon` 与其一致
- [ ] 宿主未提供的第三方依赖同时有 `PackageReference` 和 `nugetDependents` 声明
- [ ] 通过 [packaging.md](packaging.md) 检查 nupkg 根目录
