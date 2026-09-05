import {parsePaperDOMDocument} from '../app/document-model.ts';
export type CollaborationEnv={DB:D1Database;BUCKET:R2Bucket};
type Deck={id:string;owner_id:string;title:string;version:number;blob_key:string;updated_at:number};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const failure=(message:string,status:number)=>json({error:message},status);
/** Identity headers are set by the Sites dispatcher, never accepted from JSON. */
export async function collaborationAPI(request:Request,env:CollaborationEnv):Promise<Response>{
 const url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean),id=parts[2];
 const userId=request.headers.get('oai-authenticated-user-id');
 if(!userId)return failure('Sign in to use shared documents.',401);
 if(!env.DB||!env.BUCKET)return failure('Shared storage is not configured.',503);
 if(!['GET','HEAD'].includes(request.method)&&request.headers.has('origin')&&request.headers.get('origin')!==url.origin)return failure('Cross-origin writes are not allowed.',403);
 const name=request.headers.get('oai-authenticated-user-email')??userId;
 const db=env.DB,bucket=env.BUCKET,now=Date.now();
 const body=async()=>{const text=await request.text();if(text.length>35000000)throw new Error('Document exceeds 35 MB.');return JSON.parse(text);};
 try{
  if(parts[1]!=='decks')return failure('Not found.',404);
  if(!id){
   if(request.method==='GET'){const rows=await db.prepare('SELECT d.id,d.title,d.version,d.updated_at,d.owner_id FROM decks d LEFT JOIN members m ON m.deck_id=d.id AND m.user_id=? WHERE d.owner_id=? OR m.user_id=? ORDER BY d.updated_at DESC LIMIT 100').bind(userId,userId,userId).all();return json({userId,decks:rows.results});}
   if(request.method!=='POST')return failure('Method not allowed.',405);
   const data=await body(),parsed=parsePaperDOMDocument(data.document);if(!parsed.ok)return failure(parsed.error,400);
   const deckId=crypto.randomUUID(),key=`documents/${deckId}/${crypto.randomUUID()}.json`;
   await bucket.put(key,JSON.stringify(parsed.document),{httpMetadata:{contentType:'application/json'}});
   try{await db.prepare('INSERT INTO decks (id,owner_id,title,version,blob_key,updated_at) VALUES (?,?,?,1,?,?)').bind(deckId,userId,parsed.document.title,key,now).run();}catch(error){await bucket.delete(key);throw error;}
   return json({id:deckId,version:1,document:parsed.document,role:'owner'},201);
  }
  const deck=await db.prepare('SELECT * FROM decks WHERE id=?').bind(id).first<Deck>();if(!deck)return failure('Document not found.',404);
  const member=deck.owner_id===userId?{role:'owner'}:await db.prepare('SELECT role FROM members WHERE deck_id=? AND user_id=?').bind(id,userId).first<{role:string}>();
  if(!member)return failure('This document has not been shared with you.',403);
  if(parts[3]==='members'){
   if(member.role!=='owner')return failure('Only the owner can manage access.',403);
   if(request.method==='GET')return json({members:(await db.prepare('SELECT user_id,role FROM members WHERE deck_id=?').bind(id).all()).results});
   const data=await body();if(typeof data.userId!=='string'||!data.userId.trim()||data.userId.length>300||data.userId===deck.owner_id)return failure('Enter a collaborator ID from this Site.',400);
   if(request.method==='DELETE'){await db.prepare('DELETE FROM members WHERE deck_id=? AND user_id=?').bind(id,data.userId).run();return json({ok:true});}
   if(request.method!=='PUT'||!['viewer','editor'].includes(data.role))return failure('Choose viewer or editor access.',400);
   await db.prepare('INSERT INTO members (deck_id,user_id,role) VALUES (?,?,?) ON CONFLICT(deck_id,user_id) DO UPDATE SET role=excluded.role').bind(id,data.userId,data.role).run();return json({ok:true});
  }
  if(parts[3])return failure('Not found.',404);
  if(request.method==='GET'){
   await db.prepare('INSERT INTO presence (deck_id,user_id,name,seen_at) VALUES (?,?,?,?) ON CONFLICT(deck_id,user_id) DO UPDATE SET name=excluded.name,seen_at=excluded.seen_at').bind(id,userId,name,now).run();
   const peers=(await db.prepare('SELECT user_id,name FROM presence WHERE deck_id=? AND seen_at>? AND (user_id=? OR user_id IN (SELECT user_id FROM members WHERE deck_id=?))').bind(id,now-15000,deck.owner_id,id).all()).results;
   if(url.searchParams.get('version')===String(deck.version))return json({id,version:deck.version,role:member.role,peers});
   const blob=await bucket.get(deck.blob_key);if(!blob)return failure('Saved document is temporarily unavailable.',503);
   return json({id,version:deck.version,role:member.role,peers,document:JSON.parse(await blob.text())});
  }
  if(request.method!=='PUT')return failure('Method not allowed.',405);
  if(member.role==='viewer')return failure('Viewers cannot edit this document.',403);
  const data=await body();if(!Number.isInteger(data.version)||data.version!==deck.version)return failure('A newer revision is available.',409);
  const parsed=parsePaperDOMDocument(data.document);if(!parsed.ok)return failure(parsed.error,400);
  const key=`documents/${id}/${crypto.randomUUID()}.json`;
  await bucket.put(key,JSON.stringify(parsed.document),{httpMetadata:{contentType:'application/json'}});
  // Check both revision and membership in the same statement to cover concurrent revocation.
  const result=await db.prepare('UPDATE decks SET title=?,version=version+1,blob_key=?,updated_at=? WHERE id=? AND version=? AND (owner_id=? OR EXISTS (SELECT 1 FROM members WHERE deck_id=? AND user_id=? AND role=\'editor\'))').bind(parsed.document.title,key,now,id,data.version,userId,id,userId).run();
  if(!result.meta.changes){await bucket.delete(key);return failure('Revision or access changed. Reload before saving.',409);}
  return json({id,version:deck.version+1});
 }catch(error){if(error instanceof SyntaxError||error instanceof Error&&error.message==='Document exceeds 35 MB.')return failure(error.message,400);return failure('Shared storage is temporarily unavailable. Your local copy is unchanged.',503);}
}
