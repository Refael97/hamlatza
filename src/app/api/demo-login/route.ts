import { sameOrigin } from '@/lib/request';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { database,isDemo,demoAdmin,serial } from '@/lib/demo-db';
export async function POST(request:Request){
 if(!isDemo())return NextResponse.json({message:'מצב הדגמה אינו פעיל.'},{status:404});
 if(!sameOrigin(request))return NextResponse.json({message:'בקשה לא מורשית'},{status:403});
 const input=await request.json(); const u=randomUUID(),token=randomBytes(32).toString('hex');
 await serial(async()=>{const db=await database();
 if(input.admin&&demoAdmin()) {await db.query("insert into public.profiles(id,nickname) values($1,$2)",[u,'admin_'+u.slice(0,8)]);await db.query("insert into private.accounts(user_id,full_name,adult,terms_version) values($1,'מנהל הדגמה',true,'demo')",[u]);await db.query("insert into private.admins values($1,'admin')",[u]);}
 await db.query("insert into private.demo_sessions values($1,$2,now()+interval '7 days')",[createHash('sha256').update(token).digest('hex'),u]);});
 (await cookies()).set('hamlatza-demo',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:604800});return NextResponse.json({ok:true});
}
