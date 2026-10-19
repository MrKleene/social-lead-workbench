export function TaskCore({ status, running }: { status: string; running: boolean }) {
  return <div className="task-core" data-running={running}>
    <svg viewBox="0 0 180 180" aria-hidden="true" className="core-geometry">
      <circle cx="90" cy="90" r="76"/><circle cx="90" cy="90" r="59"/><circle cx="90" cy="90" r="42"/>
      <g className="core-orbit"><path d="M90 14 A76 76 0 0 1 156 52"/><path d="M39 120 A59 59 0 0 0 90 149"/></g>
      <path className="core-axis" d="M82 90h16M90 82v16"/><circle className="core-dot" cx="90" cy="90" r="5"/>
    </svg>
    <strong>{status}</strong><small>运行状态 · 非进度百分比</small>
  </div>;
}
