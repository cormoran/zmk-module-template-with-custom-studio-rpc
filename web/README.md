# ZMK Key Diagnostics - Web Frontend

This is a web application for interacting with the ZMK Key Diagnostics module
via the custom Studio RPC subsystem.

## Features

- **Device Connection**: Connect to ZMK devices via Bluetooth (GATT) or Serial
- **Custom RPC**: Fetch diagnostics data from the firmware module using protobuf
- **React + TypeScript**: Modern web development with Vite for fast builds
- **react-zmk-studio**: Uses the `@cormoran/zmk-studio-react-hook` library for
  simplified ZMK integration
- **Key Diagnostics UI**: Heatmap and table views for chattering keys

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
npm test
```

## Project Structure

```
src/
├── main.tsx              # React entry point
├── App.tsx               # Main application with connection UI
├── App.css               # Styles
└── proto/                # Generated protobuf TypeScript types
    └── zmk/key_diagnostics/
        └── custom.ts

test/
├── App.spec.tsx                   # Tests for App component
└── DiagnosticsSection.spec.tsx    # Tests for diagnostics RPC flow
```

## How It Works

### 1. Protocol Definition

The protobuf schema is defined in `../proto/zmk/key_diagnostics/custom.proto`:

```proto
message Request {
    oneof request_type {
        GetDiagnosticsRequest get_report = 1;
        ResetDiagnosticsRequest reset = 2;
    }
}

message Response {
    oneof response_type {
        ErrorResponse error = 1;
        DiagnosticsReport diagnostics = 2;
        ResetDiagnosticsResponse reset = 3;
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
const subsystem = findSubsystem("zmk__key_diagnostics");

// Create service and make RPC calls
const service = new ZMKCustomSubsystem(state.connection, subsystem.index);
const response = await service.callRPC(payload);
```

## Testing

This project includes Jest tests as a reference implementation for module users.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Structure

The tests demonstrate how to use the `react-zmk-studio` test helpers:

- **App.spec.tsx**: Basic rendering tests for the main application
- **DiagnosticsSection.spec.tsx**: Tests showing how to mock ZMK connection and
  validate diagnostics rendering

### Writing Tests

Use the test helpers from `@cormoran/zmk-studio-react-hook/testing`:

```typescript
import {
  createConnectedMockZMKApp,
  ZMKAppProvider,
} from "@cormoran/zmk-studio-react-hook/testing";

// Create a mock connected device with subsystems
const mockZMKApp = createConnectedMockZMKApp({
  deviceName: "Test Device",
  subsystems: ["zmk__key_diagnostics"],
});

// Wrap your component with the provider
render(
  <ZMKAppProvider value={mockZMKApp}>
    <YourComponent />
  </ZMKAppProvider>
);
```

See the test files in `./test/` for complete examples.

## Customization

To adapt this UI for your own ZMK module:

1. **Update the proto file**: Modify `../proto/zmk/key_diagnostics/custom.proto`
   with your message types
2. **Regenerate types**: Run `npm run generate`
3. **Update subsystem identifier**: Change `SUBSYSTEM_IDENTIFIER` in `App.tsx`
   to match your firmware registration
4. **Update RPC logic**: Modify the request/response handling in `App.tsx`
5. **Update tests**: Modify tests to match your custom subsystem identifier and
   functionality

## Dependencies

- **@cormoran/zmk-studio-react-hook**: React hooks for ZMK Studio (includes
  connection management and RPC utilities)
- **@zmkfirmware/zmk-studio-ts-client**: Patched ZMK Studio TypeScript client
  with custom RPC support
- **ts-proto**: Protocol buffers code generator for TypeScript
- **React 19**: Modern React with hooks
- **Vite**: Fast build tool and dev server

### Development Dependencies

- **Jest**: Testing framework
- **@testing-library/react**: React testing utilities
- **ts-jest**: TypeScript support for Jest
- **identity-obj-proxy**: CSS mock for testing

## Development Notes

- The `react-zmk-studio` directory contains a copy of the library for
  reference - it's automatically built and linked via `package.json`
- Proto generation uses `buf` and `ts-proto` for clean TypeScript types
- Connection state is managed by the `useZMKApp` hook from react-zmk-studio
- RPC calls are made through `ZMKCustomSubsystem` service class

## See Also

- [design.md](./design.md) - Detailed frontend architecture documentation
- [react-zmk-studio/README.md](./react-zmk-studio/README.md) - react-zmk-studio
  library documentation
