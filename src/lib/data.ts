import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';
import { database, demoRpc, isDemo, demoAdmin, serial } from './demo-db';
import { supabase } from './supabase/server';
import type { Snapshot } from './types';
export async function identity() {
 if(isDemo()) { const token=(await cookies()).get('hamlatza-demo')?.value; if(!token)return null;
  return serial(async()=>{const db=await database(); const r=await db.query<{user_id:string}>('select user_id from private.demo_sessions where token_hash=$1 and expires_at>now()',[createHash('sha256').update(token).digest('hex')]); return r.rows[0]?.user_id||null;}); }
 const client=await supabase(); const {data,error}=await client.auth.getUser(); return error?null:data.user?.id||null;
}
export async function rpc(name:string,p:unknown={}) {
 if(isDemo())return demoRpc(name,p,await identity());
 const client=await supabase(); const {data,error}=await client.rpc(name,p===undefined?undefined:{p}); if(error)throw new Error(error.message);return data;
}
export async function snapshot(filters:Record<string,string>={}) { const data=await rpc('app_snapshot',filters) as Snapshot; return {...data,demo:isDemo(),serverTime:Date.now(),demoAdmin:demoAdmin()}; }
