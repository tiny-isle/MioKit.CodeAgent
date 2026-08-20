#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer, SERVER_NAME } from './server.js';

void serveStdio(createServer);
console.error(`${SERVER_NAME} running on stdio`);
