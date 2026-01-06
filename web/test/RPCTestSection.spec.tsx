/**
 * Tests for RPCTestSection component
 * 
 * This test demonstrates how to use react-zmk-studio test helpers to test
 * components that interact with ZMK devices. This serves as a reference
 * implementation for template users.
 */

import { render, screen } from "@testing-library/react";
import {
  createConnectedMockZMKApp,
  ZMKAppProvider,
} from "@cormoran/zmk-studio-react-hook/testing";
import { RPCTestSection } from "../src/App";

describe("RPCTestSection Component", () => {
  describe("With Subsystem", () => {
    it("should render RPC controls when subsystem is found", () => {
      // Create a connected mock ZMK app with the required subsystem
      const mockZMKApp = createConnectedMockZMKApp({
        deviceName: "Test Device",
        subsystems: ["zmk__template"], // The subsystem identifier used in App.tsx
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <RPCTestSection />
        </ZMKAppProvider>
      );

      // Check for RPC test UI elements
      expect(screen.getByText(/RPC Test/i)).toBeDefined();
      expect(screen.getByText(/Send a sample request/i)).toBeDefined();
      expect(screen.getByLabelText(/Value:/i)).toBeDefined();
      expect(screen.getByText(/Send Request/i)).toBeDefined();
    });

    it("should show default input value", () => {
      const mockZMKApp = createConnectedMockZMKApp({
        subsystems: ["zmk__template"],
      });

      render(
        <ZMKAppProvider value={mockZMKApp}>
          <RPCTestSection />
        </ZMKAppProvider>
      );

      // Check that the input has a default value
      const input = screen.getByLabelText(/Value:/i) as HTMLInputElement;
      expect(input.value).toBe("42");
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
          <RPCTestSection />
        </ZMKAppProvider>
      );

      // Check for warning message
      expect(screen.getByText(/Subsystem "zmk__template" not found/i)).toBeDefined();
      expect(screen.getByText(/Make sure your firmware includes the template module/i)).toBeDefined();
    });
  });

  describe("Without ZMKAppContext", () => {
    it("should not render when ZMKAppContext is not provided", () => {
      const { container } = render(<RPCTestSection />);

      // Component should return null when context is not available
      expect(container.firstChild).toBeNull();
    });
  });
});
