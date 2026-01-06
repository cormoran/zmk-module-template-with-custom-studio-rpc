# ZMK Module Template - Web Frontend

This is a minimal web application template for interacting with ZMK firmware
modules that implement custom Studio RPC subsystems.

## Features

- **Device Connection**: Connect to ZMK devices via Bluetooth (GATT) or Serial
- **Custom RPC**: Communicate with your custom firmware module using protobuf
- **React + TypeScript**: Modern web development with Vite for fast builds
- **react-zmk-studio**: Uses the `@cormoran/zmk-studio-react-hook` library for
  simplified ZMK integration

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

- The `react-zmk-studio` directory contains a copy of the library for
  reference - it's automatically built and linked via `package.json`
- Proto generation uses `buf` and `ts-proto` for clean TypeScript types
- Connection state is managed by the `useZMKApp` hook from react-zmk-studio
- RPC calls are made through `ZMKCustomSubsystem` service class

## Testing

This template uses Jest with the test helpers from
`@cormoran/zmk-studio-react-hook/testing`.

```bash
npm test
```

The helpers provide a ready-to-use `ZMKAppProvider` and mock factories, so you
can render components in a connected or disconnected state without talking to a
real device. See `src/__tests__/App.test.tsx` for a minimal example.

## See Also

- [design.md](./design.md) - Detailed frontend architecture documentation
- [react-zmk-studio/README.md](./react-zmk-studio/README.md) - react-zmk-studio
  library documentation
