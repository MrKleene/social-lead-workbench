import { Button } from '@/components/ui/button';
import { ErrorNotice } from '@/components/feedback';
import { Task } from '@/lib/types';
import { useWorkspaceMutation } from '@/features/collection/use-collection';
export function QuickTask({ task, onDone }: {
    task: Task;
    onDone: (title: string) => void;
}) {
    const mutation = useWorkspaceMutation();
    return <div className="quick-task"><span>{task.title}</span><Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => mutation.mutate({ path: `/tasks/${task.id}`, method: 'PATCH', body: { status: 'DONE' } }, { onSuccess: () => onDone(task.title) })}>完成任务</Button><ErrorNotice error={mutation.error}/></div>;
}
