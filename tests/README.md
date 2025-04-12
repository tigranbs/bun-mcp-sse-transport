# BunSSEServerTransport Tests

This directory contains tests for the BunSSEServerTransport library.

## Running Tests

To run all tests, use the following command:

```sh
bun test
```

To run a specific test file:

```sh
bun test tests/BunSSEServerTransport.unit.test.ts
```

or

```sh
bun test tests/BunSSEServerTransport.test.ts
```

## Test Types

### Unit Tests

The `BunSSEServerTransport.unit.test.ts` file contains unit tests for individual methods and functionality of the BunSSEServerTransport class.

### Integration Tests

The `BunSSEServerTransport.test.ts` file contains integration tests that simulate a real server environment using the BunSSEServerTransport with a Model Context Protocol (MCP) server.

## Test Structure

- The unit tests focus on testing individual methods of the BunSSEServerTransport class.
- The integration tests simulate a complete setup similar to the example Echo server.

## Note on Testing

Some tests use mock objects and functions to isolate the components being tested. The integration tests simulate a full server setup using Bun's built-in server functionality. 