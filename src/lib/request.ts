/** Verify the browser origin against the public host, not Next's internal bind URL. */
export function sameOrigin(request:Request){
 const origin=request.headers.get('origin');if(!origin)return false;
 try {const parsed=new URL(origin);const configured=process.env.NEXT_PUBLIC_SITE_URL;
 if(configured)return parsed.origin===new URL(configured).origin;
 return parsed.host===request.headers.get('host')&&(parsed.protocol==='https:'||(process.env.NODE_ENV!=='production'&&parsed.protocol==='http:'));
 }catch{return false;}
}
