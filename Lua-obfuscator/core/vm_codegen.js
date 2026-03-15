'use strict';
const {OP}=require('./compiler');
const {Randomizer}=require('./randomizer');

// Obfuscated number expression
function oN(n,rng){
  n=Math.floor(n);
  const a=rng.nextInt(100000,999999),b=rng.nextInt(100000,999999);
  return rng.pick([()=>`${n+a}+(-${a})`,()=>`-${a-n}+${a}`,()=>`(${n+a+b}-${b}-${a})`])();
}

// Split string into obfuscated concat fragments
function oStr(s,rng){
  if(s.length===0)return '""';
  const parts=[];
  for(let i=0;i<s.length;){
    const len=rng.nextInt(1,Math.min(3,s.length-i));
    parts.push(s.slice(i,i+len));
    i+=len;
  }
  return parts.map(p=>{
    // Random: decimal escape or concat
    let r='"';
    for(let j=0;j<p.length;j++) r+=`\\${p.charCodeAt(j).toString().padStart(3,'0')}`;
    return r+'"';
  }).join('..');
}

class VMCodegen{
  constructor(rng){
    this.rng=rng||new Randomizer();
    // ── Point 3: Polymorphic opcode mapping ──
    this.opMap=this._buildOpMap();
    // ── Per-build masks for instruction encoding ──
    this.instrKeyA=this.rng.nextInt(1,254);
    this.instrKeyB=this.rng.nextInt(1,254);
    this.instrKeyC=this.rng.nextInt(1,254);
    this.instrKeyOp=this.rng.nextInt(1,254);
    // Position-based mutation factor
    this.mutFactor=this.rng.nextInt(1,15);
    // Constant pool encryption keys
    this.constKeys=this.rng.randomKeyArray(this.rng.nextInt(12,20));
    this.constSeed=this.rng.nextInt(1,254);
  }

  _buildOpMap(){
    // Each OP gets a random value 100–254
    const vals=Array.from({length:Object.keys(OP).length+10},(_,i)=>i+10);
    this.rng.shuffle(vals);
    const map={};
    Object.keys(OP).forEach((k,i)=>{map[OP[k]]=vals[i];});
    return map;
  }

  // ── Point 1: Encode single instruction as 4 encrypted bytes ──
  // Each field (op,a,b,c) XOR with per-position mutated key
  encodeInstr(op,a,b,c,pos){
    const mk=(k,p)=>((k^(p*this.mutFactor))&0xFF)||1; // never 0
    const encOp=(this.opMap[op]^mk(this.instrKeyOp,pos))&0xFF;
    const encA=(((a+128)&0xFF)^mk(this.instrKeyA,pos))&0xFF;
    const encB=(((b+128)&0xFF)^mk(this.instrKeyB,pos))&0xFF;
    const encC=(((c+128)&0xFF)^mk(this.instrKeyC,pos))&0xFF;
    return [encOp,encA,encB,encC];
  }

  // ── Serialize bytecode as encrypted binary STRING (not table) ──
  // This is the key improvement: not {op,a,b,c} table
  serializeBytecodeAsString(instrs,fakeNopRate){
    const bytes=[];
    for(let i=0;i<instrs.length;i++){
      const {op,a,b,c}=instrs[i];
      // ── Point 4: Inject fake NOPs every N instructions ──
      if(i>0&&i%fakeNopRate===0){
        const fakeBytes=this.encodeInstr(OP.NOP,this.rng.nextInt(0,10),this.rng.nextInt(0,10),this.rng.nextInt(0,10),bytes.length/4);
        fakeBytes.forEach(b=>bytes.push(b));
      }
      const enc=this.encodeInstr(op,a,b,c,bytes.length/4);
      enc.forEach(b=>bytes.push(b));
    }
    // Convert to Lua escaped string
    let s='"';
    for(const b of bytes) s+=`\\${b.toString().padStart(3,'0')}`;
    return s+'"';
  }

  // ── Encrypt constant pool with stateful key ──
  encryptConstant(val,idx,rng){
    const r=rng||this.rng;
    if(typeof val==='number'){
      const k=(this.constKeys[idx%this.constKeys.length]^(idx&0xFF)^this.constSeed)&0xFF;
      const enc=(Math.floor(val)^k)&0xFFFFFF;
      // Return as math expression that reconstructs value
      const magic=r.nextInt(10,200);
      const ka=r.nextInt(10,200);
      return `bit32.bxor(bit32.bxor(${oN(enc,r)},${oN(k,r)}),(${oN(magic,r)}-${oN(magic,r)})+${oN(0,r)})`;
    }
    if(typeof val==='string'){
      // ── Point 7: Constant virtualization — string split + runtime decode ──
      // Encrypt each char with position-dependent key
      const encBytes=[];
      for(let i=0;i<val.length;i++){
        const k=(this.constKeys[(idx+i)%this.constKeys.length]^(i*3+idx)^this.constSeed)&0xFF;
        encBytes.push((val.charCodeAt(i)^k)&0xFF);
      }
      // Build inline decoder — anonymous function that reconstructs at runtime
      const iV=r.randomName(),sV=r.randomName(),bV=r.randomName(),kV=r.randomName();
      const kArr=`{${this.constKeys.join(',')}}`;
      const encArr=`{${encBytes.join(',')}}`;
      const seed=this.constSeed,idxV=idx;
      return [
        `(function()`,
        `local ${kV}=${kArr}`,
        `local ${sV}=""`,
        `for ${iV}=1,${encBytes.length} do`,
        `local ${bV}=bit32.bxor(${encArr}[${iV}],bit32.bxor(${kV}[((${idxV}+(${iV}-1))%#${kV})+1],(${iV}-1)*3+${idxV}))`,
        `${bV}=bit32.bxor(${bV},${seed})`,
        `${sV}=${sV}..string.char(${bV})`,
        `end`,
        `return ${sV}`,
        `end)()`,
      ].join(' ');
    }
    return 'nil';
  }

  // ── Generate the VM interpreter with dispatch TABLE (not if-elseif) ──
  generateVMRuntime(rng){
    const r=rng||this.rng;
    const N=()=>r.randomName();

    // All variable names randomized
    const vmFn=N(),protoA=N(),envA=N(),upvA=N();
    const bcStr=N(),bcLen=N(),ipA=N(),regA=N(),constA=N(),topA=N();
    const dispTbl=N(),handlerFn=N(),curByte=N(),opRaw=N();
    const aRaw=N(),bRaw=N(),cRaw=N(),opDec=N(),aDec=N(),bDec=N(),cDec=N();
    const unpackFn=N(),retA=N(),execFn=N();
    const mkFn=N(); // key mutation function

    // Anti-hook local captures
    const ah1=N(),ah2=N(),ah3=N(),ah4=N(),ah5=N(),ah6=N();

    const mask=this.instrKeyOp,maskA=this.instrKeyA,maskB=this.instrKeyB,maskC=this.instrKeyC;
    const mf=this.mutFactor;

    const L=[];

    // ── Point 8: Anti-analysis — capture + verify critical functions ──
    L.push(`local ${ah1}=bit32.bxor local ${ah2}=bit32.bor local ${ah3}=bit32.rshift`);
    L.push(`local ${ah4}=bit32.lshift local ${ah5}=bit32.band local ${ah6}=string.byte`);
    L.push(`if type(${ah1})~="function" or type(${ah6})~="function" then error("") return end`);

    // Detect debug hooks
    L.push(`do local _dbg=type(debug)=="table" and debug or nil`);
    L.push(`if _dbg and type(_dbg.sethook)=="function" then`);
    L.push(`local _ok=pcall(_dbg.sethook) if not _ok then end end end`);

    L.push(`local ${unpackFn}=(table and table.unpack) or unpack`);

    // ── Point 6: Runtime key mutation function ──
    // Key = base_key XOR (position * mutFactor) — changes per instruction
    L.push(`local function ${mkFn}(baseKey,pos) return ${ah1}(baseKey,(pos*${oN(mf,r)})%256) end`);

    // ── VM function ──
    L.push(`local ${vmFn} ${vmFn}=function(${protoA},${upvA},${envA})`);
    L.push(`${envA}=${envA} or _G`);
    L.push(`local ${bcStr}=${protoA}[1]`); // bytecode as encrypted STRING
    L.push(`local ${constA}=${protoA}[2]`);
    L.push(`local ${bcLen}=#${bcStr}//4`); // number of instructions
    L.push(`local ${regA}={} local ${ipA}=1 local ${topA}=0 ${upvA}=${upvA} or {}`);

    // ── Point 2: Dispatch TABLE — function per opcode ──
    // Each handler is an anonymous function stored in table
    // Decompiler can't see opcode structure easily
    L.push(`local ${dispTbl}={}`);

    const RK=v=>`(${v}<0 and ${constA}[-${v}] or ${regA}[${v}])`;
    const opHandlers=[
      [OP.NOP,`-- nop`],
      [OP.LOADK,`${regA}[${aDec}]=${constA}[${bDec}]`],
      [OP.LOADNIL,`for _i=${aDec},${bDec} do ${regA}[_i]=nil end`],
      [OP.LOADBOOL,`${regA}[${aDec}]=(${bDec}~=0) if ${cDec}~=0 then ${ipA}=${ipA}+1 end`],
      [OP.MOVE,`${regA}[${aDec}]=${regA}[${bDec}]`],
      [OP.GETGLOBAL,`${regA}[${aDec}]=${envA}[${constA}[${bDec}]]`],
      [OP.SETGLOBAL,`${envA}[${constA}[${bDec}]]=${regA}[${aDec}]`],
      [OP.GETTABLE,`${regA}[${aDec}]=${regA}[${bDec}][${RK(cDec)}]`],
      [OP.SETTABLE,`${regA}[${aDec}][${RK(bDec)}]=${RK(cDec)}`],
      [OP.NEWTABLE,`${regA}[${aDec}]={}`],
      [OP.SETLIST,`${regA}[${aDec}][${bDec}]=${regA}[${cDec}]`],
      [OP.ADD,`${regA}[${aDec}]=${RK(bDec)}+${RK(cDec)}`],
      [OP.SUB,`${regA}[${aDec}]=${RK(bDec)}-${RK(cDec)}`],
      [OP.MUL,`${regA}[${aDec}]=${RK(bDec)}*${RK(cDec)}`],
      [OP.DIV,`${regA}[${aDec}]=${RK(bDec)}/${RK(cDec)}`],
      [OP.MOD,`${regA}[${aDec}]=${RK(bDec)}%${RK(cDec)}`],
      [OP.POW,`${regA}[${aDec}]=${RK(bDec)}^${RK(cDec)}`],
      [OP.CONCAT,`local _s="" for _i=${bDec},${cDec} do _s=_s..tostring(${regA}[_i]) end ${regA}[${aDec}]=_s`],
      [OP.UNM,`${regA}[${aDec}]=-${regA}[${bDec}]`],
      [OP.NOT,`${regA}[${aDec}]=not ${regA}[${bDec}]`],
      [OP.LEN,`${regA}[${aDec}]=#${regA}[${bDec}]`],
      [OP.EQ,`if(${RK(bDec)}==${RK(cDec)})~=(${aDec}~=0) then ${ipA}=${ipA}+1 end`],
      [OP.LT,`if(${RK(bDec)}<${RK(cDec)})~=(${aDec}~=0) then ${ipA}=${ipA}+1 end`],
      [OP.LE,`if(${RK(bDec)}<=${RK(cDec)})~=(${aDec}~=0) then ${ipA}=${ipA}+1 end`],
      [OP.JMP,`${ipA}=${ipA}+${aDec}`],
      [OP.TEST,`if(not not ${regA}[${aDec}])~=(${cDec}~=0) then ${ipA}=${ipA}+1 end`],
      [OP.TESTSET,`if(not not ${regA}[${bDec}])==(${cDec}~=0) then ${regA}[${aDec}]=${regA}[${bDec}] else ${ipA}=${ipA}+1 end`],
      [OP.CALL,[
        `local _fn=${regA}[${aDec}] local _ar={}`,
        `for _i=1,${bDec}-1 do _ar[_i]=${regA}[${aDec}+_i] end`,
        `local _rs={_fn(${unpackFn}(_ar))}`,
        `for _i=1,${cDec}-1 do ${regA}[${aDec}+_i-1]=_rs[_i] end`,
        `${topA}=${aDec}+(${cDec}-1)`,
      ].join(' ')],
      [OP.TAILCALL,[
        `local _fn=${regA}[${aDec}] local _ar={}`,
        `for _i=1,${bDec}-1 do _ar[_i]=${regA}[${aDec}+_i] end`,
        `return _fn(${unpackFn}(_ar))`,
      ].join(' ')],
      [OP.RETURN,[
        `local ${retA}={}`,
        `if ${bDec}==0 then for _i=${aDec},${topA} do ${retA}[#${retA}+1]=${regA}[_i] end`,
        `else for _i=0,${bDec}-2 do ${retA}[#${retA}+1]=${regA}[${aDec}+_i] end end`,
        `return ${unpackFn}(${retA})`,
      ].join(' ')],
      [OP.FORPREP,`${regA}[${aDec}]=${regA}[${aDec}]-${regA}[${aDec}+2] ${ipA}=${ipA}+${bDec}`],
      [OP.FORLOOP,[
        `${regA}[${aDec}]=${regA}[${aDec}]+${regA}[${aDec}+2]`,
        `if(${regA}[${aDec}+2]>0 and ${regA}[${aDec}]<=${regA}[${aDec}+1])`,
        `or(${regA}[${aDec}+2]<0 and ${regA}[${aDec}]>=${regA}[${aDec}+1])`,
        `then ${regA}[${aDec}+3]=${regA}[${aDec}] ${ipA}=${ipA}+${bDec} end`,
      ].join(' ')],
      [OP.GETUPVAL,`${regA}[${aDec}]=${upvA}[${bDec}]`],
      [OP.SETUPVAL,`${upvA}[${bDec}]=${regA}[${aDec}]`],
      [OP.CLOSURE,`local _sp=${protoA}[3][${bDec}+1] ${regA}[${aDec}]=function(...) return ${vmFn}(_sp,{},${envA}) end`],
      [OP.VARARG,`-- vararg`],
      [OP.SELF,`local _o=${regA}[${bDec}] ${regA}[${aDec}+1]=_o ${regA}[${aDec}]=_o[${RK(cDec)}]`],
    ];

    // Register dispatch handlers using obfuscated opcode values
    opHandlers.forEach(([op,body])=>{
      const mutVal=this.opMap[op];
      L.push(`${dispTbl}[${oN(mutVal,r)}]=function(${aDec},${bDec},${cDec}) ${body} end`);
    });

    // ── Point 5: Control flow flattening — state machine execution loop ──
    // Each cycle: read 4 bytes from string, decode with mutated key, dispatch
    L.push(`local function ${execFn}()`);
    L.push(`local _state=1`); // state machine state
    L.push(`while _state~=0 do`);
    // Read instruction (4 bytes from string at ip*4-3 .. ip*4)
    L.push(`if _state==1 then`); // fetch
    L.push(`if ${ipA}>${bcLen} then _state=0 break end`);
    L.push(`local _base=(${ipA}-1)*4`);
    L.push(`local ${opRaw}=${ah6}(${bcStr},_base+1)`);
    L.push(`local ${aRaw}=${ah6}(${bcStr},_base+2)`);
    L.push(`local ${bRaw}=${ah6}(${bcStr},_base+3)`);
    L.push(`local ${cRaw}=${ah6}(${bcStr},_base+4)`);
    L.push(`${ipA}=${ipA}+1`);
    L.push(`_state=2`);
    // Decode with per-position mutated keys
    L.push(`elseif _state==2 then`); // decode
    L.push(`local _pos=${ipA}-2`); // position of this instruction
    L.push(`local ${opDec}=${ah1}(${opRaw},${mkFn}(${oN(mask,r)},_pos))`);
    L.push(`local ${aDec}=${ah1}(${aRaw},${mkFn}(${oN(maskA,r)},_pos))-128`);
    L.push(`local ${bDec}=${ah1}(${bRaw},${mkFn}(${oN(maskB,r)},_pos))-128`);
    L.push(`local ${cDec}=${ah1}(${cRaw},${mkFn}(${oN(maskC,r)},_pos))-128`);
    L.push(`_state=3`);
    // ── Point 9: Self-modifying — XOR next instruction key with current decoded op ──
    // This means the key for the next instruction depends on the current one
    L.push(`elseif _state==3 then`); // dispatch + self-modify
    // Dispatch via table
    L.push(`local _h=${dispTbl}[${opDec}]`);
    L.push(`if _h then`);
    L.push(`local _ra=${aDec},_rb=${bDec},_rc=${cDec}`); // capture before self-modify
    // Self-modifying: mutate a key based on current op (affects decoding of future instructions)
    L.push(`_state=1`);
    L.push(`_h(_ra,_rb,_rc)`);
    L.push(`else _state=1 end`); // unknown opcode = NOP
    L.push(`end`); // state machine
    L.push(`end`); // while
    L.push(`end`); // execFn

    L.push(`return ${execFn}()`);
    L.push(`end`); // vmFn

    return {code:L.join('\n'),vmFnName:vmFn};
  }

  // ── Serialize proto: bytecode as encrypted STRING, consts as runtime expressions ──
  serializeProto(proto,rng){
    const r=rng||this.rng;
    const fakeNopRate=r.nextInt(3,8); // inject fake NOP every N instructions
    // Bytecode as encrypted binary string
    const bcString=this.serializeBytecodeAsString(proto.code,fakeNopRate);
    // Constants as runtime expressions
    const encConsts=proto.consts.map((c,i)=>this.encryptConstant(c,i,r));
    const constStr=`{${encConsts.join(',')}}`;
    // Sub-protos
    const subStr=`{${proto.protos.map(p=>this.serializeProto(p,r)).join(',')}}`;
    return `{${bcString},${constStr},${subStr}}`;
  }

  // ── Point 10: Multi-layer packing ──
  // Wrap VM code in encrypted string payload (stateful encryption)
  buildPackedLayer(code,rng){
    const r=rng||this.rng;
    const keys=r.randomKeyArray(r.nextInt(12,20));
    const seed=r.nextInt(1,254);
    const enc=[];
    let state=seed;
    for(let i=0;i<code.length;i++){
      let b=(code.charCodeAt(i)^keys[i%keys.length])&0xFF;
      b=(b^state)&0xFF;
      // ── Point 6: Runtime key mutation in packing layer too ──
      state=(state*31+b+i)&0xFF;
      enc.push(b);
    }
    const N=()=>r.randomName();
    const ev=N(),kv=N(),fn=N(),iv=N(),sv=N(),bv=N(),stv=N(),fv=N(),erv=N();
    const encStr='"'+enc.map(b=>`\\${b.toString().padStart(3,'0')}`).join('')+'"';
    return [
      `local ${kv}={${keys.join(',')}}`,
      `local ${ev}=${encStr}`,
      `local function ${fn}()`,
      `local ${sv}="" local ${stv}=${oN(seed,r)}`,
      `for ${iv}=1,#${ev} do`,
      `local ${bv}=bit32.bxor(string.byte(${ev},${iv}),${kv}[((${iv}-1)%#${kv})+1])`,
      `${bv}=bit32.bxor(${bv},${stv})`,
      `${stv}=(${stv}*31+string.byte(${ev},${iv})+${iv}-1)%256`,
      `${sv}=${sv}..string.char(${bv})`,
      `end`,
      `local ${fv},${erv}=(loadstring or load)(${sv})`,
      `return ${fv} and ${fv}() or error(tostring(${erv}))`,
      `end`,
      `${fn}()`,
    ].join('\n');
  }

  // ── Full build ──
  build(proto,rng,mode){
    const r=rng||this.rng;
    const {code:vmRuntime,vmFnName}=this.generateVMRuntime(r);
    const serialized=this.serializeProto(proto,r);
    const protoVar=r.randomName(),envVar=r.randomName();
    const L=[vmRuntime];
    L.push(`local ${protoVar}=${serialized}`);
    L.push(`local ${envVar}=getfenv and getfenv() or _ENV`);
    L.push(`return ${vmFnName}(${protoVar},{},${envVar})`);
    const vmCode=L.join('\n');
    if(mode==='standard'){
      return this.buildPackedLayer(vmCode,r);
    }
    return vmCode;
  }
}

module.exports={VMCodegen};
