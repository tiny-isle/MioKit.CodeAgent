# 扩展属性路由

按属性工作阶段读取一篇参考，避免把缓存、事件和设置页细节带入普通属性定义任务。

| 当前任务 | 阅读 |
|---|---|
| 选择 EAV / Setting EAV / Memory、声明属性、生成 Get/Set、预加载 | [extension-properties-basics.md](extension-properties-basics.md) |
| 缓存策略、变更通知、SDK 内置属性、自定义 Feature、设置页、无 Relation 读写或内存节点持久化 | [extension-properties-advanced.md](extension-properties-advanced.md) |

所有扩展属性都由源生成器生成 Get/Set；不要手写访问器。若节点需要 `IMemoryNodeFeature` 语义，同时读取 [features-basics.md](features-basics.md)。
