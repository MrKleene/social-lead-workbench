import { toast } from 'sonner'

export function showSubmittedData(
  data: unknown,
  title: string = 'You submitted the following values:'
) {
  toast.message(title, {
    description: (
      <pre className='mt-2 w-full overflow-x-auto rounded-md bg-foreground p-4 text-background'>
        <code>{JSON.stringify(data, null, 2)}</code>
      </pre>
    ),
  })
}
