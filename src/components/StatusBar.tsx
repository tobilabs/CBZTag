import { StatusInfo } from "../store";

interface Props {
  status: StatusInfo | null;
}

export function StatusBar({ status }: Props) {
  const isDone = status !== null && status.total > 0 && status.current === status.total;

  return (
    <div className={`status-bar${status ? " active" : ""}`}>
      {status && (
        <>
          <span className="status-message">{status.message}</span>
          {status.total > 0 && (
            <>
              <div className="status-progress">
                <div
                  className={`status-fill${isDone ? " done" : ""}`}
                  style={{ width: `${Math.round((status.current / status.total) * 100)}%` }}
                />
              </div>
              <span className="status-counter">
                {status.current} / {status.total}
              </span>
            </>
          )}
        </>
      )}
      <style>{`
        .status-bar {
          height: 22px;
          background: var(--surface);
          border-top: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 12px;
          font-size: 11px;
          color: var(--text-muted);
          flex-shrink: 0;
          overflow: hidden;
        }
        .status-message {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex-shrink: 0;
        }
        .status-progress {
          flex: 1;
          height: 4px;
          background: var(--border);
          border-radius: 2px;
          overflow: hidden;
          min-width: 60px;
        }
        .status-fill {
          height: 100%;
          background: var(--accent2);
          border-radius: 2px;
          transition: width 0.15s ease;
        }
        .status-fill.done {
          background: #3a8a5a;
        }
        .status-counter {
          flex-shrink: 0;
          font-variant-numeric: tabular-nums;
          color: var(--text);
        }
      `}</style>
    </div>
  );
}
