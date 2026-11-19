import {
  Check,
  Clock3,
  HelpCircle,
  LoaderCircle,
  Minus,
  Pause,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusNotice } from "@/components/status-notice";
import { cn } from "@/lib/utils";
import type { JourneyStage } from "./journey-model";
import type { JourneyStep } from "./journey-step-state";

/** 阶段状态 → 圆标外观。语义色只用于状态（DESIGN.md §7）。 */
function markerClass(state: JourneyStep["state"]) {
  if (state === "complete") {
    return "border-success bg-success text-success-foreground";
  }
  if (state === "running" || state === "loading") {
    return "border-primary bg-primary text-primary-foreground";
  }
  if (state === "next" || state === "idle") {
    return "border-dashed border-border bg-card text-muted-foreground";
  }
  if (
    state === "failed" ||
    state === "partial" ||
    state === "unknown" ||
    state === "unavailable"
  ) {
    return "border-destructive bg-card text-attention";
  }
  return "border-border bg-card text-muted-foreground";
}

export function JourneyStepper({
  steps,
  selected,
  onSelect,
  caption,
  attention,
  details,
}: {
  steps: JourneyStep[];
  selected: JourneyStage;
  onSelect: (stage: JourneyStage) => void;
  caption: string;
  attention: boolean;
  details?: string[];
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <nav aria-label="任务步骤">
        <ol
          className={cn(
            "mb-1.5 grid grid-cols-1 gap-4 sm:gap-8",
            steps.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3",
          )}
        >
          {steps.map((step, index) => {
            const Icon =
              step.state === "complete"
                ? Check
                : ["running", "loading"].includes(step.state)
                  ? LoaderCircle
                  : step.state === "queued"
                    ? Clock3
                    : step.state === "paused"
                      ? Pause
                      : ["failed", "partial", "unavailable"].includes(step.state)
                        ? TriangleAlert
                        : step.state === "unknown"
                          ? HelpCircle
                          : step.state === "skipped"
                            ? Minus
                            : null;
            const spinning = ["running", "loading"].includes(step.state);

            return (
              <li
                key={step.id}
                data-state={step.state}
                className="relative min-w-0"
              >
                <Button
                  variant="ghost"
                  size="content"
                  data-selected={selected === step.id}
                  aria-pressed={selected === step.id}
                  aria-label={`${step.label}，${step.status}${selected === step.id ? "，正在查看" : ""}`}
                  onClick={() => onSelect(step.id)}
                  className="min-h-17 w-full flex-row items-center justify-start gap-2.5 border border-transparent px-3 py-3 text-start whitespace-normal aria-pressed:border-border aria-pressed:bg-muted"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border text-caption",
                      markerClass(step.state),
                    )}
                  >
                    {Icon ? (
                      <Icon
                        size={16}
                        className={
                          spinning
                            ? "animate-spin motion-reduce:animate-none"
                            : undefined
                        }
                      />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className="grid min-w-0 gap-1">
                    <strong
                      className={cn(
                        "text-body font-semibold break-words",
                        step.state === "complete"
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {step.label}
                    </strong>
                    <small
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                      className={cn(
                        "text-caption leading-relaxed break-words",
                        step.state === "complete"
                          ? "text-success"
                          : "text-muted-foreground",
                      )}
                    >
                      {step.status}
                    </small>
                  </span>
                </Button>
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute end-0 top-6 hidden h-px w-6 translate-x-1/2 sm:block",
                      step.state === "complete" ? "bg-success" : "bg-border",
                    )}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>
      {details?.some(Boolean) ||
      steps.some((step) => step.state === "unknown") ||
      (attention && steps.every((step) => step.state === "idle")) ? (
        <StatusNotice label={caption} attention={attention} details={details} />
      ) : null}
    </div>
  );
}
