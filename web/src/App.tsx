/**
 * ZMK Key Diagnostics - Main Application
 * Interactive UI for custom RPC diagnostics data
 */

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import "./App.css";
import { connect as serial_connect } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import {
  ZMKConnection,
  ZMKCustomSubsystem,
  ZMKAppContext,
} from "@cormoran/zmk-studio-react-hook";
import {
  DiagnosticsReport,
  KeyDiagnostics,
  KeyPhysical,
  KscanType,
  Request,
  Response,
} from "./proto/zmk/key_diagnostics/custom";

// Custom subsystem identifier - must match firmware registration
export const SUBSYSTEM_IDENTIFIER = "zmk__key_diagnostics";

const kscanTypeLabels: Record<KscanType, string> = {
  [KscanType.KSCAN_TYPE_UNSPECIFIED]: "Unknown",
  [KscanType.KSCAN_TYPE_CHARLIEPLEX]: "Charlieplex",
  [KscanType.KSCAN_TYPE_UNSUPPORTED]: "Unsupported",
};

const getKeyStatus = (key: KeyDiagnostics) => {
  if (key.chatterCount > 0) {
    return "chatter";
  }
  if (key.pressCount !== key.releaseCount) {
    return "imbalanced";
  }
  return "stable";
};

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>🧪 ZMK Key Diagnostics</h1>
        <p>Investigate chattering and dead keys with live firmware data</p>
      </header>

      <ZMKConnection
        renderDisconnected={({ connect, isLoading, error }) => (
          <section className="card">
            <h2>Device Connection</h2>
            {isLoading && <p>⏳ Connecting...</p>}
            {error && (
              <div className="error-message">
                <p>🚨 {error}</p>
              </div>
            )}
            {!isLoading && (
              <button
                className="btn btn-primary"
                onClick={() => connect(serial_connect)}
              >
                🔌 Connect Serial
              </button>
            )}
          </section>
        )}
        renderConnected={({ disconnect, deviceName }) => (
          <>
            <section className="card">
              <h2>Device Connection</h2>
              <div className="device-info">
                <h3>✅ Connected to: {deviceName}</h3>
              </div>
              <button className="btn btn-secondary" onClick={disconnect}>
                Disconnect
              </button>
            </section>

            <DiagnosticsSection />
          </>
        )}
      />

      <footer className="app-footer">
        <p>
          <strong>Key Diagnostics</strong> - Designed for investigating
          soldering issues
        </p>
      </footer>
    </div>
  );
}

export function DiagnosticsSection() {
  const zmkApp = useContext(ZMKAppContext);
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!zmkApp) return null;

  const subsystem = zmkApp.findSubsystem(SUBSYSTEM_IDENTIFIER);

  const refreshReport = useCallback(
    async (resetAfter = false) => {
      if (!zmkApp.state.connection || !subsystem) return;

      setIsLoading(true);
      setError(null);

      try {
        const service = new ZMKCustomSubsystem(
          zmkApp.state.connection,
          subsystem.index
        );

        const request = Request.create({
          getReport: {
            resetAfter,
          },
        });

        const payload = Request.encode(request).finish();
        const responsePayload = await service.callRPC(payload);

        if (!responsePayload) {
          setError("No response payload returned by the firmware.");
          return;
        }

        const resp = Response.decode(responsePayload);

        if (resp.diagnostics) {
          setReport(resp.diagnostics);
          if (selectedPosition === null && resp.diagnostics.keys.length > 0) {
            setSelectedPosition(resp.diagnostics.keys[0].position);
          }
        } else if (resp.error) {
          setError(resp.error.message);
        }
      } catch (rpcError) {
        console.error("Diagnostics RPC failed:", rpcError);
        setError(
          `Failed: ${
            rpcError instanceof Error ? rpcError.message : "Unknown error"
          }`
        );
      } finally {
        setIsLoading(false);
      }
    },
    [selectedPosition, subsystem, zmkApp.state.connection]
  );

  const resetReport = useCallback(async () => {
    if (!zmkApp.state.connection || !subsystem) return;

    setIsLoading(true);
    setError(null);

    try {
      const service = new ZMKCustomSubsystem(
        zmkApp.state.connection,
        subsystem.index
      );

      const request = Request.create({
        reset: {},
      });

      const payload = Request.encode(request).finish();
      const responsePayload = await service.callRPC(payload);

      if (responsePayload) {
        const resp = Response.decode(responsePayload);
        if (resp.error) {
          setError(resp.error.message);
        }
      }

      await refreshReport(false);
    } catch (rpcError) {
      console.error("Reset RPC failed:", rpcError);
      setError(
        `Failed: ${
          rpcError instanceof Error ? rpcError.message : "Unknown error"
        }`
      );
    } finally {
      setIsLoading(false);
    }
  }, [refreshReport, subsystem, zmkApp.state.connection]);

  useEffect(() => {
    if (zmkApp.state.connection && subsystem) {
      refreshReport(false);
    }
  }, [refreshReport, subsystem, zmkApp.state.connection]);

  const diagnosticsByPosition = useMemo(() => {
    const map = new Map<number, KeyDiagnostics>();
    report?.keys.forEach((key) => map.set(key.position, key));
    return map;
  }, [report?.keys]);

  const physicalByPosition = useMemo(() => {
    const map = new Map<number, KeyPhysical>();
    report?.physicalKeys.forEach((key) => map.set(key.position, key));
    return map;
  }, [report?.physicalKeys]);

  if (!subsystem) {
    return (
      <section className="card">
        <div className="warning-message">
          <p>
            ⚠️ Subsystem "{SUBSYSTEM_IDENTIFIER}" not found. Make sure your
            firmware includes the key diagnostics module.
          </p>
        </div>
      </section>
    );
  }

  const totalKeys = report?.keys.length ?? 0;
  const chatterKeys = report?.keys.filter((key) => key.chatterCount > 0).length ?? 0;
  const imbalancedKeys =
    report?.keys.filter((key) => key.pressCount !== key.releaseCount).length ?? 0;

  const selectedKey =
    selectedPosition !== null ? diagnosticsByPosition.get(selectedPosition) : null;
  const selectedPhysical =
    selectedPosition !== null ? physicalByPosition.get(selectedPosition) : null;

  return (
    <section className="card">
      <div className="section-header">
        <div>
          <h2>Diagnostics Overview</h2>
          <p className="muted">
            Chatter window: {report?.chatterWindowMs ?? "-"} ms · Kscan type: {" "}
            {report ? kscanTypeLabels[report.kscanType] : "-"}
          </p>
        </div>
        <div className="button-group">
          <button
            className="btn btn-primary"
            onClick={() => refreshReport(false)}
            disabled={isLoading}
          >
            {isLoading ? "⏳ Refreshing..." : "🔄 Refresh Diagnostics"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={resetReport}
            disabled={isLoading}
          >
            🧹 Reset Counters
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>🚨 {error}</p>
        </div>
      )}

      {!report && !error && (
        <p className="muted">No diagnostics received yet.</p>
      )}

      {report && (
        <>
          <div className="summary-grid">
            <div className="summary-card">
              <h3>Total keys</h3>
              <p>{totalKeys}</p>
            </div>
            <div className="summary-card warning">
              <h3>Chattering keys</h3>
              <p>{chatterKeys}</p>
            </div>
            <div className="summary-card warning">
              <h3>Imbalanced keys</h3>
              <p>{imbalancedKeys}</p>
            </div>
            <div className="summary-card">
              <h3>Active layout</h3>
              <p>{report.layoutName || "Unknown"}</p>
            </div>
          </div>

          <div className="diagnostics-grid">
            <div className="layout-panel">
              <h3>Layout Heatmap</h3>
              <KeyLayout
                physicalKeys={report.physicalKeys}
                diagnostics={diagnosticsByPosition}
                selectedPosition={selectedPosition}
                onSelect={setSelectedPosition}
              />
              <p className="muted">
                Red = chatter detected · Amber = press/release imbalance · Gray = stable
              </p>
            </div>

            <div className="details-panel">
              <h3>Key Details</h3>
              {selectedKey ? (
                <div className="details-card">
                  <div className="details-header">
                    <span>Position #{selectedKey.position}</span>
                    <span className={`status-badge ${getKeyStatus(selectedKey)}`}>
                      {getKeyStatus(selectedKey)}
                    </span>
                  </div>
                  <ul>
                    <li>Press count: {selectedKey.pressCount}</li>
                    <li>Release count: {selectedKey.releaseCount}</li>
                    <li>Chatter events: {selectedKey.chatterCount}</li>
                    <li>
                      Last change: {selectedKey.lastChangeMs} ms · State:{" "}
                      {selectedKey.isPressed ? "Pressed" : "Released"}
                    </li>
                    <li>
                      Matrix: row {selectedKey.row} / col {selectedKey.column}
                    </li>
                    {selectedKey.hasGpioMapping ? (
                      <li>
                        GPIO drive: {selectedKey.driveGpio?.port} P
                        {selectedKey.driveGpio?.pin} · sense: {" "}
                        {selectedKey.senseGpio?.port} P{selectedKey.senseGpio?.pin}
                      </li>
                    ) : (
                      <li>GPIO mapping unavailable for this kscan.</li>
                    )}
                    {selectedPhysical && (
                      <li>
                        Location: x {selectedPhysical.x}, y {selectedPhysical.y} · size {" "}
                        {selectedPhysical.width}×{selectedPhysical.height}
                      </li>
                    )}
                  </ul>
                </div>
              ) : (
                <p className="muted">Select a key to inspect detailed stats.</p>
              )}
            </div>
          </div>

          <div className="table-panel">
            <h3>Key Diagnostics Table</h3>
            <table>
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Status</th>
                  <th>Presses</th>
                  <th>Releases</th>
                  <th>Chatter</th>
                  <th>GPIO</th>
                </tr>
              </thead>
              <tbody>
                {report.keys.map((key) => {
                  const status = getKeyStatus(key);
                  return (
                    <tr
                      key={key.position}
                      className={
                        selectedPosition === key.position ? "selected" : ""
                      }
                      onClick={() => setSelectedPosition(key.position)}
                    >
                      <td>#{key.position}</td>
                      <td>
                        <span className={`status-badge ${status}`}>{status}</span>
                      </td>
                      <td>{key.pressCount}</td>
                      <td>{key.releaseCount}</td>
                      <td>{key.chatterCount}</td>
                      <td>
                        {key.hasGpioMapping
                          ? `${key.driveGpio?.port} P${key.driveGpio?.pin} → ${key.senseGpio?.port} P${key.senseGpio?.pin}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

type KeyLayoutProps = {
  physicalKeys: KeyPhysical[];
  diagnostics: Map<number, KeyDiagnostics>;
  selectedPosition: number | null;
  onSelect: (position: number) => void;
};

function KeyLayout({
  physicalKeys,
  diagnostics,
  selectedPosition,
  onSelect,
}: KeyLayoutProps) {
  if (!physicalKeys.length) {
    return <p className="muted">No physical layout available.</p>;
  }

  const bounds = physicalKeys.reduce(
    (acc, key) => {
      const minX = Math.min(acc.minX, key.x);
      const minY = Math.min(acc.minY, key.y);
      const maxX = Math.max(acc.maxX, key.x + key.width);
      const maxY = Math.max(acc.maxY, key.y + key.height);
      return { minX, minY, maxX, maxY };
    },
    {
      minX: physicalKeys[0].x,
      minY: physicalKeys[0].y,
      maxX: physicalKeys[0].x + physicalKeys[0].width,
      maxY: physicalKeys[0].y + physicalKeys[0].height,
    }
  );

  const layoutWidth = bounds.maxX - bounds.minX;
  const layoutHeight = bounds.maxY - bounds.minY;
  const scale = layoutWidth > 0 ? Math.min(600 / layoutWidth, 1.5) : 1;

  return (
    <div
      className="layout-container"
      style={{ width: layoutWidth * scale, height: layoutHeight * scale }}
    >
      {physicalKeys.map((key) => {
        const diag = diagnostics.get(key.position);
        const status = diag ? getKeyStatus(diag) : "stable";
        return (
          <button
            key={key.position}
            className={`layout-key ${status} ${
              selectedPosition === key.position ? "selected" : ""
            }`}
            style={{
              left: (key.x - bounds.minX) * scale,
              top: (key.y - bounds.minY) * scale,
              width: key.width * scale,
              height: key.height * scale,
            }}
            onClick={() => onSelect(key.position)}
            aria-label={`Key position ${key.position}`}
          >
            {key.position}
          </button>
        );
      })}
    </div>
  );
}

export default App;
