# 桌面 Toast 通知

从插件构造函数注入宿主提供的 `IToastService`，或在插件 Context 可用后调用
`Context.GetRequiredService<IToastService>()`。类型位于 `MioKit.Sdk`。
不要使用 `MioIoc.Resolve<IToastService>()`：根服务将通知视作宿主所有，无法随插件停止清理。

```csharp
var toasts = Context.GetRequiredService<IToastService>();
var id = toasts.Show("文件已保存", ToastLevel.Success, "文件工具");

var progressId = toasts.Show(new ToastOptions
{
    Title = "导出文件",
    Message = "正在处理",
    Key = "export",
    Duration = TimeSpan.Zero,
    Progress = new ToastProgress { Value = 0.5, Text = "50%" }
});

toasts.Update(progressId, new ToastOptions
{
    Title = "导出完成",
    Message = "文件已生成",
    Level = ToastLevel.Success
});
```

- 服务可从任意线程调用。返回非空 Guid 只表示请求被接受，窗口显示是异步的；
  所有者未启动、通知关闭或容量已满时返回 `Guid.Empty`。
- `Duration = null` 使用宿主默认四秒；零表示保留到主动关闭，负值无效。
- `Key` 在当前插件实例内按大小写去重，同 Key 的 Show 替换现有通知。
- `Update` 完全替换内容并重置时长，不是局部修改；未知、关闭或其他所有者的 ID 返回 false。
  `Dismiss(id)` 请求关闭，不能管理其他插件的通知。
- `ToastProgress.Value` 为 null 时不定进度，否则须为 0～1 的有限数值。
- `Actions` 最多三个按钮，每项 `ToastAction.Text` 必须非空。
  `ExecuteAsync` 是 `Func<CancellationToken, ValueTask>`，在 UI 线程开始执行；
  CPU 工作自行切走，异步操作传递 token。失败会记录日志并保留通知。
  `CloseOnClick` 默认 true，在按钮操作成功完成后关闭。
- `ContentFactory` 在 UI 线程创建全新、未挂载且不是 Window 的 Control。
  支持展示与鼠标交互；键盘输入使用插件窗口。控件脱离时由插件清理自己的订阅与资源。
  此委托不能跨 JSON / WebView 桥传递。
- 停止/卸载时宿主关闭所属通知并请求取消按钮工作。需要长任务集中管理时，另外使用
  [managed-tasks.md](managed-tasks.md)，显示进度本身不会登记任务。

这是宿主桌面通知服务。插件窗口内部的 Shadcn Toast 仍使用该窗口视觉树中的
ShadToastHost，参见 `miokit-plugin-avalonia-ui` 的控件扩展文档。