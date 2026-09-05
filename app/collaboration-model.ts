import {parsePaperDOMDocument,type PaperDOMDocument} from './document-model.ts';
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** Merge independent fields. Same-field edits and deletion-versus-edit require a decision. */
export function mergeDocuments(base:PaperDOMDocument,local:PaperDOMDocument,remote:PaperDOMDocument){
 const conflicts:string[]=[];
 function merge(b:unknown,l:unknown,r:unknown,path:string):unknown{
  if(equal(l,r)||equal(b,r))return l;if(equal(b,l))return r;
  if(object(b)&&object(l)&&object(r))return Object.fromEntries([...new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])].map(k=>[k,merge(b[k],l[k],r[k],`${path}/${k}`)]));
  if(Array.isArray(b)&&Array.isArray(l)&&Array.isArray(r)&&[...b,...l,...r].every(v=>object(v)&&typeof v.id==='string')){
   const ids=(a:Record<string,unknown>[])=>a.map(v=>String(v.id));const bi=ids(b),li=ids(l),ri=ids(r),common=bi.filter(id=>li.includes(id)&&ri.includes(id));
   const order=(a:string[])=>a.filter(id=>common.includes(id));const lb=equal(order(li),order(bi)),rb=equal(order(ri),order(bi));
   if(!lb&&!rb&&!equal(order(li),order(ri))){conflicts.push(`${path}/order`);return l;}
   const orderIds=[...new Set([...(lb?ri:li),...li,...ri])];
   return orderIds.map(id=>merge(b.find(v=>v.id===id),l.find(v=>v.id===id),r.find(v=>v.id===id),`${path}/${id}`)).filter(v=>v!==undefined);
  }
  conflicts.push(path);return l;
 }
 const clean=(d:PaperDOMDocument)=>({...d,revision:0,metadata:{...d.metadata,updatedAt:''}});
 const merged=merge(clean(base),clean(local),clean(remote),'document') as PaperDOMDocument;
 merged.revision=Math.max(local.revision,remote.revision)+1;merged.metadata.updatedAt=new Date().toISOString();
 const parsed=parsePaperDOMDocument(merged);if(!parsed.ok)conflicts.push(parsed.error);
 return{document:parsed.ok?parsed.document:local,conflicts};
}
export function sameDocument(a:PaperDOMDocument,b:PaperDOMDocument){return equal({...a,revision:0,metadata:{...a.metadata,updatedAt:''}},{...b,revision:0,metadata:{...b.metadata,updatedAt:''}});}
