// No network or model downloads. Crop must contain equally spaced seven-segment cells.
export const SEGMENTS=[[.5,.12],[.78,.3],[.78,.7],[.5,.88],[.22,.7],[.22,.3],[.5,.5]];
export const DIGITS=['1111110','0110000','1101101','1111001','0110011','1011011','1011111','1110000','1111111','1111011'];
export function readSevenSegment({data,width,height},digits=5,invert=false){
 if(!Number.isInteger(digits)||digits<1||digits>7||width<digits*8||height<12)return {ok:false,reason:'範囲または桁数を確認してください'};
 let low=255,high=0;const gray=new Float32Array(width*height);for(let i=0;i<gray.length;i++){gray[i]=.299*data[i*4]+.587*data[i*4+1]+.114*data[i*4+2];low=Math.min(low,gray[i]);high=Math.max(high,gray[i]);}if(high-low<45)return {ok:false,reason:'数字と背景の差が足りません'};
 const threshold=low+(high-low)*.5,cw=width/digits;let text='',confidence=1;
 for(let d=0;d<digits;d++){let pattern='';for(const [x,y] of SEGMENTS){let count=0,lit=0;for(let py=Math.max(0,Math.floor((y-.045)*height));py<Math.min(height,Math.ceil((y+.045)*height));py++)for(let px=Math.max(0,Math.floor((d+x-.055)*cw));px<Math.min(width,Math.ceil((d+x+.055)*cw));px++){count++;if(invert?gray[py*width+px]<threshold:gray[py*width+px]>threshold)lit++;}const ratio=lit/count;confidence=Math.min(confidence,Math.abs(ratio-.5)*2);pattern+=ratio>.5?'1':'0';}const digit=DIGITS.indexOf(pattern);if(digit<0)return {ok:false,reason:'読み取れない桁があります。範囲を調整するか手入力してください'};text+=digit;}
 if(confidence<.35)return {ok:false,reason:'読み取りが不確かです。手入力してください'};return {ok:true,text,value:Number(text),confidence};
}
