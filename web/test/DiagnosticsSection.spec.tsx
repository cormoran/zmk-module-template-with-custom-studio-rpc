/**
 * Tests for DiagnosticsSection component
 *
 * This test demonstrates how to use react-zmk-studio test helpers to test
 * components that interact with ZMK devices.
 */

import { render, screen, waitFor } from "@testing-library/react";
import {
  createConnectedMockZMKApp,
  ZMKAppProvider,
} from "@cormoran/zmk-studio-react-hook/testing";
import {
  DiagnosticsReport,
  KeyDiagnostics,
  KeyPhysical,
  KscanType,
  Response,
} from "../src/proto/zmk/key_diagnostics/custom";
import { DiagnosticsSection, SUBSYSTEM_IDENTIFIER } from "../src/App";

jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: jest.fn(),
  call_rpc: jest.fn(),
}));

describe("DiagnosticsSection Component", () => {
  const { call_rpc } = jest.requireMock("@zmkfirmware/zmk-studio-ts-client");

  const mockReport = DiagnosticsReport.create({
    layoutName: "Test Layout",
    layoutIndex: 0,
    kscanType: KscanType.KSCAN_TYPE_CHARLIEPLEX,
    chatterWindowMs: 40,
    physicalKeys: [
      KeyPhysical.create({
        position: 0,
        x: 0,
        y: 0,
        width: 19,
        height: 19,
      }),
    ],
    keys: [
      KeyDiagnostics.create({
        position: 0,
        pressCount: 3,
        releaseCount: 3,
        chatterCount: 1,
        isPressed: false,
        lastChangeMs: 123,
        row: 0,
        column: 1,
        hasGpioMapping: true,
        driveGpio: {
          port: "GPIO_0",
          pin: 12,
          flags: 0,
        },
        senseGpio: {
          port: "GPIO_0",
          pin: 13,
          flags: 0,
        },
      }),
    ],
  });

  beforeEach(() => {
    const response = Response.create({ diagnostics: mockReport });
    const payload = Response.encode(response).finish();
    call_rpc.mockResolvedValue({
      custom: {
        call: {
          payload,
        },
      },
    });
  });

  describe("With Subsystem", () => {
    it("should render diagnostics when subsystem is found", async () => {
      const mockZMKApp = createConnectedMockZMKApp({
        deviceName: "Test Device",
        subsystems: [SUBSYSTEM_IDENTIFIER],
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <DiagnosticsSection />
        </ZMKAppProvider>
      );

      await waitFor(() => {
        expect(screen.getByText(/Diagnostics Overview/i)).toBeInTheDocument();
      });

      expect(screen.getByText(/Layout Heatmap/i)).toBeInTheDocument();
      expect(screen.getByText(/Key Diagnostics Table/i)).toBeInTheDocument();
      expect(screen.getByText(/Test Layout/i)).toBeInTheDocument();
    });
  });

  describe("Without Subsystem", () => {
    it("should show warning when subsystem is not found", () => {
      const mockZMKApp = createConnectedMockZMKApp({
        deviceName: "Test Device",
        subsystems: [],
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <DiagnosticsSection />
        </ZMKAppProvider>
      );

      expect(
        screen.getByText(/Subsystem "zmk__key_diagnostics" not found/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/firmware includes the key diagnostics module/i)
      ).toBeInTheDocument();
    });
  });

  describe("Without ZMKAppContext", () => {
    it("should not render when ZMKAppContext is not provided", () => {
      const { container } = render(<DiagnosticsSection />);

      expect(container.firstChild).toBeNull();
    });
  });
});
