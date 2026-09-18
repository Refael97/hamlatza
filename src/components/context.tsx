'use client';
import {createContext,useContext,useState,type ReactNode} from 'react';
import type {Snapshot} from '@/lib/types';
type AppContext={data:Snapshot;refresh:(filters?:Record<string,string>)=>Promise<void>;act:(action:string,input:unknown)=>Promise<Record<string,unknown>>;toast:(message:string)=>void};
const Context=createContext<AppContext|null>(null);
export function AppProvider({initial,children}:{initial:Snapshot;children:ReactNode}){
 const [data,setData]=useState(initial),[message,setMessage]=useState('');
 const toast=(value:string)=>{setMessage(value);setTimeout(()=>setMessage(''),5000);};
 async function refresh(filters:Record<string,string>={}){const res=await fetch('/api/state?'+new URLSearchParams(filters));const next=await res.json();if(!res.ok)throw new Error(next.message);setData(next);}
 async function act(action:string,input:unknown){const res=await fetch(`/api/action/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const result=await res.json();if(!res.ok)throw new Error(result.message);await refresh();return result;}
 return <Context.Provider value={{data,refresh,act,toast}}>{children}{message&&<div className="toast" role="status">{message}</div>}</Context.Provider>;
}
export function useApp(){const c=useContext(Context);if(!c)throw new Error('Missing provider');return c;}
