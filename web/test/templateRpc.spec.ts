import {
  assertSampleResponse,
  checksumPayload,
  createSamplePayload,
  decodeSampleResponse,
  encodeSampleRequest,
  expectedSampleResponseValue,
} from "../src/templateRpc";
import { Response } from "../src/proto/your-name/template/template";

describe("template RPC helpers", () => {
  it("encodes deterministic sample payloads and checksums", () => {
    const request = encodeSampleRequest(42, 96);

    expect(request.payloadSize).toBe(96);
    expect(request.expectedChecksum).toBe(
      checksumPayload(createSamplePayload(96))
    );
    expect(request.payload.length).toBeLessThanOrEqual(116);
  });

  it("decodes and validates sample responses", () => {
    const request = encodeSampleRequest(42, 96);
    const responsePayload = Response.encode({
      sample: {
        value: expectedSampleResponseValue(42),
        payloadSize: 96,
        checksum: request.expectedChecksum,
      },
    }).finish();

    const response = decodeSampleResponse(responsePayload);

    expect(() => assertSampleResponse(request, response)).not.toThrow();
  });

  it("throws on firmware error responses", () => {
    const responsePayload = Response.encode({
      error: { message: "bad checksum" },
    }).finish();

    expect(() => decodeSampleResponse(responsePayload)).toThrow("bad checksum");
  });
});
