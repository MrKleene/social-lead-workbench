import {ToggleGroup,ToggleGroupItem} from './ui/toggle-group';
import type { CSSProperties } from "react";

/** Single-choice filters support roving focus without implying page tabs. */
export function SegmentedControl({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: readonly { value: string; label: string; count?: number }[];
  onChange: (value: string) => void;
}) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={next=>{if(next)onChange(next);}} className="segmented" aria-label={label}
      style={{ "--segments": options.length, "--selected": Math.max(0, options.findIndex(v => v.value === value)) } as CSSProperties}>
      <span className="segment-indicator" aria-hidden="true" />
      {options.map(option => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}{option.count !== undefined && <span>{option.count}</span>}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
