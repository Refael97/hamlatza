import { NextResponse } from 'next/server';
import { snapshot } from '@/lib/data';
import { errorText } from '@/lib/validation';
export async function GET(request:Request){try{return NextResponse.json(await snapshot(Object.fromEntries(new URL(request.url).searchParams)),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return NextResponse.json(errorText(e),{status:503});}}
