'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="empty"><h1>משהו לא הסתדר</h1><p>אפשר לנסות שוב. המלצות שכבר פורסמו נשמרות.</p><button className="button primary" onClick={reset}>ניסיון נוסף</button></div>;}
