# 共享 JavaScript runtime

`MioWebview2` 会把宿主用户数据目录中的共享 JavaScript runtime 自动映射到受信任的
`https://jsruntime.local/` Origin。插件不需要、也不应自行调用
`SetVirtualHostNameToFolderMapping`。

## 路径契约

物理目录通过公开 SDK 属性取得：

```csharp
var runtimeDirectory = MioAppContext.Current.Environment.JavaScriptRuntimeDirectory;
```

共享目录与 URL 的对应关系是：

```text
{AppDataDirectory}/jsruntime/<runtime-id>/<resource-path>
https://jsruntime.local/<runtime-id>/<resource-path>
```

每个插件应使用基于自身 `Context.Metadata.Id` 的唯一 `runtime-id`，不要直接写入共享
runtime 根目录，也不要与其他插件共用可变目录。`Context.PluginPath` 是插件包中随插件
分发的资源所在目录；需要共享给多个 WebView 的大型静态资源，应在运行时从插件包复制到
自己的 runtime 子目录。

示例：

```csharp
const string runtimeId = "com.example.my-plugin.runtime.v1";
var source = Path.Combine(Context.PluginPath, "jsruntime", runtimeId, "loader.js");
var targetRoot = Path.Combine(
    MioAppContext.Current.Environment.JavaScriptRuntimeDirectory,
    runtimeId);
var target = Path.Combine(targetRoot, "loader.js");

Directory.CreateDirectory(targetRoot);
if (!File.Exists(target))
    File.Copy(source, target);
```

实际复制逻辑应支持重复启动，并在资源升级时使用新的版本化目录或可靠的版本标记，
避免 WebView 正在使用时覆盖共享文件。共享目录中的脚本可被所有插件 WebView 访问，
不得放置密钥、用户数据或其他不应公开的内容。

## 宿主内置 Monaco

宿主管理 `monaco0.54.0` 目录并负责从发布包种子初始化或修复它。插件直接使用模板
提供的 `loadMonaco()`，其 loader 地址为：

```text
https://jsruntime.local/monaco0.54.0/vs/loader.js
```

插件不要重新打包、覆盖或清理 `monaco0.54.0`。如果插件需要其他共享前端依赖，应使用
自己的唯一目录，并通过对应的 `https://jsruntime.local/<runtime-id>/...` URL 加载。

## 打包规则

- 随插件分发的 runtime 文件作为插件包内容打入 nupkg；它们不是 `nugetDependents`，
  也不是需要复制到插件根目录的宿主 DLL。
- 仅页面自身使用的小资源可以继续放在 `ui/dist`；需要被多个 WebView 或多个页面复用
  的大型依赖适合放入共享 runtime。
- `MioKit.Webview2.dll`、`MioKit.Sdk.dll` 等宿主共享程序集仍不得打进插件包。
- 宿主不会扫描、覆盖或自动清理插件自己的 runtime 子目录；插件应使用稳定、唯一、可
  版本化的目录名。
