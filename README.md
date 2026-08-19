# miokit-mcp

MioKit 的 Node.js MCP 服务。当前提供 `generate_guid` 工具，后续工具按同样方式挂到 `src/tools/`。

## 要求

- Node.js 20+

## 开发

```bash
npm install
npm start
```

stdio 上 stdout 是协议通道，日志请用 `console.error`。

用 Inspector 手动调工具：

```bash
npm run inspect
```

## Cursor

项目已包含 `.cursor/mcp.json`。在 Cursor Settings → MCP 中启用 `miokit-mcp` 后即可在 Agent 对话里调用工具。

## 目录

```
src/
  index.ts              入口，stdio 传输
  server.ts             创建 McpServer
  lib/guid.ts           GUID 生成逻辑
  tools/                每个 MCP tool 一个文件
    index.ts            集中注册
    generate-guid.ts
```
