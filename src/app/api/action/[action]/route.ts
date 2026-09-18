import { sameOrigin } from '@/lib/request';
import { NextResponse, after } from 'next/server';
import { rpc, identity } from '@/lib/data';
import { createClient } from '@supabase/supabase-js';
import { pickInput, profileInput, parseImport, errorText } from '@/lib/validation';
import { isDemo, demoRpc, database, serial } from '@/lib/demo-db';
import { supabase } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}) {
 if(!sameOrigin(request))return NextResponse.json({message:'הבקשה אינה מורשית.'},{status:403});
 try {
  if(Number(request.headers.get('content-length')||0)>300000)return NextResponse.json({message:'הבקשה גדולה מדי.'},{status:413});
  const raw=await request.text();if(raw.length>300000)throw new Error('INVALID_INPUT');
  const input=JSON.parse(raw),{action}=await params; let result:unknown;
  if(action==='publish') {result=await rpc('publish_pick',pickInput.parse(input));if(isDemo())after(async()=>{await demoRpc('process_jobs',{},null,true);});}
  else if(action==='profile')result=await rpc('save_profile',profileInput.parse(input));
  else if(action==='follow')result=await rpc('follow_user',z.object({id:z.uuid(),follow:z.boolean()}).parse(input));
  else if(action==='account'){
   if(input.action==='delete'&&!isDemo()&&!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('DELETE_UNAVAILABLE');
   const uid=input.action==='delete'?await identity():null;
   result=await rpc('account_action',input);
   if(input.action==='delete'&&uid){
    if(isDemo())await serial(async()=>{await (await database()).query('delete from private.demo_sessions where user_id=$1',[uid]);});
    else {const auth=await supabase();await auth.auth.signOut({scope:'global'});const service=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});const {error}=await service.auth.admin.deleteUser(uid);if(error)throw new Error('AUTH_DELETE_FAILED');}
   }
  }
  else if(action==='admin'){
   if(input.action==='import'){const parsed=parseImport(z.string().max(250000).parse(input.csv));if(parsed.errors.length)return NextResponse.json({message:parsed.errors.join('\n')},{status:422});result=await rpc('admin_action',{action:'import',rows:parsed.rows,reason:input.reason});}
   else result=await rpc('admin_action',input);
  }
  else if(action==='settle')result=await rpc('settle_market',input);
  else if(action==='logout'){
   if(isDemo()){const uid=await identity();if(uid)await serial(async()=>{await (await database()).query('delete from private.demo_sessions where user_id=$1',[uid]);});(await cookies()).delete('hamlatza-demo');}else{const client=await supabase();await client.auth.signOut({scope:'global'});}result={};
  } else return NextResponse.json({message:'הפעולה לא קיימת.'},{status:404});
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(error){const detail=errorText(error);return NextResponse.json(detail,{status:detail.code==='AUTH_REQUIRED'?401:detail.code==='FORBIDDEN'?403:409});}
}
