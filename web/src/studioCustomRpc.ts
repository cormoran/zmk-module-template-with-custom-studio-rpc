import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";

const FRAMING_SOF = 0xab;
const FRAMING_ESC = 0xac;
const FRAMING_EOF = 0xad;

export const STUDIO_BAUD_RATE = 12500;

export interface CustomSubsystemInfo {
  index: number;
  identifier: string;
}

export interface StudioCustomResponse {
  requestId: number;
  customPayload: Uint8Array;
}

export interface CustomCallResponse {
  subsystemIndex: number;
  payload: Uint8Array;
}

export function encodeListCustomSubsystemsRequest(
  requestId: number
): Uint8Array {
  const customPayload = new BinaryWriter().uint32(10).bytes(new Uint8Array(0));
  return encodeStudioRequest(requestId, customPayload.finish());
}

export function encodeCustomCallRequest(
  requestId: number,
  subsystemIndex: number,
  payload: Uint8Array
): Uint8Array {
  const callPayload = new BinaryWriter()
    .uint32(8)
    .uint32(subsystemIndex)
    .uint32(18)
    .bytes(payload)
    .finish();
  const customPayload = new BinaryWriter()
    .uint32(18)
    .bytes(callPayload)
    .finish();
  return encodeStudioRequest(requestId, customPayload);
}

export function encodeFrame(payload: Uint8Array): Uint8Array {
  const framed: number[] = [FRAMING_SOF];
  for (const byte of payload) {
    if (byte === FRAMING_SOF || byte === FRAMING_ESC || byte === FRAMING_EOF) {
      framed.push(FRAMING_ESC);
    }
    framed.push(byte);
  }
  framed.push(FRAMING_EOF);
  return new Uint8Array(framed);
}

export class StudioFrameDecoder {
  private state: "idle" | "data" | "escaped" = "idle";
  private data: number[] = [];

  push(chunk: Uint8Array): Uint8Array[] {
    const frames: Uint8Array[] = [];
    for (const byte of chunk) {
      if (this.state === "idle") {
        if (byte === FRAMING_SOF) {
          this.data = [];
          this.state = "data";
        }
      } else if (this.state === "data") {
        if (byte === FRAMING_ESC) {
          this.state = "escaped";
        } else if (byte === FRAMING_EOF) {
          frames.push(new Uint8Array(this.data));
          this.data = [];
          this.state = "idle";
        } else if (byte === FRAMING_SOF) {
          this.data = [];
        } else {
          this.data.push(byte);
        }
      } else {
        this.data.push(byte);
        this.state = "data";
      }
    }
    return frames;
  }
}

export function decodeStudioCustomResponse(
  payload: Uint8Array
): StudioCustomResponse {
  const reader = new BinaryReader(payload);
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if (tag === 10) {
      return decodeRequestResponse(reader.bytes());
    }
    reader.skip(tag & 7);
  }
  throw new Error("Studio response did not contain request_response");
}

export function decodeListCustomSubsystemsResponse(
  customPayload: Uint8Array
): CustomSubsystemInfo[] {
  const reader = new BinaryReader(customPayload);
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if (tag === 10) {
      return decodeSubsystemList(reader.bytes());
    }
    reader.skip(tag & 7);
  }
  throw new Error("custom response did not contain subsystem list");
}

export function decodeCustomCallResponse(
  customPayload: Uint8Array
): CustomCallResponse {
  const reader = new BinaryReader(customPayload);
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if (tag === 18) {
      return decodeCallResponse(reader.bytes());
    }
    reader.skip(tag & 7);
  }
  throw new Error("custom response did not contain call response");
}

function encodeStudioRequest(
  requestId: number,
  customPayload: Uint8Array
): Uint8Array {
  return new BinaryWriter()
    .uint32(8)
    .uint32(requestId)
    .uint32(802)
    .bytes(customPayload)
    .finish();
}

function decodeRequestResponse(payload: Uint8Array): StudioCustomResponse {
  const reader = new BinaryReader(payload);
  let requestId: number | undefined;
  let customPayload: Uint8Array | undefined;
  let hasMeta = false;

  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if (tag === 8) {
      requestId = reader.uint32();
    } else if (tag === 18) {
      hasMeta = true;
      reader.skip(tag & 7);
    } else if (tag === 802) {
      customPayload = reader.bytes();
    } else {
      reader.skip(tag & 7);
    }
  }

  if (requestId === undefined) {
    throw new Error("request_response did not contain request_id");
  }
  if (!customPayload) {
    throw new Error(
      hasMeta
        ? "request_response contained a meta response"
        : "request_response did not contain custom payload"
    );
  }

  return { requestId, customPayload };
}

function decodeSubsystemList(payload: Uint8Array): CustomSubsystemInfo[] {
  const reader = new BinaryReader(payload);
  const subsystems: CustomSubsystemInfo[] = [];
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if (tag === 10) {
      subsystems.push(decodeSubsystemInfo(reader.bytes()));
    } else {
      reader.skip(tag & 7);
    }
  }
  return subsystems;
}

function decodeSubsystemInfo(payload: Uint8Array): CustomSubsystemInfo {
  const reader = new BinaryReader(payload);
  let index = 0;
  let identifier = "";
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if (tag === 8) {
      index = reader.uint32();
    } else if (tag === 18) {
      identifier = reader.string();
    } else {
      reader.skip(tag & 7);
    }
  }
  return { index, identifier };
}

function decodeCallResponse(payload: Uint8Array): CustomCallResponse {
  const reader = new BinaryReader(payload);
  let subsystemIndex = 0;
  let responsePayload: Uint8Array | undefined;
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if (tag === 8) {
      subsystemIndex = reader.uint32();
    } else if (tag === 18) {
      responsePayload = reader.bytes();
    } else {
      reader.skip(tag & 7);
    }
  }

  if (!responsePayload) {
    throw new Error("call response did not contain payload");
  }
  return { subsystemIndex, payload: responsePayload };
}
