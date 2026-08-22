# WebView2 前端构建与打包

## 开发与输出目录

WebView2 模板在 `plugin/vue-ui/` 提供 Vue 工程：

```powershell
cd plugin/vue-ui
pnpm install
pnpm dev
pnpm build
```

模板的 Vite `outDir` 应指向 `../ui/dist`。运行时从插件输出目录的
`ui/dist/index.html` 加载前端资源；开发时可以将 `MioWebview2` 指向本地开发服务器。

## csproj 约定

前端构建产物必须同时复制到构建输出并进入 nupkg。项目若不是模板默认路径，需为实际
目录补充等价的 `CopyToOutputDirectory` 与 `Pack` 配置：

```xml
<Content Include="ui\dist\**">
  <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
  <Pack>true</Pack>
  <PackagePath>ui\dist</PackagePath>
</Content>
```

不要将 `vue-ui/` 源码、`node_modules`、`MioKit.Webview2.dll` 或宿主已有共享 DLL 放入
插件包。通用 nupkg 根布局、MCP 打包和验包流程见 `miokit-plugin-core` 的
`packaging.md`。

## 发布检查

- [ ] `pnpm build` 成功，并生成 `plugin/ui/dist/index.html`。
- [ ] `ui/dist/**` 在构建输出和 nupkg 中都存在。
- [ ] 前端资源使用相对 base，能在 WebView2 虚拟主机下加载。
- [ ] 桥接只在 WebView2 环境测试；浏览器单独打开不能验证 .NET bridge。
- [ ] nupkg 不包含 `node_modules` 或宿主共享程序集。

## 共享 JavaScript runtime

需要被多个 WebView 复用的大型 JavaScript 依赖，不要放入宿主共享 DLL，也不要覆盖
宿主的 `monaco0.54.0`。将资源作为插件包内容分发，在运行时复制到
`MioAppContext.Current.Environment.JavaScriptRuntimeDirectory` 下基于插件 ID 的唯一子目录，
再通过 `https://jsruntime.local/<runtime-id>/...` 加载。完整的目录、版本和安全约定见
[javascript-runtime.md](javascript-runtime.md)。

例如把插件包内的 `jsruntime/<runtime-id>/` 内容复制到插件输出目录：

```xml
<Content Include="jsruntime\**">
  <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
  <Pack>true</Pack>
  <PackagePath>jsruntime</PackagePath>
</Content>
```
