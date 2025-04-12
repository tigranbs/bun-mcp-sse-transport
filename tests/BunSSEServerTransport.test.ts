import { expect, test, describe, beforeAll, afterAll, afterEach } from "bun:test";
import { BunSSEServerTransport } from "../src/index";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { JSONRPCRequest } from "@modelcontextprotocol/sdk/types.js";

describe("BunSSEServerTransport Integration Tests", () => {
  const PORT = 3456;
  const SSE_ENDPOINT = "/sse";
  const MESSAGE_ENDPOINT = "/messages";
  const SERVER_URL = `http://localhost:${PORT}`;
  
  let server: any;
  const transports: Record<string, BunSSEServerTransport> = {};
  
  // Create a test MCP server similar to the echo-server example
  const mcpServer = new McpServer({
    name: "TestEcho",
    version: "1.0.0",
  });
  
  mcpServer.resource(
    "echo",
    new ResourceTemplate("echo://{message}", { list: undefined }),
    async (uri, { message }) => ({
      contents: [
        {
          uri: uri.href,
          text: `Resource echo: ${message}`,
        },
      ],
    })
  );
  
  mcpServer.tool("echo", { message: z.string() }, async ({ message }) => ({
    content: [{ type: "text", text: `Tool echo: ${message}` }],
  }));
  
  beforeAll(() => {
    server = Bun.serve({
      port: PORT,
      fetch(req) {
        const url = new URL(req.url);
        
        if (url.pathname === SSE_ENDPOINT) {
          const transport = new BunSSEServerTransport(MESSAGE_ENDPOINT);
          mcpServer.connect(transport);
          transport.onclose = () => {
            delete transports[transport.sessionId];
          };
          transports[transport.sessionId] = transport;
          return transport.createResponse();
        }
        
        if (url.pathname === MESSAGE_ENDPOINT) {
          const sessionId = url.searchParams.get("sessionId");
          if (!sessionId || !transports[sessionId]) {
            return new Response("Invalid session ID", { status: 400 });
          }
          
          return transports[sessionId].handlePostMessage(req);
        }
        
        return new Response("Not Found", { status: 404 });
      }
    });
    
    console.log(`Test server started on ${SERVER_URL}`);
  });
  
  afterAll(() => {
    server.stop();
    console.log("Test server stopped");
  });
  
  afterEach(() => {
    // Close any open transports
    Object.values(transports).forEach(transport => transport.close());
    Object.keys(transports).forEach(key => delete transports[key]);
  });
  
  test("should establish an SSE connection", async () => {
    const response = await fetch(`${SERVER_URL}${SSE_ENDPOINT}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    
    // Extract the sessionId from the response
    const reader = response.body?.getReader();
    const { value } = await reader!.read();
    const textDecoder = new TextDecoder();
    const eventData = textDecoder.decode(value);
    
    // The event data should contain the message endpoint and session ID
    expect(eventData).toContain("event: endpoint");
    expect(eventData).toContain(MESSAGE_ENDPOINT);
    expect(eventData).toContain("sessionId=");
    
    // Parse the session ID from the event data
    const sessionIdMatch = eventData.match(/sessionId=([^&\n\s]+)/);
    expect(sessionIdMatch).not.toBeNull();
    
    // Release the reader
    reader!.releaseLock();
  });
  
  test("should handle POST messages and trigger onmessage", async () => {
    // First establish the SSE connection
    const sseResponse = await fetch(`${SERVER_URL}${SSE_ENDPOINT}`);
    const reader = sseResponse.body?.getReader();
    const { value } = await reader!.read();
    const textDecoder = new TextDecoder();
    const eventData = textDecoder.decode(value);
    
    // Extract the session ID
    const sessionIdMatch = eventData.match(/sessionId=([^&\n\s]+)/);
    const sessionId = sessionIdMatch![1];
    
    // Create a promise that will resolve when onmessage is called
    let messageReceived: any = null;
    const messagePromise = new Promise<void>(resolve => {
      // Find the transport by session ID
      const transport = Object.values(transports).find(t => t.sessionId === sessionId);
      expect(transport).not.toBeNull();
      
      // Set up the onmessage handler
      transport!.onmessage = (message) => {
        messageReceived = message;
        resolve();
      };
    });
    
    // Send a JSON-RPC request to the message endpoint
    const jsonRpcRequest: JSONRPCRequest = {
      jsonrpc: "2.0",
      method: "tool.execute",
      params: {
        name: "echo",
        parameters: { message: "Hello, World!" }
      },
      id: 1
    };
    
    const postResponse = await fetch(`${SERVER_URL}${MESSAGE_ENDPOINT}?sessionId=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jsonRpcRequest)
    });
    
    expect(postResponse.status).toBe(202);
    
    // Wait for the message to be received
    await messagePromise;
    
    // Verify the message
    expect(messageReceived).not.toBeNull();
    expect(messageReceived.jsonrpc).toBe("2.0");
    expect(messageReceived.method).toBe("tool.execute");
    expect(messageReceived.params.name).toBe("echo");
    expect(messageReceived.params.parameters.message).toBe("Hello, World!");
    
    // Release the reader
    reader!.releaseLock();
  });
  
  test("should handle sending messages from server to client", async () => {
    // First establish the SSE connection
    const sseResponse = await fetch(`${SERVER_URL}${SSE_ENDPOINT}`);
    const reader = sseResponse.body?.getReader();
    const { value: initialValue } = await reader!.read();
    const textDecoder = new TextDecoder();
    const eventData = textDecoder.decode(initialValue);
    
    // Extract the session ID
    const sessionIdMatch = eventData.match(/sessionId=([^&\n\s]+)/);
    const sessionId = sessionIdMatch![1];
    
    // Find the transport
    const transport = Object.values(transports).find(t => t.sessionId === sessionId);
    expect(transport).not.toBeNull();
    
    // Send a message from the server
    const testMessage = { type: "test", value: "Hello from server" };
    await transport!.send(testMessage);
    
    // Read the sent message from the SSE stream
    const { value: messageValue } = await reader!.read();
    const messageData = textDecoder.decode(messageValue);
    
    // The data should contain the message event and the JSON string
    expect(messageData).toContain("event: message");
    expect(messageData).toContain(JSON.stringify(testMessage));
    
    // Release the reader
    reader!.releaseLock();
  });
  
  test("should handle invalid content type", async () => {
    // First establish the SSE connection
    const sseResponse = await fetch(`${SERVER_URL}${SSE_ENDPOINT}`);
    const reader = sseResponse.body?.getReader();
    const { value } = await reader!.read();
    const textDecoder = new TextDecoder();
    const eventData = textDecoder.decode(value);
    
    // Extract the session ID
    const sessionIdMatch = eventData.match(/sessionId=([^&\n\s]+)/);
    const sessionId = sessionIdMatch![1];
    
    // Send a request with invalid content type
    const postResponse = await fetch(`${SERVER_URL}${MESSAGE_ENDPOINT}?sessionId=${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "This is not JSON"
    });
    
    expect(postResponse.status).toBe(400);
    
    // Release the reader
    reader!.releaseLock();
  });
  
  test("should handle invalid session ID", async () => {
    // Send a request with an invalid session ID
    const postResponse = await fetch(`${SERVER_URL}${MESSAGE_ENDPOINT}?sessionId=invalid-session-id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: "value" })
    });
    
    expect(postResponse.status).toBe(400);
  });
  
  test("should close the transport", async () => {
    // First establish the SSE connection
    const sseResponse = await fetch(`${SERVER_URL}${SSE_ENDPOINT}`);
    const reader = sseResponse.body?.getReader();
    const { value } = await reader!.read();
    const textDecoder = new TextDecoder();
    const eventData = textDecoder.decode(value);
    
    // Extract the session ID
    const sessionIdMatch = eventData.match(/sessionId=([^&\n\s]+)/);
    console.log("sessionIdMatch", sessionIdMatch);
    expect(sessionIdMatch).not.toBeNull();
    const sessionId = sessionIdMatch![1];

    // Find the transport
    const transport = Object.values(transports).find(t => t.sessionId === sessionId);
    expect(transport).not.toBeNull();
    
    // Create a promise that will resolve when onclose is called
    let closeCalled = false;
    const closePromise = new Promise<void>(resolve => {
      transport!.onclose = () => {
        closeCalled = true;
        if (sessionId) {
          delete transports[sessionId];
        }
        resolve();
      };
    });
    
    // Close the transport
    await transport!.close();
    
    // Wait for onclose to be called
    await closePromise;
    
    expect(closeCalled).toBe(true);

    console.log("sessionId", sessionId);
    console.log("transports", Object.keys(transports)); 

    // Check if the transport was removed from the transports object
    expect(Object.keys(transports).includes(sessionId ?? "")).toBe(false);
    
    // Reader might throw an error since the stream was closed
    try {
      reader!.releaseLock();
    } catch (error) {
      // Ignore error
    }
  });
}); 