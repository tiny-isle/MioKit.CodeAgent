# Feature 路由

按当前节点能力选择一篇参考，不要同时读取全部 Feature 文档。

| 当前任务 | 阅读 |
|---|---|
| 定义节点、内存节点、名称/别名、热键、搜索组、执行、置顶、最近使用或图标 | [features-basics.md](features-basics.md) |
| 搜索结果操作、附着搜索框、作用域、插件启用状态、窗口状态或 Feature 组合 | [features-search-and-ui.md](features-search-and-ui.md) |
| 定义自有 Feature 的 EAV / Memory 属性 | [extension-properties-basics.md](extension-properties-basics.md)；复杂缓存或设置页再读 [extension-properties-advanced.md](extension-properties-advanced.md) |

`IFeature` 是根接口，所有 `MioObject` 均实现它。树遍历和 `HasFeature` / `GetFeature` → [nodes-and-tree.md](nodes-and-tree.md)。

**读取边界：** 只有需要该接口或其行为时才打开相应文档；不要为了查一个 Feature 顺带加载另一个 Feature 的实现细节。
