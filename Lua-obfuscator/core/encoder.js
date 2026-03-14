'use strict';

const { Randomizer } = require('./randomizer');

class Encoder {
  constructor(rng) {
    this.rng = rng || new Randomizer();
  }

  multiXorEncrypt(str, keys) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      out.push((str.charCodeAt(i) ^ keys[i % keys.length]) & 0xFF);
    }
    return out;
  }

  buildMultiXorDecryptor(fnName, rng) {
    const r = rng || this.rng;
    const a = r.randomName(), b = r.randomName(), c = r.randomName(), d = r.randomName();
    return [
      `local function ${fnName}(${a},${b})`,
      `local ${c}=""`,
      `for ${d}=1,#${a} do`,
      `${c}=${c}..string.char(${a}[${d}]~${b}[((${d}-1)%#${b})+1])`,
      `end`,
      `return ${c}`,
      `end`,
    ].join('\n');
  }

  buildRotateDecryptor(fnName, rng) {
    const r = rng || this.rng;
    const a = r.randomName(), b = r.randomName(), c = r.randomName(), d = r.randomName(), e = r.randomName();
    return [
      `local function ${fnName}(${a},${b})`,
      `local ${c}=""`,
      `for ${d}=1,#${a} do`,
      `local ${e}=${a}[${d}]`,
      `${e}=(${e}-${b}[((${d}-1)%#${b})+1]+256)%256`,
      `${c}=${c}..string.char(${e})`,
      `end`,
      `return ${c}`,
      `end`,
    ].join('\n');
  }

  rotateEncrypt(str, keys) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      out.push((str.charCodeAt(i) + keys[i % keys.length]) & 0xFF);
    }
    return out;
  }

  obfuscateNumber(n, rng) {
    const r = rng || this.rng;
    if (!Number.isInteger(n) || n < -9999 || n > 9999) return String(n);
    const ops = [
      () => { const a = r.nextInt(1, 99); return `(${n + a}-${a})`; },
      () => { const a = r.nextInt(1, 50); const b = r.nextInt(1, 30); return `(${n + a + b}-${a}-${b})`; },
      () => { if (n === 0) return `(1-1)`; if (n < 0) return `(-${-n})`; const a = r.nextInt(2, 6); return `(${n * a}//${a})`; },
      () => `(${n})`,
    ];
    return r.pick(ops)();
  }

  encryptString(str, rng) {
    const r = rng || this.rng;
    const method = r.nextInt(0, 1);
    if (method === 0) {
      const keys = r.randomKeyArray(r.nextInt(4, 16));
      return { bytes: this.multiXorEncrypt(str, keys), keys, method: 'xor' };
    } else {
      const keys = r.randomKeyArray(r.nextInt(4, 16));
      return { bytes: this.rotateEncrypt(str, keys), keys, method: 'rot' };
    }
  }
}

module.exports = { Encoder };
