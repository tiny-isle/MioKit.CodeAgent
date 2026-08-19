# 键盘 / 鼠标 Hook 与全局快捷键

MioKit 通过 **Win32 低级 Hook**（`Ti.Hooks`）捕获全局输入，经 **Handler 链** 分发给各处理器。插件最常见的需求是 **节点全局快捷键**，应优先使用 **`IHotkeyFeature`**；仅在需要拦截任意按键/鼠标事件时，才实现自定义 `IKeyboardInputHandler` / `IMouseInputHandler`。

---

## 1. 架构分层

```
Win32 WH_KEYBOARD_LL / WH_MOUSE_LL
        │
        ▼
Ti.Hooks                    LowLevelKeyboardHook / LowLevelMouseHook
        │
        ▼
宿主运行时实现              IKeyboardHook / IMouseHook
        │                   Handler 链：按 InputHandlerOrder 升序，Handled 时中断
        ▼
内置处理器示例
  · 宿主全局热键服务        IGlobalHotKeyService + IKeyboardInputHandler (Order=100)
        │                   Win32 RegisterHotKey + Hook 精确匹配
        ▼
宿主节点热键桥接服务        监听挂树 / Hotkey EAV 变更 → 注册/注销热键
        │
        ▼
IHotkeyFeature 节点         HotkeyProperty → InvokeAsync(InvokeContext.FromHotKey(...))
```

| 层 | 程序集 | 职责 |
|----|--------|------|
| 底层 Hook | `Ti.Hooks` | Win32 低级键盘/鼠标 Hook，产生 `KeyboardEventArgs` / `MouseEventArgs` |
| 运行时封装 | 宿主提供 | `IKeyboardHook` / `IMouseHook`：Handler 注册、排序、分发、`StartAsync` / `StopAsync` |
| 全局热键 | 宿主提供 | `IGlobalHotKeyService`：热键注册、冲突检测、Win32 + Hook 双路径触发 |
| 节点桥接 | 宿主提供 | 节点热键桥接服务：把 `IHotkeyFeature` 节点与 `IGlobalHotKeyService` 同步 |
| 插件 API | `MioKit.Sdk` | 接口、事件参数、`HotKeyInfo`、`IHotkeyFeature` |

---

## 2. 宿主启动状态

宿主输入服务启动时：

1. `MioIoc.Resolve<IKeyboardHook>()`
2. 将实现 `IGlobalHotKeyService` 的宿主热键处理器挂入键盘链
3. `keyboardHook.StartAsync()` — **键盘 Hook 已启动**

**鼠标 Hook 默认未启动**。插件若需全局鼠标监听，须自行 `MioIoc.Resolve<IMouseHook>()` 并 `StartAsync`（见 §6）。

宿主会初始化节点热键桥接服务，确保挂树后的 `IHotkeyFeature` 能同步到 `IGlobalHotKeyService`。

---

## 3. 插件推荐：IHotkeyFeature（全局快捷键）

### 3.1 流程

```
节点实现 IHotkeyFeature + 挂树
  → 宿主节点热键桥接服务读取 HotkeyProperty (EAV)
  → IGlobalHotKeyService.Register(id = 节点 Id, HotKeyInfo)
  → 用户按下组合键
  → IGlobalHotKeyService 匹配 → Triggered 事件
  → 宿主节点热键桥接服务按 Id 找节点 → IHotkeyFeature.InvokeAsync(FromHotKey)
  → 节点卸载 / Hotkey 变更 / 摘树 → 自动 Unregister
```

### 3.2 实现模板

```csharp
[EavType(MyPluginConst.MyNodeTypeId)]
public class MyHotkeyNode : MioObject, IHotkeyFeature
{
    public MyHotkeyNode(string id) : base(id) { }
    public override Guid MioType => MyPluginConst.MyNodeType;

    public Task InvokeAsync(InvokeContext context)
    {
        // context.Source == InvokeSource.HotKey
        Context.Logger.Information("Hotkey triggered: {Id}", Id);
        return Task.CompletedTask;
    }
}
```

设置快捷键（持久化 EAV）：

```csharp
// 编译后由 HotkeyExtension 生成 SetHotkey / GetHotkeyAsync
node.SetHotkey(new HotKeyInfo(
    HotKeyInfo.TypeExactMatch,
    KeyCode.Control, KeyCode.Shift, KeyCode.A));

await dp.StoreAsync(node);
node.SetParent(group);   // 挂树后宿主节点热键桥接服务自动注册
```

| 项 | 说明 |
|----|------|
| 接口 | `IHotkeyFeature` 继承 `IInvokeFeature` |
| 扩展类 | `HotkeyExtension` → `HotkeyProperty` | 见 [extension-properties.md](extension-properties.md) |
| 热键 Id | **等于节点 `Id`**（`MioObject.Id`） |
| 触发上下文 | `InvokeContext.FromHotKey(snapshot)`，`Source == InvokeSource.HotKey`；`Context` 为 `InvocationSnapshot` → [invocation-snapshot.md](invocation-snapshot.md) |
| 注册时机 | `AttachedTreeEventMessage`；变更 `HotkeyProperty` 时重新注册 |
| 注销时机 | `DetachedTreeEventMessage` 或属性清空/无效 |

### 3.3 HotKeyInfo

64 位打包结构，存于 EAV（`HotKeyConvert` 序列化）。

| 成员 | 说明 |
|------|------|
| `HotKeyInfo.TypeExactMatch` (1) | **精确匹配**：按下键集合与定义完全一致（当前默认） |
| `TypeReserved2` / `TypeReserved3` | 预留匹配策略 |
| `MaxKeys` | 最多 7 个按键 |
| 构造 | `new HotKeyInfo(type, params KeyCode[])` 或 `new HotKeyInfo(type, byte[])` |

```csharp
// Ctrl+Shift+A
new HotKeyInfo(HotKeyInfo.TypeExactMatch, KeyCode.Control, KeyCode.Shift, KeyCode.A)

// 仅修饰键（如 Ctrl+Alt）— 无法 Win32 RegisterHotKey，完全靠 Hook 匹配
new HotKeyInfo(HotKeyInfo.TypeExactMatch, KeyCode.Control, KeyCode.Menu)
```

- 按键自动 **排序、去重**；LControl/RControl 等在匹配时 **规范化为 Control** 等。
- `IsValid()`：类型 1–3 且至少一个按键。
- UI 展示：`KeyCode.ToKeyboardString()`、`KeyboardConvert`（Avalonia 绑定）。

### 3.4 匹配与 Win32 注册

宿主 `IGlobalHotKeyService` 实现双路径：

| 组合类型 | Win32 `RegisterHotKey` | Hook `MatchTypeExact` |
|----------|------------------------|------------------------|
| 含非修饰键（如 Ctrl+A） | ✅ 注册 + Hook 兜底 | ✅ |
| 仅修饰键（如 Ctrl+Alt） | ❌ | ✅ 仅 Hook |

注册时 **同组合不可重复**（跨 Id 冲突抛 `InvalidOperationException`）。若被其他应用占用 Win32 热键，注册失败并提示错误 1409。

节点热键桥接的默认注册参数：`SuppressEvent=true`, `StopPropagation=true` — 触发后抑制原始按键并停止 Handler 链传播。

---

## 4. Handler 链与 InputEventHandleResult

键盘/鼠标 Hook 按 **`InputHandlerOrder` 升序**（越小越先）遍历已注册 Handler；同 Order 按 `InputHandlerId` 字典序。

```csharp
[Flags]
public enum InputEventHandleResult : byte
{
    None = 0,           // 继续下一个 Handler
    Handled = 1,        // 停止链（不再调用后续 Handler）
    SuppressEvent = 2   // 设置 args.IsHandled，阻止向系统/其他应用传递
}
```

| 接口 | 事件 |
|------|------|
| `IKeyboardInputHandler` | `HandleKeyDown` / `HandleKeyUp` |
| `IMouseInputHandler` | `HandleUp` / `HandleDown` / `HandleDoubleClick` / `HandleWheel` / `HandleMove` |

共同基类 `IInputHandler`：

| 成员 | 说明 |
|------|------|
| `InputHandlerId` | 唯一标识 |
| `InputHandlerOrder` | 优先级（宿主全局热键处理器当前使用 **100**） |
| `IsEnableHandler` | 临时禁用 |

`IGlobalHotKeyService` **继承** `IKeyboardInputHandler`，同时提供 `Register` / `Unregister` / `Triggered` 等 API。

---

## 5. 事件参数

### KeyboardEventArgs

| 属性 | 说明 |
|------|------|
| `Keys` | 当前组合（`Keys` 类，含键盘键 + 可选鼠标键） |
| `CurrentKey` | 触发事件的按键 |
| `IsSimulator` | 是否模拟输入 |
| `IsHandled` | 设为 `true` 可阻止继续传递（配合 `SuppressEvent`） |

### MouseEventArgs（继承 KeyboardEventArgs）

| 属性 | 说明 |
|------|------|
| `CurrentKey` | `MouseKey`（Left / Right / Middle / Wheel / XButton1 / XButton2） |
| `Position` | 屏幕坐标 `Point` |
| `Delta` | 滚轮增量 |
| `IsDoubleClick` | 是否双击 |

### Keys 与 MouseKey

- `Keys.Parse("Ctrl+Shift+A")` — 支持 `+` 分隔；鼠标键支持 `MouseLeft` 或 `Left`。
- `MouseKeyExtensions.Parse` / `ToFixedString` — 鼠标键解析与 `"MouseLeft"` 格式。

按键枚举：**`KeyCode`**（Win32 虚拟键，定义于 `MioKit.Sdk`）。

---

## 6. 高级：自定义 Handler（非 IHotkeyFeature）

适用于：搜索框捕获、全局按键过滤、自定义鼠标手势等。**不要**自行创建 `LowLevelKeyboardHook`；使用宿主已注册的 Hook 服务。

### 6.1 注册键盘 Handler

```csharp
public class MyKeyCapture : IKeyboardInputHandler
{
    public string InputHandlerId => nameof(MyKeyCapture);
    public ushort InputHandlerOrder => 50;   // < 100 可先于宿主全局热键处理器
    public bool IsEnableHandler { get; set; } = true;
    public bool SupportKeyDown => true;
    public bool SupportKeyUp => false;

    public InputEventHandleResult HandleKeyDown(KeyboardEventArgs args)
    {
        // 处理逻辑
        return InputEventHandleResult.None;
    }

    public InputEventHandleResult HandleKeyUp(KeyboardEventArgs args)
        => InputEventHandleResult.None;
}

// StartCoreAsync 内（宿主输入服务已启动后）
var hook = MioIoc.Resolve<IKeyboardHook>();
hook.RegisterHandler(new MyKeyCapture());
```

### 6.2 注册鼠标 Handler

```csharp
var mouseHook = MioIoc.Resolve<IMouseHook>();
mouseHook.RegisterHandler(myMouseHandler);
await mouseHook.StartAsync();   // 宿主默认未启动，需显式 Start
```

### 6.3 直接操作 IGlobalHotKeyService

非节点场景（无 `IHotkeyFeature`）可手动注册：

```csharp
var hotkeys = MioIoc.Resolve<IGlobalHotKeyService>();
hotkeys.Register(new HotKeyDefinition(
    id: "my-plugin-action",
    hotKeyInfo: new HotKeyInfo(HotKeyInfo.TypeExactMatch, KeyCode.Control, KeyCode.B),
    suppressEvent: true,
    stopPropagation: true));

hotkeys.Triggered += (_, e) =>
{
    if (e.Registration.Id == "my-plugin-action") { /* ... */ }
};
```

插件 `StopCoreAsync` / 卸载时应 `Unregister` 并 `UnregisterHandler`，避免泄漏。

---

## 7. 解析服务：MioIoc vs 插件 Container

| 服务 | 解析方式 |
|------|----------|
| `IKeyboardHook` / `IMouseHook` / `IGlobalHotKeyService` | **`MioIoc.Resolve<T>()`**（宿主全局容器） |
| `IMioDataProvider`、插件内部服务 | **`Container!.Resolve<T>()`**（插件子容器） |

Hook 与热键服务注册在宿主全局容器中，不在插件 `RegisterService` 内。

---

## 8. 插件约定

| ✅ 应做 | ❌ 禁止 |
|--------|--------|
| 节点快捷键用 `IHotkeyFeature` + `HotkeyExtension.HotkeyProperty` | 在插件内 new `LowLevelKeyboardHook` / 重复 Start 键盘 Hook |
| 挂树后热键自动生效；改 EAV 后自动重注册 | 硬编码 Win32 `RegisterHotKey` 与宿主热键冲突 |
| 自定义 Handler 设置合理 `InputHandlerOrder` | Order 随意导致拦截宿主热键或搜索框 |
| `StopCoreAsync` 注销 Handler / 手动 Register 的热键 | 插件卸载后仍留 Handler 或占用热键 Id |
| 用 `KeyCode` + `HotKeyInfo.TypeExactMatch` 定义组合 | 发明未文档化的 HotKey 匹配类型 |

---

## 9. 相关

- Feature 摘要：[features.md](features.md) § IHotkeyFeature
- 服务解析：`MioIoc`（宿主）vs 插件 `RegisterBase<T>.Instance.ComponentContext` — 见 [plugin-core.md](plugin-core.md) § 宿主 IoC vs 插件 IoC
