'use strict';
const { OP } = require('./compiler');
const { Randomizer } = require('./randomizer');

function obsN(n, rng) {
  n = Math.floor(n);
  const a = rng.nextInt(100000, 999999);
  return rng.pick([
    () => `${n+a}+(-${a})`,
    () => `-${a-n}+${a}`,
    () => `(${n+a+rng.nextInt(1,999)}-${a+rng.nextInt(1,999)})`,
  ])();
}

class VMCodegen {
  constructor(rng) {
    this.rng = rng || new Randomizer();
    // Build randomized opcode mapping: internal OP value → emitted number
    this.opcodeMap = this._buildOpcodeMap();
    this.opMask = this.rng.nextInt(0x11, 0xEE);
    this.opShift = this.rng.nextInt(1, 4);
    this.constKey = this.rng.randomKeyArray(this.rng.nextInt(8, 16));
    this.constMask = this.rng.nextInt(0x11, 0xEE);
  }

  _buildOpcodeMap() {
    const vals = Array.from({length: Object.keys(OP).length}, (_,i) => i+5);
    this.rng.shuffle(vals);
    const map = {};
    Object.keys(OP).forEach((name,i) => { map[OP[name]] = vals[i]; });
    return map;
  }

  // Mutate opcode: (base_op ^ mask + shift) & 0xFF
  mutOp(op) {
    return ((this.opcodeMap[op] ^ this.opMask) + this.opShift) & 0xFF;
  }

  // Encrypt a constant value
  encryptConst(val, idx) {
    if(typeof val === 'number') {
      // Encode as: (val ^ key[idx%len]) with extra offset
      const k = this.constKey[idx % this.constKey.length];
      const enc = (Math.floor(val) ^ k ^ this.constMask) & 0xFFFFFF;
      return { type:'n', enc, k, mask:this.constMask };
    } else if(typeof val === 'string') {
      // Per-char encryption
      const enc = [];
      for(let i=0;i<val.length;i++){
        const k = this.constKey[(idx+i) % this.constKey.length];
        enc.push((val.charCodeAt(i) ^ k ^ (idx & 0xFF)) & 0xFF);
      }
      return { type:'s', enc, idx };
    }
    return { type:'nil' };
  }

  // Generate the VM runtime as Lua code
  generateVMRuntime(rng) {
    const r = rng || this.rng;
    const N = () => r.randomName();

    const vmFn=N(), execFn=N(), protoA=N(), envA=N(), upvA=N();
    const instrA=N(), constA=N(), regA=N(), ipA=N(), topA=N();
    const curA=N(), opA=N(), aA=N(), bA=N(), cA=N(), retA=N();
    const unpackFn=N(), om=this.opcodeMap;
    const mask=this.opMask, shift=this.opShift;

    // Anti-hook captures
    const ah1=N(),ah2=N(),ah3=N(),ah4=N(),ah5=N();

    const RK = v => `(${v}<0 and ${constA}[-${v}] or ${regA}[${v}])`;

    const L = [];
    L.push(`local ${ah1}=bit32.bxor local ${ah2}=bit32.bor local ${ah3}=bit32.rshift local ${ah4}=bit32.lshift local ${ah5}=bit32.band`);
    L.push(`if type(${ah1})~="function" then return end`);
    L.push(`local ${unpackFn}=(table and table.unpack) or unpack`);
    L.push(`local ${vmFn} ${vmFn}=function(${protoA},${upvA},${envA})`);
    L.push(`${envA}=${envA} or _G`);
    L.push(`local ${instrA}=${protoA}[1] local ${constA}=${protoA}[2] local ${regA}={} local ${ipA}=1 local ${topA}=0 ${upvA}=${upvA} or {}`);
    L.push(`local function ${execFn}() while true do`);
    L.push(`local ${curA}=${instrA}[${ipA}] ${ipA}=${ipA}+1`);
    L.push(`local ${opA}=${curA}[1] local ${aA}=${curA}[2] local ${bA}=${curA}[3] local ${cA}=${curA}[4]`);
    // Demutate: ((op - shift) % 256) XOR mask = base opcode in opcodeMap
    // Then we compare against known values
    L.push(`${opA}=${ah1}((${opA}-${shift})%256,${mask})`);

    // Dispatch — compare against mutated opcode values
    const cases = Object.keys(OP);
    cases.forEach((name, i) => {
      const opVal = this.opcodeMap[OP[name]]; // after demutation = opcodeMap value
      const kw = i===0 ? 'if' : 'elseif';
      L.push(`${kw} ${opA}==${opVal} then`);
      const op = OP[name];
      if(op===OP.LOADK) L.push(`${regA}[${aA}]=${constA}[${bA}]`);
      else if(op===OP.LOADNIL) L.push(`for _i=${aA},${bA} do ${regA}[_i]=nil end`);
      else if(op===OP.LOADBOOL) L.push(`${regA}[${aA}]=(${bA}~=0) if ${cA}~=0 then ${ipA}=${ipA}+1 end`);
      else if(op===OP.MOVE) L.push(`${regA}[${aA}]=${regA}[${bA}]`);
      else if(op===OP.GETGLOBAL) L.push(`${regA}[${aA}]=${envA}[${constA}[${bA}]]`);
      else if(op===OP.SETGLOBAL) L.push(`${envA}[${constA}[${bA}]]=${regA}[${aA}]`);
      else if(op===OP.GETTABLE) L.push(`${regA}[${aA}]=${regA}[${bA}][${RK(cA)}]`);
      else if(op===OP.SETTABLE) L.push(`${regA}[${aA}][${RK(bA)}]=${RK(cA)}`);
      else if(op===OP.NEWTABLE) L.push(`${regA}[${aA}]={}`);
      else if(op===OP.SETLIST) L.push(`${regA}[${aA}][${bA}]=${regA}[${cA}]`);
      else if(op===OP.ADD) L.push(`${regA}[${aA}]=${RK(bA)}+${RK(cA)}`);
      else if(op===OP.SUB) L.push(`${regA}[${aA}]=${RK(bA)}-${RK(cA)}`);
      else if(op===OP.MUL) L.push(`${regA}[${aA}]=${RK(bA)}*${RK(cA)}`);
      else if(op===OP.DIV) L.push(`${regA}[${aA}]=${RK(bA)}/${RK(cA)}`);
      else if(op===OP.MOD) L.push(`${regA}[${aA}]=${RK(bA)}%${RK(cA)}`);
      else if(op===OP.POW) L.push(`${regA}[${aA}]=${RK(bA)}^${RK(cA)}`);
      else if(op===OP.CONCAT) L.push(`local _s="" for _i=${bA},${cA} do _s=_s..tostring(${regA}[_i]) end ${regA}[${aA}]=_s`);
      else if(op===OP.UNM) L.push(`${regA}[${aA}]=-${regA}[${bA}]`);
      else if(op===OP.NOT) L.push(`${regA}[${aA}]=not ${regA}[${bA}]`);
      else if(op===OP.LEN) L.push(`${regA}[${aA}]=#${regA}[${bA}]`);
      else if(op===OP.EQ) L.push(`if(${RK(bA)}==${RK(cA)})~=(${aA}~=0) then ${ipA}=${ipA}+1 end`);
      else if(op===OP.LT) L.push(`if(${RK(bA)}<${RK(cA)})~=(${aA}~=0) then ${ipA}=${ipA}+1 end`);
      else if(op===OP.LE) L.push(`if(${RK(bA)}<=${RK(cA)})~=(${aA}~=0) then ${ipA}=${ipA}+1 end`);
      else if(op===OP.JMP) L.push(`${ipA}=${ipA}+${aA}`);
      else if(op===OP.TEST) L.push(`if(not not ${regA}[${aA}])~=(${cA}~=0) then ${ipA}=${ipA}+1 end`);
      else if(op===OP.TESTSET) L.push(`if(not not ${regA}[${bA}])==(${cA}~=0) then ${regA}[${aA}]=${regA}[${bA}] else ${ipA}=${ipA}+1 end`);
      else if(op===OP.CALL) {
        L.push(`local _fn=${regA}[${aA}] local _ar={}`);
        L.push(`for _i=1,${bA}-1 do _ar[_i]=${regA}[${aA}+_i] end`);
        L.push(`local _rs={_fn(${unpackFn}(_ar))}`);
        L.push(`for _i=1,${cA}-1 do ${regA}[${aA}+_i-1]=_rs[_i] end`);
        L.push(`${topA}=${aA}+(${cA}-1)`);
      }
      else if(op===OP.TAILCALL) {
        L.push(`local _fn=${regA}[${aA}] local _ar={}`);
        L.push(`for _i=1,${bA}-1 do _ar[_i]=${regA}[${aA}+_i] end`);
        L.push(`return _fn(${unpackFn}(_ar))`);
      }
      else if(op===OP.RETURN) {
        L.push(`local ${retA}={}`);
        L.push(`if ${bA}==0 then for _i=${aA},${topA} do ${retA}[#${retA}+1]=${regA}[_i] end`);
        L.push(`else for _i=0,${bA}-2 do ${retA}[#${retA}+1]=${regA}[${aA}+_i] end end`);
        L.push(`return ${unpackFn}(${retA})`);
      }
      else if(op===OP.FORPREP) L.push(`${regA}[${aA}]=${regA}[${aA}]-${regA}[${aA}+2] ${ipA}=${ipA}+${bA}`);
      else if(op===OP.FORLOOP) {
        L.push(`${regA}[${aA}]=${regA}[${aA}]+${regA}[${aA}+2]`);
        L.push(`if(${regA}[${aA}+2]>0 and ${regA}[${aA}]<=${regA}[${aA}+1])or(${regA}[${aA}+2]<0 and ${regA}[${aA}]>=${regA}[${aA}+1]) then ${regA}[${aA}+3]=${regA}[${aA}] ${ipA}=${ipA}+${bA} end`);
      }
      else if(op===OP.GETUPVAL) L.push(`${regA}[${aA}]=${upvA}[${bA}]`);
      else if(op===OP.SETUPVAL) L.push(`${upvA}[${bA}]=${regA}[${aA}]`);
      else if(op===OP.CLOSURE) {
        L.push(`local _sp=${protoA}[3][${bA}+1] ${regA}[${aA}]=function(...) return ${vmFn}(_sp,{},${envA}) end`);
      }
      else if(op===OP.VARARG) L.push(`-- vararg`);
      else if(op===OP.SELF) {
        L.push(`local _o=${regA}[${bA}] ${regA}[${aA}+1]=_o ${regA}[${aA}]=_o[${RK(cA)}]`);
      }
      else L.push(`-- nop`);
    });

    L.push(`end end end`);
    L.push(`return ${execFn}() end`);

    return { code: L.join('\n'), vmFnName: vmFn };
  }

  // Serialize a proto to encrypted Lua table literal
  serializeProto(proto, rng) {
    const r = rng || this.rng;

    // Encrypt constants
    const encConsts = proto.consts.map((c,i) => {
      const ec = this.encryptConst(c, i);
      if(ec.type==='n'){
        // Emit as runtime expression
        const k = this.constKey[i % this.constKey.length];
        const enc = (Math.floor(c) ^ k ^ this.constMask) & 0xFFFFFF;
        return `bit32.bxor(bit32.bxor(${obsN(enc,r)},${obsN(k,r)}),${obsN(this.constMask,r)})`;
      } else if(ec.type==='s'){
        // Decrypt as: for each byte: (enc[i] XOR key[(i+idx)%len] XOR (idx&0xFF))
        // Emit inline decode
        const decFn = r.randomName();
        const iV=r.randomName(),sV=r.randomName(),bV=r.randomName();
        const kArr=`{${this.constKey.join(',')}}`;
        const encArr=`{${ec.enc.join(',')}}`;
        const idx=proto.consts.indexOf(c);
        return `(function() local ${sV}="" local _k=${kArr} for ${iV}=1,${ec.enc.length} do local ${bV}=bit32.bxor(${encArr}[${iV}],_k[((${iV}+(${idx})-1)%#_k)+1]) ${bV}=bit32.bxor(${bV},${idx}&255 or 0) ${sV}=${sV}..string.char(${bV}) end return ${sV} end)()`;
      }
      return 'nil';
    });

    // Encrypt instructions: each [mutatedOp, a, b, c]
    const encInstrs = proto.code.map(({op,a,b,c}) => {
      const mo = this.mutOp(op);
      // Obfuscate each field
      return `{${obsN(mo,r)},${obsN(a,r)},${obsN(b,r)},${obsN(c,r)}}`;
    });

    // Recurse for nested protos
    const subProtos = proto.protos.map(p => this.serializeProto(p, r));

    const instrStr = `{${encInstrs.join(',')}}`;
    const constStr = `{${encConsts.join(',')}}`;
    const subStr = `{${subProtos.join(',')}}`;

    return `{${instrStr},${constStr},${subStr}}`;
  }

  // Full build: compile proto → encrypted VM code
  build(proto, rng) {
    const r = rng || this.rng;
    const { code: vmRuntime, vmFnName } = this.generateVMRuntime(r);

    // Serialize the proto
    const serialized = this.serializeProto(proto, r);

    // Wrap: encrypted payload + VM runner
    const protoVar = r.randomName();
    const lines = [];
    lines.push(vmRuntime);
    lines.push(`local ${protoVar}=${serialized}`);
    lines.push(`local _env=getfenv and getfenv() or _ENV`);
    lines.push(`return ${vmFnName}(${protoVar},{},_env)`);

    return lines.join('\n');
  }
}

module.exports = { VMCodegen };
