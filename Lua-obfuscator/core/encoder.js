'use strict';

const { Randomizer } = require('./randomizer');

class Encoder {
  constructor(rng) {
    this.rng = rng || new Randomizer();
  }

  xorEncrypt(str, keys) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      out.push((str.charCodeAt(i) ^ keys[i % keys.length]) & 0xFF);
    }
    return out;
  }

  rotEncrypt(str, keys) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      out.push((str.charCodeAt(i) + keys[i % keys.length]) & 0xFF);
    }
    return out;
  }

  buildXorDecryptor(fnName, rng) {
    const r = rng || this.rng;
    const a=r.randomName(),b=r.randomName(),c=r.randomName(),d=r.randomName(),e=r.randomName();
    return [
      `local function ${fnName}(${a},${b})`,
      `local ${c}=""`,
      `for ${d}=1,#${a} do`,
      `local ${e}=bit32.bxor(${a}[${d}],${b}[((${d}-1)%#${b})+1])`,
      `${c}=${c}..string.char(${e})`,
      `end`,
      `return ${c}`,
      `end`,
    ].join('\n');
  }

  buildRotDecryptor(fnName, rng) {
    const r = rng || this.rng;
    const a=r.randomName(),b=r.randomName(),c=r.randomName(),d=r.randomName(),e=r.randomName();
    return [
      `local function ${fnName}(${a},${b})`,
      `local ${c}=""`,
      `for ${d}=1,#${a} do`,
      `local ${e}=(${a}[${d}]-${b}[((${d}-1)%#${b})+1]+256)%256`,
      `${c}=${c}..string.char(${e})`,
      `end`,
      `return ${c}`,
      `end`,
    ].join('\n');
  }

  obfuscateNumber(n, rng) {
    const r = rng || this.rng;
    if (!Number.isInteger(n) || n < 0 || n > 9999) return String(n);
    const ops = [
      () => { const a=r.nextInt(1,99); return `(${n+a}-${a})`; },
      () => { const a=r.nextInt(1,50),b=r.nextInt(1,30); return `(${n+a+b}-${a}-${b})`; },
      () => { if(n===0) return `(0+0)`; const a=r.nextInt(1,20); return `(${n+a*2}-${a*2})`; },
      () => `(${n})`,
    ];
    return r.pick(ops)();
  }
}

module.exports = { Encoder };
