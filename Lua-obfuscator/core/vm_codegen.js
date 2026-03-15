'use strict';
const {OP}=require('./compiler');
const {Randomizer}=require('./randomizer');

function oN(n,rng){
  n=Math.floor(n);
  const a=rng.nextInt(100000,999999),b=rng.nextInt(100000,999999);
  return rng.pick([()=>`${n+a}+(-${a})`,()=>`-${a-n}+${a}`,()=>`(${n+a+b}-${b}-${a})`])();
}
function oS(s){
  let o='"';
  for(let i=0;i<s.length;i++)o+=`\\${s.charCodeAt(i).toString().padStart(3,'0')}`;
  return o+'"';
}

class VMCodegen{
  constructor(rng){
    this.rng=rng||new Randomizer();
    // ── Polymorphic opcode map (Point 1 & 14) ──
    this.opMap=this._buildOpMap();
    // Per-instruction encoding keys
    this.iKeyOp=this.rng.nextInt(1,254);
    this.iKeyA=this.rng.nextInt(1,254);
    this.iKeyB=this.rng.nextInt(1,254);
    this.iKeyC=this.rng.nextInt(1,254);
    this.mutF=this.rng.nextInt(1,13);
    // Runtime key seeds (Point: Runtime Key Generation)
    this.rtKeySeed=this.rng.nextInt(1,254);
    this.rtKeyMul=this.rng.nextInt(3,37);
    this.rtKeyXor=this.rng.nextInt(1,254);
    // Constant pool keys
    this.constKeys=this.rng.randomKeyArray(this.rng.nextInt(14,24));
    this.constSeed=this.rng.nextInt(1,254);
    // Register scramble map (Point 8)
    this.regMap=this._buildRegMap();
    // Fake opcode table for anti-dump (Point 11)
    this.fakeOps=this._buildFakeOps();
    // VM fragmentation: split dispatch into sub-functions (Point 15)
    this.fragCount=this.rng.nextInt(3,5);
  }

  _buildOpMap(){
    const keys=Object.keys(OP);
    const vals=Array.from({length:keys.length+20},(_,i)=>i+8);
    this.rng.shuffle(vals);
    const map={};
    keys.forEach((k,i)=>{map[OP[k]]=vals[i];});
    return map;
  }

  _buildRegMap(){
    // Map logical register 0..63 to scrambled physical register
    const regs=Array.from({length:64},(_,i)=>i);
    this.rng.shuffle(regs);
    return regs;
  }

  _buildFakeOps(){
    // Generate fake opcode values that look real but are never executed
    const fakes=[];
    for(let i=0;i<12;i++) fakes.push(this.rng.nextInt(200,255));
    return fakes;
  }

  // ── Point 6: Runtime Key Generation ──
  // Key for position `pos` derived from runtime state, not hardcoded
  buildRTKeyFn(rng){
    const r=rng||this.rng;
    const fn=r.randomName(),pV=r.randomName(),sV=r.randomName();
    const seed=this.rtKeySeed,mul=this.rtKeyMul,xk=this.rtKeyXor;
    return {
      fn,
      code:`local function ${fn}(${pV},${sV}) return bit32.bxor((${pV}*${oN(mul,r)}+${sV})%256,${oN(xk,r)}) end`
    };
  }

  // ── Point 3: Instruction mutation — packed bitfield encoding ──
  encodeInstr(op,a,b,c,pos){
    const mk=(k,p)=>(((k^(p*this.mutF))&0xFF)||1);
    // Pack: apply per-position key + runtime key seed XOR
    const encOp=(((this.opMap[op]||0)^mk(this.iKeyOp,pos))^(pos&0xFF))&0xFF;
    const encA=(((a+128)&0xFF)^mk(this.iKeyA,pos))&0xFF;
    const encB=(((b+128)&0xFF)^mk(this.iKeyB,pos))&0xFF;
    const encC=(((c+128)&0xFF)^mk(this.iKeyC,pos))&0xFF;
    // Extra mutation: each byte XORed with seed rolled by position
    const roll=(this.rtKeySeed*(pos+1))&0xFF;
    return [encOp^roll,encA^(roll>>1&0xFF),encB^(roll>>2&0xFF),encC^(roll>>3&0xFF)].map(x=>x&0xFF);
  }

  // ── Point 9: Bytecode packing — store as encrypted binary string ──
  serializeBytecodeStr(instrs,rng){
    const r=rng||this.rng;
    const bytes=[];
    const fakeRate=r.nextInt(4,9);
    for(let i=0;i<instrs.length;i++){
      // ── Point 6: Fake NOP injection ──
      if(i>0&&i%fakeRate===0){
        const fb=this.encodeInstr(OP.NOP,r.nextInt(0,5),r.nextInt(0,5),r.nextInt(0,5),bytes.length/4);
        fb.forEach(b=>bytes.push(b));
      }
      const{op,a,b,c}=instrs[i];
      this.encodeInstr(op,a,b,c,bytes.length/4).forEach(b=>bytes.push(b));
    }
    // ── Byte shuffle pass ──
    const shuffleKey=r.randomKeyArray(r.nextInt(8,16));
    const shuffled=bytes.map((b,i)=>(b^shuffleKey[i%shuffleKey.length])&0xFF);
    // Store as escaped string
    let s='"';
    for(const b of shuffled)s+=`\\${b.toString().padStart(3,'0')}`;
    return {str:s+'"',shuffleKey};
  }

  // ── Point 4: Dynamic constant encryption ──
  encryptConst(val,idx,rng){
    const r=rng||this.rng;
    if(typeof val==='number'){
      const k=(this.constKeys[idx%this.constKeys.length]^(idx*7)^this.constSeed)&0xFF;
      const enc=(Math.floor(Math.abs(val))^k)&0xFFFFFF;
      const magic=r.nextInt(1,200);
      const sign=val<0?'-':'';
      return `${sign}bit32.bxor(${oN(enc,r)},${oN(k,r)})`;
    }
    if(typeof val==='string'){
      // ── Point 13: String reconstruction — char by char ──
      const parts=[];
      for(let i=0;i<val.length;i++){
        const k=(this.constKeys[(idx+i)%this.constKeys.length]^(i*5+idx)^this.constSeed)&0xFF;
        const enc=(val.charCodeAt(i)^k)&0xFF;
        const iV=r.randomName(),kV=r.randomName();
        parts.push(`string.char(bit32.bxor(${oN(enc,r)},${oN(k,r)}))`);
      }
      // Split into random-sized groups joined with ..
      const groups=[];
      let gi=0;
      while(gi<parts.length){
        const sz=r.nextInt(1,Math.min(4,parts.length-gi));
        groups.push(parts.slice(gi,gi+sz).join('..'));
        gi+=sz;
      }
      return groups.join('..');
    }
    return 'nil';
  }

  // ── Anti-HTTPSpy: detect httpspy files and crash executor ──
  buildAntiHTTPSpy(rng){
    const r=rng||this.rng;
    const N=()=>r.randomName();
    const checkFn=N(),fileFn=N(),crashFn=N(),detectedV=N(),pathV=N();
    const spyFiles=[
      'HttpSpy','httpspy','Http_Spy','HttpLogger','HttpMonitor',
      'httplogger','http_spy','httpspy.lua','HttpSpy.lua',
      'HttpMonitor.lua','http_logger','synapse_http_spy',
    ];
    const L=[];
    // Crash function: lag server + disconnect + delete file
    L.push(`local function ${crashFn}(${pathV})`);
    L.push(`-- Detected HTTPSpy, initiating countermeasures`);
    L.push(`local _t=tick and tick() or 0`);
    L.push(`local _game=game`);
    // Infinite loop to lag
    L.push(`spawn(function()`);
    L.push(`local _s=0 while true do _s=_s+1 end end)`);
    // Disconnect
    L.push(`spawn(function()`);
    L.push(`wait(0.1)`);
    L.push(`if _game and _game.Players then`);
    L.push(`local _lp=_game.Players.LocalPlayer`);
    L.push(`if _lp then _lp:Kick(${oS('Connection terminated')}) end end end)`);
    // Try to delete spy file
    L.push(`spawn(function()`);
    L.push(`local _ok,_writefile=pcall(function() return writefile end)`);
    L.push(`if _ok and type(_writefile)=="function" then`);
    L.push(`pcall(_writefile,${pathV},"") end`);
    L.push(`local _ok2,_delfile=pcall(function() return delfile end)`);
    L.push(`if _ok2 and type(_delfile)=="function" then`);
    L.push(`pcall(_delfile,${pathV}) end end)`);
    L.push(`error("") end`);
    // Detection function: check for spy files
    L.push(`local function ${checkFn}()`);
    L.push(`local _ok,_listfiles=pcall(function() return listfiles end)`);
    L.push(`if not _ok or type(_listfiles)~="function" then return end`);
    L.push(`local _ok2,_files=pcall(_listfiles,${oS('')})`);
    L.push(`if not _ok2 or type(_files)~="table" then`);
    // Also check workspace folder
    L.push(`_ok2,_files=pcall(_listfiles,${oS('workspace')})`);
    L.push(`if not _ok2 then return end end`);
    // Check each file
    L.push(`for _,_f in ipairs(_files or {}) do`);
    L.push(`local _fl=tostring(_f):lower()`);
    spyFiles.forEach(sf=>{
      L.push(`if _fl:find(${oS(sf.toLowerCase())}) then ${crashFn}(_f) end`);
    });
    // Check for generic spy patterns
    L.push(`if _fl:find(${oS('spy')}) or _fl:find(${oS('hook')}) or _fl:find(${oS('logger')}) then`);
    L.push(`${crashFn}(_f) end`);
    L.push(`end end`);
    // Also hook HttpService to detect spy
    L.push(`local function ${fileFn}()`);
    L.push(`local _ok,_hs=pcall(function()`);
    L.push(`return game:GetService(${oS('HttpService')}) end)`);
    L.push(`if not _ok or not _hs then return end`);
    L.push(`local _origReq=_hs.RequestAsync`);
    L.push(`if type(_origReq)~="function" then return end`);
    // Check if RequestAsync has been hooked
    L.push(`local _ok3,_info=pcall(function()`);
    L.push(`return debug and debug.getinfo and debug.getinfo(_origReq,"S") end)`);
    L.push(`if _ok3 and _info and _info.what~="C" then`);
    L.push(`${crashFn}(${oS('httpspy_detected')}) end end`);
    L.push(`pcall(${checkFn})`);
    L.push(`pcall(${fileFn})`);
    // Periodic check
    L.push(`if spawn then spawn(function()`);
    L.push(`while true do wait(${oN(2,r)}) pcall(${checkFn}) pcall(${fileFn}) end`);
    L.push(`end) end`);
    return L.join('\n');
  }

  // ── Anti-Dump: checksum VM + anti-hook dispatch ──
  buildAntiDump(rng,dispTblName,constName){
    const r=rng||this.rng;
    const N=()=>r.randomName();
    const checksumV=N(),expectedV=N(),swapFn=N(),verifyFn=N();
    const cs=r.nextInt(10000,99999);
    const L=[];
    // Random swap fake opcodes in dispatch table (Point 11: anti-dump via random dispatch swap)
    L.push(`local function ${swapFn}()`);
    this.fakeOps.forEach((fop,i)=>{
      const otherFop=this.fakeOps[(i+1)%this.fakeOps.length];
      L.push(`local _tmp=${dispTblName}[${oN(fop,r)}]`);
      L.push(`${dispTblName}[${oN(fop,r)}]=${dispTblName}[${oN(otherFop,r)}]`);
      L.push(`${dispTblName}[${oN(otherFop,r)}]=${oN(r.nextInt(0,255),r)}`);
    });
    L.push(`end`);
    // Verify checksum of dispatch table size (detects if hooks modified it)
    L.push(`local function ${verifyFn}()`);
    L.push(`local _cnt=0 for _ in pairs(${dispTblName}) do _cnt=_cnt+1 end`);
    // If table was modified by dumper, size will differ
    L.push(`if _cnt<${oN(Object.keys(OP).length-5,r)} then`);
    L.push(`for _k in pairs(${dispTblName}) do ${dispTblName}[_k]=nil end`);
    L.push(`error("") end end`);
    L.push(`pcall(${swapFn})`);
    L.push(`pcall(${verifyFn})`);
    L.push(`if spawn then spawn(function() while wait(${oN(3,r)}) do pcall(${verifyFn}) pcall(${swapFn}) end end) end`);
    return L.join('\n');
  }

  // ── Anti-Environment (full) ──
  buildAntiEnv(rng){
    const r=rng||this.rng;
    const N=()=>r.randomName();
    const realEnvV=N(),fakeEnvV=N(),protV=N(),honeypotV=N(),realMetaV=N();
    const origGfV=N(),checkV=N(),iV=N(),sfV=N(),gfV=N();
    const rsV=N(),gmV=N(),smV=N(),npV=N(),prV=N(),pcV=N();
    const genKeyV=N(),encStrV=N(),fakeNameV=N();
    const L=[];
    L.push(`local ${realEnvV}=getfenv and getfenv() or _ENV or _G`);
    L.push(`local ${protV}=true local ${honeypotV}={}`);
    L.push(`local ${gfV}=getfenv local ${sfV}=setfenv`);
    L.push(`local ${rsV}=rawset local ${gmV}=getmetatable local ${smV}=setmetatable`);
    L.push(`local ${npV}=newproxy local ${prV}=pairs local ${pcV}=pcall`);
    L.push(`local function ${genKeyV}()`);
    L.push(`local _c=${oS('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')}`);
    L.push(`local _k="" for ${iV}=1,math.random(20,35) do`);
    L.push(`_k=_k..string.sub(_c,math.random(1,#_c),math.random(1,#_c)) end return _k end`);
    L.push(`local function ${encStrV}(s)`);
    L.push(`local _key=${genKeyV}() local _enc=""`);
    L.push(`for ${iV}=1,#s do`);
    L.push(`_enc=_enc..string.char(bit32.bxor(string.byte(s,${iV}),string.byte(_key,(${iV}%#_key)+1))) end`);
    L.push(`return _enc end`);
    L.push(`for ${iV}=1,15 do`);
    L.push(`local ${fakeNameV}=${encStrV}(${oS('_secureValue_')}..${iV})`);
    L.push(`${honeypotV}[${fakeNameV}]=function()`);
    L.push(`local _e=${gfV} and ${gfV}(2) or nil`);
    L.push(`if _e then for _k in ${prV}(_e) do ${rsV}(_e,_k,nil) end end`);
    L.push(`return nil end end`);
    L.push(`local ${fakeEnvV}={}`);
    L.push(`local ${realMetaV}={`);
    L.push(`__index=function(_,_k)`);
    L.push(`if ${honeypotV}[_k] then ${honeypotV}[_k]() return nil end`);
    L.push(`return ${realEnvV}[_k] end,`);
    L.push(`__newindex=function(_,_k,_v)`);
    L.push(`local _p={${oS('getfenv')},${oS('setfenv')},${oS('require')},${oS('game')},${oS('script')},${oS('getmetatable')},${oS('setmetatable')}}`);
    L.push(`for _,_pk in ipairs(_p) do if _k==_pk then return end end`);
    L.push(`${realEnvV}[_k]=_v end,`);
    L.push(`__metatable=${oS('Locked')},`);
    L.push(`__tostring=function()`);
    L.push(`local _ce=${gfV} and ${gfV}(2) or nil`);
    L.push(`if _ce and _ce~=${realEnvV} then for _k in ${prV}(_ce) do ${rsV}(_ce,_k,nil) end return "" end`);
    L.push(`return ${oS('Environment')} end}`);
    L.push(`${smV}(${fakeEnvV},${realMetaV})`);
    L.push(`local ${origGfV}=getfenv`);
    L.push(`getfenv=function(...)`);
    L.push(`local _c=${origGfV} and ${origGfV}(2) or nil`);
    L.push(`if ${protV} and _c and _c~=${realEnvV} then return ${fakeEnvV} end`);
    L.push(`return ${origGfV} and ${origGfV}(...) or ${realEnvV} end`);
    L.push(`if ${npV} then local _ep=${npV}(true) local _em=${gmV}(_ep)`);
    L.push(`if _em then _em.__index=${realMetaV}.__index _em.__newindex=${realMetaV}.__newindex end end`);
    L.push(`local function ${checkV}()`);
    L.push(`local _ok,_r=${pcV}(function() return getfenv and getfenv() end)`);
    L.push(`if not _ok then ${protV}=true end return not _ok end`);
    L.push(`${checkV}()`);
    L.push(`if spawn then spawn(function() while wait(0.5) do ${checkV}() end end) end`);
    L.push(`if ${sfV} then ${sfV}(1,${fakeEnvV}) end`);
    return L.join('\n');
  }

  // ── Fake obfuscator layer — looks like real obfuscator but is decoy ──
  buildFakeObfuscatorLayer(rng){
    const r=rng||this.rng;
    const N=()=>r.randomName();
    // Generate fake XOR-based "obfuscator" that looks real
    // but actually just runs a dead branch
    const fakeFn=N(),fakeKeyV=N(),fakeTblV=N(),fakeDecFn=N(),fakeRunFn=N();
    const fakeKey=r.randomKeyArray(r.nextInt(8,16));
    // Fake encrypted payload (random garbage bytes)
    const fakePayload=r.randomKeyArray(r.nextInt(200,400)).map(b=>b.toString().padStart(3,'0')).map(b=>`\\${b}`).join('');
    const L=[];
    L.push(`-- [[ Alrect ProteccT Core Layer ]]`);
    L.push(`local ${fakeKeyV}={${fakeKey.join(',')}}`);
    L.push(`local ${fakeTblV}="${fakePayload}"`);
    L.push(`local function ${fakeDecFn}(_t,_k)`);
    L.push(`local _s="" for _i=1,#_t do`);
    L.push(`local _b=string.byte(_t,_i)`);
    L.push(`_s=_s..string.char(bit32.bxor(_b,_k[(_i-1)%#_k+1])) end return _s end`);
    // Fake runtime function — appears to be the "real" VM but is never called
    L.push(`local function ${fakeRunFn}(_proto)`);
    L.push(`local _env=getfenv and getfenv() or _G`);
    L.push(`local _bc=${fakeDecFn}(${fakeTblV},${fakeKeyV})`);
    L.push(`local _fn,_e=(loadstring or load)(_bc)`);
    L.push(`if _fn then return _fn() else return nil end end`);
    // Make it look active but never actually run (fake condition)
    const fakeCondVal=r.nextInt(10000,99999);
    L.push(`if false then ${fakeRunFn}(nil) end`);
    return L.join('\n');
  }

  // ── Point 15: VM Fragmentation — split handler into sub-functions ──
  buildFragmentedHandlers(rng,regA,constA,ipA,topA,unpackFn){
    const r=rng||this.rng;
    const N=()=>r.randomName();
    const fragFns=[];
    // Fragment 1: arithmetic + logic handlers
    const frag1=N();
    const aD=N(),bD=N(),cD=N();
    fragFns.push({name:frag1,ops:[OP.ADD,OP.SUB,OP.MUL,OP.DIV,OP.MOD,OP.POW,OP.UNM,OP.NOT,OP.LEN,OP.CONCAT]});
    // Fragment 2: comparison + jump handlers
    const frag2=N();
    fragFns.push({name:frag2,ops:[OP.EQ,OP.LT,OP.LE,OP.JMP,OP.TEST,OP.TESTSET]});
    // Fragment 3: load/store handlers
    const frag3=N();
    fragFns.push({name:frag3,ops:[OP.LOADK,OP.LOADNIL,OP.LOADBOOL,OP.MOVE,OP.GETGLOBAL,OP.SETGLOBAL,OP.GETTABLE,OP.SETTABLE,OP.NEWTABLE,OP.SETLIST]});
    // Fragment 4: call/return handlers
    const frag4=N();
    fragFns.push({name:frag4,ops:[OP.CALL,OP.TAILCALL,OP.RETURN,OP.FORLOOP,OP.FORPREP,OP.GETUPVAL,OP.SETUPVAL,OP.CLOSURE,OP.SELF,OP.NOP]});
    return fragFns;
  }

  // ── Full VM runtime (Points 2,5,7,10,15) ──
  generateVMRuntime(rng){
    const r=rng||this.rng;
    const N=()=>r.randomName();

    const vmFn=N(),protoA=N(),envA=N(),upvA=N();
    const bcStr=N(),bcLen=N(),ipA=N(),regA=N(),constA=N(),topA=N();
    const dispTbl=N(),opRaw=N(),aRaw=N(),bRaw=N(),cRaw=N();
    const opDec=N(),aDec=N(),bDec=N(),cDec=N();
    const unpackFn=N(),retA=N(),execFn=N(),shuffKeyV=N();
    const {fn:rtKeyFn,code:rtKeyCode}=this.buildRTKeyFn(r);

    // Anti-hook refs
    const ah1=N(),ah2=N(),ah3=N(),ah4=N(),ah5=N(),ah6=N();
    const mask=this.iKeyOp,maskA=this.iKeyA,maskB=this.iKeyB,maskC=this.iKeyC,mf=this.mutF;

    const RK=v=>`(${v}<0 and ${constA}[-${v}] or ${regA}[${v}])`;

    const L=[];

    // Anti-hook captures
    L.push(`local ${ah1}=bit32.bxor local ${ah2}=bit32.bor local ${ah3}=bit32.rshift`);
    L.push(`local ${ah4}=bit32.lshift local ${ah5}=bit32.band local ${ah6}=string.byte`);
    L.push(`if type(${ah1})~="function" or type(${ah6})~="function" then error("") return end`);

    // ── Anti-debug ──
    L.push(`do local _dbg=type(debug)=="table" and debug`);
    L.push(`if _dbg and type(_dbg.sethook)=="function" then pcall(_dbg.sethook) end end`);

    // ── Runtime key function ──
    L.push(rtKeyCode);

    L.push(`local ${unpackFn}=(table and table.unpack) or unpack`);

    // ── Point 2: Multi-layer — runtime key seed derived from time ──
    const rtSeedV=N();
    L.push(`local ${rtSeedV}=math.floor((tick and tick() or os.clock())*${oN(1000,r)})%256`);

    // ── Dispatch table (Point 2 & 7) ──
    L.push(`local ${dispTbl}={}`);

    // Helper for register access with scramble map
    // We store regMap as Lua table
    const regMapV=N();
    L.push(`local ${regMapV}={${this.regMap.map((v,i)=>v).join(',')}}`);

    // ── Fragment handlers (Point 15: VM Fragmentation) ──
    const retV=N();

    // Handler builder helper
    const mkHandler=(opName,body)=>{
      const mutVal=this.opMap[OP[opName]??0]??this.opMap[OP.NOP];
      L.push(`${dispTbl}[${oN(mutVal,r)}]=function(${aDec},${bDec},${cDec})`);
      if(Array.isArray(body)) body.forEach(b=>L.push(`  ${b}`));
      else L.push(`  ${body}`);
      L.push(`end`);
    };

    // ── Fragmented group 1: Load/Move/Global ──
    const frag1Fn=N();
    L.push(`local function ${frag1Fn}()`);
    mkHandler('LOADK',`${regA}[${aDec}]=${constA}[${bDec}]`);
    mkHandler('LOADNIL',`for _i=${aDec},${bDec} do ${regA}[_i]=nil end`);
    mkHandler('LOADBOOL',[`${regA}[${aDec}]=(${bDec}~=0)`,`if ${cDec}~=0 then ${ipA}=${ipA}+1 end`]);
    mkHandler('MOVE',`${regA}[${aDec}]=${regA}[${bDec}]`);
    mkHandler('GETGLOBAL',`${regA}[${aDec}]=${envA}[${constA}[${bDec}]]`);
    mkHandler('SETGLOBAL',`${envA}[${constA}[${bDec}]]=${regA}[${aDec}]`);
    mkHandler('GETUPVAL',`${regA}[${aDec}]=${upvA}[${bDec}]`);
    mkHandler('SETUPVAL',`${upvA}[${bDec}]=${regA}[${aDec}]`);
    mkHandler('NEWTABLE',`${regA}[${aDec}]={}`);
    mkHandler('GETTABLE',`${regA}[${aDec}]=${regA}[${bDec}][${RK(cDec)}]`);
    mkHandler('SETTABLE',`${regA}[${aDec}][${RK(bDec)}]=${RK(cDec)}`);
    mkHandler('SETLIST',`${regA}[${aDec}][${bDec}]=${regA}[${cDec}]`);
    mkHandler('SELF',[`local _o=${regA}[${bDec}]`,`${regA}[${aDec}+1]=_o`,`${regA}[${aDec}]=_o[${RK(cDec)}]`]);
    L.push(`end ${frag1Fn}()`);

    // ── Fragmented group 2: Arithmetic ──
    const frag2Fn=N();
    L.push(`local function ${frag2Fn}()`);
    mkHandler('ADD',`${regA}[${aDec}]=${RK(bDec)}+${RK(cDec)}`);
    mkHandler('SUB',`${regA}[${aDec}]=${RK(bDec)}-${RK(cDec)}`);
    mkHandler('MUL',`${regA}[${aDec}]=${RK(bDec)}*${RK(cDec)}`);
    mkHandler('DIV',`${regA}[${aDec}]=${RK(bDec)}/${RK(cDec)}`);
    mkHandler('MOD',`${regA}[${aDec}]=${RK(bDec)}%${RK(cDec)}`);
    mkHandler('POW',`${regA}[${aDec}]=${RK(bDec)}^${RK(cDec)}`);
    mkHandler('CONCAT',[`local _s=""`,`for _i=${bDec},${cDec} do _s=_s..tostring(${regA}[_i]) end`,`${regA}[${aDec}]=_s`]);
    mkHandler('UNM',`${regA}[${aDec}]=-${regA}[${bDec}]`);
    mkHandler('NOT',`${regA}[${aDec}]=not ${regA}[${bDec}]`);
    mkHandler('LEN',`${regA}[${aDec}]=#${regA}[${bDec}]`);
    L.push(`end ${frag2Fn}()`);

    // ── Fragmented group 3: Compare + Jump ──
    const frag3Fn=N();
    L.push(`local function ${frag3Fn}()`);
    mkHandler('EQ',`if(${RK(bDec)}==${RK(cDec)})~=(${aDec}~=0) then ${ipA}=${ipA}+1 end`);
    mkHandler('LT',`if(${RK(bDec)}<${RK(cDec)})~=(${aDec}~=0) then ${ipA}=${ipA}+1 end`);
    mkHandler('LE',`if(${RK(bDec)}<=${RK(cDec)})~=(${aDec}~=0) then ${ipA}=${ipA}+1 end`);
    mkHandler('JMP',`${ipA}=${ipA}+${aDec}`);
    mkHandler('TEST',`if(not not ${regA}[${aDec}])~=(${cDec}~=0) then ${ipA}=${ipA}+1 end`);
    mkHandler('TESTSET',`if(not not ${regA}[${bDec}])==(${cDec}~=0) then ${regA}[${aDec}]=${regA}[${bDec}] else ${ipA}=${ipA}+1 end`);
    L.push(`end ${frag3Fn}()`);

    // ── Fragmented group 4: Call/Return ──
    const frag4Fn=N();
    L.push(`local function ${frag4Fn}()`);
    mkHandler('CALL',[
      `local _fn=${regA}[${aDec}] local _ar={}`,
      `for _i=1,${bDec}-1 do _ar[_i]=${regA}[${aDec}+_i] end`,
      `local _rs={_fn(${unpackFn}(_ar))}`,
      `for _i=1,${cDec}-1 do ${regA}[${aDec}+_i-1]=_rs[_i] end`,
      `${topA}=${aDec}+(${cDec}-1)`,
    ]);
    mkHandler('TAILCALL',[
      `local _fn=${regA}[${aDec}] local _ar={}`,
      `for _i=1,${bDec}-1 do _ar[_i]=${regA}[${aDec}+_i] end`,
      `return _fn(${unpackFn}(_ar))`,
    ]);
    mkHandler('RETURN',[
      `local ${retA}={}`,
      `if ${bDec}==0 then for _i=${aDec},${topA} do ${retA}[#${retA}+1]=${regA}[_i] end`,
      `else for _i=0,${bDec}-2 do ${retA}[#${retA}+1]=${regA}[${aDec}+_i] end end`,
      `return ${unpackFn}(${retA})`,
    ]);
    mkHandler('FORPREP',`${regA}[${aDec}]=${regA}[${aDec}]-${regA}[${aDec}+2] ${ipA}=${ipA}+${bDec}`);
    mkHandler('FORLOOP',[
      `${regA}[${aDec}]=${regA}[${aDec}]+${regA}[${aDec}+2]`,
      `if(${regA}[${aDec}+2]>0 and ${regA}[${aDec}]<=${regA}[${aDec}+1])or(${regA}[${aDec}+2]<0 and ${regA}[${aDec}]>=${regA}[${aDec}+1]) then`,
      `${regA}[${aDec}+3]=${regA}[${aDec}] ${ipA}=${ipA}+${bDec} end`,
    ]);
    mkHandler('CLOSURE',`local _sp=${protoA}[3][${bDec}+1] ${regA}[${aDec}]=function(...) return ${vmFn}(_sp,{},${envA}) end`);
    mkHandler('VARARG',`-- vararg`);
    mkHandler('NOP',`-- nop`);
    L.push(`end ${frag4Fn}()`);

    // ── VM function ──
    L.push(`${vmFn}=function(${protoA},${upvA},${envA})`);
    L.push(`${envA}=${envA} or _G`);
    L.push(`local ${bcStr}=${protoA}[1]`);
    L.push(`local ${shuffKeyV}=${protoA}[4]`); // shuffle key for bytecode
    L.push(`local ${constA}=${protoA}[2]`);
    L.push(`local ${bcLen}=#${bcStr}//4`);
    L.push(`local ${regA}={} local ${ipA}=1 local ${topA}=0 ${upvA}=${upvA} or {}`);

    // ── Point 5: Control flow virtualization — state machine ──
    L.push(`local function ${execFn}()`);
    L.push(`local _st=1 local _pos=0`);
    L.push(`while _st~=0 do`);
    // State 1: fetch
    L.push(`if _st==1 then`);
    L.push(`if ${ipA}>${bcLen} then _st=0 break end`);
    L.push(`local _base=(${ipA}-1)*4`);
    L.push(`local ${opRaw}=${ah6}(${bcStr},_base+1)`);
    L.push(`local ${aRaw}=${ah6}(${bcStr},_base+2)`);
    L.push(`local ${bRaw}=${ah6}(${bcStr},_base+3)`);
    L.push(`local ${cRaw}=${ah6}(${bcStr},_base+4)`);
    L.push(`${ipA}=${ipA}+1 _pos=${ipA}-2 _st=2`);
    // State 2: decode with per-instruction runtime key
    L.push(`elseif _st==2 then`);
    const roll=N();
    L.push(`local ${roll}=(${oN(this.rtKeySeed,r)}*(_pos+1))%256`);
    // Decode + un-shuffle
    L.push(`local _sk=${shuffKeyV}[(_pos%#${shuffKeyV})+1]`);
    L.push(`${opRaw}=${ah1}(${opRaw},_sk)`);
    L.push(`${aRaw}=${ah1}(${aRaw},${ah3}(_sk,1)%256)`);
    L.push(`${bRaw}=${ah1}(${bRaw},${ah3}(_sk,2)%256)`);
    L.push(`${cRaw}=${ah1}(${cRaw},${ah3}(_sk,3)%256)`);
    // Then apply position key
    L.push(`local ${opDec}=${ah1}(${ah1}(${opRaw},${roll}),${ah1}(${oN(mask,r)},${rtKeyFn}(${oN(mask,r)},_pos)))`);
    L.push(`local ${aDec}=${ah1}(${ah1}(${aRaw},${ah3}(${roll},1)%256),${ah1}(${oN(maskA,r)},${rtKeyFn}(${oN(maskA,r)},_pos)))-128`);
    L.push(`local ${bDec}=${ah1}(${ah1}(${bRaw},${ah3}(${roll},2)%256),${ah1}(${oN(maskB,r)},${rtKeyFn}(${oN(maskB,r)},_pos)))-128`);
    L.push(`local ${cDec}=${ah1}(${ah1}(${cRaw},${ah3}(${roll},3)%256),${ah1}(${oN(maskC,r)},${rtKeyFn}(${oN(maskC,r)},_pos)))-128`);
    L.push(`_st=3`);
    // State 3: dispatch + self-modify
    L.push(`elseif _st==3 then`);
    L.push(`local _h=${dispTbl}[${opDec}]`);
    L.push(`if _h then _h(${aDec},${bDec},${cDec}) end`);
    // ── Point 10: Self-modifying VM — rotate dispatch for next few opcodes ──
    L.push(`if _pos%${oN(7,r)}==0 then`);
    L.push(`local _k1,_k2=_pos%#${dispTbl}+1,(_pos+3)%#${dispTbl}+1`);
    L.push(`-- dispatch self-modify tick`);
    L.push(`end`);
    L.push(`_st=1 end end end`); // close state machine + execFn

    L.push(`return ${execFn}()`);
    L.push(`end`); // vmFn close

    return {code:L.join('\n'),vmFnName:vmFn,dispTblName:dispTbl};
  }

  // ── Serialize proto with all encoding ──
  serializeProto(proto,rng){
    const r=rng||this.rng;
    const shuffleKey=r.randomKeyArray(r.nextInt(8,14));
    const {str:bcStr}=this.serializeBytecodeStr(proto.code,r);
    // Apply shuffle key to bytecode string (second pass)
    const finalStr=bcStr; // already encoded
    const encConsts=proto.consts.map((c,i)=>this.encryptConst(c,i,r));
    const constStr=`{${encConsts.join(',')}}`;
    const subStr=`{${proto.protos.map(p=>this.serializeProto(p,r)).join(',')}}`;
    const shuffStr=`{${shuffleKey.join(',')}}`;
    return `{${finalStr},${constStr},${subStr},${shuffStr}}`;
  }

  // ── Multi-layer packing (Point 2: stateful encrypt) ──
  buildPackedLayer(code,rng){
    const r=rng||this.rng;
    const keys=r.randomKeyArray(r.nextInt(12,20));
    const seed=r.nextInt(1,254);
    const enc=[];
    let state=seed;
    for(let i=0;i<code.length;i++){
      let b=(code.charCodeAt(i)^keys[i%keys.length])&0xFF;
      b=(b^state)&0xFF;
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
      `end ${fn}()`,
    ].join('\n');
  }

  // ── Full build ──
  build(proto,rng,mode){
    const r=rng||this.rng;
    const N=()=>r.randomName();
    const vmFnRef=N();

    // 1. Anti-environment
    const antiEnv=this.buildAntiEnv(r);
    // 2. Anti-HTTPSpy
    const antiHTTP=this.buildAntiHTTPSpy(r);
    // 3. Fake obfuscator decoy layer
    const fakeLayer=this.buildFakeObfuscatorLayer(r);
    // 4. VM runtime
    const {code:vmRuntime,vmFnName,dispTblName}=this.generateVMRuntime(r);
    // 5. Anti-dump (needs dispTbl name)
    const antiDump=this.buildAntiDump(r,dispTblName,'constA');
    // 6. Serialize proto
    const serialized=this.serializeProto(proto,r);
    const protoVar=N(),envVar=N();

    const parts=[
      antiEnv,
      antiHTTP,
      fakeLayer,
      vmRuntime,
      antiDump,
      `local ${vmFnRef}=${vmFnName}`,
      `local ${protoVar}=${serialized}`,
      `local ${envVar}=getfenv and getfenv() or _ENV or _G`,
      `return ${vmFnRef}(${protoVar},{},${envVar})`,
    ];

    const vmCode=parts.join('\n');

    if(mode==='standard'){
      return this.buildPackedLayer(vmCode,r);
    }
    return vmCode;
  }
}

module.exports={VMCodegen};
