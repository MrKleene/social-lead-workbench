export const DEFAULT_QWEN_MODEL:string;
export const QWEN_PRICE_VERSION:string;
export function qwenModel(model:string):{id:string;priceVersion:string;priceAck:string;priceDescription:string}|null;

export function qwenModelChoices(savedModel?:string):{id:string;priceDescription:string;priceVersion:string}[];
