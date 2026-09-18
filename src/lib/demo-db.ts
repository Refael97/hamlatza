import { PGlite } from '@electric-sql/pglite';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { seedDemo } from './seed';
const globals=globalThis as unknown as { demoDB?: Promise<PGlite>; demoQueue?: Promise<unknown> };
export function isDemo() { return !process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.DEMO_MODE==='true' || process.env.NODE_ENV!=='production') && !process.env.VERCEL; }
export function demoAdmin() { return isDemo() && process.env.DEMO_ADMIN==='true' && process.env.NODE_ENV!=='production'; }
export const bootstrapSQL=`create role anon; create role authenticated; create role service_role; create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;`;
export async function database() {
 if(!isDemo()) throw new Error('DEMO_DISABLED');
 if(!globals.demoDB) globals.demoDB=(async()=>{
  const path=resolve(/* turbopackIgnore: true */ process.env.DEMO_DB_PATH || '.demo-data'); await mkdir(path,{recursive:true}); const db=new PGlite(path);
  const exists=await db.query<{name:string|null}>("select to_regclass('public.profiles')::text name");
  if(!exists.rows[0].name) { await db.exec(bootstrapSQL); await db.exec(await readFile(resolve('supabase/schema.sql'),'utf8')); await seedDemo(db); }
  const social=await db.query<{name:string|null}>("select to_regclass('public.pick_likes')::text name");
  if(!social.rows[0].name) await db.exec(await readFile(resolve('supabase/migrations/20260918100000_social_cards.sql'),'utf8'));
  const manual=await db.query<{name:string|null}>("select to_regprocedure('public.publish_post(jsonb)')::text name");
  if(!manual.rows[0].name) await db.exec(await readFile(resolve('supabase/migrations/20260918110000_manual_posts.sql'),'utf8'));
  await db.exec('create table if not exists private.demo_sessions(token_hash text primary key,user_id uuid not null,expires_at timestamptz not null)');
  return db;
 })();
 return globals.demoDB;
}
export function serial<T>(fn:()=>Promise<T>):Promise<T> { const task=(globals.demoQueue||Promise.resolve()).then(fn,fn); globals.demoQueue=task.catch(()=>{}); return task; }
export async function demoRpc(name:string,p:unknown,user:string|null,service=false) {
 if(!/^[a-z_]+$/.test(name)) throw new Error('INVALID_RPC');
 return serial(async()=>{const db=await database(); return db.transaction(async tx=>{
  await tx.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[user||'',service?'service_role':user?'authenticated':'anon']);
  await tx.exec(`set local role ${service?'service_role':user?'authenticated':'anon'}`);
  const result=await tx.query<{data:unknown}>(`select public.${name}(${name==='process_jobs'?'':'$1::jsonb'}) data`,name==='process_jobs'?[]:[JSON.stringify(p)]);
  return result.rows[0].data;
 });});
}
