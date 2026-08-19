# WebView2 + Vue 3（vue-bridge）UI

插件可用 **Vue 3 + shadcn-vue** 作为 UI 层，**.NET 承载业务逻辑**，通过 WebView2 与 `ServiceBridge` 双向通信——类似 WPF MVVM，但 View 是 Vue 组件，ViewModel 是带 `[JsService]` 的 C# 服务。

前端基础工程来自 **[miokit-ui-template](https://github.com/MioKit-Teams/miokit-ui-template)**。`dotnet new miokit-plugin-webview2` 创建的项目已内置 `plugin/vue-ui/`。**构建产物**由 csproj 复制 `ui/dist/**` 到输出目录。

**路径约定：**

| 阶段 | 路径 |
|------|------|
| 前端源码与开发 | `plugin/vue-ui/`（`pnpm dev` / `pnpm build`） |
| 发布静态资源 | `plugin/ui/dist/`（模板 Vite `outDir` 已指向 `../ui/dist`；csproj `Content Include="ui\dist\**"`） |
| 运行时加载 | `AppContext.BaseDirectory` 下 `ui/dist/index.html` |

---

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│  Vue 3 组件（Reka UI / shadcn-vue + Tailwind）               │
│  useService / useObservableProperty / useObservableCollection│
└──────────────────────────┬──────────────────────────────────┘
                           │ vue-bridge（window.VueDotnetBridge）
┌──────────────────────────▼──────────────────────────────────┐
│  DotnetBridge (bridge.js)  ← window.chrome.webview.postMessage│
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  MioWebview2 → ServiceBridge → [JsService] C# 服务           │
│  CommunityToolkit.Mvvm ObservableObject / ObservableProperty │
└─────────────────────────────────────────────────────────────┘
```

| 层 | 技术 | 职责 |
|----|------|------|
| View | Vue 3 + shadcn-vue | 界面、交互 |
| 桥接 | `src/lib/vue-bridge/` | 组合式 API，属性/集合/事件同步 |
| 宿主控件 | `MioWebview2` | WebView2 嵌入、虚拟主机、主题同步 |
| ViewModel | `[JsService]` + MVVM Toolkit | 业务逻辑、原生 API、持久化 |

**核心原则**：C# 中 `ObservableProperty` / `ObservableCollection` 变更 → 自动推送 Vue 重渲染，无需 REST、无需手写轮询。`[JsService]` 对外 API 支持**同步方法、标准 Task/ValueTask 异步方法、属性、可通知属性/列表、`EventHandler` 事件**（§4.0）。

---

## 2. 前端工程（WebView2 模板）

`miokit-plugin-webview2` 模板已包含 `vue-ui/` 与示例 `Views/`、`Services/`，创建项目后安装依赖即可开发：

```bash
cd plugin/vue-ui
pnpm install
```

开发模式：

```bash
cd plugin/vue-ui
pnpm dev
```

发布构建：

```bash
cd plugin/vue-ui
pnpm build
```

模板内 Vue / 主题 / 组件规范见 `vue-ui/.agents/skills/miokit-ui-template/SKILL.md`。

创建项目后**只需编写业务代码**：

| 你写的 | 模板已提供 |
|--------|------------|
| `Services/*JsService.cs` | `vue-bridge`、`components/ui/`、路由、主题、Loading |
| `vue-ui/src/views/` 业务页面 | `App.vue`、`layouts/`、`router/` 骨架 |
| `Views/*WebView.axaml` | `MioWebview2` 嵌入方式（见 C# 模板） |

---

## 3. 推荐目录结构（插件）

```
plugin/
├── Views/
│   └── PluginWebView.axaml       # 嵌入 MioWebview2（dotnet new 已生成）
├── vue-ui/                       # 前端源码（开发在此目录）
│   ├── package.json
│   ├── src/
│   └── ...
├── ui/
│   └── dist/                     # pnpm build 输出（csproj 复制到输出）
└── Services/
    └── *JsService.cs             # [JsService]（dotnet new 已含 TimerJsService 示例）
```

C# / AXAML 参考生成项目内的 `plugin/Views/PluginWebView.*`、`plugin/Services/TimerJsService.cs`。

---

## 4. C# 端：服务与桥接

### 4.0 JsService API 约束（硬限制）

`ServiceBridge` 仅反射并桥接下表成员。**`[JsService]` 类中不要声明超出此范围的公开 API**，否则元数据异常、调用无响应或事件无法订阅。

| 类型 | C# 要求 | Vue 侧 |
|------|---------|--------|
| **同步方法** | `public`，返回类型可 JSON 序列化（`void` / 值类型 / `string` 等） | `await vm.Methods.Save()` |
| **异步方法** | `public Task` / `Task<T>` / `ValueTask` / `ValueTask<T>`；`T` 可 JSON 序列化 | `await vm.Methods.SaveAsync()` |
| **属性** | `public` get/set | `vm.Properties.Title`、`vm.setProperty('Title', v)` |
| **可通知属性** | `[ObservableProperty]` 或 `INotifyPropertyChanged`（继承 `ObservableObject`） | 自动 `propertyChangeFired` |
| **可通知列表** | `public ObservableCollection<T>` | `vm.Collections.Items`、`useObservableCollection` |
| **事件** | `event EventHandler` 或 `event EventHandler<TArgs>`（`TArgs` 须可序列化） | `useServiceEvent(vm, 'Xxx', fn)` |

**禁止写入 `[JsService]` 的公开成员：**

| ❌ 禁止 | 原因 |
|--------|------|
| `async void` 方法 | 无法等待完成或观察异常；改为 `Task` / `ValueTask` |
| 自定义 awaitable、`IAsyncEnumerable<T>` | bridge 只识别标准 Task/ValueTask，流式协议不在当前契约内 |
| 自定义委托事件（`event Action`、`event Func<>`、非 `EventHandler` 签名的 delegate） | `ServiceBridge` 仅按 `EventHandler` 模式订阅并转发 |
| `[RelayCommand]` 等源生成命令 | 非对外 `public` 方法，与 `Methods.Xxx()` 约定不符 |
| 带默认值的公开方法参数 | 元数据反射可能越界（见 `vue-ui/samples/csharp/BridgeTestService.cs` 注释） |

一次请求/响应应直接返回 Task/ValueTask；无泛型结果时 Vue Promise resolve 为 `null`，fault/cancel 时 reject。bridge 不自动注入 `CancellationToken`，也不提供远程取消或默认超时。需要进度、单飞或长后台任务时，使用同步入口返回 `operationId`，再通过 `EventHandler<T>` 完成事件通知。

### 4.1 定义 JsService（ViewModel）

参考生成项目 `plugin/Services/TimerJsService.cs`：

```csharp
[JsService("MyUiService")]
public partial class MyUiService : ObservableObject
{
    [ObservableProperty] private string title = "";

    public ObservableCollection<TableRowItem> Items { get; } = new();

    public async Task<SaveResultDto> SaveAsync(SaveRequestDto request)
    {
        var result = await SaveCoreAsync(request);
        return new SaveResultDto(result.Success, result.Message);
    }

    public event EventHandler? Saved;

    protected virtual void OnSaved() => Saved?.Invoke(this, EventArgs.Empty);
}
```

| 约定 | 说明 |
|------|------|
| `[JsService("名称")]` | Vue 侧 `DotnetBridge.getService('MyUiService')` |
| `[ObservableProperty]` | 生成 `Title` + `OnTitleChanged`，Vue 可订阅 |
| `ObservableCollection<T>` | 用 `useObservableCollection` 同步列表 |
| 同步返回值或标准 Task/ValueTask 方法 | Vue `await vm.Methods.SaveAsync()` |
| `event EventHandler` / `EventHandler<T>` | Vue `useServiceEvent(vm, 'Saved', fn)` |

服务须注册到 **Microsoft DI**，并在 `InitializeBridgeAsync` 传入：

```csharp
services.AddSingleton<MyUiService>();
await webView.InitializeBridgeAsync(services, serviceProvider);
```

### 4.2 Avalonia 嵌入 MioWebview2

参考生成项目 `plugin/Views/PluginWebView.axaml` · `PluginWebView.axaml.cs`：

```xml
<webview2:MioWebview2 x:Name="WebView" />
```

```csharp
await WebView.EnsureCoreWebView2Async();
await WebView.InitializeBridgeAsync(services, sp);

// 开发：Vite dev server
WebView.Source = new Uri("http://localhost:5173");

// 发布：本地构建产物
// WebView.Source = new Uri(Path.Combine(AppContext.BaseDirectory, "ui", "dist", "index.html"));
```

| API | 说明 |
|-----|------|
| `EnsureCoreWebView2Async()` | 等待 WebView2 就绪 |
| `InitializeBridgeAsync(services, provider)` | 创建 `ServiceBridge`，扫描 `[JsService]` |
| `Source` | 本地 `file://` 时映射为虚拟主机 `https://miokit.locale/index.html` |

**DEBUG**：桥接就绪后可 `OpenDebugWindow()`（F10 调试面板）。

### 4.3 主题同步

`MioWebview2` 设置 WebView2 `PreferredColorScheme`；Vue 侧通过 `window.setColorTheme(payload)` 同步 Avalonia `ShadColorTheme` 色板（实现于模板 `src/lib/colorTheme.js`）。详见 `vue-ui/.agents/skills/miokit-ui-template/SKILL.md`。

Avalonia 壳层 AXAML 主题见 [shadcn-theme.md](shadcn-theme.md)。

---

## 5. 打包与输出

插件 csproj 将 Vue 构建产物复制到输出：

```xml
<ItemGroup>
  <Content Include="ui\dist\**">
    <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
  </Content>
</ItemGroup>
```

```bash
cd plugin/vue-ui
pnpm build
```

模板 Vite 已配置 `base: './'` 与 `outDir: ../ui/dist`，虚拟主机下资源路径正确。

---

## 6. Vue 端：vue-bridge 速查

桥接位于 `plugin/vue-ui/src/lib/vue-bridge/`。在 `main.js` 中**必须**通过 `setupVueBridge()` 动态加载（勿静态 import `bridge-vue.js`，否则 `window.Vue` 未就绪）：

```javascript
import { setupVueBridge } from '@/lib/vue-bridge/setup';

async function bootstrap() {
  await setupVueBridge(); // → window.DotnetBridge、window.VueDotnetBridge
  // createApp ...
}
bootstrap();
```

### 6.1 useService — Singleton

```vue
<script setup>
const { useService } = window.VueDotnetBridge;
const vm = useService('MyUiService');
</script>

<template>
  <div v-if="vm._loading">加载中...</div>
  <input
    v-else
    :value="vm.Properties.Title"
    @input="vm.setProperty('Title', $event.target.value)"
  />
  <li v-for="row in vm.Collections.Items" :key="row.id">{{ row.name }}</li>
</template>
```

### 6.2 useObservableProperty — 单属性双向绑定

```vue
<script setup>
const { useObservableProperty } = window.VueDotnetBridge;
const { value: title, setValue: setTitle } = useObservableProperty(service, 'Title');
</script>
```

### 6.3 useObservableCollection — 列表

```vue
<script setup>
const items = useObservableCollection(service, 'Items');
</script>
```

### 6.4 useTransientService — 带构造参数

```vue
<script setup>
import { ref } from 'vue';
const docId = ref('abc');
const vm = useTransientService('EditorSession', () => [docId.value]);
</script>
```

### 6.5 useServiceEvent — C# 事件

```vue
<script setup>
const vm = useService('TimerService');
useServiceEvent(vm, 'TimerStopped', () => console.log('结束'));
</script>
```

### 6.6 直接调用 DotnetBridge

```javascript
const service = await DotnetBridge.getService('MyUiService');
await service.Save();
const title = await service.GetTitle();
```

---

## 7. API 对照表

| 能力 | Vue | C#（须符合 §4.0） |
|------|-----|-------------------|
| 属性同步 | `useObservableProperty(s, 'Name')` | `[ObservableProperty] private T name` |
| 集合同步 | `useObservableCollection(s, 'Items')` | `ObservableCollection<T>` |
| 方法调用 | `await vm.Methods.SaveAsync()` | `public Task<T> SaveAsync()`；也支持同步、ValueTask 与无泛型结果 |
| Singleton | `useService('Name')` | `services.AddSingleton<T>()` |
| Transient | `useTransientService('Name', () => [id])` | `services.AddTransient<T>()` |
| 事件 | `useServiceEvent(vm, 'Stopped', fn)` | `event EventHandler` / `EventHandler<T>`（**非**自定义 delegate） |
| 写属性 | `vm.setProperty('Title', v)` | 自动生成 `SetTitle` |

---

## 8. 开发与调试

```bash
cd plugin/vue-ui
pnpm dev      # http://localhost:5173 — 浏览器中 bridge 不可用
pnpm build    # 输出到 ../ui/dist，即 plugin/ui/dist/
```

C# 开发时 `WebView.Source = http://localhost:5173`；发布时加载 `ui/dist/index.html`（相对 `AppContext.BaseDirectory`）。

须在 **WebView2 环境**（`window.chrome.webview` 存在）中测试桥接；浏览器单独打开无法连 .NET。

---

## 9. 插件约定

| ✅ 应做 | ❌ 禁止 |
|--------|--------|
| 业务逻辑放在 `[JsService]` C# 类 | 在 Vue 里直接访问文件系统/Win32 |
| 异步方法仅返回 Task/ValueTask 标准形态；结果 DTO 可序列化 | `async void`、自定义 awaitable、自定义 delegate 事件、`[RelayCommand]` |
| UI 用模板 `components/ui/` + 业务 views | 绕过桥接自己写 `postMessage` |
| `InitializeBridgeAsync` 传入完整 DI | 未注册就 `getService` |
| `pnpm build` 后确保 `plugin/ui/dist/` 存在（csproj 复制到输出） | 把 `node_modules` 打进插件 |
| 界面文案直接写中文 | 引入 i18n（模板约定不用国际化） |

---

## 10. 相关资源

| 资源 | 说明 |
|------|------|
| [miokit-ui-template](https://github.com/MioKit-Teams/miokit-ui-template) | 官方 Vue 前端模板（WebView2 模板内置为 `plugin/vue-ui/`） |
| `plugin/vue-ui/.agents/skills/miokit-ui-template/SKILL.md` | 模板内 UI / 主题 / 组件规范 |
| 生成项目 `plugin/Views/`、`plugin/Services/` | C# `[JsService]`、AXAML 示例 |
| [nuget.md](nuget.md) | `MioKit.Webview2` NuGet 版本 |
