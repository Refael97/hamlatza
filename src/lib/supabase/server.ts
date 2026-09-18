import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export async function supabase() {
 const jar=await cookies();
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key) throw new Error('SETUP_REQUIRED');
 return createServerClient(url,key,{cookies:{getAll:()=>jar.getAll(),setAll:values=>{try{for(const {name,value,options} of values) jar.set(name,value,{...options,secure:process.env.NODE_ENV==='production',sameSite:'lax'});}catch{/* Server Components refreshed by proxy. */}}}});
}
