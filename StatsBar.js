import React from "react";
import { ChevronDown, ChevronUp, Gauge, TrendingUp, HeartPulse } from "lucide-react";

const formatNumber = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return Number(value).toLocaleString();
};

const formatPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }
  return `${Math.round(Number(value))}%`;
};

const StatsBar = ({ stats, isOpen, onToggle, isLoading }) => {
  return (
    <section className="fused-panel rounded-2xl p-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-fused-muted">Live Metrics</p>
          <h3 className="text-sm font-semibold text-fused-text">Usage Statistics</h3>
        </div>
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {isOpen && (
        <div className="mt-3 grid grid-cols-1 gap-2">
          <div className="rounded-xl border border-fused-line/70 bg-fused-card/55 p-3">
            <div className="mb-1 flex items-center gap-2 text-fused-muted">
              <TrendingUp size={14} />
              <span className="text-xs">Total Queries</span>
            </div>
            <p className="text-lg font-semibold text-fused-text">
              {isLoading ? "..." : formatNumber(stats?.total_queries)}
            </p>
          </div>

          <div className="rounded-xl border border-fused-line/70 bg-fused-card/55 p-3">
            <div className="mb-1 flex items-center gap-2 text-fused-muted">
              <Gauge size={14} />
              <span className="text-xs">Avg Response Time</span>
            </div>
            <p className="text-lg font-semibold text-fused-text">
              {isLoading
                ? "..."
                : stats?.avg_response_time_ms === null || stats?.avg_response_time_ms === undefined
                  ? "N/A"
                  : `${formatNumber(stats?.avg_response_time_ms)} ms`}
            </p>
          </div>

          <div className="rounded-xl border border-fused-line/70 bg-fused-card/55 p-3">
            <div className="mb-1 flex items-center gap-2 text-fused-muted">
              <HeartPulse size={14} />
              <span className="text-xs">User Satisfaction</span>
            </div>
            <p className="text-lg font-semibold text-fused-text">
              {isLoading ? "..." : formatPercent(stats?.user_satisfaction)}
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

export default StatsBar;
