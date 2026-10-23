/** Narrow documented imageView2 thumbnail subset. This is NOT evidence of the actual
 * upstream query. https://developer.qiniu.com/dora/1279/basic-processing-images-imageview2
 * Dimensions <=1024, modes 1/2, optional static format and quality. No signatures,
 * pipes, URLs, encoding, duplicate/unknown operations or arbitrary query parameters. */
export function avatarQueryPolicy(query:string,present:boolean):'NONE'|'IMAGE_VIEW2_THUMBNAIL'|'UNSUPPORTED' {
 if(!present)return 'NONE';
 if(query.length>128||!/^[A-Za-z0-9/]+$/.test(query))return 'UNSUPPORTED';
 const parts=query.split('/');
 if(parts[0]!=='imageView2'||!['1','2'].includes(parts[1])||parts.length<4||parts.length%2!==0)return 'UNSUPPORTED';
 const seen=new Set<string>();
 for(let i=2;i<parts.length;i+=2){const key=parts[i],value=parts[i+1];
  if(seen.has(key))return 'UNSUPPORTED';seen.add(key);
  if(key==='w'||key==='h'||key==='q'){
   if(!/^[1-9][0-9]{0,3}$/.test(value)||Number(value)>(key==='q'?100:1024))return 'UNSUPPORTED';
  }else if(key==='format'){if(!['jpg','jpeg','png','webp'].includes(value))return 'UNSUPPORTED';}
  else return 'UNSUPPORTED';
 }
 return seen.has('w')||seen.has('h')?'IMAGE_VIEW2_THUMBNAIL':'UNSUPPORTED';
}
