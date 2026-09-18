import { randomUUID, createHash } from 'node:crypto';
type DB = { query: (sql: string, params?: unknown[]) => Promise<unknown> };
export async function seedDemo(db: DB) {
 const people = [ ['זאב_צפוני',0,'כדורגל אירופי, ניתוח רגוע ומבט לטווח הארוך.'], ['נשר_הספורט',1,'כדורסל, מספרים ומה שביניהם. כל תוצאה נשארת כאן.'], ['אריה_במגרש',2,'עוקב אחרי הליגות בישראל ובאירופה.'] ] as const;
 const users: string[]=[];
 for (const [nickname,avatar,bio] of people) {
  const u=randomUUID(); users.push(u);
  await db.query('insert into public.profiles(id,nickname,avatar,bio) values($1,$2,$3,$4)',[u,nickname,avatar,bio]);
  await db.query("insert into private.accounts(user_id,full_name,adult,terms_version) values($1,'משתמש הדגמה',true,'demo')",[u]);
 }
 const games=[['football','ספרד · לה ליגה','ריאל מדריד','אתלטיקו מדריד'],['basketball','NBA','לוס אנג׳לס לייקרס','דנבר נאגטס'],['football','אנגליה · פרמייר ליג','ארסנל','ליברפול'],['football','ישראל · ליגת העל','מכבי תל אביב','מכבי חיפה'],['basketball','יורוליג','מכבי תל אביב','פנאתינייקוס'],['football','ספרד · לה ליגה','ברצלונה','ולנסיה']];
 for (let i=0;i<44;i++) {
  const [sport,league,home,away]=games[i%games.length];
  const event=randomUUID(), market=randomUUID(), homeId=randomUUID();
  const future=i<6; const start=new Date(Date.now()+(future ? (i+4)*3600000 : -(i-4)*86400000));
  await db.query('insert into public.events(id,sport,league,home,away,starts_at,lock_at,source,external_id,is_demo,status) values($1,$2,$3,$4,$5,$6,$7,\'demo\',$8,true,$9)',[event,sport,league,home,away,start.toISOString(),new Date(start.getTime()-120000).toISOString(),`demo-${i}`,future?'scheduled':'finished']);
  await db.query("insert into public.markets(id,event_id,code,label,status) values($1,$2,'winner','תוצאת משחק',$3)",[market,event,future?'open':'settled']);
  const odds=[1.85,1.92,2.1,1.75,2.2,1.9][i%6];
  await db.query('insert into public.selections(id,market_id,code,label,odds) values($1,$2,\'home\',$3,$4)',[homeId,market,`${home} מנצחת`,odds]);
  await db.query('insert into public.selections(market_id,code,label,odds) values($1,\'away\',$2,2.35)',[market,`${away} מנצחת`]);
  if(sport==='football') await db.query("insert into public.selections(market_id,code,label,odds) values($1,'draw','תיקו',3.25)",[market]);
  for(let j=0;j<users.length;j++) {
   if(future && j!==i%3) continue;
   const id=randomUUID(),at=new Date(future?Date.now()-(i+1)*3000000:start.getTime()-86400000),won=(i*7+j*3)%10<(j===0?7:6); const state=future?'published':won?'won':'lost';
   const hash=createHash('sha256').update([users[j],event,market,homeId,odds,at.toISOString()].join('|')).digest('hex');
   await db.query('insert into public.recommendations(id,user_id,event_id,market_id,selection_id,published_odds,analysis,status,published_at,settled_at,profit_units,published_hash,idempotency_key) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[id,users[j],event,market,homeId,odds,sport==='football'?'יתרון הביתיות והיכולת לייצר מצבים במרכז המגרש הם השיקולים המרכזיים בבחירה. זו הערכה בלבד — גם ניתוח טוב יכול להסתיים בתוצאה אחרת.':'קצב המשחק והתאמת הסגלים הם הבסיס לניתוח. חשוב לבחון את ההמלצה כחלק מהיסטוריה מלאה, ולא לפי משחק בודד.',state,at.toISOString(),future?null:start.toISOString(),future?null:won?Number((odds-1).toFixed(4)):-1,hash,randomUUID()]);
   await db.query('insert into public.audit_logs(recommendation_id,action,new_value,reason,created_at) values($1,\'published\',$2,\'נתוני הדגמה סינתטיים — אינם היסטוריית אמת\',$3)',[id,JSON.stringify({odds,hash}),at.toISOString()]);
  }
 }
}
