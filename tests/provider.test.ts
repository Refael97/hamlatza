import {describe,it,expect} from 'vitest';
import {parseImport} from '../src/lib/validation';
import {DemoResultsProvider,settleFromProvider} from '../src/lib/providers';
import {dateLabel} from '../src/lib/types';
import {readFileSync} from 'node:fs';
describe('provider boundaries',()=>{
 it('validates CSV and detects duplicates and invalid odds',()=>{const csv=readFileSync('public/import-template.csv','utf8');expect(parseImport(csv).errors).toEqual([]);expect(parseImport(csv+csv.split('\n')[1]).errors.some(e=>e.includes('כפולה'))).toBe(true);expect(parseImport(csv.replace('1.85','0.8')).errors.length).toBeGreaterThan(0);});
 it('uses explicit demo results, never guesses unresolved games',async()=>{const calls:unknown[]=[];const provider=new DemoResultsProvider({done:[{marketId:'market',winner:'home',void:false,source:'test',reason:'test'}]});await settleFromProvider(provider,'pending',async result=>calls.push(result));expect(calls).toHaveLength(0);await settleFromProvider(provider,'done',async result=>calls.push(result));expect(calls).toEqual([{marketId:'market',winner:'home',void:false,source:'demo',reason:'סגירת הדגמה סינתטית'}]);});
 it('formats Israel time with timezone daylight-saving rules',()=>{expect(dateLabel('2026-09-17T12:00:00Z')).toContain('15:00');expect(dateLabel('2026-01-17T12:00:00Z')).toContain('14:00');});
});
