'use strict';

const { Randomizer } = require('./randomizer');

const OP_NAMES = [
  'LOADK','LOADNIL','LOADBOOL','MOVE','GETGLOBAL','SETGLOBAL',
  'GETTABLE','SETTABLE','ADD','SUB','MUL','DIV','MOD','POW',
  'CONCAT','UNM','NOT','LEN','EQ','LT','LE','JMP','TEST',
  'CALL','RETURN','FORLOOP','FORPREP','CLOSURE','VARARG',
  'NEWTABLE','SETLIST','GETUPVAL','SETUPVAL','SELF',
];

class VMBuilder {
  constructor(rng) {
    this.rng = rng || new Randomizer();
    this.opcodeMap = this._buildOpcodeMap();
  }

  _buildOpcodeMap() {
    const vals = Array.from({ length: OP_NAMES.length }, (_, i) => i + 10);
    this.rng.shuffle(vals);
    const map = {};
    OP_NAMES.forEach((n, i) => { map[n] = vals[i]; });
    return map;
  }

  op(name) { return this.opcodeMap[name]; }

  buildVMRuntime(rng) {
    const r = rng || this.rng;
    const N = () => r.randomName();

    const vmFn     = N(), execFn  = N(), protoA  = N(), upvA   = N(), envA   = N();
    const instrA   = N(), constA  = N(), regA    = N(), ipA    = N(), topA   = N();
    const tmpA     = N(), opA     = N(), aA      = N(), bA     = N(), cA     = N();
    const retA     = N(), upvInner= N(), selfTmp = N();
    const om       = this.opcodeMap;

    const lines = [];
    lines.push(`local ${vmFn}`);
    lines.push(`${vmFn}=function(${protoA},${upvA},${envA})`);
    lines.push(`${envA}=${envA} or _G`);
    lines.push(`local ${instrA}=${protoA}[1]`);
    lines.push(`local ${constA}=${protoA}[2]`);
    lines.push(`local ${regA}={}`);
    lines.push(`local ${ipA}=1`);
    lines.push(`local ${topA}=0`);
    lines.push(`${upvA}=${upvA} or {}`);

    lines.push(`local function ${execFn}()`);
    lines.push(`while true do`);
    lines.push(`local ${tmpA}=${instrA}[${ipA}]`);
    lines.push(`${ipA}=${ipA}+1`);
    lines.push(`local ${opA}=${tmpA}[1]`);
    lines.push(`local ${aA}=${tmpA}[2]`);
    lines.push(`local ${bA}=${tmpA}[3]`);
    lines.push(`local ${cA}=${tmpA}[4]`);

    const RK = (v, r2) => `(${v}<0 and ${constA}[-${v}] or ${r2}[${v}])`;

    lines.push(`if ${opA}==${om.LOADK} then`);
    lines.push(`${regA}[${aA}]=${constA}[${bA}]`);

    lines.push(`elseif ${opA}==${om.LOADNIL} then`);
    lines.push(`for _i=${aA},${bA} do ${regA}[_i]=nil end`);

    lines.push(`elseif ${opA}==${om.LOADBOOL} then`);
    lines.push(`${regA}[${aA}]=(${bA}~=0)`);
    lines.push(`if ${cA}~=0 then ${ipA}=${ipA}+1 end`);

    lines.push(`elseif ${opA}==${om.MOVE} then`);
    lines.push(`${regA}[${aA}]=${regA}[${bA}]`);

    lines.push(`elseif ${opA}==${om.GETUPVAL} then`);
    lines.push(`${regA}[${aA}]=${upvA}[${bA}]`);

    lines.push(`elseif ${opA}==${om.SETUPVAL} then`);
    lines.push(`${upvA}[${bA}]=${regA}[${aA}]`);

    lines.push(`elseif ${opA}==${om.GETGLOBAL} then`);
    lines.push(`${regA}[${aA}]=${envA}[${constA}[${bA}]]`);

    lines.push(`elseif ${opA}==${om.SETGLOBAL} then`);
    lines.push(`${envA}[${constA}[${bA}]]=${regA}[${aA}]`);

    lines.push(`elseif ${opA}==${om.GETTABLE} then`);
    lines.push(`local _t=${regA}[${bA}]`);
    lines.push(`local _k=${RK(cA, regA)}`);
    lines.push(`${regA}[${aA}]=_t[_k]`);

    lines.push(`elseif ${opA}==${om.SETTABLE} then`);
    lines.push(`local _t=${regA}[${aA}]`);
    lines.push(`local _k=${RK(bA, regA)}`);
    lines.push(`local _v=${RK(cA, regA)}`);
    lines.push(`_t[_k]=_v`);

    lines.push(`elseif ${opA}==${om.SELF} then`);
    lines.push(`local _obj=${regA}[${bA}]`);
    lines.push(`${regA}[${aA}+1]=_obj`);
    lines.push(`${regA}[${aA}]=_obj[${RK(cA, regA)}]`);

    lines.push(`elseif ${opA}==${om.ADD} then`);
    lines.push(`${regA}[${aA}]=${RK(bA,regA)}+${RK(cA,regA)}`);

    lines.push(`elseif ${opA}==${om.SUB} then`);
    lines.push(`${regA}[${aA}]=${RK(bA,regA)}-${RK(cA,regA)}`);

    lines.push(`elseif ${opA}==${om.MUL} then`);
    lines.push(`${regA}[${aA}]=${RK(bA,regA)}*${RK(cA,regA)}`);

    lines.push(`elseif ${opA}==${om.DIV} then`);
    lines.push(`${regA}[${aA}]=${RK(bA,regA)}/${RK(cA,regA)}`);

    lines.push(`elseif ${opA}==${om.MOD} then`);
    lines.push(`${regA}[${aA}]=${RK(bA,regA)}%${RK(cA,regA)}`);

    lines.push(`elseif ${opA}==${om.POW} then`);
    lines.push(`${regA}[${aA}]=${RK(bA,regA)}^${RK(cA,regA)}`);

    lines.push(`elseif ${opA}==${om.CONCAT} then`);
    lines.push(`local _s=""`);
    lines.push(`for _i=${bA},${cA} do _s=_s..tostring(${regA}[_i]) end`);
    lines.push(`${regA}[${aA}]=_s`);

    lines.push(`elseif ${opA}==${om.UNM} then`);
    lines.push(`${regA}[${aA}]=-${regA}[${bA}]`);

    lines.push(`elseif ${opA}==${om.NOT} then`);
    lines.push(`${regA}[${aA}]=not ${regA}[${bA}]`);

    lines.push(`elseif ${opA}==${om.LEN} then`);
    lines.push(`${regA}[${aA}]=#${regA}[${bA}]`);

    lines.push(`elseif ${opA}==${om.EQ} then`);
    lines.push(`if (${RK(bA,regA)}==${RK(cA,regA)})~=(${aA}~=0) then ${ipA}=${ipA}+1 end`);

    lines.push(`elseif ${opA}==${om.LT} then`);
    lines.push(`if (${RK(bA,regA)}<${RK(cA,regA)})~=(${aA}~=0) then ${ipA}=${ipA}+1 end`);

    lines.push(`elseif ${opA}==${om.LE} then`);
    lines.push(`if (${RK(bA,regA)}<=${RK(cA,regA)})~=(${aA}~=0) then ${ipA}=${ipA}+1 end`);

    lines.push(`elseif ${opA}==${om.JMP} then`);
    lines.push(`${ipA}=${ipA}+${aA}`);

    lines.push(`elseif ${opA}==${om.TEST} then`);
    lines.push(`if (not not ${regA}[${aA}])~=(${cA}~=0) then ${ipA}=${ipA}+1 end`);

    lines.push(`elseif ${opA}==${om.CALL} then`);
    lines.push(`local _fn=${regA}[${aA}]`);
    lines.push(`local _args={}`);
    lines.push(`for _i=1,${bA}-1 do _args[_i]=${regA}[${aA}+_i] end`);
    lines.push(`local _res={_fn(table.unpack(_args))}`);
    lines.push(`for _i=1,${cA}-1 do ${regA}[${aA}+_i-1]=_res[_i] end`);
    lines.push(`${topA}=${aA}+(${cA}-1)`);

    lines.push(`elseif ${opA}==${om.RETURN} then`);
    lines.push(`local ${retA}={}`);
    lines.push(`if ${bA}==0 then`);
    lines.push(`for _i=${aA},${topA} do ${retA}[#${retA}+1]=${regA}[_i] end`);
    lines.push(`else`);
    lines.push(`for _i=0,${bA}-2 do ${retA}[#${retA}+1]=${regA}[${aA}+_i] end`);
    lines.push(`end`);
    lines.push(`return table.unpack(${retA})`);

    lines.push(`elseif ${opA}==${om.FORPREP} then`);
    lines.push(`${regA}[${aA}]=${regA}[${aA}]-${regA}[${aA}+2]`);
    lines.push(`${ipA}=${ipA}+${bA}`);

    lines.push(`elseif ${opA}==${om.FORLOOP} then`);
    lines.push(`${regA}[${aA}]=${regA}[${aA}]+${regA}[${aA}+2]`);
    lines.push(`if (${regA}[${aA}+2]>0 and ${regA}[${aA}]<=${regA}[${aA}+1]) or (${regA}[${aA}+2]<0 and ${regA}[${aA}]>=${regA}[${aA}+1]) then`);
    lines.push(`${regA}[${aA}+3]=${regA}[${aA}]`);
    lines.push(`${ipA}=${ipA}+${bA}`);
    lines.push(`end`);

    lines.push(`elseif ${opA}==${om.NEWTABLE} then`);
    lines.push(`${regA}[${aA}]={}`);

    lines.push(`elseif ${opA}==${om.SETLIST} then`);
    lines.push(`local _t=${regA}[${aA}]`);
    lines.push(`for _i=1,${bA} do _t[_i+(${cA}-1)*50]=${regA}[${aA}+_i] end`);

    lines.push(`elseif ${opA}==${om.CLOSURE} then`);
    lines.push(`local _subp=${protoA}[3][${bA}]`);
    lines.push(`${regA}[${aA}]=function(...)`);
    lines.push(`local _ar={...} local _sr={}`);
    lines.push(`for _i,_v in ipairs(_ar) do _sr[_i-1]=_v end`);
    lines.push(`return ${vmFn}(_subp,${upvA},${envA})`);
    lines.push(`end`);

    lines.push(`elseif ${opA}==${om.VARARG} then`);
    lines.push(`end`);
    lines.push(`end`);
    lines.push(`end`);
    lines.push(`return ${execFn}()`);
    lines.push(`end`);

    return { code: lines.join('\n'), vmFnName: vmFn };
  }

  buildEncryptedConstantPool(constants, rng) {
    const r = rng || this.rng;
    const poolVar = r.randomName();
    const decFn   = r.randomName();
    const keys    = r.randomKeyArray(r.nextInt(8, 20));

    const encrypted = constants.map((c, idx) => {
      if (typeof c === 'string') {
        const bytes = [];
        for (let i = 0; i < c.length; i++) {
          bytes.push((c.charCodeAt(i) ^ keys[(idx + i) % keys.length]) & 0xFF);
        }
        return { type: 's', bytes };
      }
      return { type: 'n', val: c };
    });

    const iV = r.randomName(), sV = r.randomName(), jV = r.randomName(), kV = r.randomName();
    const decCode = [
      `local function ${decFn}(${iV},${kV})`,
      `local ${sV}=""`,
      `for ${jV}=1,#${iV} do`,
      `${sV}=${sV}..string.char(${iV}[${jV}]~${kV}[((${jV}+${iV}[1])%#${kV})+1])`,
      `end`,
      `return ${sV}`,
      `end`,
    ].join('\n');

    const poolEntries = encrypted.map((e, idx) => {
      if (e.type === 'n') return String(e.val);
      return `${decFn}({${e.bytes.join(',')}},{${keys.join(',')}})`;
    });

    const poolCode = `local ${poolVar}={${poolEntries.join(',')}}`;

    return { decCode, poolCode, poolVar };
  }

  wrapInVM(luaSource, rng) {
    const r = rng || this.rng;
    const { code: vmCode, vmFnName } = this.buildVMRuntime(r);

    const keys1 = r.randomKeyArray(r.nextInt(12, 24));
    const keys2 = r.randomKeyArray(r.nextInt(8, 16));
    const encrypted = [];
    for (let i = 0; i < luaSource.length; i++) {
      encrypted.push((luaSource.charCodeAt(i) ^ keys1[i % keys1.length] ^ keys2[i % keys2.length]) & 0xFF);
    }

    const decFn   = r.randomName();
    const k1V     = r.randomName();
    const k2V     = r.randomName();
    const payV    = r.randomName();
    const iV      = r.randomName();
    const sV      = r.randomName();
    const fnV     = r.randomName();
    const errV    = r.randomName();

    const lines = [];
    lines.push(vmCode);
    lines.push(`local function ${decFn}(${payV},${k1V},${k2V})`);
    lines.push(`local ${sV}=""`);
    lines.push(`for ${iV}=1,#${payV} do`);
    lines.push(`${sV}=${sV}..string.char(${payV}[${iV}]~${k1V}[((${iV}-1)%#${k1V})+1]~${k2V}[((${iV}-1)%#${k2V})+1])`);
    lines.push(`end`);
    lines.push(`return ${sV}`);
    lines.push(`end`);
    lines.push(`local ${k1V}={${keys1.join(',')}}`);
    lines.push(`local ${k2V}={${keys2.join(',')}}`);
    lines.push(`local ${fnV},${errV}=load(${decFn}({${encrypted.join(',')}},${k1V},${k2V}))`);
    lines.push(`if ${fnV} then return ${fnV}() else error(tostring(${errV})) end`);

    return lines.join('\n');
  }

  buildMiniVM(snippet, rng) {
    const r = rng || this.rng;
    const keys = r.randomKeyArray(r.nextInt(6, 14));
    const encrypted = [];
    for (let i = 0; i < snippet.length; i++) {
      encrypted.push((snippet.charCodeAt(i) ^ keys[i % keys.length]) & 0xFF);
    }
    const fn  = r.randomName();
    const kV  = r.randomName();
    const eV  = r.randomName();
    const iV  = r.randomName();
    const sV  = r.randomName();
    const fV  = r.randomName();
    const erV = r.randomName();
    return [
      `local function ${fn}(${eV},${kV})`,
      `local ${sV}=""`,
      `for ${iV}=1,#${eV} do ${sV}=${sV}..string.char(${eV}[${iV}]~${kV}[((${iV}-1)%#${kV})+1]) end`,
      `local ${fV},${erV}=load(${sV})`,
      `return ${fV} and ${fV}() or error(${erV})`,
      `end`,
      `${fn}({${encrypted.join(',')}},{${keys.join(',')}})`,
    ].join('\n');
  }
}

module.exports = { VMBuilder };
