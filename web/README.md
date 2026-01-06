# ZMK Module Template - Web Frontend

This is a minimal web application template for interacting with ZMK firmware
modules that implement custom Studio RPC subsystems.

## Features

- **Device Connection**: Connect to ZMK devices via Bluetooth (GATT) or Serial
- **Custom RPC**: Communicate with your custom firmware module using protobuf
- **React + TypeScript**: Modern web development with Vite for fast builds
- **react-zmk-studio**: Uses the `@cormoran/zmk-studio-react-hook` library for
  simplified ZMK integration
- **Testing**: Jest-based test suite with react-zmk-studio testing helpers

## Quick Start

```bash
# Install dependencies
npm install

# Generate TypeScript types from proto
npm run generate

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm run test
```

## Project Structure

```
src/
├── main.tsx              # React entry point
├── App.tsx               # Main application with connection UI
├── App.css               # Styles
└── proto/                # Generated protobuf TypeScript types
    └── zmk/template/
        └── custom.ts
test/
└── App.spec.tsx          # Component tests
```

## How It Works

### 1. Protocol Definition

The protobuf schema is defined in `../proto/zmk/template/custom.proto`:

```proto
message Request {
    oneof request_type {
        SampleRequest sample = 1;
    }
}

message Response {
    oneof response_type {
        ErrorResponse error = 1;
        SampleResponse sample = 2;
    }
}
```

### 2. Code Generation

TypeScript types are generated using `ts-proto`:

```bash
npm run generate
```

This runs `buf generate` which uses the configuration in `buf.gen.yaml`.

### 3. Using react-zmk-studio

The app uses the `@cormoran/zmk-studio-react-hook` library:

```typescript
import { useZMKApp, ZMKCustomSubsystem } from "@cormoran/zmk-studio-react-hook";

// Connect to device
const { state, connect, findSubsystem, isConnected } = useZMKApp();

// Find your subsystem
const subsystem = findSubsystem("zmk__template");

// Create service and make RPC calls
const service = new ZMKCustomSubsystem(state.connection, subsystem.index);
const response = await service.callRPC(payload);
```

## Testing

The project uses Jest with testing helpers from `@cormoran/zmk-studio-react-hook/testing`.

### Running Tests

```bash
# Run tests once
npm run test

# Run tests in watch mode
npm run test:watch
```

### Writing Tests

Test files are located in the `test/` directory with `.spec.tsx` extension.

Key patterns for testing ZMK components:

1. **Mock the zmk-studio-ts-client module**:

```typescript
jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: jest.fn(),
  call_rpc: jest.fn(),
}));
```

2. **Mock the transport module** (since Web Serial API isn't available in tests):

```typescript
jest.mock("@zmkfirmware/zmk-studio-ts-client/transport/serial", () => ({
  connect: jest.fn(),
}));
```

3. **Use setupZMKMocks() to configure mock behavior**:

```typescript
import { setupZMKMocks, createMockTransport } from "@cormoran/zmk-studio-react-hook/testing";

let mocks: ReturnType<typeof setupZMKMocks>;

beforeEach(() => {
  mocks = setupZMKMocks();
});

it("should connect successfully", async () => {
  // Configure successful connection
  mocks.mockSuccessfulConnection({
    deviceName: "My Device",
    subsystems: ["my_subsystem"],
  });

  // Mock the transport
  const serialModule = await import("@zmkfirmware/zmk-studio-ts-client/transport/serial");
  (serialModule.connect as jest.Mock).mockResolvedValue(createMockTransport());

  // ... render and test
});
```

4. **Test connection states**:

```typescript
// Test disconnected state
expect(screen.getByText("Connect")).toBeDefined();

// Test connected state
await waitFor(() => {
  expect(screen.getByText(/Connected to:/)).toBeDefined();
});

// Test error state
mocks.mockFailedConnection("Connection error");
```

See `test/App.spec.tsx` for complete examples.

### Test Helpers Reference

The `@cormoran/zmk-studio-react-hook/testing` module provides:

- `setupZMKMocks()` - Sets up common mocks for tests
- `createMockTransport()` - Creates a mock RPC transport
- `createMockZMKApp()` - Creates a mock ZMK app instance
- `createConnectedMockZMKApp()` - Creates a connected mock instance
- `ZMKAppProvider` - Test wrapper for ZMKAppContext

For more details, see the
[react-zmk-studio README](https://github.com/cormoran/react-zmk-studio#testing).

## Customization

To adapt this template for your own ZMK module:

1. **Update the proto file**: Modify `../proto/zmk/template/custom.proto` with
   your message types
2. **Regenerate types**: Run `npm run generate`
3. **Update subsystem identifier**: Change `SUBSYSTEM_IDENTIFIER` in `App.tsx`
   to match your firmware registration
4. **Update RPC logic**: Modify the request/response handling in `App.tsx`

## Dependencies

- **@cormoran/zmk-studio-react-hook**: React hooks for ZMK Studio (includes
  connection management and RPC utilities)
- **@zmkfirmware/zmk-studio-ts-client**: Patched ZMK Studio TypeScript client
  with custom RPC support
- **ts-proto**: Protocol buffers code generator for TypeScript
- **React 19**: Modern React with hooks
- **Vite**: Fast build tool and dev server

## Development Notes

- Proto generation uses `buf` and `ts-proto` for clean TypeScript types
- Connection state is managed by the `useZMKApp` hook from react-zmk-studio
- RPC calls are made through `ZMKCustomSubsystem` service class

## See Also

- [design.md](./design.md) - Detailed frontend architecture documentation
- [react-zmk-studio README](https://github.com/cormoran/react-zmk-studio) -
  react-zmk-studio library documentation
