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
    this.opMap=this._buildOpMap();
    this.iKeyOp=this.rng.nextInt(1,254);
    this.iKeyA=this.rng.nextInt(1,254);
    this.iKeyB=this.rng.nextInt(1,254);
    this.iKeyC=this.rng.nextInt(1,254);
    this.mutF=this.rng.nextInt(1,13);
    this.rtKeySeed=this.rng.nextInt(1,254);
    this.rtKeyMul=this.rng.nextInt(3,37);
    this.rtKeyXor=this.rng.nextInt(1,254);
    this.constKeys=this.rng.randomKeyArray(this.rng.nextInt(14,24));
    this.constSeed=this.rng.nextInt(1,254);
    this.regMap=this._buildRegMap();
    this.fakeOps=this._buildFakeOps();
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
    const regs=Array.from({length:64},(_,i)=>i);
    this.rng.shuffle(regs);
    return regs;
  }

  _buildFakeOps(){
    const f=[];
    for(let i=0;i<8;i++)f.push(this.rng.nextInt(200,254));
    return f;
  }

  buildRTKeyFn(rng){
    const r=rng||this.rng;
    const fn=r.randomName(),pV=r.randomName(),sV=r.randomName();
    const mul=this.rtKeyMul,xk=this.rtKeyXor;
    return {
      fn,
      code:`local function ${fn}(${pV},${sV}) return bit32.bxor((${pV}*${oN(mul,r)}+${sV})%256,${oN(xk,r)}) end`
    };
  }

  encodeInstr(op,a,b,c,pos){
    const mk=(k,p)=>(((k^(p*this.mutF))&0xFF)||1);
    const roll=(this.rtKeySeed*(pos+1))&0xFF;
    const encOp=(((this.opMap[op]||0)^mk(this.iKeyOp,pos))^(pos&0xFF)^roll)&0xFF;
    const encA=(((a+128)&0xFF)^mk(this.iKeyA,pos)^((roll>>1)&0xFF))&0xFF;
    const encB=(((b+128)&0xFF)^mk(this.iKeyB,pos)^((roll>>2)&0xFF))&0xFF;
    const encC=(((c+128)&0xFF)^mk(this.iKeyC,pos)^((roll>>3)&0xFF))&0xFF;
    return [encOp,encA,encB,encC];
  }

  serializeBytecodeStr(instrs,rng){
    const r=rng||this.rng;
    const bytes=[];
    const fakeRate=r.nextInt(5,10);
    for(let i=0;i<instrs.length;i++){
      if(i>0&&i%fakeRate===0){
        this.encodeInstr(OP.NOP,r.nextInt(0,3),r.nextInt(0,3),r.nextInt(0,3),bytes.length/4).forEach(b=>bytes.push(b));
      }
      const{op,a,b,c}=instrs[i];
      this.encodeInstr(op,a,b,c,bytes.length/4).forEach(b=>bytes.push(b));
    }
    const shuffleKey=r.randomKeyArray(r.nextInt(8,14));
    const shuffled=bytes.map((b,i)=>(b^shuffleKey[i%shuffleKey.length])&0xFF);
    let s='"';
    for(const b of shuffled)s+=`\\${b.toString().padStart(3,'0')}`;
    return {str:s+'"',shuffleKey};
  }

  encryptConst(val,idx,rng){
    const r=rng||this.rng;
    if(typeof val==='number'){
      const k=(this.constKeys[idx%this.constKeys.length]^(idx*7)^this.constSeed)&0xFF;
      const enc=(Math.floor(Math.abs(val))^k)&0xFFFFFF;
      const sign=val<0?'-':'';
      return `${sign}bit32.bxor(${oN(enc,r)},${oN(k,r)})`;
    }
    if(typeof val==='string'){
      const parts=[];
      for(let i=0;i<val.length;i++){
        const k=(this.constKeys[(idx+i)%this.constKeys.length]^(i*5+idx)^this.constSeed)&0xFF;
        const enc=(val.charCodeAt(i)^k)&0xFF;
        parts.push(`string.char(bit32.bxor(${oN(enc,r)},${oN(k,r)}))`);
      }
      const groups=[];let gi=0;
      while(gi<parts.length){
        const sz=r.nextInt(1,Math.min(4,parts.length-gi));
        groups.push(parts.slice(gi,gi+sz).join('..'));
        gi+=sz;
      }
      return groups.join('..');
    }
    return 'nil';
  }

  // ── FIXED Anti-HTTPSpy: NO infinite loop unless spy is actually detected ──
  buildAntiHTTPSpy(rng){
    const r=rng||this.rng;
    const N=()=>r.randomName();
    const checkFn=N(),crashFn=N(),pathV=N(),spyHookFn=N();
    const spyFiles=[
      'HttpSpy','httpspy','Http_Spy','HttpLogger','HttpMonitor',
      'httplogger','http_spy','HttpSpy.lua','HttpMonitor.lua',
      'http_logger','synapse_http_spy','synapse_spy',
    ];
    const L=[];

    // Crash function — only runs when spy IS detected
    // NO infinite loop — instead: corrupt env + kick + task.wait abuse
    L.push(`local function ${crashFn}(${pathV})`);
    L.push(`local _g=game local _lp`);
    L.push(`pcall(function() _lp=_g.Players.LocalPlayer end)`);
    // Kick player
    L.push(`if _lp then pcall(function() _lp:Kick(${oS('Script protection triggered')}) end) end`);
    // Overwrite spy file content with garbage
    L.push(`pcall(function()`);
    L.push(`if writefile then writefile(tostring(${pathV}),${oS('--corrupted')}) end`);
    L.push(`if delfile then delfile(tostring(${pathV})) end`);
    L.push(`end)`);
    // task.delay crash (not infinite loop - just delayed error)
    L.push(`if task then task.delay(0,function() error(${oS('')}) end)`);
    L.push(`else spawn(function() error(${oS('')}) end) end`);
    L.push(`end`);

    // Check files — runs ONCE at startup, NOT in a loop
    L.push(`local function ${checkFn}()`);
    L.push(`local _ok,_lf=pcall(function() return listfiles end)`);
    L.push(`if not _ok or type(_lf)~="function" then return end`);
    L.push(`local _ok2,_files=pcall(_lf,${oS('')})`);
    L.push(`if not _ok2 then _ok2,_files=pcall(_lf,${oS('.')}) end`);
    L.push(`if not _ok2 or type(_files)~="table" then return end`);
    L.push(`for _,_f in ipairs(_files) do`);
    L.push(`local _fl=tostring(_f):lower()`);
    spyFiles.forEach(sf=>{
      L.push(`if _fl:find(${oS(sf.toLowerCase())},1,true) then ${crashFn}(_f) return end`);
    });
    L.push(`if _fl:find(${oS('spy')},1,true) and _fl:find(${oS('http')},1,true) then`);
    L.push(`${crashFn}(_f) return end`);
    L.push(`end end`);

    // Hook HttpService.RequestAsync to detect spy hooking it
    L.push(`local function ${spyHookFn}()`);
    L.push(`local _ok,_hs=pcall(function() return game:GetService(${oS('HttpService')}) end)`);
    L.push(`if not _ok or not _hs then return end`);
    L.push(`local _ok2,_req=pcall(function() return _hs.RequestAsync end)`);
    L.push(`if not _ok2 or type(_req)~="function" then return end`);
    // Check if function was hooked (not a C function)
    L.push(`local _ok3,_info=pcall(function()`);
    L.push(`return debug and debug.getinfo and debug.getinfo(_req,${oS('S')}) end)`);
    L.push(`if _ok3 and _info and type(_info)=="table" then`);
    L.push(`if _info.what~=${oS('C')} then ${crashFn}(${oS('httpspy_hook')}) end end end`);

    // Run checks ONCE — no periodic loop
    L.push(`pcall(${checkFn})`);
    L.push(`pcall(${spyHookFn})`);

    // Periodic check with task.delay (NOT while true) — checks every 30s, lightweight
    L.push(`if task then`);
    L.push(`local function _schedCheck()`);
    L.push(`task.delay(30,function() pcall(${checkFn}) _schedCheck() end)`);
    L.push(`end _schedCheck()`);
    L.push(`elseif spawn then`);
    L.push(`spawn(function()`);
    L.push(`while wait(30) do pcall(${checkFn}) end`); // wait(30) not wait(0.5) — no fps hit
    L.push(`end) end`);

    return L.join('\n');
  }

  // ── Anti-Dump: checksum + dispatch verification ──
  buildAntiDump(rng,dispTblName){
    const r=rng||this.rng;
    const N=()=>r.randomName();
    const verifyFn=N(),swapFn=N();
    const expectedSize=Object.keys(OP).length;
    const L=[];
    // Swap fake opcodes to confuse dump (safe — only fake keys)
    L.push(`local function ${swapFn}()`);
    this.fakeOps.slice(0,4).forEach((fop,i)=>{
      const nxtFop=this.fakeOps[(i+1)%this.fakeOps.length];
      L.push(`local _t=${dispTblName}[${oN(fop,r)}]`);
      L.push(`${dispTblName}[${oN(fop,r)}]=${dispTblName}[${oN(nxtFop,r)}]`);
      L.push(`${dispTblName}[${oN(nxtFop,r)}]=_t`);
    });
    L.push(`end`);
    // Verify dispatch table integrity
    L.push(`local function ${verifyFn}()`);
    L.push(`local _cnt=0 for _ in pairs(${dispTblName}) do _cnt=_cnt+1 end`);
    L.push(`if _cnt<${oN(expectedSize-5,r)} then`);
    // Table was modified — wipe it (script stops working = anti-dump)
    L.push(`for _k in pairs(${dispTblName}) do ${dispTblName}[_k]=nil end`);
    L.push(`end end`);
    L.push(`pcall(${swapFn})`);
    L.push(`pcall(${verifyFn})`);
    // Periodic with delay not tight loop
    L.push(`if task then task.delay(${oN(10,r)},function() pcall(${verifyFn}) pcall(${swapFn}) end)`);
    L.push(`end`);
    return L.join('\n');
  }

  // ── Anti-Environment ──
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
    L.push(`for ${iV}=1,10 do`);
    L.push(`local ${fakeNameV}=${encStrV}(${oS('_sv_')}..${iV})`);
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
    L.push(`__tostring=function() return ${oS('table')} end}`);
    L.push(`${smV}(${fakeEnvV},${realMetaV})`);
    L.push(`local ${origGfV}=getfenv`);
    L.push(`getfenv=function(...)`);
    L.push(`local _c=${origGfV} and ${origGfV}(2) or nil`);
    L.push(`if ${protV} and _c and _c~=${realEnvV} then return ${fakeEnvV} end`);
    L.push(`return ${origGfV} and ${origGfV}(...) or ${realEnvV} end`);
    L.push(`if ${npV} then local _ep=${npV}(true) local _em=${gmV}(_ep)`);
    L.push(`if _em then _em.__index=${realMetaV}.__index _em.__newindex=${realMetaV}.__newindex end end`);
    // Periodic env check — task.delay, not while loop
    L.push(`local function ${checkV}() local _ok=${pcV}(function() return getfenv and getfenv() end)`);
    L.push(`if not _ok then ${protV}=true end end`);
    L.push(`${checkV}()`);
    L.push(`if task then task.delay(${oN(5,r)},function() ${checkV}() end) end`);
    L.push(`if ${sfV} then pcall(${sfV},1,${fakeEnvV}) end`);
    return L.join('\n');
  }

  // ── Fake obfuscator decoy (confuse skidders) ──
  buildFakeObfLayer(rng){
    const r=rng||this.rng;
    const N=()=>r.randomName();
    const fakeFn=N(),fakeKeyV=N(),fakeTblV=N(),fakeDecFn=N(),fakeRunFn=N();
    const fakeKey=r.randomKeyArray(r.nextInt(8,16));
    // Fake "encrypted" payload — random bytes that decrypt to garbage
    const fakeBytes=r.randomKeyArray(r.nextInt(150,300));
    const fakePayload='"'+fakeBytes.map(b=>`\\${b.toString().padStart(3,'0')}`).join('')+'"';
    const L=[];
    L.push(`-- [[ ProteccT Core Runtime ]]`);
    L.push(`local ${fakeKeyV}={${fakeKey.join(',')}}`);
    L.push(`local ${fakeTblV}=${fakePayload}`);
    L.push(`local function ${fakeDecFn}(_t,_k)`);
    L.push(`local _s="" for _i=1,#_t do`);
    L.push(`_s=_s..string.char(bit32.bxor(string.byte(_t,_i),_k[(_i-1)%#_k+1])) end return _s end`);
    L.push(`local function ${fakeRunFn}(_p)`);
    L.push(`local _e=getfenv and getfenv() or _G`);
    L.push(`local _bc=${fakeDecFn}(${fakeTblV},${fakeKeyV})`);
    L.push(`local _f,_e2=(loadstring or load)(_bc)`);
    L.push(`if _f then return _f() end return nil end`);
    // Fake call — dead branch, never runs
    const deadVal=r.nextInt(10000,99999);
    L.push(`if (${oN(deadVal,r)})~=${oN(deadVal,r)} then ${fakeRunFn}(nil) end`);
    return L.join('\n');
  }

  // ── Full VM Runtime ──
  generateVMRuntime(rng){
    const r=rng||this.rng;
    const N=()=>r.randomName();

    const vmFn=N(),protoA=N(),envA=N(),upvA=N();
    const bcStr=N(),bcLen=N(),ipA=N(),regA=N(),constA=N(),topA=N();
    const dispTbl=N(),opRaw=N(),aRaw=N(),bRaw=N(),cRaw=N();
    const opDec=N(),aDec=N(),bDec=N(),cDec=N();
    const unpackFn=N(),retA=N(),execFn=N(),shuffKeyV=N();
    const{fn:rtKeyFn,code:rtKeyCode}=this.buildRTKeyFn(r);
    const ah1=N(),ah2=N(),ah3=N(),ah4=N(),ah5=N(),ah6=N();
    const mask=this.iKeyOp,maskA=this.iKeyA,maskB=this.iKeyB,maskC=this.iKeyC,mf=this.mutF;
    const RK=v=>`(${v}<0 and ${constA}[-${v}] or ${regA}[${v}])`;
    const L=[];

    // Anti-hook captures
    L.push(`local ${ah1}=bit32.bxor local ${ah2}=bit32.bor local ${ah3}=bit32.rshift`);
    L.push(`local ${ah4}=bit32.lshift local ${ah5}=bit32.band local ${ah6}=string.byte`);
    L.push(`if type(${ah1})~="function" or type(${ah6})~="function" then error("") return end`);
    // Anti-debug (lightweight)
    L.push(`do local _d=type(debug)=="table" and debug`);
    L.push(`if _d and type(_d.sethook)=="function" then pcall(_d.sethook) end end`);

    L.push(rtKeyCode);
    L.push(`local ${unpackFn}=(table and table.unpack) or unpack`);
    const rtSeedV=N();
    L.push(`local ${rtSeedV}=math.floor((tick and tick() or os.clock())*1000)%256`);

    // Dispatch table
    L.push(`local ${dispTbl}={}`);
    L.push(`local ${vmFn}`);

    // ── Fragmented handlers ──
    const mkH=(opName,body)=>{
      const opKey=OP[opName];
      if(opKey===undefined)return;
      const mutVal=this.opMap[opKey];
      L.push(`${dispTbl}[${oN(mutVal,r)}]=function(${aDec},${bDec},${cDec})`);
      (Array.isArray(body)?body:[body]).forEach(b=>L.push(`  ${b}`));
      L.push(`end`);
    };

    const frag1=N();
    L.push(`local function ${frag1}()`);
    mkH('LOADK',`${regA}[${aDec}]=${constA}[${bDec}]`);
    mkH('LOADNIL',`for _i=${aDec},${bDec} do ${regA}[_i]=nil end`);
    mkH('LOADBOOL',[`${regA}[${aDec}]=(${bDec}~=0)`,`if ${cDec}~=0 then ${ipA}=${ipA}+1 end`]);
    mkH('MOVE',`${regA}[${aDec}]=${regA}[${bDec}]`);
    mkH('GETGLOBAL',`${regA}[${aDec}]=${envA}[${constA}[${bDec}]]`);
    mkH('SETGLOBAL',`${envA}[${constA}[${bDec}]]=${regA}[${aDec}]`);
    mkH('GETUPVAL',`${regA}[${aDec}]=${upvA}[${bDec}]`);
    mkH('SETUPVAL',`${upvA}[${bDec}]=${regA}[${aDec}]`);
    mkH('NEWTABLE',`${regA}[${aDec}]={}`);
    mkH('GETTABLE',`${regA}[${aDec}]=${regA}[${bDec}] and ${regA}[${bDec}][${RK(cDec)}] or nil`);
    mkH('SETTABLE',`if ${regA}[${aDec}] then ${regA}[${aDec}][${RK(bDec)}]=${RK(cDec)} end`);
    mkH('SETLIST',`if ${regA}[${aDec}] then ${regA}[${aDec}][${bDec}]=${regA}[${cDec}] end`);
    mkH('SELF',[`local _o=${regA}[${bDec}]`,`if _o then ${regA}[${aDec}+1]=_o ${regA}[${aDec}]=_o[${RK(cDec)}] end`]);
    L.push(`end ${frag1}()`);

    const frag2=N();
    L.push(`local function ${frag2}()`);
    mkH('ADD',`${regA}[${aDec}]=${RK(bDec)}+${RK(cDec)}`);
    mkH('SUB',`${regA}[${aDec}]=${RK(bDec)}-${RK(cDec)}`);
    mkH('MUL',`${regA}[${aDec}]=${RK(bDec)}*${RK(cDec)}`);
    mkH('DIV',`${regA}[${aDec}]=${RK(bDec)}/${RK(cDec)}`);
    mkH('MOD',`${regA}[${aDec}]=${RK(bDec)}%${RK(cDec)}`);
    mkH('POW',`${regA}[${aDec}]=${RK(bDec)}^${RK(cDec)}`);
    mkH('CONCAT',[`local _s=""`,`for _i=${bDec},${cDec} do _s=_s..tostring(${regA}[_i] or "") end`,`${regA}[${aDec}]=_s`]);
    mkH('UNM',`${regA}[${aDec}]=-${regA}[${bDec}]`);
    mkH('NOT',`${regA}[${aDec}]=not ${regA}[${bDec}]`);
    mkH('LEN',`if ${regA}[${bDec}]~=nil then ${regA}[${aDec}]=#${regA}[${bDec}] end`);
    L.push(`end ${frag2}()`);

    const frag3=N();
    L.push(`local function ${frag3}()`);
    mkH('EQ',`if(${RK(bDec)}==${RK(cDec)})~=(${aDec}~=0) then ${ipA}=${ipA}+1 end`);
    mkH('LT',`if(${RK(bDec)}<${RK(cDec)})~=(${aDec}~=0) then ${ipA}=${ipA}+1 end`);
    mkH('LE',`if(${RK(bDec)}<=${RK(cDec)})~=(${aDec}~=0) then ${ipA}=${ipA}+1 end`);
    mkH('JMP',`${ipA}=${ipA}+${aDec}`);
    mkH('TEST',`if(not not ${regA}[${aDec}])~=(${cDec}~=0) then ${ipA}=${ipA}+1 end`);
    mkH('TESTSET',`if(not not ${regA}[${bDec}])==(${cDec}~=0) then ${regA}[${aDec}]=${regA}[${bDec}] else ${ipA}=${ipA}+1 end`);
    L.push(`end ${frag3}()`);

    const frag4=N();
    L.push(`local function ${frag4}()`);
    mkH('CALL',[
      `local _fn=${regA}[${aDec}]`,
      `if type(_fn)~="function" then return end`,
      `local _ar={} for _i=1,${bDec}-1 do _ar[_i]=${regA}[${aDec}+_i] end`,
      `local _rs={_fn(${unpackFn}(_ar))}`,
      `for _i=1,${cDec}-1 do ${regA}[${aDec}+_i-1]=_rs[_i] end`,
      `${topA}=${aDec}+(${cDec}-1)`,
    ]);
    mkH('TAILCALL',[
      `local _fn=${regA}[${aDec}]`,
      `if type(_fn)~="function" then return end`,
      `local _ar={} for _i=1,${bDec}-1 do _ar[_i]=${regA}[${aDec}+_i] end`,
      `return _fn(${unpackFn}(_ar))`,
    ]);
    mkH('RETURN',[
      `local ${retA}={}`,
      `if ${bDec}==0 then for _i=${aDec},${topA} do ${retA}[#${retA}+1]=${regA}[_i] end`,
      `else for _i=0,${bDec}-2 do ${retA}[#${retA}+1]=${regA}[${aDec}+_i] end end`,
      `return ${unpackFn}(${retA})`,
    ]);
    mkH('FORPREP',`${regA}[${aDec}]=${regA}[${aDec}]-${regA}[${aDec}+2] ${ipA}=${ipA}+${bDec}`);
    mkH('FORLOOP',[
      `${regA}[${aDec}]=${regA}[${aDec}]+${regA}[${aDec}+2]`,
      `if(${regA}[${aDec}+2]>0 and ${regA}[${aDec}]<=${regA}[${aDec}+1])or(${regA}[${aDec}+2]<0 and ${regA}[${aDec}]>=${regA}[${aDec}+1]) then`,
      `${regA}[${aDec}+3]=${regA}[${aDec}] ${ipA}=${ipA}+${bDec} end`,
    ]);
    mkH('CLOSURE',`local _sp=${protoA}[3][${bDec}+1] if _sp then ${regA}[${aDec}]=function(...) return ${vmFn}(_sp,{},${envA}) end end`);
    mkH('VARARG',`-- vararg`);
    mkH('NOP',`-- nop`);
    L.push(`end ${frag4}()`);

    // VM function
    L.push(`${vmFn}=function(${protoA},${upvA},${envA})`);
    L.push(`${envA}=${envA} or _G`);
    L.push(`local ${bcStr}=${protoA}[1]`);
    L.push(`local ${shuffKeyV}=${protoA}[4]`);
    L.push(`local ${constA}=${protoA}[2]`);
    L.push(`local ${bcLen}=math.floor(#${bcStr}/4)`);
    L.push(`local ${regA}={} local ${ipA}=1 local ${topA}=0`);
    L.push(`${upvA}=${upvA} or {}`);

    // State machine execution loop
    L.push(`local function ${execFn}()`);
    L.push(`local _st=1 local _pos=0`);
    L.push(`local _opRaw,_aRaw,_bRaw,_cRaw,_opD,_aD,_bD,_cD`);
    L.push(`while _st~=0 do`);
    // State 1: Fetch
    L.push(`if _st==1 then`);
    L.push(`if ${ipA}>${bcLen} then _st=0 break end`);
    L.push(`local _base=(${ipA}-1)*4`);
    L.push(`_opRaw=${ah6}(${bcStr},_base+1) or 0`);
    L.push(`_aRaw=${ah6}(${bcStr},_base+2) or 0`);
    L.push(`_bRaw=${ah6}(${bcStr},_base+3) or 0`);
    L.push(`_cRaw=${ah6}(${bcStr},_base+4) or 0`);
    L.push(`${ipA}=${ipA}+1 _pos=${ipA}-2 _st=2`);
    // State 2: Decode
    L.push(`elseif _st==2 then`);
    const rollV=N();
    L.push(`local ${rollV}=(${oN(this.rtKeySeed,r)}*(_pos+1))%256`);
    L.push(`local _sk=(${shuffKeyV} and ${shuffKeyV}[(_pos%#${shuffKeyV})+1]) or 0`);
    // Un-shuffle + un-position-key
    L.push(`_opD=${ah1}(${ah1}(_opRaw,_sk),${ah1}(${rollV},${rtKeyFn}(${oN(mask,r)},_pos)))`);
    L.push(`_aD=${ah1}(${ah1}(_aRaw,${ah3}(_sk,1)%256),${ah1}(${ah3}(${rollV},1)%256,${rtKeyFn}(${oN(maskA,r)},_pos)))-(${oN(128,r)})`);
    L.push(`_bD=${ah1}(${ah1}(_bRaw,${ah3}(_sk,2)%256),${ah1}(${ah3}(${rollV},2)%256,${rtKeyFn}(${oN(maskB,r)},_pos)))-(${oN(128,r)})`);
    L.push(`_cD=${ah1}(${ah1}(_cRaw,${ah3}(_sk,3)%256),${ah1}(${ah3}(${rollV},3)%256,${rtKeyFn}(${oN(maskC,r)},_pos)))-(${oN(128,r)})`);
    L.push(`_st=3`);
    // State 3: Dispatch
    L.push(`elseif _st==3 then`);
    L.push(`local _h=${dispTbl}[_opD]`);
    L.push(`if type(_h)=="function" then _h(_aD,_bD,_cD) end`);
    L.push(`_st=1 end end end`); // close state machine + execFn

    L.push(`return ${execFn}()`);
    L.push(`end`); // vmFn

    return{code:L.join('\n'),vmFnName:vmFn,dispTblName:dispTbl};
  }

  serializeProto(proto,rng){
    const r=rng||this.rng;
    const{str:bcStr,shuffleKey}=this.serializeBytecodeStr(proto.code,r);
    const encConsts=proto.consts.map((c,i)=>this.encryptConst(c,i,r));
    const constStr=`{${encConsts.join(',')}}`;
    const subStr=`{${proto.protos.map(p=>this.serializeProto(p,r)).join(',')}}`;
    const shuffStr=`{${shuffleKey.join(',')}}`;
    return `{${bcStr},${constStr},${subStr},${shuffStr}}`;
  }

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

  build(proto,rng,mode){
    const r=rng||this.rng;
    const N=()=>r.randomName();

    const antiEnv=this.buildAntiEnv(r);
    const antiHTTP=this.buildAntiHTTPSpy(r);
    const fakeLayer=this.buildFakeObfLayer(r);
    const{code:vmRuntime,vmFnName,dispTblName}=this.generateVMRuntime(r);
    const antiDump=this.buildAntiDump(r,dispTblName);
    const serialized=this.serializeProto(proto,r);
    const protoVar=N(),envVar=N();

    const parts=[
      antiEnv,
      antiHTTP,
      fakeLayer,
      vmRuntime,
      antiDump,
      `local ${protoVar}=${serialized}`,
      `local ${envVar}=getfenv and getfenv() or _ENV or _G`,
      `return ${vmFnName}(${protoVar},{},${envVar})`,
    ];

    const vmCode=parts.join('\n');
    if(mode==='standard'){
      return this.buildPackedLayer(vmCode,r);
    }
    return vmCode;
  }
}

module.exports={VMCodegen};
