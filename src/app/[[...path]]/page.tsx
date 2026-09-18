import {notFound} from 'next/navigation';
import {Feed} from '@/components/feed';
import {Tipsters,ProfilePage} from '@/components/tipsters';
import {CreatePick} from '@/components/create-pick';
import {Login,ProfileForm} from '@/components/auth';
import {Account} from '@/components/account';
import {PickDetail,Notifications} from '@/components/detail';
import {Admin} from '@/components/admin';
import {Legal} from '@/components/legal';
export async function generateMetadata({params}:{params:Promise<{path?:string[]}>}){const {path=[]}=await params;const privatePage=['admin','settings','notifications','create','login','onboarding'].includes(path[0]);const title=path[0]==='tipsters'&&path[1]?`${decodeURIComponent(path[1])} · היסטוריית המלצות`:path[0]==='picks'?'המלצה · פרטים ויומן שקיפות':'המלצה · המלצות ספורט עם היסטוריה';return {title,robots:privatePage?{index:false,follow:false}:undefined,alternates:{canonical:'/'+path.join('/')}};}
export default async function Page({params}:{params:Promise<{path?:string[]}>}){const {path=[]}=await params;const route=path.join('/');if(!route||route==='feed')return <Feed/>;if(route==='tipsters')return <Tipsters/>;if(path[0]==='tipsters'&&path.length===2)return <ProfilePage nickname={decodeURIComponent(path[1])}/>;if(path[0]==='picks'&&path.length===2)return <PickDetail id={path[1]}/>;if(route==='create')return <CreatePick/>;if(route==='notifications')return <Notifications/>;if(route==='login')return <Login/>;if(route==='onboarding')return <ProfileForm onboarding/>;if(route==='settings/profile')return <ProfileForm/>;if(route==='settings/account')return <Account/>;if(route==='admin')return <Admin/>;if(['terms','privacy','responsible-play','how-it-works'].includes(route))return <Legal page={route}/>;notFound();}
