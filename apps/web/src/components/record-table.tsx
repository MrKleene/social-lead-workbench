import type {ComponentProps} from 'react';
import {Table} from './ui/table';
import './record-table.css';

/** Keep column headings and keyboard horizontal scrolling at every viewport. */
export function RecordTable(props:ComponentProps<typeof Table>){
 return <div className="record-table"><Table {...props}/><p className="record-table-hint">左右滚动查看完整表格</p></div>;
}
