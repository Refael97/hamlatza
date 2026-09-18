'use client';
import {useState} from 'react';
import Link from 'next/link';
import {LockKeyhole,ArrowLeft,Share2,Flag,Check,Heart} from 'lucide-react';
import {useApp} from './context';
import {Avatar,Follow,Streak} from './ui';
import {type Pick,dateLabel,statusLabels} from '@/lib/types';
export function PickCard({pick,detail=false}:{pick:Pick;detail?:boolean}){
 const {data,toast,act}=useApp();const [busy,setBusy]=useState(false);
 const user=data.profiles.find(p=>p.id===pick.user_id),event=data.events.find(e=>e.id===pick.event_id),selection=data.selections.find(s=>s.id===pick.selection_id),market=data.markets.find(m=>m.id===pick.market_id);
 if(!user)return null;
 const liked=data.liked.includes(pick.id),count=data.likes[pick.id]||0;
 async function share(){const url=`${location.origin}/picks/${pick.id}`;try{if(navigator.share)await navigator.share({title:event?`${event.home} — ${event.away}`:`המלצה של ${user!.nickname}`,url});else{await navigator.clipboard.writeText(url);toast('הקישור הועתק');}}catch{toast('אפשר להעתיק את כתובת ההמלצה משורת הכתובת.');}}
 async function like(){setBusy(true);try{await act('like',{id:pick.id,liked:!liked});}catch(e){toast((e as Error).message);}finally{setBusy(false);}}
 return <article className={`pick-card compact-pick ${detail?'pick-detail':''} ${!event?'manual-post':''}`}>
 <div className="pick-top"><div className="author"><Link href={`/tipsters/${user.nickname}`}><Avatar profile={user}/><span><strong>{user.nickname.replaceAll('_',' ')}</strong><time dateTime={pick.published_at}>{dateLabel(pick.published_at,true)}</time></span></Link><Follow id={user.id}/></div>{event&&<div className="match-summary"><strong>{event.home} <span>—</span> {event.away}</strong><small>{event.league} · {dateLabel(event.starts_at,true)}</small></div>}</div>
 {event&&selection&&<div className="selection-strip"><div><span className="overline">{market?.label}</span><strong>{selection.label}</strong></div><div className="odds"><span>{event.is_demo?'יחס הדגמה':event.source==='winner'?'יחס Winner':'יחס המקור'}</span><b dir="ltr">{Number(pick.published_odds).toFixed(2)}</b></div></div>}
 {(pick.analysis||pick.hidden)&&<p className="analysis">{pick.hidden?'הניתוח הוסתר על ידי צוות המודרציה. הרשומה והביצועים נשמרים.':pick.analysis}</p>}
 {event&&<div className="pick-status"><span className={`status ${pick.status}`}>{pick.status==='won'?<Check size={14}/>:<LockKeyhole size={13}/>} {statusLabels[pick.status]}</span><Streak count={data.stats.find(s=>s.id===user.id)?.win_streak||0}/></div>}
 <div className="pick-footer">{!detail?<Link href={`/picks/${pick.id}`}>פרטים <ArrowLeft size={15}/></Link>:<Link href="/responsible-play">משחקים באחריות</Link>}<div>{data.me?<button className={liked?'liked':''} aria-label={liked?'ביטול לייק':'אהבתי את ההמלצה'} aria-pressed={liked} disabled={busy||pick.hidden} onClick={like}><Heart size={17} fill={liked?'currentColor':'none'}/>{count}</button>:<Link className="like-login" href="/login" aria-label="כניסה כדי לעשות לייק"><Heart size={17}/>{count}</Link>}<button onClick={share}><Share2 size={16}/>שיתוף</button>{detail&&data.me&&<button onClick={async()=>{const reason=prompt('מה הסיבה לדיווח?');if(!reason)return;try{await act('account',{action:'report',target_type:'pick',target_id:pick.id,reason});toast('הדיווח נשלח לבדיקה');}catch(e){toast((e as Error).message);}}}><Flag size={15}/>דיווח</button>}</div></div></article>;
}
