export const contactPageSize=20;
export function contactPagination(total:number,offset:number){return {pages:Math.ceil(total/contactPageSize),page:total?Math.floor(offset/contactPageSize)+1:0,last:Math.max(0,Math.ceil(total/contactPageSize)-1)*contactPageSize};}
