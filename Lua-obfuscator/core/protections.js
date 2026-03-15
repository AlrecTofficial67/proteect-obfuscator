'use strict';

const { Randomizer } = require('./randomizer');

class Protections {
  constructor(rng) {
    this.rng = rng || new Randomizer();
  }

  buildOpaquePredicate(rng) {
    const r = rng || this.rng;
    const a = r.nextInt(2, 30), b = r.nextInt(2, 30);
    const v1 = r.randomName(), v2 = r.randomName();
    const variants = [
      `do local ${v1}=${a} local ${v2}=${b} if not(${v1}*${v2}==${a*b}) then error("") end end`,
      `do local ${v1}=${a+b} if ${v1}~=${a+b} then error("") end end`,
      `do local ${v1}=type(tostring)=="function" if not ${v1} then error("") end end`,
    ];
    return r.pick(variants);
  }

  buildDeadCode(rng) {
    const r = rng || this.rng;
    const v1 = r.randomName(), v2 = r.randomName();
    const a = r.nextInt(1, 999);
    const variants = [
      `if false then local ${v1}=${a} end`,
      `while false do break end`,
      `do local ${v1}=nil if ${v1} then local ${v2}=${a} end end`,
      `repeat local ${v1}=0 until true`,
    ];
    return r.pick(variants);
  }

  buildJunkChain(rng, count) {
    const r = rng || this.rng;
    const lines = [];
    for (let i = 0; i < (count || 2); i++) {
      lines.push(r.next() > 0.5 ? this.buildOpaquePredicate(r) : this.buildDeadCode(r));
    }
    return lines.join('\n');
  }

  buildAntiDebugStandard(rng) {
    const r = rng || this.rng;
    const v1 = r.randomName(), v2 = r.randomName(), v3 = r.randomName();
    return [
      `local ${v1}=type(debug)=="table" and debug or nil`,
      `local ${v2}=${v1} and type(${v1}.getinfo)=="function"`,
      `if ${v2} then`,
      `local ${v3}=pcall(${v1}.getinfo,1,"S")`,
      `if not ${v3} then end`,
      `end`,
    ].join('\n');
  }

  buildIntegrityStandard(code, rng) {
    const r = rng || this.rng;
    let csum = 0;
    for (let i = 0; i < Math.min(code.length, 256); i++) {
      csum = (csum * 31 + code.charCodeAt(i)) & 0x7FFFFFFF;
    }
    const salt = r.nextInt(1, 9999);
    const v1 = r.randomName(), v2 = r.randomName(), v3 = r.randomName();
    return [
      `local ${v1}=${csum}`,
      `local ${v2}=${salt}`,
      `local ${v3}=(${v1}+${v2})-${v2}`,
      `if ${v3}~=${csum} then error("integrity") end`,
    ].join('\n');
  }

  buildFullHeader(mode, code, rng) {
    const r = rng || this.rng;
    if (mode === 'executor') {
      return this.buildJunkChain(r, 2);
    }
    const parts = [];
    parts.push(this.buildAntiDebugStandard(r));
    parts.push(this.buildIntegrityStandard(code, r));
    parts.push(this.buildJunkChain(r, 2));
    return parts.join('\n');
  }
}

module.exports = { Protections };
