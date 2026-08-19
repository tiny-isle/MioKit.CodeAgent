# Vue UI 模板规范

本规范适用于 `MioWebview2` 承载的 Vue 3 前端。它独立于项目模板中的 `.agents` 文件；
即使模板不再携带该目录，也应按本文开发。

## 技术栈与结构

默认工程使用 Vue 3.5、Vite 7、Pinia 3、Vue Router 4（Hash 模式）、Tailwind CSS 4、Reka UI /
shadcn-vue 风格组件、TanStack Table、vue-sonner。保持模板已有版本和配置，除非任务明确
要求升级。

```
src/
├── main.js                 # 应用入口：先初始化 bridge，再挂载 Vue
├── App.vue                 # 根组件（Toaster、全局 Loading）
├── style.css               # 全局样式和主题变量
├── lib/
│   ├── utils.js            # cn() 类名合并
│   ├── colorTheme.js       # 动态主题与 window.setColorTheme
│   ├── loadMonaco.js       # Monaco 加载器
│   └── vue-bridge/         # DotnetBridge 与 Vue 组合式 API
├── router/index.js         # Hash 路由，并暴露 window.router
├── store/useThemeStore.js  # 跟随系统的深浅色主题
├── views/                  # 业务页面
├── components/hotkey/      # HotKeyControl / HotKeyEditor
└── components/ui/          # 可复用 UI 组件
```

在 `src/views/` 新建页面，并在 `src/router/index.js` 注册路由；不要将业务页面塞进
`App.vue`。可复用 bridge 调用放 `src/api/`，页面的响应式状态优先使用 `useService`。

## Bridge 初始化与前端边界

`bridge.js` 与 `bridge-vue.js` 是暴露全局对象的 IIFE 脚本，不是普通 ES Module。`main.js`
必须动态初始化，避免模块提升时 `window.Vue` 尚未就绪：

```javascript
import { setupVueBridge } from '@/lib/vue-bridge/setup';

async function bootstrap() {
  await setupVueBridge(); // window.DotnetBridge、window.VueDotnetBridge
  // createApp(...).use(...).mount('#app')
}
bootstrap();
```

不要静态导入 `bridge-vue.js`，也不要回退到已弃用的 `window.bridge` / `webview2.js`
module.method 协议。完整 bridge API、服务生命周期与 C# 契约见 `vue-bridge.md`。

浏览器中的 `pnpm dev` 没有 WebView2 bridge：需要将 bridge 功能 mock，或最终在
WebView2 中验证；不能把浏览器调试成功当作 .NET 通信已验证。

## C# 驱动的全局 API

模板应提供下列 `window` API，供 C# 通过 `ExecuteScriptAsync` 调用：

| API | 用途 |
|---|---|
| `window.setColorTheme(payload)` | 同步 Avalonia `ShadColorTheme` 色板 |
| `window.router.push(path)` / `replace(path)` / `back()` / `current()` | 路由导航 |
| `window.loading.show(msg?)` / `hide()` / `setMessage(msg)` | 全局 Loading |

在 C# 与 Vue 之间传递数据时序列化为 JSON；不要把字符串直接拼进 JavaScript。

## 主题同步

`MioWebview2` 设置浏览器的 `PreferredColorScheme`，前端通过 `prefers-color-scheme`
自动切换 light/dark 色板；不要使用独立的 window API 强制深浅色。

`window.setColorTheme(payload)` 接收色板名称和 `light` / `dark` 两套色值。颜色可为 Avalonia
`#AARRGGBB` 字符串，或 `{ r, g, b, a }`（`a` 接受 0–255 或 0–1）。属性名可使用
PascalCase 或 camelCase，典型字段如下：

```javascript
window.setColorTheme({
  name: 'Default',
  light: {
    background: '#FFFFFFFF', foreground: '#FF0A0A0A',
    primary: '#FF2563EB', primaryForeground: '#FFFFFFFF',
    danger: '#FFEF4444', dangerForeground: '#FFFFFFFF',
    border: '#FFE5E7EB', radiusSize: 'Normal', // Small | Normal | Large
  },
  dark: { background: '#FF0A0A0A', foreground: '#FFFAFAFA' },
});
```

`NavigationCompleted` 时 Vue 模块可能尚未加载。`index.html` 有排队 stub 时可在此调用；
更稳妥的做法是等待 WebView 收到 `{ type: 'appReady' }`，或前端的
`color-theme-api-ready` / `app-ready` 事件后再调用。前端还会发出 `theme-changed`
（`detail.theme`、`detail.colorTheme`）和 `color-theme-changed`（`detail.name`）事件。

将色板映射到语义 CSS 变量后，界面一律使用语义 Tailwind 类，而不是硬编码颜色：

| 色板字段 | CSS 变量 / 推荐类 |
|---|---|
| Background / Foreground | `--background` / `bg-background`；`--foreground` / `text-foreground` |
| Primary / Danger / Information / Warning | `bg-primary`、`bg-destructive`、`bg-information`、`bg-warning` |
| Border | `--border` / `border-border` |
| LowText / MuteText / DisabledText | 对应 `--low-text` 等语义变量 |

## 快捷键录入

全局快捷键**不得**通过 `window.addEventListener('keydown')` 录入：这会触发宿主已注册的
热键，且 WebView 失焦时也无法捕获。使用宿主的低级键盘钩子服务：

- 注册 `HotKeyCaptureJsService` 为 singleton，并以 `[JsService("HotKeyCaptureService")]` 暴露。
- 使用 `components/hotkey/HotKeyControl.vue`、`HotKeyEditor.vue` 与
  `composables/useHotKeyCapture.js`；浏览器无 bridge 时控件应禁用。
- `Popover` 关闭、点击外部、Esc、路由离开或窗口失焦时均调用 `CancelCapture`；录入期间
  暂时禁用 `GlobalHotKeyService`。

```vue
<HotKeyControl
  :model-value="hotKeyValue"
  :display="hotKeyDisplay"
  exclude-owner-id="your-node-id"
  @save="(v) => yourService.Methods.SetHotKey(v)"
/>
```

## 界面约定与组件

- 用户可见文案直接使用中文，不引入 i18n。
- 优先使用 Tailwind 和语义化主题类；条件类名用 `@/lib/utils` 的 `cn()` 合并。
- 成功、失败或提示消息使用 `vue-sonner`：

  ```javascript
  import { toast } from 'vue-sonner';
  toast.success('操作成功', { description: '已保存' });
  ```

- 优先复用 `components/ui/` 中的组件。删除等不可逆操作使用 `ConfirmPopover`；普通编辑
  使用 `Dialog`；表格使用 `DataTable`（支持 selection、列显隐、分页和左右冻结列）。
- 图标操作使用 `ActionIcon`，变体为 `default`、`primary`、`success`、`warning`、`error`。
- 使用 Monaco 时，C# 须映射虚拟主机 `jsruntime.local` 到
  `{AppBase}/jsruntime/monaco0.54.0/vs/`，通过 `loadMonaco()` 加载，并监听
  `theme-changed` 将编辑器切为 `vs` 或 `vs-dark`。

### 常用组件速查

```vue
<script setup>
import { ref } from 'vue';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const open = ref(false);
</script>

<template>
  <Button @click="open = true">打开弹窗</Button>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>标题</DialogTitle>
        <DialogDescription>描述文字</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" @click="open = false">取消</Button>
        <Button @click="open = false">确定</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
```

```vue
<script setup>
import { ConfirmPopover } from '@/components/ui/confirm-popover';
import { ActionIcon } from '@/components/ui/action-icon';
import { Trash2 } from 'lucide-vue-next';
</script>

<template>
  <ConfirmPopover title="删除确认" description="是否确认删除此项目？" @confirm="onDelete">
    <ActionIcon variant="error"><Trash2 /></ActionIcon>
  </ConfirmPopover>
</template>
```

`DataTable` 接收 `columns` 和 `data`，支持 `enableSelection`（默认 true）、
`enableColumnVisibility`、`enablePagination`、`pageSizeOptions`、`stickyLeftColumns` 与
`stickyRightColumns`。列使用 TanStack 格式，例如：

```javascript
const columns = [
  { accessorKey: 'id', header: 'ID', size: 60 },
  { accessorKey: 'name', header: '名称', size: 120 },
  { id: 'actions', header: '操作', size: 80, enableHiding: false },
];
```

```javascript
import { loadMonaco } from '@/lib/loadMonaco';

const monaco = await loadMonaco();
const editor = monaco.editor.create(container, {
  value: 'console.log("Hello");', language: 'javascript', theme: 'vs-dark',
});
window.addEventListener('theme-changed', (e) => {
  monaco.editor.setTheme(e.detail.theme === 'dark' ? 'vs-dark' : 'vs');
});
```
