import {
  decodeCustomCallResponse,
  decodeListCustomSubsystemsResponse,
  decodeStudioCustomResponse,
  encodeCustomCallRequest,
  encodeFrame,
  encodeListCustomSubsystemsRequest,
  StudioFrameDecoder,
} from "../src/studioCustomRpc";

describe("Studio custom RPC helpers", () => {
  it("encodes list subsystem requests", () => {
    expect(Array.from(encodeListCustomSubsystemsRequest(7))).toEqual([
      8, 7, 162, 6, 2, 10, 0,
    ]);
  });

  it("encodes custom call requests", () => {
    expect(
      Array.from(encodeCustomCallRequest(2, 3, new Uint8Array([1, 2])))
    ).toEqual([8, 2, 162, 6, 8, 18, 6, 8, 3, 18, 2, 1, 2]);
  });

  it("decodes custom Studio responses", () => {
    const response = new Uint8Array([
      10, 20, 8, 4, 162, 6, 15, 10, 13, 10, 11, 8, 9, 18, 7, 116, 101, 115, 116,
      95, 105, 100,
    ]);

    const studio = decodeStudioCustomResponse(response);
    const subsystems = decodeListCustomSubsystemsResponse(studio.customPayload);

    expect(studio.requestId).toBe(4);
    expect(subsystems).toEqual([{ index: 9, identifier: "test_id" }]);
  });

  it("decodes custom call responses", () => {
    const response = decodeCustomCallResponse(
      new Uint8Array([18, 6, 8, 3, 18, 2, 1, 2])
    );

    expect(response.subsystemIndex).toBe(3);
    expect(Array.from(response.payload)).toEqual([1, 2]);
  });

  it("frames escaped bytes", () => {
    const decoder = new StudioFrameDecoder();
    const encoded = encodeFrame(new Uint8Array([0xab, 0xac, 0xad, 1]));

    expect(Array.from(encoded)).toEqual([
      0xab, 0xac, 0xab, 0xac, 0xac, 0xac, 0xad, 1, 0xad,
    ]);
    expect(decoder.push(encoded)).toEqual([
      new Uint8Array([0xab, 0xac, 0xad, 1]),
    ]);
  });
});
