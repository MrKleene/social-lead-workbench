import type { CSSProperties } from "react";

/** Native toggle buttons keep keyboard behavior familiar without implying ARIA tabs. */
export function SegmentedControl({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: readonly { value: string; label: string; count?: number }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}
      style={{ "--segments": options.length, "--selected": Math.max(0, options.findIndex(v => v.value === value)) } as CSSProperties}>
      <span className="segment-indicator" aria-hidden="true" />
      {options.map(option => (
        <button type="button" key={option.value} aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}>
          {option.label}{option.count !== undefined && <span>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
