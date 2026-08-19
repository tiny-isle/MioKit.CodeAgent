# Sdk 辅助 API 与反模式

图标资产、Shell、单例窗口、宿主可 Resolve 服务，以及「不要重复造轮」对照。类型均在 `MioKit.Sdk`（控件在 `MioKit.Sdk.Controls`）。

---

## 1. 反模式对照

| 需求 | 用 Sdk |
|------|--------|
| 递归遍历子树 | `GetDescendants*` → [nodes-and-tree.md](nodes-and-tree.md) |
| 枚举全部搜索组 | `RootNode.Root.GetFeatureInstances<ISearchableFeature>()` |
| 启动加载固定组 | `EnsureTreeLoadedAsync<T>(groupId)` |
| 模糊匹配名称 | `SearchHelper.TryMatch` → [search.md](search.md) |
| 按字段筛选分页 | `IMioDataProvider.SearchAsync` + `EavQuery` → [nodes-and-tree.md](nodes-and-tree.md) §8 |
| 读前台/剪贴板 | `InvokeContext.Context` → [invocation-snapshot.md](invocation-snapshot.md) |
| 解析 .lnk / Reveal 文件 | `ShellHelper`（本文 §3） |
| 结果图标 | `IIconProviderFeature` + `Context.Icons`（本文 §2） |
| 插件窗口使用插件图标 | `PluginWindowExtensions.SetPluginIcon`（本文 §4） |
| Alt 菜单 / 固定忽略别名热键 | 内置 `*Action.Instance` → [result-action.md](result-action.md) |
| 类体内读写 EAV | `this.GetXxx()` / `this.SetXxx()` → [extension-properties.md](extension-properties.md) |
| 单例设置窗口 | `WindowManager.ShowUniqueWindow<T>()`（本文 §4） |
| 宿主服务 | `MioIoc.Resolve<T>()` → [plugin-core.md](plugin-core.md) |
| 插件私有服务 | `XxxRegister.Instance.ComponentContext.Resolve<T>()` |
| 附着 + 多组范围搜索 | `SearchScopeFeatureBase` → [attach-search-panel.md](attach-search-panel.md) |

---

## 2. 节点图标与资产

### `IIconProviderFeature`

```csharp
ValueTask<IIconLease?> GetIconAsync(
    IconRequest request,
    CancellationToken cancellationToken);
```

| 项 | 说明 |
|----|------|
| EAV | `CachedIconIdProperty` → `Get/SetCachedIconId` |
| 刷新 | `IconRevisionProperty` + `InvalidateIcon()`，不持有解码图片 |
| UI | `MioObjectImage` 沿祖先找最近 `IIconProviderFeature` |

每次调用必须返回新的 lease：

- 插件自己长期持有的共享 `IImage`：`IconLease.Borrowed(image)`；
- 本次调用创建、应随控件销毁的 `Bitmap`：`IconLease.Owned(image)`；
- 引用计数缓存或特殊资源：`IconLease.Create(image, release)`。

宿主只释放 lease，不直接释放其中的 `Image`。Provider 在有并发上限的后台调度器执行，
必须遵守取消令牌，不能读取 Avalonia 控件或假设当前线程是 UI 线程。`MioObjectImage`
换项、离树、窗口隐藏或插件停止时会取消请求并释放 lease；迟到结果也会立即释放。

### `IconSource`

宿主会在加载插件前从当前 Windows 初始化常用图标。插件可直接复用
`IconSource.MioKit`、`Default`、`Folder`、`File`、`Application`、`Shortcut`、
`Settings`、`Terminal`、`TextFile`、`ImageFile`、`Archive`、`Drive`。

- Avalonia 使用对应的 `IImage` 属性，例如 `IconSource.Folder`。
- WebView2 使用同名 `DataUrl` 属性，例如 `IconSource.FolderDataUrl`。
- 系统图标获取失败时由宿主自动使用内置资源回退；插件无需自行探测 Windows DLL 或维护回退文件。

### `IPluginContext.Icons`（所有者绑定）

插件通过 `PluginBase.Context.Icons` 获取 `IPluginIconService`。该实例的 `OwnerId`
固定为当前插件 ID：插件可以读取共享图标，但只能创建、覆盖或删除自己的记录，且没有全库重建入口。
不要通过 `MioIoc.Resolve<IIconService>()` 访问兼容外壳；它仅用于旧插件和宿主迁移。

| 成员 | 说明 |
|------|------|
| `GetAsync(iconId)` | 读取 descriptor，不解码图片 |
| `OpenFileAsync(path, request, ct)` | 打开插件本地文件；同版本并发单飞并使用有界热缓存 |
| `OpenStoredAsync(iconId, request, ct)` | 打开已导入的内容寻址图标；缺失或损坏时返回 `null`，不会隐式重建 |
| `OpenRemoteAsync(uri, request, options, ct)` | 普通 HTTP/HTTPS 图片；磁盘缓存、validators、过期与离线旧缓存 |
| `ImportManagedAsync` | 导入插件或宿主可重建文件；保留源定位和修改时间 |
| `ImportUserAsync` | 导入用户选择的图片；强制 `Persistent`，不保存原始路径 |
| `SaveGeneratedAsync` | 保存生成的 PNG；无重建配方时重建会跳过 |
| `GetOrCreateWindowsApplicationAsync` | Windows EXE/LNK/DLL/CPL/Shell/Store 图标 |
| `DeleteAsync(iconId)` | 删除当前插件拥有的图标；跨所有者删除会被拒绝 |

插件目录内的 `plugin.json` 图标使用 `ImportManagedAsync`。如果插件功能让用户上传图标，使用
`ImportUserAsync`，并在用户更换、重置或删除所属对象时调用 `DeleteAsync(iconId)`。
全库重建是宿主设置中心的显式维护操作，插件不得在启动、搜索、渲染或后台扫描路径触发。

普通公开在线图片可直接使用 `OpenRemoteAsync`。签名 CDN、登录 Cookie、私有协议、
校验或解密等业务仍由插件自己处理：下载到 `PluginDataPath`，原子替换本地文件，再由
`OpenFileAsync` 打开；需要立即刷新可见项时调用 `this.InvalidateIcon()`。宿主不会记录
插件的鉴权头，也不会限制插件采用新的来源。

### `FileThumbnailHelper` / `IImageService`

| API | 用途 |
|-----|------|
| `FileThumbnailHelper.GetIconAsync(path, size, isFolder, options)` | 系统缩略图 PNG bytes |
| `IImageService.GetIconAsync(IStorable, ct)` | 存储项 → Avalonia `IImage` |

Feature 语义 → [features.md](features.md) § IIconProviderFeature。

---

## 3. Shell

| API | 说明 |
|-----|------|
| `ShellHelper.GetShortcutDetails(lnkPath)` | `.lnk` 显示名等（勿自写 COM） |
| `ShellHelper.GetFileDisplayName(path)` | Shell 显示名 |
| `ShellHelper.OpenFolderOrSelectFile(path)` | Explorer 选中 |

---

## 4. UI 辅助

| API | 说明 |
|-----|------|
| `TopLevelHelper.GetMainWindowTopLevel()` | 对话框父级 |
| `WindowManager.ShowUniqueWindow<T>(...)` | 单例窗口（勿自管字典） |
| `WindowManager.SetOwnerId` / `GetOwnerId` | 标记窗口所属插件 Id（停插件时按此关窗） |
| `WindowManager.GetExistWindow` / `CloseWindow` / `CloseWindowsByOwnerIdAsync` | 查关窗口 |
| `PluginWindowExtensions.SetPluginIcon(window, Context, ct)` | 插件窗口图标 |
| `PluginWindowExtensions.SetAppUserModelId(window, pluginId)` | Windows 任务栏分组（AUMID = 插件 Id） |
| `PluginWindowBehavior`（`Type` = 插件 Id） | 快捷聚合：OwnerId + AUMID + Icon |
| `HighlightedTextBlock` / `MioObjectImage` / `KeyControl` | `MioKit.Sdk.Controls` |

### 插件窗口（扩展原语 + Behavior）

同一插件打开的任务栏窗口应合并为一组：`AppUserModelID` **直接等于插件 Id**。扩展方法是原语，可独立调用；`PluginWindowBehavior` 只是 XAML 快捷聚合。

**代码路径（不经 Behavior）：**

```csharp
using MioKit.Extensions.Extensions;

public async Task ShowPluginWindowAsync(CancellationToken cancellationToken = default)
{
    var pluginId = Context.Metadata.Id;
    var window = new PluginMainWindow();
    WindowManager.SetOwnerId(window, pluginId);
    await window.SetPluginIcon(Context, cancellationToken);
    window.Opened += (_, _) => window.SetAppUserModelId(pluginId);
    window.Show();
}
```

**XAML 快捷路径：**

```xml
<Interaction.Behaviors>
  <behaviors:PluginWindowBehavior Type="com.example.plugin.foo" />
  <!-- 或 Type="{Binding ...}"，值为插件节点 Id -->
</Interaction.Behaviors>
```

Behavior 在窗口 `Opened` 后依次：`SetOwnerId` → `SetAppUserModelId` → 按 Id 从节点树取图标（`PluginBase` 走 `SetPluginIcon`，否则 `IIconProviderFeature`）。

图标解析顺序（`SetPluginIcon`）：

1. 优先读取 `plugin.json` 的 `icon`（即 `Context.Metadata.IconPath`）所指向的插件本地文件；
2. 未配置、本地文件不存在或加载失败时，自动查找当前插件的 `IIconProviderFeature` 并提取图标；
3. Provider 不存在、返回 `null`、请求被取消或加载异常时，不设置窗口图标，也不影响窗口继续打开。

扩展会释放 `IIconLease` 并记录加载异常。插件窗口调用方不要再次读取 `IconPath`、手动调用
`GetIconAsync`，也不要自行释放 Provider 返回的图像。此 API 只用于插件拥有的窗口；宿主窗口继续使用宿主自己的图标策略。

**停插件关窗：** 宿主在停止/卸载插件前调用 `CloseWindowsByOwnerIdAsync(pluginId)`。窗口须挂 `PluginWindowBehavior`，或显式 `SetOwnerId` / `ShowUniqueWindow(..., ownerId: pluginId)`，否则不会被自动关闭。不要使用进程级 `SetCurrentProcessExplicitAppUserModelID`。

---

## 5. 宿主可 Resolve 服务

通过 **`MioIoc.Resolve<T>()`**。插件私有服务用插件容器，见 [plugin-core.md](plugin-core.md)。

| 分类 | 接口 |
|------|------|
| 数据 | `IMioDataProvider` |
| 搜索 | `ITextMatcher`、`IInvocationSnapshotProvider`、`ISearchPipelineRegistry`（少见） |
| 输入 | `IGlobalHotKeyService`、`IKeyboardHook`、`IMouseHook` |
| UI | `ISearchBoxWindow`、`IFocusRequestService`、`ISearchBoxFocusTargetProvider`、`IImageService`；图标使用 `Context.Icons` |
| 基础设施 | `IMioEventBus`；业务日志优先 `IPluginContext.Logger` |

| 勿依赖 | 原因 |
|--------|------|
| 插件商店 / 加载器内部服务 | 不在 Sdk |
| `RegisterService` 注册的类型 | 仅插件子容器，不能 `MioIoc.Resolve` |
| `ILocalWebhostClient` | 可选；Resolve 前 `IsRegistered` |

Keyed：`MioIoc.ResolveKeyed<IPlugin>(pluginId)` 取其他已加载插件（慎用）。

### `MioAppContext.Current`

`RootNode` · `EventBus` · `Environment` · `FrameworkLogger` · `IntPtr` · `HostVersion` / `SdkVersion`

### `IMioEventBus`

`PublishAsync` / `RegisterEventHandle` / `UnregisterEventHandle`；常见事件：`ParentChangedMessage`、`AttachedTreeEventMessage`、`MioPropertyChangedEventMessage`。

---

## 6. `EavFactory`（宿主用；插件一般只认 `[EavType]`）

| 方法 | 说明 |
|------|------|
| `RegisterAssembly(assembly)` | 扫描 `[EavType]`；**PluginManager 加载时**已调 |
| `CreateInstance(mioType, objectId)` | 按 Guid 构造节点（反序列化） |
| `IsRegistered(mioType)` | 类型是否已注册 |
