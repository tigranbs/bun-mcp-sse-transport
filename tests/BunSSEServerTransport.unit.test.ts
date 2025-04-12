import { expect, test, describe, jest, beforeEach, afterEach } from "bun:test";
import { BunSSEServerTransport } from "../src/index";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

describe("BunSSEServerTransport Unit Tests", () => {
  let transport: BunSSEServerTransport;
  const TEST_ENDPOINT = "/test-endpoint";
  
  beforeEach(() => {
    transport = new BunSSEServerTransport(TEST_ENDPOINT);
  });
  
  afterEach(() => {
    transport.close();
  });
  
  test("should create a transport with a session ID", () => {
    expect(transport.sessionId).toBeDefined();
    expect(typeof transport.sessionId).toBe("string");
    expect(transport.sessionId.length).toBeGreaterThan(0);
  });
  
  test("should create a response with correct headers", async () => {
    const response = await transport.createResponse();
    
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(response.headers.get("Connection")).toBe("keep-alive");
  });
  
  test("should start and set up the response", async () => {
    await transport.start();
    
    // The start method should call createResponse internally if not already called
    const response = await transport.createResponse();
    expect(response).toBeInstanceOf(Response);
  });
  
  test("should handle valid JSON-RPC messages", async () => {
    // Set up a mock onmessage handler
    let receivedMessage: JSONRPCMessage | null = null;
    transport.onmessage = (message) => {
      receivedMessage = message;
    };
    
    // Create a valid JSON-RPC message
    const validMessage: JSONRPCMessage = {
      jsonrpc: "2.0",
      method: "test.method",
      params: { foo: "bar" },
      id: 123
    };
    
    // Process the message
    await transport.handleMessage(validMessage);
    
    // Check that onmessage was called with the correct message
    expect(receivedMessage).not.toBeNull();
    expect(receivedMessage as unknown as JSONRPCMessage).toEqual(validMessage);
  });
  
  test("should reject invalid JSON-RPC messages", async () => {
    // Set up a mock onmessage and onerror handlers
    let errorCaught = false;
    transport.onerror = () => {
      errorCaught = true;
    };
    
    // Create an invalid message (missing required fields)
    const invalidMessage = {
      method: "test.method", // missing jsonrpc field
      params: { foo: "bar" }
    };
    
    // The handleMessage should throw for invalid messages
    try {
      await transport.handleMessage(invalidMessage);
      // If we get here, the test fails because no error was thrown
      expect("No error thrown").toBe("Error should have been thrown");
    } catch (error) {
      // Expected behavior
      expect(errorCaught).toBe(true);
      expect(String(error)).toContain("Invalid JSON-RPC message");
    }
  });
  
  test("should handle POST requests with valid JSON", async () => {
    await transport.start();
    
    // Set up a mock onmessage handler
    let receivedMessage: JSONRPCMessage | null = null;
    transport.onmessage = (message) => {
      receivedMessage = message;
    };
    
    // Create a valid JSON-RPC message
    const validMessage: JSONRPCMessage = {
      jsonrpc: "2.0",
      method: "test.method",
      params: { foo: "bar" },
      id: 123
    };
    
    // Create a mock Request with JSON content
    const request = new Request("https://example.com/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(validMessage)
    });
    
    // Handle the POST request
    const response = await transport.handlePostMessage(request);
    
    // Check the response
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("Accepted");
    
    // Check that onmessage was called with the correct message
    expect(receivedMessage).not.toBeNull();
    expect(receivedMessage as unknown as JSONRPCMessage).toEqual(validMessage);
  });
  
  test("should reject POST requests with invalid content type", async () => {
    await transport.start();
    
    // Create a mock Request with non-JSON content
    const request = new Request("https://example.com/messages", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain"
      },
      body: "This is not JSON"
    });
    
    // Set up a mock onerror handler
    let errorCaught = false;
    transport.onerror = () => {
      errorCaught = true;
    };
    
    // Handle the POST request
    const response = await transport.handlePostMessage(request);
    
    // Check the response
    expect(response.status).toBe(400);
    expect(errorCaught).toBe(true);
  });
  
  test("should send messages over the SSE connection", async () => {
    // Start the transport and get a response
    await transport.start();
    
    // Create a message to send
    const message = { type: "test", data: "Hello, World!" };
    
    // Create a mock writer to capture the write calls
    const mockWrite = jest.fn();
    (transport as any)._writer = { write: mockWrite };
    
    // Send the message
    await transport.send(message);
    
    // Check that the writer.write method was called with the encoded message
    expect(mockWrite).toHaveBeenCalled();
    
    // Get the argument passed to write
    const writeArg = mockWrite.mock.calls[0]?.[0];
    if (!writeArg) {
      throw new Error("No argument passed to write");
    }
    
    // Convert the Uint8Array back to a string
    const decoder = new TextDecoder();
    const written = decoder.decode(writeArg);
    
    // Check the SSE format
    expect(written).toContain("event: message");
    expect(written).toContain(`data: ${JSON.stringify(message)}`);
  });
  
  test("should throw when sending without being connected", async () => {
    // Close the transport to ensure there's no writer
    await transport.close();
    
    // Try to send a message
    try {
      await transport.send({ test: "value" });
      // If we get here, the test fails
      expect("No error thrown").toBe("Error should have been thrown");
    } catch (error) {
      // Expected behavior
      expect(String(error)).toContain("Not connected");
    }
  });
  
  test("should call onclose when closed", async () => {
    // Set up a mock onclose handler
    let closeCalled = false;
    transport.onclose = () => {
      closeCalled = true;
    };
    
    // Close the transport
    await transport.close();
    
    // Check that onclose was called
    expect(closeCalled).toBe(true);
  });
}); 