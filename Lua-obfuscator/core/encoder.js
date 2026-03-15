'use strict';

const { Randomizer } = require('./randomizer');

class Encoder {
  constructor(rng) {
    this.rng = rng || new Randomizer();
  }

  // Multi-step: XOR + rotate + scatter with position-dependent key mutation
  heavyEncrypt(str, keys, seed) {
    const out = [];
    let state = seed & 0xFF;
    for (let i = 0; i < str.length; i++) {
      let b = str.charCodeAt(i);
      // Step 1: XOR with key
      b = (b ^ keys[i % keys.length]) & 0xFF;
      // Step 2: XOR with position-mutated state
      b = (b ^ state) & 0xFF;
      // Step 3: rotate left by (i%5)+1 bits
      const rot = (i % 5) + 1;
      b = ((b << rot) | (b >> (8 - rot))) & 0xFF;
      // Step 4: XOR with secondary key derived from position
      b = (b ^ ((i * 7 + seed) & 0xFF)) & 0xFF;
      // Update state
      state = (state * 31 + b + i) & 0xFF;
      out.push(b);
    }
    return out;
  }

  buildHeavyDecryptor(fnName, keys, seed, rng) {
    const r = rng || this.rng;
    const a=r.randomName(), b=r.randomName(), c=r.randomName(), d=r.randomName();
    const e=r.randomName(), f=r.randomName(), g=r.randomName(), h=r.randomName();
    const kV=r.randomName(), sV=r.randomName();
    return [
      `local function ${fnName}(${a})`,
      `local ${b}=""`,
      `local ${sV}=${seed & 0xFF}`,
      `local ${kV}={${keys.join(',')}}`,
      `for ${c}=1,#${a} do`,
      `local ${d}=${a}[${c}]`,
      // Step 4 reverse: XOR with position-derived key
      `local ${e}=((${c}-1)*7+${seed & 0xFF})%256`,
      `${d}=bit32.bxor(${d},${e})`,
      // Step 3 reverse: rotate right
      `local ${f}=(${c}-1)%5+1`,
      `${d}=bit32.bor(bit32.rshift(${d},${f}),bit32.lshift(${d},8-${f}))%256`,
      // Step 2 reverse: XOR with state
      `${d}=bit32.bxor(${d},${sV})`,
      // Step 1 reverse: XOR with key
      `${d}=bit32.bxor(${d},${kV}[((${c}-1)%#${kV})+1])`,
      // Update state (must mirror encrypt state update - use original encrypted byte)
      `${sV}=(${sV}*31+${a}[${c}]+(${c}-1))%256`,
      `${b}=${b}..string.char(${d})`,
      `end`,
      `return ${b}`,
      `end`,
    ].join('\n');
  }

  // Simpler XOR for short strings (fallback)
  xorEncrypt(str, keys) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      out.push((str.charCodeAt(i) ^ keys[i % keys.length]) & 0xFF);
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

  // Rotation decrypt
  rotEncrypt(str, keys) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      out.push((str.charCodeAt(i) + keys[i % keys.length]) & 0xFF);
    }
    return out;
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
