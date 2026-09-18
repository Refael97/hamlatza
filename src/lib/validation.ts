import { z } from 'zod';
import Papa from 'papaparse';
export const pickInput=z.object({selection_id:z.uuid(),odds:z.coerce.number().gt(1).max(1000),analysis:z.string().max(600).default(''),key:z.uuid()});
export const profileInput=z.object({nickname:z.string().regex(/^[a-zA-Z0-9א-ת_]{3,24}$/),bio:z.string().max(300).default(''),avatar:z.number().int().min(0).max(19),full_name:z.string().min(2).max(100).optional(),adult:z.boolean().optional(),terms:z.boolean().optional()});
const csvRow=z.object({sport_code:z.enum(['football','basketball']),league_name:z.string().min(1).max(100),starts_at:z.iso.datetime({offset:true}),home_participant:z.string().min(1).max(100),away_participant:z.string().min(1).max(100),market_code:z.string().min(1).max(80),line_value:z.string().refine(v=>v===''||Number.isFinite(Number(v))),selection_code:z.string().min(1).max(80),selection_label_he:z.string().min(1).max(100),decimal_odds:z.coerce.number().gt(1).max(1000),source_updated_at:z.iso.datetime({offset:true}),external_event_id:z.string().min(1).max(100),market_label_he:z.string().optional()});
export function parseImport(csv:string) {
 const parsed=Papa.parse<Record<string,string>>(csv,{header:true,skipEmptyLines:'greedy'}); const errors=parsed.errors.map(e=>`שורה ${(e.row||0)+2}: ${e.message}`); const rows:z.infer<typeof csvRow>[]=[]; const keys=new Set<string>();
 if(parsed.data.length>1000)errors.push('עד 1,000 שורות בכל ייבוא');
 parsed.data.forEach((row,i)=>{const r=csvRow.safeParse(row);if(!r.success){errors.push(`שורה ${i+2}: ${r.error.issues.map(e=>e.path.join('.')).join(', ')}`);return;} const key=[r.data.external_event_id,r.data.market_code,r.data.selection_code].join('|');if(keys.has(key))errors.push(`שורה ${i+2}: בחירה כפולה`);keys.add(key);if(new Date(r.data.starts_at).getTime()<=Date.now()+120000)errors.push(`שורה ${i+2}: המשחק אינו עתידי`);rows.push(r.data);});
 if(!rows.length)errors.push('לא נמצאו שורות תקינות');return {rows,errors};
}
export function errorText(error:unknown) {
 const message=error instanceof Error?error.message:String(error);
 const labels:Record<string,string>={DELETE_UNAVAILABLE:'מחיקה אינה זמינה עד להגדרת שירות ניהול החשבונות.',AUTH_DELETE_FAILED:'הפרופיל הוסר אך מחיקת חשבון האימות לא הושלמה. נדרשת בדיקת מנהל.',AUTH_REQUIRED:'יש להתחבר ולהשלים פרופיל כדי להמשיך.',FORBIDDEN:'אין לך הרשאה לפעולה הזו.',PROFILE_INCOMPLETE:'נדרשים פרופיל מלא, אישור גיל ותנאי שימוש.',EVENT_LOCKED:'מועד הפרסום עבר או שהשוק אינו פתוח. בחרו משחק אחר.',ODDS_CHANGED:'היחס השתנה. בדקו את היחס המעודכן ואשרו מחדש.',DUPLICATE_MARKET:'כבר פרסמת המלצה בשוק הזה. ההמלצה המקורית נשמרת.',IDEMPOTENCY_CONFLICT:'הבקשה כבר שימשה לפרסום אחר. התחילו פרסום חדש.',RATE_LIMIT:'בוצעו פעולות רבות. נסו שוב בעוד דקה.',NICKNAME_COOLDOWN:'אפשר לשנות כינוי פעם ב־30 יום.',INVALID_NICKNAME:'הכינוי חייב לכלול 3–24 אותיות, ספרות או קו תחתון.',REASON_REQUIRED:'יש להזין סיבה מפורטת (לפחות 5 תווים).',SETUP_REQUIRED:'יש לחבר Supabase כדי להפעיל את האפליקציה בסביבת ייצור.',EVENT_MAPPING_CONFLICT:'האירוע קיים עם נתונים אחרים. יש לבדוק את המיפוי.',INVALID_WINNER:'יש לבחור תוצאה מתוך השוק.',EVENT_NOT_STARTED:'לא ניתן לסגור תוצאה לפני תחילת המשחק.'};
 for(const [code,text] of Object.entries(labels))if(message.includes(code))return {code,message:text};
 if(message.includes('profiles_nickname'))return {code:'NICKNAME_TAKEN',message:'הכינוי כבר תפוס. בחרו כינוי אחר.'};
 return {code:'REQUEST_FAILED',message:'הפעולה לא הושלמה. בדקו את הנתונים ונסו שוב.'};
}
