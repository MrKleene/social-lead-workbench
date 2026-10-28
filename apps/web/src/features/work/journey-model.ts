import type {Config, Run} from '@/features/collection/types';

export const journeyStages = [
  {id: 'collect', label: '采集', description: '发现帖子，保存评论与回复'},
  {id: 'review', label: '评论匹配', description: '判断需求，保留原文证据'},
  {id: 'contact', label: '自动回复', description: '按已授权规则处理匹配评论'},
  {id: 'handoff', label: '回复与交接', description: '核实意向，交给销售跟进'},
] as const;
export type JourneyStage = typeof journeyStages[number]['id'];
export function journeyStage(value: string | null): JourneyStage {
  return journeyStages.find(stage => stage.id === value)?.id ?? 'collect';
}
/** A saved selection is scoped to its configuration. Never infer a run from another scope. */
export function selectedJourneyRun(config: Config | undefined, runs: Run[], requested: string) {
  if (!config) return undefined;
  return runs.find(run => run.id === (requested || config.activeRunId)) ?? (!requested ? runs[0] : undefined);
}
