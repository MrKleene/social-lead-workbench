import { type ComponentProps, type ReactNode } from 'react';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Prefix every value so an explicit empty/clear option stays selectable in Radix.
const encode = (value: string | number) => `choice:${value}`;
type Props = Omit<ComponentProps<typeof SelectTrigger>, 'value' | 'defaultValue' | 'onChange'> & {
  value?: string | number; defaultValue?: string | number; name?: string; required?: boolean;
  onValueChange?: (value: string) => void; children: ReactNode;
};
export function SelectField({ value, defaultValue, onValueChange, children, disabled, name, required, ...trigger }: Props) {
  return <Select value={value === undefined ? undefined : encode(value)} defaultValue={defaultValue === undefined ? undefined : encode(defaultValue)} onValueChange={value => onValueChange?.(value.slice(7))} disabled={disabled} name={name} required={required}>
    <SelectTrigger {...trigger} data-value={value === undefined ? undefined : String(value)}><SelectValue placeholder="请选择" /></SelectTrigger>
    <SelectContent position="popper" align="start"><SelectGroup>{children}</SelectGroup></SelectContent>
  </Select>;
}
export function SelectOption({ value, children, ...props }: Omit<ComponentProps<typeof SelectItem>, 'value'> & { value?: string | number }) {
  const actual = value ?? (typeof children === 'string' || typeof children === 'number' ? children : '');
  return <SelectItem {...props} value={encode(actual)} data-value={String(actual)}>{children}</SelectItem>;
}
