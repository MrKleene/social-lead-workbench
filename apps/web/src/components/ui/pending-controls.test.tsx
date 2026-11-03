import {describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Button} from './button';
import {Switch} from './switch';

describe('temporary pending actions',()=>{
 it.each(['default','outline','ghost'] as const)('blocks activation without replacing the %s button or removing keyboard focusability',variant=>{
  const action=vi.fn(),preventDefault=vi.fn(),stopPropagation=vi.fn();
  const button=Button({pending:true,variant,onClick:action,children:'完成设置'});
  button.props.onClick({preventDefault,stopPropagation} as any);
  expect(action).not.toHaveBeenCalled();expect(preventDefault).toHaveBeenCalledOnce();
  expect(button.props.disabled).toBeUndefined();expect(button.props['aria-disabled']).toBe(true);expect(button.props['aria-busy']).toBe(true);
  expect(button.props['data-variant']).toBe(variant);
 });
 it('retains genuine unavailable constraints even while saving',()=>{
  const html=renderToStaticMarkup(<Button pending disabled>不可用</Button>);
  expect(html).toContain('disabled=""');
  const sw=Switch({pending:true,disabled:true,checked:false});expect(sw.props.disabled).toBe(true);
 });
 it('keeps the saved switch state and suppresses pointer and keyboard-generated changes during pending',()=>{
  const change=vi.fn(),preventDefault=vi.fn();const sw=Switch({pending:true,checked:true,onCheckedChange:change});
  sw.props.onClick({preventDefault});sw.props.onCheckedChange(false);
  expect(preventDefault).toHaveBeenCalledOnce();expect(change).not.toHaveBeenCalled();expect(sw.props.checked).toBe(true);expect(sw.props.disabled).toBeUndefined();
 });
 it('allows normal activation after success or failure releases pending',()=>{
  const action=vi.fn(),change=vi.fn();Button({pending:false,onClick:action}).props.onClick({} as any);Switch({pending:false,checked:false,onCheckedChange:change}).props.onCheckedChange(true);
  expect(action).toHaveBeenCalledOnce();expect(change).toHaveBeenCalledWith(true);
 });
});
