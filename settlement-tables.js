// Shared JSON contract: sanma.shared/v1. Amounts are yen; score step is 1,000.
export const SHARED_SCHEMA='sanma.shared/v1';
export const DEFAULT_TABLES=[{"id":"half","name":"ハーフ","version":1,"comparisonOnly":false,"rounding":{"unit":50,"perPayment":true,"method":"floor-per-share","payerPays":"rounded-shares-total"},"points":{"threshold":40000,"step":1000,"at39000":550,"slope":50,"atZero":3000},"venue":{"amount":0,"nonTopAt40000":0,"splitRounding":"floor50","splitUnit":50,"payerPays":"rounded-shares-total","scoreRounding":"ceil1000"},"gratuity":{"ippatsu":300,"ura":300,"yakuman":{"counted":1000,"yakuman":2000,"double":4000,"triple":6000,"quadruple":8000}}},{"id":"pin","name":"ピン","version":1,"comparisonOnly":false,"rounding":{"unit":50,"perPayment":true,"method":"floor-per-share","payerPays":"rounded-shares-total"},"points":{"threshold":40000,"step":1000,"at39000":1100,"slope":100,"atZero":6000},"venue":{"amount":1000,"nonTopAt40000":0,"splitRounding":"floor50","splitUnit":50,"payerPays":"rounded-shares-total","scoreRounding":"ceil1000"},"gratuity":{"ippatsu":500,"ura":500,"yakuman":{"counted":2000,"yakuman":4000,"double":8000,"triple":12000,"quadruple":16000}}},{"id":"table1","name":"精算表1","version":1,"comparisonOnly":false,"rounding":{"unit":50,"perPayment":true,"method":"floor-per-share","payerPays":"rounded-shares-total"},"points":{"threshold":40000,"step":1000,"at39000":850,"slope":50,"atZero":3300},"venue":{"amount":1000,"nonTopAt40000":300,"splitRounding":"floor50","splitUnit":50,"payerPays":"rounded-shares-total","scoreRounding":"ceil1000"},"gratuity":{"ippatsu":300,"ura":300,"yakuman":{"counted":1000,"yakuman":2000,"double":4000,"triple":6000,"quadruple":8000}}},{"id":"table2","name":"精算表2","version":1,"comparisonOnly":false,"rounding":{"unit":50,"perPayment":true,"method":"floor-per-share","payerPays":"rounded-shares-total"},"points":{"threshold":40000,"step":1000,"at39000":1550,"slope":50,"atZero":4000},"venue":{"amount":1000,"nonTopAt40000":0,"splitRounding":"floor50","splitUnit":50,"payerPays":"rounded-shares-total","scoreRounding":"ceil1000"},"gratuity":{"ippatsu":300,"ura":300,"yakuman":{"counted":1000,"yakuman":2000,"double":4000,"triple":6000,"quadruple":8000}}}];
const ROUNDING=DEFAULT_TABLES[0].rounding;
export const COMPARISON_TABLES=[['half3500','ハーフ3500（比較用）',500],['half4000','ハーフ4000（比較用）',1000]].map(([id,name,surcharge])=>{const t=structuredClone(DEFAULT_TABLES[0]);t.id=id;t.name=name;t.comparisonOnly=true;t.points.at39000+=surcharge;t.points.atZero+=surcharge;return t;});
export function validateTable(t){
 if(!t||typeof t.id!=='string'||!t.id||typeof t.name!=='string'||!t.name.trim()||t.version!==1)throw Error('精算表の識別情報が不正です');
 for(const n of [t.points?.threshold,t.points?.step,t.points?.at39000,t.points?.slope,t.points?.atZero,t.venue?.amount,(t.venue?.nonTopAt40000??t.venue?.secondAt40000),t.gratuity?.ippatsu,t.gratuity?.ura])if(!Number.isSafeInteger(n)||n<0)throw Error('精算表は0以上の整数で指定してください');
 if(t.points.threshold!==40000||t.points.step!==1000||(t.venue.nonTopAt40000??t.venue.secondAt40000)>t.venue.amount||t.points.atZero-t.points.at39000-39*t.points.slope<0)throw Error('精算表の段差・場代・点数幅が不正です');

 if(t.gratuity.yakuman)for(const key of ['counted','yakuman','double','triple','quadruple'])if(!Number.isSafeInteger(t.gratuity.yakuman[key])||t.gratuity.yakuman[key]<1000||t.gratuity.yakuman[key]%1000)throw Error('役満祝儀の設定は1,000円単位です');
 return t;
}
export function tableBurden(score,t){validateTable(t);if(!Number.isSafeInteger(score)||score%500!==0)throw Error('点数は500点単位です');score=Math.ceil(score/1000)*1000;if(score>=40000)return 0;return score>0?t.points.at39000+(39000-score)/1000*t.points.slope:t.points.atZero-score/1000*t.points.slope;}
export const YAKUMAN_TYPES=[{id:'counted',name:'数え役満'},{id:'yakuman',name:'役満'},{id:'double',name:'ダブル'},{id:'triple',name:'トリプル'},{id:'quadruple',name:'4倍'}];
export function yakumanAmount(table,type){
 if(!YAKUMAN_TYPES.some(t=>t.id===type))throw Error('役満の種類が不正です');
 const values=table.gratuity.yakuman||[...DEFAULT_TABLES,...COMPARISON_TABLES].find(t=>t.id===table.id)?.gratuity.yakuman;
 if(!values)throw Error('独自の精算表は役満祝儀の額を設定してください');return values[type];
}
export function upgradeCurrentTables(tables){let changed=false;for(const t of tables){const known=[...DEFAULT_TABLES,...COMPARISON_TABLES].find(x=>x.id===t.id);if(!t.gratuity.yakuman&&known){t.gratuity.yakuman=structuredClone(known.gratuity.yakuman);if(t.id==='pin'){if(t.gratuity.ippatsu===300)t.gratuity.ippatsu=500;if(t.gratuity.ura===300)t.gratuity.ura=500;}changed=true;}}return changed;}
export const finishBonus=t=>tableBurden(0,t)-tableBurden(1000,t)-t.points.slope;
export function venueFees(scores,leaders,t){
 const out=Object.fromEntries(Object.keys(scores).map(id=>[id,0]));let remainder=t.venue.amount;
 for(const id of Object.keys(scores))if(!leaders.includes(id)&&Math.ceil(scores[id]/1000)*1000>=40000){out[id]=t.venue.nonTopAt40000??t.venue.secondAt40000;remainder-=out[id];}
 if(remainder<0)throw Error('場代負担が場代合計を超えています');
 for(const id of leaders)out[id]=Math.floor(remainder/leaders.length/50)*50;return out;
}
export function exportShared(members=[],tables=DEFAULT_TABLES){return {schema:SHARED_SCHEMA,members:structuredClone(members),tables:structuredClone(tables).map(t=>{t.rounding=structuredClone(ROUNDING);t.gratuity.yakuman=Object.fromEntries(YAKUMAN_TYPES.map(k=>[k.id,yakumanAmount(t,k.id)]));t.venue={amount:t.venue.amount,nonTopAt40000:t.venue.nonTopAt40000??t.venue.secondAt40000,splitRounding:"floor50",splitUnit:50,payerPays:"rounded-shares-total",scoreRounding:"ceil1000"};return t;})};}
