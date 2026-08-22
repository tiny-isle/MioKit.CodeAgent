# 跨插件方法调用

`IPluginCallClient` / `IPluginCallStrategy` 提供运行中插件之间的版本化方法调用。
它适合“调用目标插件执行一个明确方法并返回结果”；跨模块事件广播仍使用
`IMioEventBus`，两者不要混用。

## 调用模型

调用由宿主路由，调用方和目标方都必须处于可调用的运行状态：

```text
调用方插件
  └─ IPluginCallClient.CallAsync(PluginCallRequest)
       └─ 宿主按 TargetPluginId + MethodName + ContractVersion 精确路由
            └─ 目标插件的 IPluginCallStrategy.HandleAsync(...)
```

调用方身份由宿主绑定到插件 IOC 中的 `IPluginCallClient`，不会从请求对象读取，
因此请求不能伪造 `CallerPluginId`。目标策略也不声明所属插件 ID；宿主根据策略所在的
插件容器确定归属。

## 调用方：发送请求

`IPluginCallClient` 是插件私有容器中的服务，可以通过构造函数注入到服务或生命周期组件：

```csharp
using System.Text.Json;
using MioKit.Sdk;

public sealed class SettingsClient(IPluginCallClient pluginCalls)
{
    public async ValueTask<string?> GetThemeAsync(CancellationToken cancellationToken = default)
    {
        var arguments = JsonSerializer.SerializeToElement(new
        {
            IncludeSystemTheme = true
        });

        var response = await pluginCalls.CallAsync(new PluginCallRequest
        {
            TargetPluginId = "com.example.settings",
            MethodName = "settings.get-theme",
            ContractVersion = 1,
            Arguments = arguments
        }, cancellationToken);

        if (response.Status == PluginCallStatus.Failure)
        {
            // 根据 response.ErrorCode 处理目标不存在、版本不支持等情况。
            return null;
        }

        return response.Result?.Deserialize<string>();
    }
}
```

请求规则：

- `TargetPluginId` 和 `MethodName` 必须非空，且不能包含首尾空白；方法名大小写敏感。
- `ContractVersion` 从 `1` 开始，必须与目标策略的版本精确匹配。
- `Arguments` 是可选的 `JsonElement`；没有参数时传 `null`。不要传
  `JsonValueKind.Undefined`。
- 请求对象不包含调用方 ID；不要尝试添加或推断身份字段。
- 调用应传递当前操作的 `CancellationToken`，不要使用无法取消的长期阻塞调用。

## 目标方：公开方法

目标插件为每个公开方法实现一个 `IPluginCallStrategy`，并在自己的
`RegisterService` 中注册到插件容器：

```csharp
using Autofac;
using Microsoft.Extensions.DependencyInjection;
using System.Text.Json;
using MioKit.Sdk;

public sealed class GetThemeStrategy : IPluginCallStrategy
{
    public string MethodName => "settings.get-theme";

    public int ContractVersion => 1;

    public ValueTask<PluginCallResponse> HandleAsync(
        PluginCallContext context,
        JsonElement? arguments,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var theme = JsonSerializer.SerializeToElement("system");
        return ValueTask.FromResult(PluginCallResponse.Success(theme));
    }
}

public sealed class SettingsRegister : RegisterBase<SettingsRegister>
{
    public override void RegisterService(ContainerBuilder builder, IServiceCollection services)
    {
        var plugin = new SettingsPlugin();

        builder.RegisterInstance(plugin)
            .As<IPlugin>()
            .Keyed<IPlugin>(SettingsConst.PluginId)
            .As(plugin.GetType());

        builder.RegisterType<GetThemeStrategy>()
            .As<IPluginCallStrategy>()
            .SingleInstance();
    }
}
```

策略注册规则：

- `MethodName` 与 `ContractVersion` 共同组成公开方法的稳定契约；同一插件可以同时注册
  同一方法的多个版本，但不能重复注册相同的方法名和版本。
- `HandleAsync` 收到的 `PluginCallContext` 是宿主创建的可信上下文；使用
  `context.CallerPluginId` 做授权或审计时，不要从 JSON 参数读取调用方身份。
- 策略应尽快返回并尊重 `CancellationToken`。不要在策略中依赖调用方插件的内部类型或
  直接访问另一个插件的容器。
- 成功结果使用 `PluginCallResponse.Success(result)`；没有返回值时可省略 `result`。
  失败结果使用 `PluginCallResponse.Failure(errorCode, errorMessage)`，错误码不能为空。
- 策略可以返回插件自定义错误码；宿主定义的稳定错误码见下表。

## 响应与错误处理

`PluginCallResponse` 的 `Status` 决定调用是否成功：

| 状态 | 成员 | 说明 |
|---|---|---|
| `Success` | `Result` | 可选 JSON 结果；没有结果时为 `null` |
| `Failure` | `ErrorCode`、`ErrorMessage` | 机器可判断的错误码和可选说明 |

`PluginCallErrorCodes` 提供宿主可能返回的稳定错误码；宿主可能返回以下值：

| 错误码 | 含义 |
|---|---|
| `invalid_request` | 请求为空、目标/方法名无效、版本小于 1 或 JSON 参数无效 |
| `caller_not_active` | 调用方未运行，不能发起调用 |
| `target_not_found` | 目标插件未加载或已从路由移除 |
| `target_not_running` | 目标插件当前未运行 |
| `method_not_found` | 目标插件没有公开该方法名 |
| `version_not_supported` | 方法存在，但没有请求的契约版本 |
| `call_cycle_detected` | 调用会形成自调用或嵌套调用环路 |
| `handler_failed` | 策略返回空响应或执行时抛出未处理异常 |

策略抛出的普通异常会被记录并转换为 `handler_failed`，不会把异常对象泄露给调用方。
`OperationCanceledException` 保持取消语义并继续向调用方传播，调用方应按取消处理，
不要把取消当成普通业务失败。

## 生命周期与调用环路

- 目标插件只有在运行状态下才接受方法调用；停止或卸载目标插件时，活动调用会收到目标
  生命周期的取消信号。
- 调用方停止或卸载后不能发起新的调用，调用方已有的出站调用也会被取消。
- 调用方传入的取消令牌、调用方生命周期和目标插件生命周期共同约束一次调用；策略必须
  将令牌继续传递给下游异步操作。
- 同一插件调用自身，或 `A → B → A` 这样的嵌套调用，会返回
  `call_cycle_detected`。需要异步解耦时，应改用事件或持久化状态，而不是绕过环路检测。

## 检查清单

- [ ] 调用方通过注入的 `IPluginCallClient` 发起调用，没有自行填写调用方身份
- [ ] 目标方在 `RegisterService` 中注册 `IPluginCallStrategy`
- [ ] 方法名和契约版本已定义并保持兼容，版本匹配使用精确值
- [ ] JSON 参数和结果有明确契约，正确区分 `Success` 与 `Failure`
- [ ] 策略使用 `PluginCallContext.CallerPluginId` 做授权/审计，并尊重取消令牌
- [ ] 调用方处理目标不存在、未运行、版本不支持和取消等失败情况
- [ ] 未使用跨插件方法调用替代单向事件广播，也未使用事件总线伪装请求/响应
