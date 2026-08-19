# NuGet 依赖参考

插件与宿主共享运行时依赖。**包版本以生成项目 `*.csproj` 中的 `PackageReference` 为准**；需要选择第三方包版本时，以模板生成的项目和当前宿主兼容约定为准，不要臆造版本表。

---

## 1. 分层概览

```
托管程序集
  1. Default ALC 已加载的宿主程序集
  2. 宿主运行目录 / 宿主依赖清单可解析的程序集 → 加入 Default ALC
  3. 插件目录                                  → 插件 ALC
  4. 安装记录锁定并校验的共享依赖               → 插件 ALC
  5. .NET 默认回退解析

原生 DLL
  1. 宿主运行目录
  2. 插件目录
  3. 安装记录锁定并校验的共享依赖
  4. .NET 默认回退解析
```

这是固定的“宿主优先”规则，适用于所有程序集，不只适用于 `MioKit.*`、Avalonia
或其他契约程序集。宿主已提供的托管程序集在所有插件间共享同一个
`AssemblyLoadContext.Default` 实例；宿主没有的插件私有依赖仍由各插件 ALC
隔离。

| 层级 | csproj 应引用 |
|------|---------------|
| **插件必需** | `MioKit.Sdk`、`MioKit.SourceGenerate` |
| **WebView2** | + `MioKit.Webview2` |
| **直接使用到的第三方 API** | 与模板/csproj 中已有条目**同版本** `PackageReference`（仅编译） |
| **插件发布包** | `dotnet pack` 的 `PackageId` / `PackageVersion`；完整流程见 [packaging.md](packaging.md) |
| **插件私有包** | csproj + `plugin.json` → `nugetDependents` |

目标框架与 csproj 一致，通常为 `net10.0-windows10.0.19041.0`。

---

## 2. 插件必需包

| 包 | 说明 |
|----|------|
| `MioKit.Sdk` | PluginBase、MioObject、IFeature、EAV、搜索类型 |
| `MioKit.SourceGenerate` | EAV/Memory 源生成（`PrivateAssets=all`） |
| `MioKit.Webview2` | 按需：WebView2 + JS 桥接 |

以当前模板和宿主兼容约定为准。不要将模板中的所有包都加到插件项目；只有插件代码直接引用某个包的 API 时才添加。

---

## 3. 运行期解析（PluginLoadContext）

加载器严格按 §1 的顺序解析，不使用程序集名称白名单，也不会在发现宿主候选后
改用插件副本。

宿主候选必须同时满足：

- 简单名称一致
- Culture 一致（未指定按 neutral 处理）
- 公钥标记一致

`AssemblyVersion` 不参与兼容性拒绝：只要上述身份一致，无论宿主版本高于或低于
插件编译时请求的版本，都直接复用宿主程序集。真正存在 API/ABI 不兼容时，由插件
更新适配宿主版本。只有 Culture 或公钥标记等身份不匹配时，加载才以
`HostAssemblyIncompatible` 失败，并且**不会**继续尝试插件目录或共享依赖。

**不要**将下列 DLL 复制到插件输出：

- `MioKit.Sdk.dll`、`MioKit.Webview2.dll`
- 宿主已提供的共享库（除非属于 §4 私有依赖）

---

## 4. 插件私有依赖（nugetDependents）

Sdk 与 Host **均未提供** 的新包：

1. csproj 添加 `PackageReference`（编译）
2. `plugin.json` 声明 `nugetDependents`（宿主安装时解析、锁定并校验）

详见 [plugin-json.md](plugin-json.md)。

`nugetDependents.version` 表示精确 NuGet 版本。安装器按包 ID 对照宿主实际依赖：

- 同包、同版本：直接复用宿主，不下载，也不为插件锁定副本；依赖图中的其他节点仍继续处理。
- 同包、不同版本：仍直接复用宿主，不下载，也不锁定插件副本。
- 不同包但产出同名托管程序集：按简单名称、Culture 和公钥标记校验；版本不同仍
  跳过插件副本，身份不兼容时安装失败。
- 同名原生 DLL：只要宿主目录已存在，就跳过插件副本。

插件本体的 NuGet 包 ID 与版本由 `dotnet pack` / 安装记录维护；商店部署时还会登记 `{ sourceUrl, packageId }`。`nugetDependents` 在宿主未提供时仍是插件私有依赖：

| 字段 | 用途 |
|------|------|
| `nugetDependents` | 精确版本的插件私有依赖包；宿主安装时解析、锁定并校验 |

运行时从安装器写入的安装记录取得包身份与精确版本；不要依赖 `plugin.json` 中的任意自定义包 ID 字段。
插件目录与依赖锁若同时提供同名 DLL，加载会以 `PluginAssemblySourceConflict`
失败；请只保留一个来源，不要把 `nugetDependents` 的 DLL 再打入插件根目录。

---

## 5. IoC 解析

| 场景 | API |
|------|-----|
| 宿主全局服务 | `MioIoc.Resolve<T>()` → [host-services.md](host-services.md) |
| 本插件注册的服务 | `{Plugin}Register.Instance.ComponentContext.Resolve<T>()` |
| `PluginBase` 生命周期内 | `Container!.Resolve<T>()` |

---

## 6. csproj 结构

以模板生成的 `*.csproj` 为基准，通常包含：

```xml
<PackageReference Include="MioKit.Extensions" Version="…" />
<PackageReference Include="MioKit.SourceGenerate" Version="…">
  <PrivateAssets>all</PrivateAssets>
  <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
</PackageReference>
```

`MioKit.Sdk` / `Ti.Avalonia.Shadcn` 由 `MioKit.Extensions` 传递引入，无需再显式 `PackageReference`。

```xml
<None Update="plugin.json">
  <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
</None>
```

按需添加 `MioKit.Webview2` 及代码直接引用的第三方包（版本与模板/csproj 对齐）。WebView2 的 UI 与前端构建规则见 `miokit-plugin-webview2`。

---

## 7. 禁止事项

| ❌ | ✅ |
|----|-----|
| 插件输出携带 `MioKit.Sdk.dll` | 仅 NuGet 引用，运行期用宿主程序集 |
| 在 `plugin.json` 写 `pluginVersion` / `releaseState` / `releaseDate` | 调 MCP `pack_plugin`（`packageId` / `packageVersion`）；SemVer 后缀决定预发布状态 |
| 私有依赖只打 dll 不写 `plugin.json` | `nugetDependents` |
| 用 `MioIoc` 解析仅注册在插件子容器的服务 | `ComponentContext` / `Container` |

---

## 8. 相关文档

- [plugin-json.md](plugin-json.md) — 清单字段与 `nugetDependents`
- [packaging.md](packaging.md) — nupkg 内容、验证与发布
- [plugin-core.md](plugin-core.md) — Register 与 DI
- `miokit-plugin-webview2` — WebView2 包和前端构建约定
- [sdk-helpers.md](sdk-helpers.md) — 宿主可 Resolve 服务、反模式
