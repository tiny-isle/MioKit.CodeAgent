# 宿主 Toast 通知

需要 SDK 1.3.0 或更高及对应宿主实现，使用它的插件设置
`"minSdkVersion": "1.3.0"`。同步基准中 1.3.0 仅为源码准备版本，发布状态未核实；
模板仍引用 1.2.3。确认包可用后，可显式引用 `MioKit.Sdk` 1.3.0，不能靠修改清单使旧
宿主拥有新 API；不随插件携带宿主 DLL。依赖规则见 [nuget.md](nuget.md)。

## 服务归属与简单通知

宿主为每个加载的插件实例注入 `IToastService`。业务服务从插件子容器构造注入；
只注册业务类，不自行注册通知服务。也可在 `PluginBase` 方法内使用
`Container!.Resolve<IToastService>()`（`using Autofac;`）。

```csharp
using MioKit.Sdk;

public sealed class SaveFeedback(IToastService toasts)
{
    public Guid Saved() => toasts.Show("配置保存成功", ToastLevel.Success);
}
```

插件不要使用 `MioIoc.Resolve<IToastService>()`：根服务归属应用，插件停止/卸载不会
清理其通知。这里也不需要 View、`ShadWindow` 或插件自己创建 `ShadToastHost`。
窗口内部的 Shadcn Toast 是另一种能力，见 Avalonia skill 的控件参考。

服务可从后台线程调用。非空 ID 仅表示请求已接受，不表示窗口已显示；初始化阶段、
禁用/停止后、旧内容仍在清理或容量已满时，`Show` 返回 `Guid.Empty`，不要用它继续更新。

## 进度与替换

```csharp
var id = toasts.Show(new ToastOptions
{
    Title = "模型导入中",
    Key = "model-import",
    Duration = TimeSpan.Zero,
    Progress = new ToastProgress { Value = null, Text = "正在准备" }
});

if (id != Guid.Empty)
{
    toasts.Update(id, new ToastOptions
    {
        Title = "模型导入中",
        Key = "model-import",
        Duration = TimeSpan.Zero,
        Progress = new ToastProgress { Value = 0.65, Text = "65%" }
    });
    toasts.Update(id, new ToastOptions
    {
        Title = "模型导入完成",
        Message = "资源已处理成功",
        Level = ToastLevel.Success,
        Duration = TimeSpan.FromSeconds(3)
    });
}
```

`Update` **完整替换**选项并重置时长，不是补丁；要保留的属性必须再次提供。
同一实例同非空 `Key` 的 `Show` 替换原通知并返回原 ID，Key 按 Ordinal 区分大小写，
不同插件互不影响。更新到另一个活跃通知的 Key 会抛异常。
未知、关闭中、已关闭或其他实例的 ID 无法更新；`Update` / `Dismiss` 返回 `false`。

空消息、非法等级/时长/进度等选项会抛参数异常；`Guid.Empty` / `false` 表示合法请求
未被接受，不是所有错误的统一返回值。即使 ID 无效，`Update` 也会先校验选项。

默认时长 4 秒，零为常驻，负值非法。进度 `Value = null` 表示不确定进度，确定值需为
有限的 0～1。默认最多同时展示 4 条；每插件容量 20 条、全局 100 条，排队不消耗时长，
悬停或操作执行中暂停自动关闭。全屏免打扰期间短时通知仍老化，过期后不补弹。

## 操作按钮

```csharp
toasts.Show(new ToastOptions
{
    Title = "操作失败",
    Message = "检查设备后重试",
    Level = ToastLevel.Error,
    Actions =
    [
        new ToastAction
        {
            Text = "重试",
            ExecuteAsync = async ct => await RetryAsync(ct),
            CloseOnClick = true
        }
    ]
});
```

`RetryAsync(CancellationToken)` 替换为实际业务方法。按钮最多 3 个，`Text` 非空；
`ExecuteAsync` 类型为 `Func<CancellationToken, ValueTask>`，执行从 UI 线程开始，
宿主登记任务并防止重复点击。CPU 密集工作显式卸载到后台。
`CloseOnClick` 默认 `true`，成功完成后才关闭；失败记录日志并保留供重试。
更新、关闭和插件停止会请求取消操作，业务必须响应 token。停止清理会等待真实执行退出，
不能把取消请求当作完成。托管任务语义见 [managed-tasks.md](managed-tasks.md)。

## 自定义 Avalonia 内容与生命周期

`ToastOptions.ContentFactory` 是在 UI 线程调用的 `Func<Control>`。工厂返回新的、
未挂载的普通 Control，替换消息区；标题、进度、按钮及外壳仍由宿主管理。不要返回
`Window` 或已挂载控件。通知不激活，适合展示和鼠标操作，需要键盘输入时打开插件窗口。

宿主关闭/替换时脱树并解除持有引用，不会 Dispose 控件或共享 DataContext。
屏幕迁移或高度变化可能使同版本控件临时脱树后再挂载，工厂同版本只创建一次；
订阅、计时器在 Attached/Detached 中成对建立与解除，Detached 不代表永久销毁。

禁用/停止/卸载会清理本次加载实例的通知；旧服务实例不能影响重新加载后的新会话。
WebView/Vue 通过插件 C# JsService 包装操作，JSON 不能传输 `ContentFactory` 或异步委托。
