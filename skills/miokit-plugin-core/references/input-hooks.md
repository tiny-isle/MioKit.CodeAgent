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

本次新增 `ExtraInfo`、可选分发接口及下述启动/停止语义按 SDK 1.2.3+ 与对应宿主实现
核对；版本与发布条件见 [sdk-api-index.md](sdk-api-index.md)。

宿主输入服务启动时：

1. 从插件 DI 获取 `IKeyboardHook`（继承宿主注册的共享实例）
2. 将实现 `IGlobalHotKeyService` 的宿主热键处理器挂入键盘链
3. 等待 `keyboardHook.StartAsync()` — 成功后键盘 Hook 才就绪

**鼠标 Hook 默认未启动**。插件若需全局鼠标监听，从插件 DI 注入 `IMouseHook` 并等待 `StartAsync`（见 §6）。

宿主会初始化节点热键桥接服务，确保挂树后的 `IHotkeyFeature` 能同步到 `IGlobalHotKeyService`。

宿主服务启动与插件加载并行，不能假定插件 `StartAsync` 时键盘已经就绪。
自定义输入组件需要立即可用时可等待共享 Hook 的 `StartAsync(ct)`；并发调用共享底层
启动，安装失败向调用方报错。取消已开始的 Start/Stop 只取消当前等待，底层共享操作
继续。`StopAsync` 等待资源释放，但在 Hook 自身同步回调线程调用时仅请求停止并立即
返回，避免等待自身退出。插件停止只注销自己的 Handler/热键，不停止宿主共享 Hook。

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
| `ExtraInfo` | SDK 1.2.3+ 的原生 `dwExtraInfo`（`nuint`），可区分自己附带标签的模拟输入；不是可信身份 |

`Position` 使用屏幕像素，可因左侧/上方显示器而为负值。旧构造重载仍可用，默认
`ExtraInfo = 0`。标签与 `IsSimulator` 组合用于避免自身回放递归，不应据此信任外部输入。

### Keys 与 MouseKey

- `Keys.Parse("Ctrl+Shift+A")` — 支持 `+` 分隔；鼠标键支持 `MouseLeft` 或 `Left`。
- `MouseKeyExtensions.Parse` / `ToFixedString` — 鼠标键解析与 `"MouseLeft"` 格式。

按键枚举：**`KeyCode`**（Win32 虚拟键，定义于 `MioKit.Sdk`）。

---

## 6. 高级：自定义 Handler（非 IHotkeyFeature）

适用于：搜索框捕获、全局按键过滤、自定义鼠标手势等。**不要**自行创建 `LowLevelKeyboardHook`；使用宿主已注册的 Hook 服务。

### 6.1 注册键盘 Handler

```csharp
using MioKit.Sdk;

// 在 RegisterService 中 AsSelf().As<IPluginLifecycleComponent>().SingleInstance()。
public sealed class MyKeyCapture : IKeyboardInputHandler, IPluginLifecycleComponent
{
    private readonly IKeyboardHook _hook;
    public MyKeyCapture(IKeyboardHook hook) => _hook = hook;
    public string InputHandlerId => "com.example.plugin.capture.keyboard";
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

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        await _hook.StartAsync(cancellationToken);
        _hook.RegisterHandler(this);
    }

    public Task StopAsync(CancellationToken cancellationToken = default)
    {
        _hook.UnregisterHandler(this);
        return Task.CompletedTask;
    }
}
```

同步 Handler 尽快返回；耗时工作移到队列/任务服务，不在输入线程同步等待。

### 6.2 注册鼠标 Handler

```csharp
// mouseHook 由插件 DI 构造注入 IMouseHook。
// 生命周期组件 StartAsync：保留同一个 myMouseHandler 实例用于停止时注销。
await mouseHook.StartAsync(cancellationToken);
mouseHook.RegisterHandler(myMouseHandler);

// 组件 StopAsync：只解除自己的注册，不 Stop/Dispose 共享 Hook。
mouseHook.UnregisterHandler(myMouseHandler);
```

### 6.3 直接操作 IGlobalHotKeyService

非节点场景（无 `IHotkeyFeature`）可手动注册：

```csharp
// hotkeys 由插件 DI 构造注入 IGlobalHotKeyService。
hotkeys.Register(new HotKeyDefinition(
    Id: "my-plugin-action",
    HotKeyInfo: new HotKeyInfo(HotKeyInfo.TypeExactMatch, KeyCode.Control, KeyCode.B),
    SuppressEvent: true,
    StopPropagation: true));

void OnTriggered(object? sender, HotKeyTriggeredEventArgs e)
{
    if (e.Registration.Id == "my-plugin-action") { /* ... */ }
}
hotkeys.Triggered += OnTriggered;

// 组件停止时使用相同委托退订，再注销自己的热键。
hotkeys.Triggered -= OnTriggered;
hotkeys.Unregister("my-plugin-action");
```

手动热键同样放在生命周期组件中注册/清理。不要调用全局 `Clear`，避免影响其他插件。

### 6.4 可选输入线程分发

`IInputHookDispatcher` 是额外能力，不是 `IInputHook` 的必需成员。当前宿主只有
`IMouseHook` 实例实现它，键盘实例没有；接口也未单独注册到根容器。
对已解析的 Hook 做能力探测，缺失时显式报告/跳过依赖该能力的功能，不偷偷换线程。

```csharp
using MioKit.Sdk;

public static async Task<bool> TryUpdateInputStateAsync(
    IMouseHook hook, Action updateState, CancellationToken cancellationToken = default)
{
    if (hook is not IInputHookDispatcher dispatcher)
        return false;

    await hook.StartAsync(cancellationToken);
    await dispatcher.DispatchAsync(updateState, cancellationToken);
    return true;
}
```

只投递短同步 `Action`，不能传 `async` lambda 形成 `async void`。
`DispatchAsync` 始终排队，即使在 Hook 线程调用也不会内联；不要在该线程使用
`.Wait()` / `.Result`。排队前取消可阻止执行，已开始工作不中断；Action 异常使返回
Task 失败，不终止输入循环。停止会取消未开始工作并等待正在执行的工作，重启不会
执行旧队列。调用方应等待/观察 Task，并处理停止、取消、未启动或已释放的情况。

---

## 7. 统一从插件 DI 获取服务

`IKeyboardHook` / `IMouseHook` / `IGlobalHotKeyService` 与数据服务、插件私有服务
一样，优先由插件 DI 构造注入；`PluginBase` 方法内也可使用 `Container!.Resolve<T>()`。
Hook 与热键服务虽在宿主全局容器注册，插件 Scope 会继承这些共享实例，无需使用
`MioIoc` 或在 `RegisterService` 重新注册 Hook。只注册自己的处理器/生命周期组件，
停止时只注销自己的资源。

---

## 8. 插件约定

| ✅ 应做 | ❌ 禁止 |
|--------|--------|
| 节点快捷键用 `IHotkeyFeature` + `HotkeyExtension.HotkeyProperty` | 为插件私建 `LowLevelKeyboardHook` 或停止宿主共享 Hook |
| 挂树后热键自动生效；改 EAV 后自动重注册 | 硬编码 Win32 `RegisterHotKey` 与宿主热键冲突 |
| 自定义 Handler 设置合理 `InputHandlerOrder` | Order 随意导致拦截宿主热键或搜索框 |
| 生命周期组件停止时注销 Handler / 手动 Register 的热键并退订 | 停止共享 Hook、全局 Clear 或插件卸载后仍留注册 |
| 用 `KeyCode` + `HotKeyInfo.TypeExactMatch` 定义组合 | 发明未文档化的 HotKey 匹配类型 |

---

## 9. 相关

- Feature 摘要：[features.md](features.md) § IHotkeyFeature
- 服务解析：统一使用插件 DI — 见 [plugin-core.md](plugin-core.md) § 统一使用插件 DI
