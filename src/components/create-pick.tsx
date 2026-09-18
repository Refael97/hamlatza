'use client';
import {useState,type FormEvent} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Send} from 'lucide-react';
import {useApp} from './context';
import {Avatar,Empty} from './ui';
export function CreatePick(){const {data,act}=useApp(),router=useRouter();const [body,setBody]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[key]=useState(()=>crypto.randomUUID());
 if(!data.me)return <Empty title="מה ההמלצה שלך?" body="התחברו כדי לכתוב פוסט ולשתף את הקהילה." href={data.auth_id?'/onboarding':'/login'} label={data.auth_id?'השלמת פרופיל':'כניסה'}/>;
 async function publish(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const result=await act('publish',{analysis:body,key});router.push(`/picks/${result.id}?published=1`);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <div className="wizard"><div className="page-heading"><h1>מה ההמלצה שלך?</h1><p>כותבים פוסט, משתפים ומדברים ספורט.</p></div><form className="panel" onSubmit={publish}><div className="wizard-body"><div className="table-user"><Avatar profile={data.me}/><strong>{data.me.nickname.replaceAll('_',' ')}</strong></div><label className="post-label" htmlFor="post-body">הפוסט שלך</label><textarea id="post-body" required minLength={3} maxLength={600} rows={7} value={body} disabled={busy} onChange={e=>setBody(e.target.value)} placeholder={'ארסנל נגד ליברפול\nלכו על ארסנל, היא תנצח היום! הנה למה...'} autoFocus/><div className="counter">{body.length} / 600</div><p className="muted">הפוסט נשמר כפי שפורסם ולא ניתן לעריכה. פוסטים ידניים אינם מקבלים ציון הצלחה אוטומטי.</p>{error&&<div className="error-box" role="alert">{error}</div>}</div><div className="wizard-actions"><Link className="button ghost" href="/feed">ביטול</Link><button className="button primary" disabled={busy||body.trim().length<3} type="submit"><Send size={16}/>{busy?'מפרסם...':'פרסום פוסט'}</button></div></form></div>;
}
