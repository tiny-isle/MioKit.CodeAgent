# 附着搜索框：入口与 command

本文只用于 `/` 作用域发现和 `SearchCommands` 行为。接口、基类、附着生命周期、内容宿主和挂树 → [attach-search-panel-basics.md](attach-search-panel-basics.md)。

---

## 1. `/` 入口发现

用户输入以 `/` 开头时，宿主预览列出根树上所有 `ISearchScopeFeature`：

- 仅 `/`：按 `Name` 排序列出全部作用域
- `/关键词`：按 `Name` 与 **command 别名**（`SearchCommands` + `UserSearchCommands`）文本匹配过滤

选中结果执行 `InvokeAsync` → `SetAttachedPanelAsync`。作用域节点的 `Name` / `Description`（`IFeature` 接口成员）会显示在预览列表中。

---

## 2. command 模式（SearchCommands + UserSearchCommands）

### 2.1 插件声明：`SearchCommands`

任意实现 `IAttachPanelFeature` 的节点可在代码中声明多个 `SearchCommands`；每项须符合 `^[a-z]+(?:[-_][a-z]+)*$`。继承 `SearchScopeFeatureBase` 时 **override** 属性：

```csharp
public override IReadOnlyList<string> SearchCommands { get; } = ["app", "app-launch"];
```

宿主与 `SearchHelper.TryMatch` 通过 `EnumerateSearchCommandMatchCandidates()` 合并 `SearchCommands` 与 `GetUserSearchCommands()` 得到匹配候选；插件一般无需直接调用，但自定义匹配逻辑时可复用。

### 2.2 用户配置：`UserSearchCommands`（EAV）

宿主为所有 `IAttachPanelFeature` 提供 EAV 扩展属性，供用户在设置界面等场景追加别名：

| 项 | 说明 |
|----|------|
| 扩展类 | `AttachPanelExtension` |
| 属性 | `UserSearchCommandsProperty` — `EavProperty<List<string>>`，`SearchCommandListConvert` 序列化 |
| 缓存 | `EavCachePolicy.Absolute` + `ForcePersistence`；`SearchScopeFeatureBase.PreloadPropertySource` 已包含，持久化节点加载或内存节点挂树时预读 |
| 同步读 | `this.GetUserSearchCommands()`（`SearchScopeFeatureBase` 已预加载；**MioObject 子类内须 `this.`**） |
| 写入 | `this.SetUserSearchCommands(list)`；非法项由 `SearchCommandValidation` 按分隔符规则过滤 |
| 变更 | `SetUserSearchCommands` 后宿主自动刷新 command 注册表 |

```csharp
// 设置界面等：为用户追加自定义 command（在 MioObject 子类内须 this.）
scopeFeature.SetUserSearchCommands(["my-app", "go_now"]);

// 同步读取（SearchScopeFeatureBase 预加载后）
var userCommands = this.GetUserSearchCommands();
```

### 2.3 宿主合并规则

| 规则 | 说明 |
|------|------|
| 合并 | `SearchCommands` + `GetUserSearchCommands()` 去重后进入注册表；`EnumerateSearchCommandMatchCandidates()` 为同一合并逻辑的公开 API |
| 插件职责 | 声明 `SearchCommands`；**不**解析输入、**不**处理触发键；用户别名由宿主 EAV 管理 |
| 触发时机 | 用户输入别名（或合法前缀）后**按下宿主配置的触发键**（与 `SearchAsync` 搜索管线分离） |
| 前缀补全 | 输入合法前缀时显示幽灵补全；触发键支持**最短前缀匹配**附着 |
| 分隔符前缀 | 输入可暂时以单个 `-` 或 `_` 结尾；例如已注册 `my-color` 时，输入 `my-` 即显示补全 |
| 宿主行为 | 用当前 `SearchText` 匹配注册表；命中则取消进行中的搜索并 `SetAttachedPanelAsync` |
| 注册时机 | 节点挂到 RootNode 子树（`IsAttachRootTree`）时自动注册；`UserSearchCommands` 变更时重新注册；下树时注销 |
| 冲突 | 同一 command 被多个节点声明时，**先上树者优先**；其余保留在队列，前者下树后自动回落 |
| 未命中 | 不附着；不影响当前搜索状态 |
| 与 `/` | `Name` 与 command 别名均可参与 `/` 预览的文本匹配；触发键 command 模式匹配合并后的全部别名 |

**附着后插件需做的：** 在 `OnAttachSearchBox` / `OnDetachSearchBox` 维护 UI 或状态；若实现 `IAttachPanelSearchFeature`，在 `SearchAsync` 内产出该范围内的搜索结果。

仅 `IAttachPanelFeature`（无 `SearchAsync`）也可注册 command；附着后输入仍禁用，与手动附着行为一致。

---

