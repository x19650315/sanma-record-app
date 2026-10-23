import {clone,validateState} from './core.js';
import {photoIds} from './storage.js';
export const BACKUP_LIMIT=32*1024*1024;
const filenameCounts=new Map(),filenamePlans=new WeakMap();
const reserveMemory=async stamp=>{const count=(filenameCounts.get(stamp)||0)+1;filenameCounts.set(stamp,count);if(filenameCounts.size>64)filenameCounts.delete(filenameCounts.keys().next().value);return count;};
async function filenameForPlan(plan){let state=filenamePlans.get(plan);if(!state){state={reserve:reserveMemory};filenamePlans.set(plan,state);}if(!state.ready){const d=new Date(plan.createdAt),pad=n=>String(n).padStart(2,'0'),stamp=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'_'+pad(d.getHours())+pad(d.getMinutes());state.ready=Promise.resolve(state.reserve(stamp)).then(n=>stamp+(n>1?'-'+n:''));}return state.ready;}
export function selectPeriod(state,from='',to=''){
 if(from&&to&&from>to)throw Error('バックアップの開始日と終了日を確認してください');
 const out=clone(state);if(!from&&!to)return out;
 out.sessions=out.sessions.filter(s=>(!from||s.date>=from)&&(!to||s.date<=to));const sessions=new Set(out.sessions.map(s=>s.id));out.records=out.records.filter(r=>sessions.has(r.sessionId));const ids=new Set(out.records.map(r=>r.id));out.audit=out.audit.filter(a=>a.kind!=='record-edit'||ids.has(a.id));return out;
}
export function backupEnvelope(state,photos={},from='',to=''){
 const selected=selectPeriod(state,from,to);validateState(selected);const included={};for(const id of photoIds(selected))if(photos[id])included[id]=photos[id];
 const text=JSON.stringify({schema:'sanma.backup/v2',scope:from||to?'period':'all',from,to,state:selected,photos:included});
 if(new Blob([text]).size>BACKUP_LIMIT)throw Error('32MBを超えるため書き出しません。期間を短くしてください');return text;
}
const bytes=text=>new Blob([text]).size;
const validPhotoId=id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id);
export function photoSummary(state,available){const refs=[...photoIds(state)],present=new Set(available),written=new Set(state.meta.photoExportedIds||[]);return {unwritten:refs.filter(id=>present.has(id)&&!written.has(id)),missing:refs.filter(id=>!present.has(id))};}
export function markPhotosExported(state,ids){if(ids.some(id=>!validPhotoId(id)))throw Error('写真IDが不正です');const next=clone(state);next.meta.photoExportedIds=[...new Set([...(state.meta.photoExportedIds||[]),...ids])].sort();return next;}
function validateSet(set){if(!set||!/^[-a-f0-9]{36}$/.test(set.id)||!Number.isSafeInteger(set.total)||set.total<1||set.total>10000||!Number.isSafeInteger(set.index)||set.index<1||set.index>set.total||!['all','period','additional'].includes(set.kind)||!Number.isFinite(Date.parse(set.createdAt))||!Array.isArray(set.photoIds)||set.photoIds.length>100000||set.photoIds.some(id=>!validPhotoId(id))||new Set(set.photoIds).size!==set.photoIds.length)throw Error('分割バックアップの識別子・番号が不正です');}
export function backupProgress(state,available){const present=new Set(available);return Object.values(state.meta.importedBackupSets||{}).map(set=>({...set,missingFiles:Array.from({length:set.total},(_,i)=>i+1).filter(i=>!set.loaded.includes(i)),missingPhotos:set.photoIds.filter(id=>!present.has(id)).length}));}
export function restoreBackup(current,payload){
 const v3=payload.schema==='sanma.backup/v3';if(!v3&&payload.schema!=='sanma.backup/v2'||!['all','period',...(v3?['photos']:[])].includes(payload.scope)||!payload.photos||typeof payload.photos!=='object'||Array.isArray(payload.photos))throw Error('バックアップの形式が違います');
 let next;if(payload.scope==='photos')next=clone(current);else{
  validateState(payload.state);if(payload.scope==='all')next=clone(payload.state);else{
   next=clone(current);for(const key of ['members','tables','sessions','records'])for(const item of payload.state[key]){const at=next[key].findIndex(x=>x.id===item.id);if(at<0)next[key].push(clone(item));else if(!['members','tables'].includes(key))next[key][at]=clone(item);}
   const seen=new Set(next.audit.map(x=>JSON.stringify(x)));for(const a of payload.state.audit){const key=JSON.stringify(a);if(!seen.has(key)){next.audit.push(clone(a));seen.add(key);}}
  }
 }
 // Progress belongs to the receiving device and survives a late full-state part.
 next.meta.photoExportedIds=[...new Set([...(current.meta.photoExportedIds||[]),...(payload.state?.meta?.photoExportedIds||[]),...Object.keys(payload.photos)])].sort();next.meta.importedBackupSets=clone(current.meta.importedBackupSets||{});
 if(v3){const set=payload.backupSet;validateSet(set);const old=next.meta.importedBackupSets[set.id];if(old&&(old.total!==set.total||old.kind!==set.kind||old.createdAt!==set.createdAt||JSON.stringify(old.photoIds)!==JSON.stringify(set.photoIds)))throw Error('同じ書き出しIDの分割情報が一致しません');next.meta.importedBackupSets[set.id]={id:set.id,total:set.total,kind:set.kind,createdAt:set.createdAt,photoIds:[...set.photoIds],loaded:[...new Set([...(old?.loaded||[]),set.index])].sort((a,b)=>a-b)};}
 validateState(next);return next;
}
function* statePieces(state,limit){if(bytes(JSON.stringify(state))<=limit/2||state.records.length<=1){yield state;return;}const mid=Math.ceil(state.records.length/2);for(const records of [state.records.slice(0,mid),state.records.slice(mid)]){const ids=new Set(records.map(r=>r.id));yield* statePieces({...state,records,audit:state.audit.filter(a=>a.kind!=='record-edit'||ids.has(a.id))},limit);}}
function envelope(plan,part,photos,index,total){return {schema:'sanma.backup/v3',scope:part.scope,from:part.from,to:part.to,...(part.state?{state:part.state}:{}),photos,backupSet:{id:plan.id,createdAt:plan.createdAt,kind:plan.kind,index,total,photoIds:plan.photoIds}};}
// Planning counts byte lengths, retaining IDs only, so the first file can carry
// its exact n-of-N without collecting all photo values in memory.
export async function createBackupPlan(state,readPhoto,{from='',to='',includePhotos=true,additionalIds=null,limit=BACKUP_LIMIT,reserveFilename=reserveMemory}={}){
 const selected=selectPeriod(state,from,to);validateState(selected);
 const kind=additionalIds?'additional':from||to?'period':'all',allIds=includePhotos?[...new Set(additionalIds||photoIds(selected))].sort():[];if(allIds.some(id=>!validPhotoId(id)))throw Error('写真IDが不正です');if(additionalIds&&!allIds.length)throw Error('まだ書き出していない写真はありません');
 const plan={id:crypto.randomUUID(),createdAt:new Date().toISOString(),kind,photoIds:allIds,parts:[],limit};filenamePlans.set(plan,{reserve:reserveFilename});let bases=[];
 if(additionalIds)bases=[{scope:'photos',from:'',to:'',ids:allIds}];
 else if(!includePhotos)bases=[{scope:from||to?'period':'all',from,to,state:selected,ids:[]}];
 else{const months=[...new Set(selected.sessions.map(s=>s.date.slice(0,7)))].sort(),periods=months.length?months.map(month=>{const [y,m]=month.split('-').map(Number);return [month+'-01',new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)];}):[[from,to]];
  for(const [start,end]of periods)for(const piece of statePieces(selectPeriod(selected,start,end),limit)){const whole=!from&&!to&&start===periods[0][0];bases.push({scope:whole?'all':'period',from:start,to:end,state:whole?selected:piece,ids:[...photoIds(piece)]});}}
 for(const base of bases){const baseline=bytes(JSON.stringify(envelope(plan,base,{},10000,10000)));if(baseline>limit)throw Error('記録・設定・修正履歴が32MBを超えます。期間を短くしてください');let ids=[],size=baseline;
  for(const id of base.ids){const value=await readPhoto(id);if(!value)throw Error('未復元の写真があります。写真込みの元バックアップを読み込んでください');const entry=bytes(JSON.stringify(id)+':'+JSON.stringify(value));if(size+entry+(ids.length?1:0)>limit){if(!ids.length)throw Error('1件の記録と写真が32MBを超えます');plan.parts.push({...base,ids});ids=[];size=baseline;}if(size+entry>limit)throw Error('1枚の写真がバックアップ上限を超えます');size+=entry+(ids.length?1:0);ids.push(id);}
  plan.parts.push({...base,ids});
 }
 if(plan.parts.length>10000)throw Error('分割ファイルが多すぎます。期間を短くしてください');return plan;
}
export async function materializeBackupPart(plan,index,readPhoto){const part=plan.parts[index];if(!part)throw Error('分割ファイルがありません');const photos={};for(const id of part.ids){const value=await readPhoto(id);if(!value)throw Error('未復元の写真があります');photos[id]=value;}const payload=envelope(plan,part,photos,index+1,plan.parts.length),text=JSON.stringify(payload);if(bytes(text)>plan.limit)throw Error('バックアップ上限を超えました');const d=new Date(plan.createdAt),pad=(n,w=2)=>String(n).padStart(w,'0'),stamp=await filenameForPlan(plan),kind={all:'全体',period:'期間',additional:'追加分'}[plan.kind];return {text,name:`卓の記録-${stamp}-${kind}-${index+1}of${plan.parts.length}.json`,from:part.from,to:part.to,part:index+1,total:plan.parts.length,photoIds:[...part.ids]};}
export async function* photoBackupParts(state,readPhoto,from='',to='',limit=BACKUP_LIMIT){const plan=await createBackupPlan(state,readPhoto,{from,to,limit});for(let i=0;i<plan.parts.length;i++)yield await materializeBackupPart(plan,i,readPhoto);}
