import { Children, cloneElement, isValidElement, useId, type ComponentProps, type ReactElement } from 'react';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Switch } from './ui/switch';
import { SelectField } from './select-field';
import { Field, FieldLabel } from '@/components/ui/field';

type ControlProps = {id?:string;disabled?:boolean;'aria-invalid'?:boolean;'aria-label'?:string;'aria-labelledby'?:string};
/** Explicit label text excludes portaled/hidden option text from the accessible name. */
export function FormField({ children, htmlFor, ...props }: ComponentProps<typeof FieldLabel>) {
  const generated = useId();
  const nodes = Children.toArray(children);
  const control = nodes.find(node => isValidElement(node) && [Input, Textarea, Checkbox, Switch, SelectField].includes(node.type as never)) as ReactElement<ControlProps> | undefined;
  const id = htmlFor || control?.props.id || generated;
  const text = <span id={`${id}-label`}>{nodes.filter(node=>node!==control)}</span>;
  const input = control && cloneElement(control, {id, ...(!control.props['aria-label']&&!control.props['aria-labelledby']?{'aria-labelledby':`${id}-label`}:{})});
  return <Field className="form-field" data-disabled={control?.props.disabled || undefined} data-invalid={control?.props['aria-invalid'] || undefined}>
    <FieldLabel {...props} htmlFor={id}>{nodes[0]===control?<>{input}{text}</>:<>{text}{input}</>}</FieldLabel>
  </Field>;
}
