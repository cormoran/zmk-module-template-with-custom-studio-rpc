/**
 * ZMK Battery History - Main Application
 */

import { useContext, useMemo, useState } from "react";
import "./App.css";
import { connect as serial_connect } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import {
  ZMKConnection,
  ZMKCustomSubsystem,
  ZMKAppContext,
} from "@cormoran/zmk-studio-react-hook";
import { Request, Response } from "./proto/zmk/battery_history/custom";

// Custom subsystem identifier - must match firmware registration
export const SUBSYSTEM_IDENTIFIER = "zmk__battery_history";

type BatterySample = {
  timestampSeconds: number;
  levelPercent: number;
};

const formatDuration = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
};

const formatUptime = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : formatDuration(seconds);

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__badge">Battery Insight</div>
        <h1>AAA Battery History</h1>
        <p>
          Track consumption trends directly from your ZMK device with zero flash
          wear.
        </p>
      </header>

      <ZMKConnection
        renderDisconnected={({ connect, isLoading, error }) => (
          <section className="card card--hero">
            <div>
              <h2>Connect your keyboard</h2>
              <p className="muted">
                Use serial mode to sync battery history captured on the device.
              </p>
              {isLoading && <p className="status">⏳ Connecting...</p>}
              {error && (
                <div className="error-message">
                  <p>🚨 {error}</p>
                </div>
              )}
              <div className="button-row">
                <button
                  className="btn btn-primary"
                  onClick={() => connect(serial_connect)}
                  disabled={isLoading}
                >
                  🔌 Connect Serial
                </button>
              </div>
            </div>
            <div className="hero-art">
              <div className="hero-art__ring" />
              <div className="hero-art__battery">
                <span>AAA</span>
                <strong>Live</strong>
              </div>
            </div>
          </section>
        )}
        renderConnected={({ disconnect, deviceName }) => (
          <>
            <section className="card card--connection">
              <div>
                <h2>Connected</h2>
                <p className="device-name">✅ {deviceName}</p>
                <p className="muted">
                  The device keeps history in RAM and shares it on demand.
                </p>
              </div>
              <button className="btn btn-secondary" onClick={disconnect}>
                Disconnect
              </button>
            </section>

            <BatteryHistorySection />
          </>
        )}
      />

      <footer className="app-footer">
        <p>
          Built with ZMK custom Studio RPC • Ready for future backend sync
        </p>
      </footer>
    </div>
  );
}

export function BatteryHistorySection() {
  const zmkApp = useContext(ZMKAppContext);
  const [history, setHistory] = useState<BatterySample[]>([]);
  const [historyInfo, setHistoryInfo] = useState<{
    capacity: number;
    totalEntries: number;
    sampleIntervalSeconds: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!zmkApp) return null;

  const subsystem = zmkApp.findSubsystem(SUBSYSTEM_IDENTIFIER);

  const latestSample = history.at(-1);
  const historyRangeSeconds =
    history.length > 1
      ? history[history.length - 1].timestampSeconds - history[0].timestampSeconds
      : 0;

  const chartPoints = useMemo(() => {
    if (history.length === 0) return "";
    const maxX = history.length - 1;
    return history
      .map((sample, index) => {
        const x = (index / Math.max(maxX, 1)) * 100;
        const y = 100 - sample.levelPercent;
        return `${x},${y}`;
      })
      .join(" ");
  }, [history]);

  const fetchHistory = async () => {
    if (!zmkApp.state.connection || !subsystem) return;

    setIsLoading(true);
    setError(null);

    try {
      const service = new ZMKCustomSubsystem(
        zmkApp.state.connection,
        subsystem.index
      );

      const request = Request.create({
        getHistory: {
          maxEntries: 0,
        },
      });

      const payload = Request.encode(request).finish();
      const responsePayload = await service.callRPC(payload);

      if (responsePayload) {
        const resp = Response.decode(responsePayload);

        if (resp.history) {
          const samples =
            resp.history.samples?.map((sample) => ({
              timestampSeconds: sample.timestampSeconds,
              levelPercent: sample.levelPercent,
            })) ?? [];

          setHistory(samples);
          setHistoryInfo({
            capacity: resp.history.capacity,
            totalEntries: resp.history.totalEntries,
            sampleIntervalSeconds: resp.history.sampleIntervalSeconds,
          });
        } else if (resp.error) {
          setError(resp.error.message);
        }
      }
    } catch (fetchError) {
      console.error("RPC call failed:", fetchError);
      setError(
        fetchError instanceof Error ? fetchError.message : "Unknown error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = async () => {
    if (!zmkApp.state.connection || !subsystem) return;

    setIsLoading(true);
    setError(null);

    try {
      const service = new ZMKCustomSubsystem(
        zmkApp.state.connection,
        subsystem.index
      );

      const request = Request.create({
        clearHistory: {},
      });

      const payload = Request.encode(request).finish();
      const responsePayload = await service.callRPC(payload);
      if (responsePayload) {
        const resp = Response.decode(responsePayload);
        if (resp.clearHistory?.success) {
          await fetchHistory();
        } else if (resp.error) {
          setError(resp.error.message);
        }
      }
    } catch (clearError) {
      console.error("Clear history failed:", clearError);
      setError(
        clearError instanceof Error ? clearError.message : "Unknown error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!subsystem) {
    return (
      <section className="card">
        <div className="warning-message">
          <p>
            ⚠️ Subsystem "{SUBSYSTEM_IDENTIFIER}" not found. Make sure your
            firmware includes the battery history module.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="card card--history">
      <div className="card-header">
        <div>
          <h2>Battery history</h2>
          <p className="muted">
            Samples are cached on-device and streamed to the UI when requested.
          </p>
        </div>
        <div className="button-row">
          <button
            className="btn btn-secondary"
            onClick={fetchHistory}
            disabled={isLoading}
          >
            {isLoading ? "⏳ Syncing..." : "🔄 Refresh"}
          </button>
          <button
            className="btn btn-ghost"
            onClick={clearHistory}
            disabled={isLoading}
          >
            🧹 Clear device history
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <p>🚨 {error}</p>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Current level</span>
          <strong className="stat-value">
            {latestSample ? `${latestSample.levelPercent}%` : "--"}
          </strong>
          <span className="stat-foot">
            {latestSample
              ? `Uptime ${formatUptime(latestSample.timestampSeconds)}`
              : "Awaiting samples"}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">History window</span>
          <strong className="stat-value">
            {historyRangeSeconds > 0
              ? formatDuration(historyRangeSeconds)
              : "--"}
          </strong>
          <span className="stat-foot">
            {history.length > 1 ? "From first to last sample" : "Not enough data"}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Samples stored</span>
          <strong className="stat-value">
            {historyInfo ? historyInfo.totalEntries : "--"}
          </strong>
          <span className="stat-foot">
            {historyInfo
              ? `${historyInfo.capacity} max`
              : "Capacity pending"}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Sampling interval</span>
          <strong className="stat-value">
            {historyInfo
              ? formatDuration(historyInfo.sampleIntervalSeconds)
              : "--"}
          </strong>
          <span className="stat-foot">Configurable in firmware</span>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-header">
          <h3>Battery trend</h3>
          <span className="muted">
            {history.length > 0
              ? `${history.length} samples`
              : "No samples yet"}
          </span>
        </div>
        <div className="chart-area">
          {history.length === 0 ? (
            <div className="chart-empty">
              <p>Connect and refresh to view battery history.</p>
            </div>
          ) : (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="lineGradient" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#6d5efc" />
                  <stop offset="100%" stopColor="#00d2ff" />
                </linearGradient>
                <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#6d5efc" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#00d2ff" stopOpacity="0.05" />
                </linearGradient>
              </defs>
              <polygon
                points={`0,100 ${chartPoints} 100,100`}
                fill="url(#areaGradient)"
              />
              <polyline
                points={chartPoints}
                fill="none"
                stroke="url(#lineGradient)"
                strokeWidth="2"
              />
            </svg>
          )}
        </div>
      </div>

      <div className="history-list">
        <h3>Recent samples</h3>
        {history.length === 0 ? (
          <p className="muted">No samples captured yet.</p>
        ) : (
          <ul>
            {history
              .slice(-6)
              .reverse()
              .map((sample, index) => (
                <li key={`${sample.timestampSeconds}-${index}`}>
                  <span>{sample.levelPercent}%</span>
                  <span className="muted">
                    {formatUptime(sample.timestampSeconds)} uptime
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default App;
