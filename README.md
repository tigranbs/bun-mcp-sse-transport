[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/tigranbs-bun-mcp-sse-transport-badge.png)](https://mseep.ai/app/tigranbs-bun-mcp-sse-transport)

# bun-mcp-sse-transport

A Server-Sent Events (SSE) transport implementation for the Model Context Protocol (MCP) using Bun.

## Overview

This package provides a Bun-specific implementation of SSE transport for MCP servers. It enables real-time, one-way communication from server to client using the SSE protocol, with client-to-server communication handled via HTTP POST requests.

## Key Features

- Built specifically for Bun runtime
- Implements the MCP transport interface
- Manages SSE connections with proper headers
- Handles incoming JSON-RPC messages
- Simple integration with Bun.serve

## Quick Usage

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BunSSEServerTransport } from "bun-mcp-sse-transport";

// Create SSE transport
const transport = new BunSSEServerTransport("/messages");

// Connect to MCP server
const server = new McpServer({ name: "MyServer", version: "1.0.0" });
server.connect(transport);

// Set up Bun HTTP server
Bun.serve({
  port: 3000,
  routes: {
    "/sse": () => transport.createResponse(),
    "/messages": (req) => transport.handlePostMessage(req)
  }
});
```

## How It Works

1. When a client connects to `/sse`, the server creates an SSE connection
2. The server sends the endpoint URL where the client should POST messages
3. The client sends JSON-RPC messages to the endpoint URL
4. The server receives these messages and passes them to the MCP server
5. The MCP server processes the messages and sends responses via the SSE connection

This implementation follows the MCP standard while leveraging Bun's streaming capabilities for efficient real-time communication.
