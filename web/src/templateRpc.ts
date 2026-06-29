import { Request, Response } from "./proto/your-name/template/template";

export const SUBSYSTEM_IDENTIFIER = "your_name__template";
export const DEFAULT_SAMPLE_VALUE = 42;
export const DEFAULT_LARGE_SAMPLE_SIZE = 96;

export interface EncodedSampleRequest {
  payload: Uint8Array;
  expectedChecksum: number;
  payloadSize: number;
  value: number;
}

export interface DecodedSampleResponse {
  value: string;
  payloadSize: number;
  checksum: number;
}

export function expectedSampleResponseValue(value: number): string {
  return `Hello from firmware! Received: ${value}`;
}

export function createSamplePayload(size: number): Uint8Array {
  if (!Number.isInteger(size) || size < 0) {
    throw new Error("payload size must be a non-negative integer");
  }

  const payload = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    payload[i] = (i * 31 + 17) & 0xff;
  }
  return payload;
}

export function checksumPayload(payload: Uint8Array): number {
  let checksum = 0;
  for (const byte of payload) {
    checksum = (checksum + byte) >>> 0;
  }
  return checksum;
}

export function encodeSampleRequest(
  value: number,
  payloadSize = 0
): EncodedSampleRequest {
  const samplePayload = createSamplePayload(payloadSize);
  const expectedChecksum = checksumPayload(samplePayload);
  const request = Request.create({
    sample: {
      value,
      payload: samplePayload,
      expectedChecksum,
    },
  });

  return {
    payload: Request.encode(request).finish(),
    expectedChecksum,
    payloadSize,
    value,
  };
}

export function decodeSampleResponse(
  payload: Uint8Array
): DecodedSampleResponse {
  const response = Response.decode(payload);
  if (response.error) {
    throw new Error(response.error.message || "firmware returned an error");
  }
  if (!response.sample) {
    throw new Error("firmware response did not contain sample data");
  }

  return {
    value: response.sample.value,
    payloadSize: response.sample.payloadSize,
    checksum: response.sample.checksum,
  };
}

export function assertSampleResponse(
  request: EncodedSampleRequest,
  response: DecodedSampleResponse
): void {
  const expectedValue = expectedSampleResponseValue(request.value);
  if (response.value !== expectedValue) {
    throw new Error(
      `unexpected response value: ${response.value}; expected ${expectedValue}`
    );
  }
  if (response.payloadSize !== request.payloadSize) {
    throw new Error(
      `unexpected payload size: ${response.payloadSize}; expected ${request.payloadSize}`
    );
  }
  if (response.checksum !== request.expectedChecksum) {
    throw new Error(
      `unexpected checksum: ${response.checksum}; expected ${request.expectedChecksum}`
    );
  }
}
