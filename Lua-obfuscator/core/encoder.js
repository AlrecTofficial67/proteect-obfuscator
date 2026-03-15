'use strict';
const { Randomizer } = require('./randomizer');

class Encoder {
  constructor(rng) { this.rng = rng||new Randomizer(); }

  buildSubTable(rng) {
    const r=rng||this.rng;
    const fwd=Array.from({length:256},(_,i)=>i);
    for(let i=255;i>0;i--){const j=r.nextInt(0,i);[fwd[i],fwd[j]]=[fwd[j],fwd[i]];}
    const rev=new Array(256);
    fwd.forEach((v,i)=>{rev[v]=i;});
    return {fwd,rev};
  }

  subEncrypt(str, fwd, period) {
    const out=[];
    for(let i=0;i<str.length;i++){
      let b=fwd[str.charCodeAt(i)];
      if(i%period===0) b=((b&0x0F)<<4)|((b&0xF0)>>4);
      out.push(b&0xFF);
    }
    return out;
  }

  buildSubDecryptor(fnName, rev, period, rng) {
    const r=rng||this.rng;
    const chunks=[],cvars=[];
    for(let c=0;c<8;c++){cvars.push(r.randomName());chunks.push(rev.slice(c*32,(c+1)*32));}
    const magic=r.nextInt(20,200);
    const masked=period^magic;
    const outerFn=r.randomName(),tbl=r.randomName(),iv=r.randomName();
    const sv=r.randomName(),bv=r.randomName(),av=r.randomName();
    const lines=[];
    chunks.forEach((ch,c)=>lines.push(`local ${cvars[c]}={${ch.join(',')}}`));
    lines.push(`local ${outerFn};${outerFn}=(function()`);
    lines.push(`local ${tbl}={}`);
    cvars.forEach((cv,c)=>lines.push(`for ${iv}=1,#${cv} do ${tbl}[${c*32}+${iv}]=${cv}[${iv}] end`));
    lines.push(`local _p=bit32.bxor(${masked},${magic})`);
    lines.push(`return function(${av})`);
    lines.push(`local ${sv}=""`);
    lines.push(`for ${iv}=1,#${av} do`);
    lines.push(`local ${bv}=${av}[${iv}]`);
    lines.push(`if(${iv}-1)%_p==0 then`);
    lines.push(`${bv}=bit32.bor(bit32.lshift(bit32.band(${bv},15),4),bit32.rshift(${bv},4))`);
    lines.push(`end`);
    lines.push(`${sv}=${sv}..string.char(${tbl}[${bv}+1])`);
    lines.push(`end return ${sv} end end)()`);
    lines.push(`local ${fnName}=${outerFn}`);
    return lines.join('\n');
  }

  buildFakeDecoys(count, rng) {
    const r=rng||this.rng;
    const lines=[];
    for(let i=0;i<count;i++){
      const fn=r.randomName(),a=r.randomName(),b=r.randomName(),c=r.randomName(),d=r.randomName(),e=r.randomName();
      const k=r.randomKeyArray(8);
      lines.push(`local function ${fn}(${a},${b}) local ${c}="" local ${d}={${k.join(',')}} for ${e}=1,#${a} do ${c}=${c}..string.char((${a}[${e}]+${d}[((${e}-1)%#${d})+1])%256) end return ${c} end`);
    }
    return lines.join('\n');
  }

  xorEncrypt(str, keys) {
    return Array.from(str).map((c,i)=>(c.charCodeAt(0)^keys[i%keys.length])&0xFF);
  }
  buildXorDecryptor(fn, rng) {
    const r=rng||this.rng;
    const a=r.randomName(),b=r.randomName(),c=r.randomName(),d=r.randomName(),e=r.randomName();
    return [`local function ${fn}(${a},${b})`,`local ${c}=""`,`for ${d}=1,#${a} do`,`local ${e}=bit32.bxor(${a}[${d}],${b}[((${d}-1)%#${b})+1])`,`${c}=${c}..string.char(${e})`,`end`,`return ${c}`,`end`].join('\n');
  }
  rotEncrypt(str, keys) {
    return Array.from(str).map((c,i)=>(c.charCodeAt(0)+keys[i%keys.length])&0xFF);
  }
  buildRotDecryptor(fn, rng) {
    const r=rng||this.rng;
    const a=r.randomName(),b=r.randomName(),c=r.randomName(),d=r.randomName(),e=r.randomName();
    return [`local function ${fn}(${a},${b})`,`local ${c}=""`,`for ${d}=1,#${a} do`,`local ${e}=(${a}[${d}]-${b}[((${d}-1)%#${b})+1]+256)%256`,`${c}=${c}..string.char(${e})`,`end`,`return ${c}`,`end`].join('\n');
  }
  obfuscateNumber(n, rng) {
    const r=rng||this.rng;
    if(!Number.isInteger(n)||n<0||n>9999) return String(n);
    const mg=r.nextInt(10,200);
    return r.pick([
      ()=>`(${n+r.nextInt(1,99)}-${r.nextInt(1,99)})`,
      ()=>`bit32.bxor(${n^mg},${mg})`,
      ()=>`(${n})`,
    ])();
  }
}

module.exports = { Encoder };
