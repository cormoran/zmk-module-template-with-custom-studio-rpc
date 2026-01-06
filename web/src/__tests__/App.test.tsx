import { render, screen } from "@testing-library/react";
import {
  ZMKAppProvider,
  createConnectedMockZMKApp,
} from "@cormoran/zmk-studio-react-hook/testing";
import { RPCTestSection } from "../App";

test("renders RPC test UI when subsystem is available", () => {
  const mockZMKApp = createConnectedMockZMKApp({
    subsystems: ["zmk__template"],
  });

  render(
    <ZMKAppProvider value={mockZMKApp}>
      <RPCTestSection />
    </ZMKAppProvider>
  );

  expect(screen.getByRole("heading", { name: "RPC Test" })).toBeInTheDocument();
  expect(screen.getByLabelText("Value:")).toHaveValue(42);
  expect(
    screen.getByRole("button", { name: "📤 Send Request" })
  ).toBeInTheDocument();
});
