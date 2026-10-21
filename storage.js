import {initialState,validateState} from './core.js';
import {DEFAULT_TABLES,yakumanAmount,YAKUMAN_TYPES} from './settlement-tables.js';
const database=typeof indexedDB==='undefined'?null:new Promise((resolve,reject)=>{const req=indexedDB.open('sanma-record-app',2);req.onupgradeneeded=()=>{for(const name of ['state','photos'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('別の画面を閉じてから開き直してください'));});
const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
const validPhoto=value=>typeof value==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)&&value.length<=1800000;
export async function photoHash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function splitPhotos(input){
 const photos={};let changed=false;
 async function walk(value){if(!value||typeof value!=='object')return value;if(Array.isArray(value))return Promise.all(value.map(walk));const out={};for(const [key,item] of Object.entries(value)){
   if(key==='photo'&&item!=null){if(!validPhoto(item))throw Error('写真データが不正です');const id=await photoHash(item);photos[id]=item;out.photoId=id;changed=true;}
   else if(key!=='photo'&&!(key==='photoId'&&value.photo!=null))Object.defineProperty(out,key,{value:await walk(item),enumerable:true,writable:true,configurable:true});
 }return out;}
 return {state:await walk(input),photos,changed};
}
export async function load(){const db=await database,raw=await request(db.transaction('state','readonly').objectStore('state').get('main'));if(!raw)return initialState();validateState(raw);let upgraded=false;for(const t of raw.tables)if(!t.gratuity.yakuman){t.gratuity.yakuman=Object.fromEntries(YAKUMAN_TYPES.map(k=>[k.id,yakumanAmount(t,k.id)]));if(t.id==='pin'){if(t.gratuity.ippatsu===300)t.gratuity.ippatsu=500;if(t.gratuity.ura===300)t.gratuity.ura=500;}upgraded=true;}const prepared=await splitPhotos(raw);return prepared.changed||upgraded?save(raw,raw.revision):raw;}
export async function save(next,expected,extraPhotos={}){
 validateState(next);const prepared=await splitPhotos(next);validateState(prepared.state);const photos={...extraPhotos,...prepared.photos};
 for(const [id,value] of Object.entries(photos))if(!/^[a-f0-9]{64}$/.test(id)||!validPhoto(value)||await photoHash(value)!==id)throw Error('写真バックアップの内容またはハッシュが不正です');
 const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction(['state','photos'],'readwrite'),store=tx.objectStore('state'),req=store.get('main');let conflict=false,stored;
 req.onsuccess=()=>{if((req.result?.revision??0)!==expected){conflict=true;tx.abort();return;}stored=prepared.state;stored.revision=expected+1;for(const [id,value] of Object.entries(photos))tx.objectStore('photos').put(value,id);store.put(stored,'main');};
 tx.oncomplete=()=>resolve(stored);tx.onabort=()=>reject(conflict?Error('別の画面で変更されました。この画面を再読み込みしてください'):tx.error||Error('保存できませんでした。空き容量を確認してください'));tx.onerror=()=>{};});
}
export async function loadPhoto(id){if(!id)return null;const db=await database;return (await request(db.transaction('photos','readonly').objectStore('photos').get(id)))??null;}
export function photoIds(value,ids=new Set()){if(value&&typeof value==='object')for(const [k,v] of Object.entries(value)){if(k==='photoId')ids.add(v);else photoIds(v,ids);}return ids;}
export async function collectPhotos(state,requireAll=false,maxBytes=Infinity){const photos={};let bytes=0;for(const id of photoIds(state)){const value=await loadPhoto(id);if(value){bytes+=value.length;if(bytes>maxBytes)throw Error('写真が32MBを超えます。期間を短くするか、写真なしで保存してください');photos[id]=value;}else if(requireAll)throw Error('未復元の写真があります。写真込みの元バックアップを読み込むか、写真なしで保存してください');}return photos;}
export async function storageStats(){const db=await database,state=await request(db.transaction('state','readonly').objectStore('state').get('main')),size=await new Promise((resolve,reject)=>{let photos=0,photosBytes=0;const req=db.transaction('photos','readonly').objectStore('photos').openCursor();req.onsuccess=()=>{const cursor=req.result;if(!cursor){resolve({photos,photosBytes});return;}photos++;photosBytes+=cursor.value.length;cursor.continue();};req.onerror=()=>reject(req.error);});return {recordsBytes:new Blob([JSON.stringify(state??{})]).size,...size,...(await navigator.storage?.estimate?.()??{})};}
export async function rescueRaw(){const db=await database,tx=db.transaction(['state','photos'],'readonly');const [state,keys,values]=await Promise.all([request(tx.objectStore('state').get('main')),request(tx.objectStore('photos').getAllKeys()),request(tx.objectStore('photos').getAll())]);return {schema:'sanma.recovery/v1',state,photos:Object.fromEntries(keys.map((id,i)=>[id,values[i]]))};}

export async function resetStorage(){
 const db=await database;await new Promise((resolve,reject)=>{const tx=db.transaction(['state','photos'],'readwrite');tx.objectStore('state').clear();tx.objectStore('photos').clear();tx.objectStore('state').put(initialState(),'main');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('初期化できませんでした'));tx.onerror=()=>{};});
}

export async function availablePhotoIds(){const db=await database;return request(db.transaction('photos','readonly').objectStore('photos').getAllKeys());}
