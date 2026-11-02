/** Date-bound shared cap. Never changes the permanent account limit or rule cap. */
export function effectiveAccountLimit(base:number,usage:{day?:string;dailyLimitOverride?:number|null}|null|undefined,day:string){
 if(!day.startsWith('REAL:Asia/Shanghai:')||usage?.day!==day||usage.dailyLimitOverride==null)return base;
 const value=usage.dailyLimitOverride;if(!Number.isInteger(value)||value<0||value>1000)throw Error('INVALID_DAY_LIMIT');return value;
}
