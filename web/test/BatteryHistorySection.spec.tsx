/**
 * Tests for BatteryHistorySection component
 *
 * This test demonstrates how to use react-zmk-studio test helpers to test
 * components that interact with ZMK devices.
 */

import { render, screen } from "@testing-library/react";
import {
  createConnectedMockZMKApp,
  ZMKAppProvider,
} from "@cormoran/zmk-studio-react-hook/testing";
import { BatteryHistorySection, SUBSYSTEM_IDENTIFIER } from "../src/App";

describe("BatteryHistorySection Component", () => {
  describe("With Subsystem", () => {
    it("should render battery history controls when subsystem is found", () => {
      // Create a connected mock ZMK app with the required subsystem
      const mockZMKApp = createConnectedMockZMKApp({
        deviceName: "Test Device",
        subsystems: [SUBSYSTEM_IDENTIFIER],
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <BatteryHistorySection />
        </ZMKAppProvider>
      );

      // Check for battery history UI elements
      expect(
        screen.getByRole("heading", { name: /Battery history/i })
      ).toBeInTheDocument();
      expect(screen.getByText(/Samples are cached on-device/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Refresh/i })
      ).toBeInTheDocument();
    });
  });

  describe("Without Subsystem", () => {
    it("should show warning when subsystem is not found", () => {
      // Create a connected mock ZMK app without the required subsystem
      const mockZMKApp = createConnectedMockZMKApp({
        deviceName: "Test Device",
        subsystems: [], // No subsystems
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <BatteryHistorySection />
        </ZMKAppProvider>
      );

      // Check for warning message
      expect(
        screen.getByText(/Subsystem "zmk__battery_history" not found/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Make sure your firmware includes the battery history module/i)
      ).toBeInTheDocument();
    });
  });

  describe("Without ZMKAppContext", () => {
    it("should not render when ZMKAppContext is not provided", () => {
      const { container } = render(<BatteryHistorySection />);

      // Component should return null when context is not available
      expect(container.firstChild).toBeNull();
    });
  });
});
