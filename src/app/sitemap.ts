import type {MetadataRoute} from 'next';
import {snapshot} from '@/lib/data';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{const base=process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000';const data=await snapshot();return [{url:base},{url:base+'/tipsters'},...data.profiles.filter(p=>p.status==='active').map(p=>({url:`${base}/tipsters/${encodeURIComponent(p.nickname)}`}))];}
