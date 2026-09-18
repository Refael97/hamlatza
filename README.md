# המלצה · hamlatza

אפליקציית המלצות ספורט בעברית וב־RTL: המלצות מובנות ונעולות, היסטוריה מלאה, דירוג שקוף, מעקב, התראות וממשק ניהול. מיועדת לבני 18 ומעלה. אינה מקבלת הימורים או מחזיקה כספים, ואינה קשורה ל־Winner.

## הרצה מקומית

Node.js 22.13 ומעלה.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

פתחו http://localhost:3000. בלי כתובת Supabase ובסביבת פיתוח מופעל PostgreSQL מקומי משובץ (PGlite), עם נתוני הדגמה מסומנים. הנתונים נשמרים ב־`.demo-data/` בין הפעלות. לכל כניסת הדגמה נוצר משתמש נפרד. זהו שרת אמיתי עם מסד נתונים; השינויים אינם נשמרים רק בדפדפן.

לבדיקת כלי הניהול, הגדירו `DEMO_ADMIN=true` והפעילו מחדש. במסך הכניסה יופיע כפתור מנהל הדגמה. האפשרות חסומה ב־production. מצב הדגמה מקומי אינו פועל ב־Vercel ואינו מתאים להרצה מרובת תהליכים. מומלץ להתקין תלויות מחוץ לתיקייה ש־iCloud מפנה אוטומטית לענן.

## מה עובד

- פיד ציבורי, טאבים, סינון ענף/ליגה/תאריך/סטטוס ומיון.
- פרופילים, 20 אווטארים מצוירים מקוריים, כינויים ייחודיים והצהרת 18+ ותנאים.
- OAuth Google ו־SMS OTP דרך Supabase, callback ו־session refresh; כניסת הדגמה מקומית מופרדת במפורש.
- פרסום משחק/שוק/בחירה לפני נעילה, אישור יחס עדכני, idempotency וחתימת SHA-256.
- מניעת עריכה ומחיקה של המלצות שפורסמו, ברמת מסד הנתונים.
- סגירה מדויקת לפי Decimal, טיפול ב־Void, תיקון מנהל עם יומן קודם/חדש וסיבה.
- סטטיסטיקות ודירוג מחושבים בשרת, כולל מסנני תקופה וגודל מדגם 30.
- מעקב והתראות עם outbox אסינכרוני ומניעת כפילות.
- שיתוף, דיווח, העדפות התראות, יצוא מידע ומחיקה תוך שמירת היסטוריה אנונימית.
- Admin: אירועים ושווקים, CSV עם preview/validation, סגירת תוצאות, השעיה, דיווחים ויומן ביקורת.
- RTL רספונסיבי, ניווט מובייל, מצבי טעינה/ריק/שגיאה ומקלדת.

## חיבור Supabase

1. בחרו פרויקט **ייעודי**. הקוד לא שינה פרויקט חיצוני כלשהו.
2. הריצו את `supabase/migrations/20260917202502_initial_community.sql` באמצעות מערכת המיגרציות או SQL Editor. `supabase/schema.sql` הוא עותק קנוני זהה לבדיקות המקומיות.
3. ודאו שרק `public` חשוף ב־Data API. אין לחשוף את סכמת `private`.
4. הגדירו:

```dotenv
DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=SERVER_ONLY_SERVICE_KEY
NEXT_PUBLIC_SITE_URL=https://YOUR_DOMAIN
CRON_SECRET=A_LONG_RANDOM_SECRET
NEXT_PUBLIC_TURNSTILE_SITE_KEY=YOUR_PUBLIC_SITE_KEY
```

5. הפעילו Google OAuth ו־Phone Auth, הגדירו ספק SMS ו־CAPTCHA ב־Supabase. הוסיפו את `https://YOUR_DOMAIN/auth/callback` ל־Redirect URLs, ואת כתובת callback של Supabase בהגדרות OAuth של Google. הפעילו manual identity linking אם רוצים לאפשר חיבור שיטות כניסה נוספות.
6. אחרי יצירת פרופיל של מנהל, העניקו תפקיד דרך מסד הנתונים בלבד:

```sql
insert into private.admins(user_id, role)
select id, 'admin' from public.profiles where nickname = 'YOUR_ADMIN_NICKNAME';
```

תפקידים: `admin`, `moderator`, `data_operator`, `support`. מודרטור אינו יכול לשנות תוצאות. מפעיל נתונים אינו יכול להשעות משתמשים.

7. קבעו מתזמן שיקרא מדי דקה ל־`GET /api/internal/jobs` עם `Authorization: Bearer CRON_SECRET`. הוא נועל המלצות ומעבד outbox; בחירת מתזמן תלויה בתכנית האירוח. בהדגמה ההתראות מעובדות גם אחרי הפרסום. משימות שנכשלו נשמרות עד חמש ניסיונות ומופיעות בממשק הניהול.
8. הריצו בדיקה אמיתית של Google/SMS ושל הרשאות בשני חשבונות לפני שימוש ציבורי.

## נתוני ספורט

אין scraping ואין חיבור אוטומטי ל־Winner. במצב מקומי המשחקים וההיסטוריה סינתטיים; במסד production אין seed. אפשר לייבא CSV דרך Admin (תבנית ב־`public/import-template.csv`). `src/lib/providers.ts` מגדיר חוזים נפרדים ל־Fixtures, Markets ו־Results, עם adapter תוצאות הדגמה ומנגנון retry. ספק חי דורש רישיון, מימוש adapter, בדיקת מיפוי וכללי settlement לכל שוק. אין להסיק תוצאת שוק מתוצאה כללית של משחק.

שוק הוא מזהה יציב: קו שונה ב־Totals/Handicap צריך `market_code` שונה, למשל `total_goals_2_5`. CSV לא משנה שעת תחילה או משתתפים של אירוע קיים; קונפליקט מיפוי נדחה לבדיקה. היחס המקורי נשמר בהמלצה גם כשמייבאים יחס מעודכן.

## בדיקות

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

בדיקות האינטגרציה מריצות PostgreSQL אמיתי משובץ, את סכמת הייצור ואת ה־RPCs תחת תפקידי `anon`, `authenticated`, `service_role`. נבדקים נעילה, יחס שהשתנה, כפילויות, אי־שינוי, פרטיות, תפקידי מנהל, חישובי ROI, תקופות, Void, retries והתראות.

## לפני השקה ציבורית

יש לחבר ולאמת Supabase, Google וספק SMS, ספק ספורט מורשה ומתזמן; להשלים פרטי מפעיל ותנאים/פרטיות לאחר בדיקה משפטית, גיבויים ושחזור, ניטור ותקופות שמירה. מסמכי התנאים במוצר מסומנים כנוסח פיתוח ראשוני. העלאת תמונה אישית, אימייל, Push, תשלומים, PWA וניתוח מתקדם אינם ממומשים. ממשק הנתונים הנוכחי מחזיר snapshot מלא ומתאים לפיילוט קטן; לפני הרחבה נדרשים paging בצד השרת וחישובי סטטיסטיקה מצטברים.

פירוט: [אבטחה](docs/security.md), [עיצוב](docs/design.md), [מפרט המקור](docs/product-spec-he.md).
