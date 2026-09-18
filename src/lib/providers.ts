/** Provider contract: only licensed, normalized data enters the product. Never scrape. */
export type DateRange={from:Date;to:Date};
export type Fixture={externalId:string;sport:'football'|'basketball';league:string;home:string;away:string;startsAt:string};
export type ProviderMarket={externalEventId:string;code:string;label:string;line:number|null;selections:{code:string;label:string;odds:string;updatedAt:string}[]};
export type MarketResult={marketId:string;winner:string|null;void:boolean;source:string;reason:string};
export interface FixturesProvider {syncSports():Promise<string[]>;syncLeagues():Promise<string[]>;syncUpcomingEvents(range:DateRange):Promise<Fixture[]>}
export interface MarketsProvider {syncEventMarkets(eventId:string):Promise<ProviderMarket[]>;syncOdds(eventId:string):Promise<ProviderMarket[]>}
export interface ResultsProvider {syncEventStatus(eventId:string):Promise<'scheduled'|'live'|'finished'|'postponed'|'canceled'>;settleEventMarkets(eventId:string):Promise<MarketResult[]>}
export async function withRetry<T>(work:()=>Promise<T>,attempts=4):Promise<T>{let last:unknown;for(let i=0;i<attempts;i++){try{return await work();}catch(e){last=e;if(i<attempts-1)await new Promise(r=>setTimeout(r,250*2**i));}}throw last;}
/** Explicit result input means demo data can never be mistaken for a live feed. */
export class DemoResultsProvider implements ResultsProvider {
 constructor(private results:Record<string,MarketResult[]>){ }
 async syncEventStatus(id:string){return this.results[id]?'finished' as const:'scheduled' as const;}
 async settleEventMarkets(id:string){return (this.results[id]||[]).map(r=>({...r,source:'demo',reason:'סגירת הדגמה סינתטית'}));}
}
export async function settleFromProvider(provider:ResultsProvider,eventId:string,settle:(result:MarketResult)=>Promise<unknown>){
 const status=await withRetry(()=>provider.syncEventStatus(eventId));if(status!=='finished'&&status!=='canceled')return;
 const results=await withRetry(()=>provider.settleEventMarkets(eventId));for(const result of results)await withRetry(()=>settle(result));
}
