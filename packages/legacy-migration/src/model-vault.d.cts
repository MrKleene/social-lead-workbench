export type EncryptedKey={v:1;kid:string;iv:string;ct:string;tag:string};
export declare class VaultError extends Error{code:string;}
export declare function vaultPath(id:string,home?:string):string;
export declare function initialize(file:string):void;
export declare function encrypt(file:string|undefined,id:string,text:string):EncryptedKey;
export declare function decrypt(file:string|undefined,id:string,box:unknown):string;
export declare function probe(file:string|undefined):string;
