#!/usr/bin/env node
import { SerialPort } from "serialport";
import {
  decodeCustomCallResponse,
  decodeListCustomSubsystemsResponse,
  decodeStudioCustomResponse,
  encodeCustomCallRequest,
  encodeFrame,
  encodeListCustomSubsystemsRequest,
  STUDIO_BAUD_RATE,
  StudioFrameDecoder,
  type CustomSubsystemInfo,
} from "../src/studioCustomRpc.ts";
import {
  assertSampleResponse,
  decodeSampleResponse,
  DEFAULT_LARGE_SAMPLE_SIZE,
  DEFAULT_SAMPLE_VALUE,
  encodeSampleRequest,
  SUBSYSTEM_IDENTIFIER,
  type DecodedSampleResponse,
} from "../src/templateRpc.ts";

const DEFAULT_TIMEOUT_MS = 5000;

interface SampleOptions {
  port?: string;
  subsystem: string;
  value: number;
  largeSize: number;
  timeoutMs: number;
  json: boolean;
}

interface SampleRunResult {
  port: string;
  subsystem: CustomSubsystemInfo;
  small: DecodedSampleResponse;
  large?: DecodedSampleResponse;
}

class SerialStudioClient {
  private decoder = new StudioFrameDecoder();
  private frames: Uint8Array[] = [];
  private waiters: Array<(frame: Uint8Array) => void> = [];
  private requestId = 1;
  private readonly port: SerialPort;

  private constructor(port: SerialPort) {
    this.port = port;
    this.port.on("data", (chunk: Buffer) => {
      for (const frame of this.decoder.push(chunk)) {
        const waiter = this.waiters.shift();
        if (waiter) {
          waiter(frame);
        } else {
          this.frames.push(frame);
        }
      }
    });
  }

  static async open(path: string): Promise<SerialStudioClient> {
    const port = new SerialPort({
      path,
      baudRate: STUDIO_BAUD_RATE,
      autoOpen: false,
    });

    await new Promise<void>((resolve, reject) => {
      port.open((error) => (error ? reject(error) : resolve()));
    });

    return new SerialStudioClient(port);
  }

  async close(): Promise<void> {
    if (!this.port.isOpen) {
      this.port.destroy();
      return;
    }

    await new Promise<void>((resolve) => {
      this.port.close(() => resolve());
    });
  }

  async listSubsystems(timeoutMs: number): Promise<CustomSubsystemInfo[]> {
    const response = await this.transact(
      (requestId) => encodeListCustomSubsystemsRequest(requestId),
      timeoutMs
    );
    return decodeListCustomSubsystemsResponse(response);
  }

  async callCustomSubsystem(
    subsystemIndex: number,
    payload: Uint8Array,
    timeoutMs: number
  ): Promise<Uint8Array> {
    const response = await this.transact(
      (requestId) =>
        encodeCustomCallRequest(requestId, subsystemIndex, payload),
      timeoutMs
    );
    const call = decodeCustomCallResponse(response);
    if (call.subsystemIndex !== subsystemIndex) {
      throw new Error(
        `custom response used subsystem index ${call.subsystemIndex}; expected ${subsystemIndex}`
      );
    }
    return call.payload;
  }

  private async transact(
    encodeRequest: (requestId: number) => Uint8Array,
    timeoutMs: number
  ): Promise<Uint8Array> {
    const requestId = this.requestId;
    this.requestId += 1;
    await this.writeFrame(encodeRequest(requestId));

    while (true) {
      const frame = await this.readFrame(timeoutMs);
      const response = decodeStudioCustomResponse(frame);
      if (response.requestId === requestId) {
        return response.customPayload;
      }
    }
  }

  private async writeFrame(payload: Uint8Array): Promise<void> {
    const frame = encodeFrame(payload);
    await new Promise<void>((resolve, reject) => {
      this.port.write(Buffer.from(frame), (error) =>
        error ? reject(error) : resolve()
      );
    });
    await new Promise<void>((resolve, reject) => {
      this.port.drain((error) => (error ? reject(error) : resolve()));
    });
  }

  private async readFrame(timeoutMs: number): Promise<Uint8Array> {
    if (this.frames.length > 0) {
      return this.frames.shift() as Uint8Array;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await new Promise<Uint8Array>((resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("timed out waiting for Studio RPC frame")),
          timeoutMs
        );
        this.waiters.push(resolve);
      });
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}

function printHelp(): void {
  console.log(`Usage:
  npm run cli -- ports
  npm run cli -- sample [--port <path>] [--subsystem <id>] [--value <n>] [--large-size <n>]

Commands:
  ports       List serial ports visible to Node.
  subsystems  List Studio custom subsystems on one port.
  sample      Send SampleRequest, then optionally a larger SampleRequest.

Options:
  --port <path>        Serial port path. If omitted, likely USB serial ports are tried.
  --subsystem <id>     Custom subsystem identifier. Default: ${SUBSYSTEM_IDENTIFIER}
  --value <n>          SampleRequest.value. Default: ${DEFAULT_SAMPLE_VALUE}
  --large-size <n>     Extra SampleRequest payload size. Default: ${DEFAULT_LARGE_SAMPLE_SIZE}
  --timeout-ms <n>     RPC timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}
  --json               Print machine-readable JSON for successful sample calls.
`);
}

function parseOptions(argv: string[]): {
  command: string;
  options: SampleOptions;
} {
  let command = "sample";
  const args = [...argv];
  if (args[0] && !args[0].startsWith("-")) {
    command = args.shift() ?? command;
  }

  const options: SampleOptions = {
    subsystem: SUBSYSTEM_IDENTIFIER,
    value: DEFAULT_SAMPLE_VALUE,
    largeSize: DEFAULT_LARGE_SAMPLE_SIZE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    json: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      const value = args[++i];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      return value;
    };

    switch (arg) {
      case "--port":
        options.port = next();
        break;
      case "--subsystem":
        options.subsystem = next();
        break;
      case "--value":
        options.value = parseInteger(arg, next());
        break;
      case "--large-size":
        options.largeSize = parseInteger(arg, next());
        break;
      case "--timeout-ms":
        options.timeoutMs = parseInteger(arg, next());
        break;
      case "--json":
        options.json = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`unknown option: ${arg}`);
    }
  }

  return { command, options };
}

function parseInteger(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }
  return parsed;
}

async function runSampleOnPort(
  portPath: string,
  options: SampleOptions
): Promise<SampleRunResult> {
  const client = await SerialStudioClient.open(portPath);
  try {
    const subsystems = await client.listSubsystems(options.timeoutMs);
    const subsystem = subsystems.find(
      (candidate) => candidate.identifier === options.subsystem
    );
    if (!subsystem) {
      const found = subsystems
        .map((candidate) => candidate.identifier)
        .join(", ");
      throw new Error(
        `subsystem ${options.subsystem} not found; available: ${found || "(none)"}`
      );
    }

    const smallRequest = encodeSampleRequest(options.value);
    const smallPayload = await client.callCustomSubsystem(
      subsystem.index,
      smallRequest.payload,
      options.timeoutMs
    );
    const small = decodeSampleResponse(smallPayload);
    assertSampleResponse(smallRequest, small);

    let large: DecodedSampleResponse | undefined;
    if (options.largeSize > 0) {
      const largeRequest = encodeSampleRequest(
        options.value,
        options.largeSize
      );
      const largePayload = await client.callCustomSubsystem(
        subsystem.index,
        largeRequest.payload,
        options.timeoutMs
      );
      large = decodeSampleResponse(largePayload);
      assertSampleResponse(largeRequest, large);
    }

    return { port: portPath, subsystem, small, large };
  } finally {
    await client.close();
  }
}

async function candidatePortPaths(explicitPort?: string): Promise<string[]> {
  if (explicitPort) {
    return [explicitPort];
  }

  const ports = await SerialPort.list();
  return ports
    .map((port) => port.path)
    .filter((path) => /usbmodem|usbserial|ttyACM|ttyUSB|COM\d+/i.test(path));
}

async function printPorts(): Promise<void> {
  const ports = await SerialPort.list();
  if (ports.length === 0) {
    console.log("No serial ports found.");
    return;
  }

  for (const port of ports) {
    const details = [
      port.path,
      port.manufacturer,
      port.vendorId && port.productId
        ? `vid:pid=${port.vendorId}:${port.productId}`
        : undefined,
    ].filter(Boolean);
    console.log(details.join(" "));
  }
}

async function printSubsystems(options: SampleOptions): Promise<void> {
  if (!options.port) {
    throw new Error("subsystems requires --port");
  }
  const client = await SerialStudioClient.open(options.port);
  try {
    const subsystems = await client.listSubsystems(options.timeoutMs);
    for (const subsystem of subsystems) {
      console.log(`${subsystem.index}: ${subsystem.identifier}`);
    }
  } finally {
    await client.close();
  }
}

async function runSample(options: SampleOptions): Promise<void> {
  const ports = await candidatePortPaths(options.port);
  if (ports.length === 0) {
    throw new Error("no candidate serial ports found; pass --port explicitly");
  }

  const failures: string[] = [];
  for (const port of ports) {
    try {
      const result = await runSampleOnPort(port, options);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`RPC passed on ${result.port}`);
        console.log(
          `Subsystem: ${result.subsystem.identifier} (${result.subsystem.index})`
        );
        console.log(
          `Small sample: value="${result.small.value}", payloadSize=${result.small.payloadSize}, checksum=${result.small.checksum}`
        );
        if (result.large) {
          console.log(
            `Large sample: value="${result.large.value}", payloadSize=${result.large.payloadSize}, checksum=${result.large.checksum}`
          );
        }
      }
      return;
    } catch (error) {
      failures.push(
        `${port}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw new Error(`RPC failed on all candidate ports:\n${failures.join("\n")}`);
}

async function main(): Promise<void> {
  const { command, options } = parseOptions(process.argv.slice(2));
  switch (command) {
    case "ports":
      await printPorts();
      break;
    case "subsystems":
      await printSubsystems(options);
      break;
    case "rpc":
    case "sample":
      await runSample(options);
      break;
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
