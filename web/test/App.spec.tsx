/**
 * Tests for App component
 * 
 * This test file demonstrates how to test a ZMK web application using
 * the react-zmk-studio test helpers. It serves as a reference implementation
 * for users of this template.
 */

import { render, screen } from "@testing-library/react";
import App from "../src/App";

describe("App Component", () => {
  describe("Basic Rendering", () => {
    it("should render the application header", () => {
      render(<App />);
      
      // Check for the main title
      expect(screen.getByText(/ZMK Module Template/i)).toBeDefined();
      expect(screen.getByText(/Custom Studio RPC Demo/i)).toBeDefined();
    });

    it("should render connection button when disconnected", () => {
      render(<App />);

      // Check for connection button in disconnected state
      expect(screen.getByText(/Connect Serial/i)).toBeDefined();
    });

    it("should render footer", () => {
      render(<App />);

      // Check for footer text
      expect(screen.getByText(/Template Module/i)).toBeDefined();
    });
  });
});
