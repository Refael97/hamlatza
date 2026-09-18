import type {Metadata} from 'next';
import '@fontsource/heebo/400.css';
import '@fontsource/heebo/500.css';
import '@fontsource/heebo/600.css';
import '@fontsource/heebo/700.css';
import '@fontsource/heebo/800.css';
import './globals.css';
import {snapshot} from '@/lib/data';
import {AppProvider} from '@/components/context';
import {Shell} from '@/components/shell';
export const dynamic='force-dynamic';
export const metadata:Metadata={metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000'),title:'המלצה · המלצות ספורט עם היסטוריה',description:'קהילת המלצות ספורט בעברית. כל המלצה מתועדת, כל תוצאה נספרת. דירוג שקוף והיסטוריה מלאה.',openGraph:{locale:'he_IL',type:'website',siteName:'המלצה'}};
export default async function Layout({children}:{children:React.ReactNode}){let data;try{data=await snapshot();}catch(error){console.error('Application initialization failed:',error instanceof Error?error.message:'unknown');return <html lang="he" dir="rtl"><body><main className="setup panel"><h1>המלצה · הגדרת הסביבה</h1><p>לא ניתן להתחבר למסד הנתונים. בדקו את משתני הסביבה והריצו את המיגרציה לפי README.</p><p>לפיתוח מקומי ניתן להגדיר DEMO_MODE=true ולהפעיל מחדש.</p></main></body></html>;}
 return <html lang="he" dir="rtl"><body><AppProvider initial={data}><Shell>{children}</Shell></AppProvider></body></html>;}
