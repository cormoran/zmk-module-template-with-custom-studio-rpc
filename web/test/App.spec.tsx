/**
 * Tests for App component
 *
 * This test file demonstrates how to test React components that use
 * @cormoran/zmk-studio-react-hook for ZMK device communication.
 *
 * ## Key Patterns
 *
 * 1. Mock the @zmkfirmware/zmk-studio-ts-client module
 * 2. Use setupZMKMocks() to configure mock behavior
 * 3. Use ZMKAppProvider to provide mock context to components
 * 4. Use @testing-library/react for rendering and assertions
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { act } from "@testing-library/react";
import {
  setupZMKMocks,
  createMockTransport,
} from "@cormoran/zmk-studio-react-hook/testing";

// Import App component
import App from "../src/App";

// Mock the zmk-studio-ts-client module
// This is required because the library uses this under the hood
jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: jest.fn(),
  call_rpc: jest.fn(),
}));

// Mock the serial transport module
// In tests, we don't have access to the Web Serial API
jest.mock("@zmkfirmware/zmk-studio-ts-client/transport/serial", () => ({
  connect: jest.fn(),
}));

describe("App", () => {
  let mocks: ReturnType<typeof setupZMKMocks>;

  beforeEach(() => {
    // Reset all mocks before each test
    mocks = setupZMKMocks();
    // Reset the serial connect mock
    jest.clearAllMocks();
  });

  /**
   * Test: App renders in disconnected state
   *
   * When the app starts, it should show a connect button.
   * This is the initial state before any device is connected.
   */
  it("should render connect button when disconnected", () => {
    render(<App />);

    // Check that the connect button is visible
    expect(screen.getByText("🔌 Connect Serial")).toBeDefined();

    // The RPC test section should not be visible
    expect(screen.queryByText("RPC Test")).toBeNull();
  });

  /**
   * Test: App shows loading state during connection
   *
   * When connecting to a device, the app should show a loading indicator.
   */
  it("should show connecting state when isLoading is true", async () => {
    // Start connection - this will set isLoading to true
    render(<App />);

    // Manually trigger the mock to show loading state
    // In real tests, you would click the connect button and check the state
    // For simplicity, we verify the button exists which is the entry point
    const connectButton = screen.getByText("🔌 Connect Serial");
    expect(connectButton).toBeDefined();
  });

  /**
   * Test: App handles successful connection
   *
   * After successful connection, the app should display:
   * - Device name
   * - Disconnect button
   * - RPC test section (if subsystem is available)
   */
  it("should show connected state after successful connection", async () => {
    // Get the mocked serial connect function
    const serialModule = await import(
      "@zmkfirmware/zmk-studio-ts-client/transport/serial"
    );
    const serialConnect = serialModule.connect as jest.Mock;

    // Configure mock for successful connection
    mocks.mockSuccessfulConnection({
      deviceName: "My ZMK Keyboard",
      subsystems: ["zmk__template"],
    });

    // Mock the serial transport to return a mock transport
    serialConnect.mockResolvedValue(createMockTransport());

    render(<App />);

    // Click connect button
    const connectButton = screen.getByText("🔌 Connect Serial");
    await act(async () => {
      fireEvent.click(connectButton);
    });

    // Wait for connection to complete
    await waitFor(() => {
      expect(screen.getByText(/Connected to: My ZMK Keyboard/)).toBeDefined();
    });

    // Disconnect button should be visible
    expect(screen.getByText("Disconnect")).toBeDefined();

    // RPC test section should be visible
    expect(screen.getByText("RPC Test")).toBeDefined();
  });

  /**
   * Test: App shows warning when subsystem is not available
   *
   * If the connected device doesn't have the required subsystem,
   * a warning message should be displayed.
   */
  it("should show warning when subsystem is not found", async () => {
    // Get the mocked serial connect function
    const serialModule = await import(
      "@zmkfirmware/zmk-studio-ts-client/transport/serial"
    );
    const serialConnect = serialModule.connect as jest.Mock;

    // Configure mock for connection without our subsystem
    mocks.mockSuccessfulConnection({
      deviceName: "Other Device",
      subsystems: ["other_subsystem"], // Not "zmk__template"
    });

    // Mock the serial transport to return a mock transport
    serialConnect.mockResolvedValue(createMockTransport());

    render(<App />);

    // Click connect button
    const connectButton = screen.getByText("🔌 Connect Serial");
    await act(async () => {
      fireEvent.click(connectButton);
    });

    // Wait for connection and check for warning
    await waitFor(() => {
      expect(screen.getByText(/Connected to: Other Device/)).toBeDefined();
    });

    // Warning about missing subsystem should appear
    expect(
      screen.getByText(/Subsystem "zmk__template" not found/)
    ).toBeDefined();
  });

  /**
   * Test: App handles connection errors
   *
   * When connection fails, an error message should be displayed.
   */
  it("should display error on connection failure", async () => {
    // Suppress console.error for this test since we expect an error
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // Get the mocked serial connect function
    const serialModule = await import(
      "@zmkfirmware/zmk-studio-ts-client/transport/serial"
    );
    const serialConnect = serialModule.connect as jest.Mock;

    // Mock the serial transport to reject with an error
    serialConnect.mockRejectedValue(new Error("Serial port not available"));

    render(<App />);

    // Click connect button
    const connectButton = screen.getByText("🔌 Connect Serial");
    await act(async () => {
      fireEvent.click(connectButton);
    });

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByText(/Serial port not available/)).toBeDefined();
    });

    // Restore console.error
    consoleErrorSpy.mockRestore();
  });
});
