'use strict';
const { Randomizer } = require('./randomizer');
class Protections {
  constructor(rng){this.rng=rng||new Randomizer();}
  buildAntiHook(rng){
    const r=rng||this.rng,v1=r.randomName(),v2=r.randomName(),v3=r.randomName(),v4=r.randomName();
    return `local ${v1}=string.char\nlocal ${v2}=bit32.bxor\nlocal ${v3}=bit32.bor\nlocal ${v4}=bit32.rshift`;
  }
  buildDeadCode(rng){
    const r=rng||this.rng,v1=r.randomName(),v2=r.randomName(),a=r.nextInt(1,999);
    return r.pick([`if false then local ${v1}=${a} end`,`while false do break end`,`do local ${v1}=nil if ${v1} then local ${v2}=${a} end end`]);
  }
  buildOpaque(rng){
    const r=rng||this.rng,a=r.nextInt(2,20),b=r.nextInt(2,20),v1=r.randomName();
    return r.pick([`do local ${v1}=${a}*${b} _=${v1} end`,`do local ${v1}=type(bit32) _=${v1} end`]);
  }
  buildJunk(rng,n){
    const r=rng||this.rng,lines=[];
    for(let i=0;i<(n||2);i++) lines.push(r.next()>0.5?this.buildDeadCode(r):this.buildOpaque(r));
    return lines.join('\n');
  }
}
module.exports = { Protections };
