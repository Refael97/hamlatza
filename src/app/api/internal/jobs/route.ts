import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isDemo,demoRpc } from '@/lib/demo-db';
export async function GET(request:Request){const expected=process.env.CRON_SECRET,actual=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!expected||!actual||expected.length!==actual.length||!timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))return NextResponse.json({message:'Unauthorized'},{status:401});
 if(isDemo())return NextResponse.json(await demoRpc('process_jobs',{},null,true));
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});const {data,error}=await client.rpc('process_jobs');return NextResponse.json(error?{message:'Job failed'}:data,{status:error?500:200});}
