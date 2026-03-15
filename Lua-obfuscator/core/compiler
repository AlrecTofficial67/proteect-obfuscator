'use strict';

// ── Opcodes (internal names, values assigned randomly per build) ──
const OP = {
  LOADK:0, LOADNIL:1, LOADBOOL:2, MOVE:3,
  GETGLOBAL:4, SETGLOBAL:5, GETTABLE:6, SETTABLE:7,
  NEWTABLE:8, SETLIST:9,
  ADD:10, SUB:11, MUL:12, DIV:13, MOD:14, POW:15,
  UNM:16, NOT:17, LEN:18,
  CONCAT:19,
  EQ:20, LT:21, LE:22,
  JMP:23, TEST:24, TESTSET:25,
  CALL:26, TAILCALL:27, RETURN:28,
  FORLOOP:29, FORPREP:30,
  GETUPVAL:31, SETUPVAL:32, CLOSURE:33, VARARG:34,
  SELF:35,
};

// ── Token types ──
const TK = {
  NAME:'NAME', NUMBER:'NUMBER', STRING:'STRING',
  PLUS:'+', MINUS:'-', STAR:'*', SLASH:'/', PERCENT:'%', CARET:'^',
  HASH:'#', EQ:'==', NEQ:'~=', LT:'<', GT:'>', LE:'<=', GE:'>=',
  ASSIGN:'=', LPAREN:'(', RPAREN:')', LBRACE:'{', RBRACE:'}',
  LBRACKET:'[', RBRACKET:']', SEMI:';', COLON:':', DCOLON:'::',
  COMMA:',', DOT:'.', CONCAT:'..', VARARG:'...',
  AND:'and', BREAK:'break', DO:'do', ELSE:'else', ELSEIF:'elseif',
  END:'end', FALSE:'false', FOR:'for', FUNCTION:'function', GOTO:'goto',
  IF:'if', IN:'in', LOCAL:'local', NIL:'nil', NOT:'not', OR:'or',
  REPEAT:'repeat', RETURN:'return', THEN:'then', TRUE:'true',
  UNTIL:'until', WHILE:'while',
  EOF:'EOF',
};

const KEYWORDS = new Set([
  'and','break','do','else','elseif','end','false','for','function','goto',
  'if','in','local','nil','not','or','repeat','return','then','true','until','while'
]);

// ── Lexer ──
class Lexer {
  constructor(src) {
    this.src=src; this.pos=0; this.line=1;
    this.tokens=[]; this._tokenize();
  }
  peek(off=0){return this.src[this.pos+off]||'';}
  adv(){const c=this.src[this.pos++]; if(c==='\n')this.line++; return c;}
  match(c){if(this.src[this.pos]===c){this.pos++;return true;}return false;}
  skipWS(){
    while(this.pos<this.src.length){
      const c=this.peek();
      if(c===' '||c==='\t'||c==='\r'||c==='\n'){this.adv();}
      else if(c==='-'&&this.peek(1)==='-'){
        this.pos+=2;
        if(this.peek()==='['){
          const lv=this._longLevel();
          if(lv>=0){this._longStr(lv);continue;}
        }
        while(this.pos<this.src.length&&this.peek()!=='\n')this.pos++;
      } else break;
    }
  }
  _longLevel(){
    let i=this.pos+1,lv=0;
    while(this.src[i]==='='){lv++;i++;}
    return this.src[i]==='['?lv:-1;
  }
  _longStr(lv){
    this.pos+=lv+2;
    const close=']'+'='.repeat(lv)+']';
    const idx=this.src.indexOf(close,this.pos);
    if(idx<0)throw new Error('unfinished long string');
    const s=this.src.slice(this.pos,idx);
    this.line+=(s.match(/\n/g)||[]).length;
    this.pos=idx+close.length;
    return s;
  }
  _str(q){
    this.pos++;let r='';
    while(this.pos<this.src.length){
      const c=this.src[this.pos];
      if(c===q){this.pos++;return r;}
      if(c==='\n')throw new Error('unfinished string');
      if(c==='\\'){
        this.pos++;
        const e=this.src[this.pos++];
        const map={a:'\x07',b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\x0B','\\':'\\','\'':'\'','"':'"'};
        if(map[e])r+=map[e];
        else if(e>='0'&&e<='9'){let n=e;for(let i=0;i<2&&this.src[this.pos]>='0'&&this.src[this.pos]<='9';i++)n+=this.src[this.pos++];r+=String.fromCharCode(parseInt(n));}
        else r+=e;
      } else r+=this.src[this.pos++];
    }
    throw new Error('unfinished string');
  }
  _num(){
    let s=this.pos;
    if(this.src[this.pos]==='0'&&/[xX]/.test(this.src[this.pos+1])){
      this.pos+=2;while(/[0-9a-fA-F]/.test(this.src[this.pos]||''))this.pos++;
    } else {
      while(/[0-9]/.test(this.src[this.pos]||''))this.pos++;
      if(this.src[this.pos]==='.'&&/[0-9]/.test(this.src[this.pos+1]||'')){this.pos++;while(/[0-9]/.test(this.src[this.pos]||''))this.pos++;}
      if(/[eE]/.test(this.src[this.pos]||'')){this.pos++;if(/[+-]/.test(this.src[this.pos]||''))this.pos++;while(/[0-9]/.test(this.src[this.pos]||''))this.pos++;}
    }
    return this.src.slice(s,this.pos);
  }
  _tokenize(){
    while(true){
      this.skipWS();
      if(this.pos>=this.src.length){this.tokens.push({t:TK.EOF,v:'',ln:this.line});break;}
      const ln=this.line,c=this.src[this.pos];
      if(c==='['&&this._longLevel()>=0){const lv=this._longLevel();const s=this._longStr(lv);this.tokens.push({t:TK.STRING,v:s,ln});continue;}
      if(c==='"'||c==="'"){this.tokens.push({t:TK.STRING,v:this._str(c),ln});continue;}
      if(/[0-9]/.test(c)||(c==='.'&&/[0-9]/.test(this.peek(1)))){this.tokens.push({t:TK.NUMBER,v:this._num(),ln});continue;}
      if(/[a-zA-Z_]/.test(c)){let n='';while(/[a-zA-Z0-9_]/.test(this.src[this.pos]||''))n+=this.src[this.pos++];this.tokens.push({t:KEYWORDS.has(n)?n:TK.NAME,v:n,ln});continue;}
      this.pos++;
      if(c==='.'){
        if(this.match('.')){if(this.match('.'))this.tokens.push({t:TK.VARARG,v:'...',ln});else this.tokens.push({t:TK.CONCAT,v:'..',ln});}
        else this.tokens.push({t:TK.DOT,v:'.',ln});
      } else if(c==='='){this.tokens.push({t:this.match('=')?TK.EQ:TK.ASSIGN,v:c,ln});}
      else if(c==='<'){this.tokens.push({t:this.match('=')?TK.LE:TK.LT,v:c,ln});}
      else if(c==='>'){this.tokens.push({t:this.match('=')?TK.GE:TK.GT,v:c,ln});}
      else if(c==='~'){if(this.match('='))this.tokens.push({t:TK.NEQ,v:'~=',ln});else this.tokens.push({t:'~',v:'~',ln});}
      else if(c===':'){this.tokens.push({t:this.match(':')?TK.DCOLON:TK.COLON,v:c,ln});}
      else {
        const M={'+':TK.PLUS,'-':TK.MINUS,'*':TK.STAR,'/':TK.SLASH,'%':TK.PERCENT,'^':TK.CARET,
          '#':TK.HASH,'(':TK.LPAREN,')':TK.RPAREN,'{':TK.LBRACE,'}':TK.RBRACE,
          '[':TK.LBRACKET,']':TK.RBRACKET,';':TK.SEMI,',':TK.COMMA};
        if(M[c])this.tokens.push({t:M[c],v:c,ln});
      }
    }
  }
}

// ── Proto (function prototype) ──
class Proto {
  constructor(parent=null){
    this.parent=parent;
    this.code=[];       // instructions [{op,a,b,c}]
    this.consts=[];     // constant pool
    this.protos=[];     // nested protos
    this.upvals=[];     // upvalue names
    this.locals=[];     // [{name, startpc, endpc}]
    this.params=0;
    this.isVararg=false;
    this._reg=0;        // next free register
    this._locals=[];    // [{name,reg}]
    this._upvalNames=[];
  }
  allocReg(){return this._reg++;}
  freeRegs(n){this._reg-=n;}
  addConst(v){
    const idx=this.consts.findIndex(c=>c===v&&typeof c===typeof v);
    if(idx>=0)return idx;
    this.consts.push(v); return this.consts.length-1;
  }
  RK(idx){return idx>=0?idx:(-1-idx);} // RK encoding: const = negative offset
  constRK(v){return -1-this.addConst(v);}
  emit(op,a=0,b=0,c=0){this.code.push({op,a,b,c});return this.code.length-1;}
  emitABC(op,a,b,c){return this.emit(op,a,b,c);}
  emitABx(op,a,bx){return this.emit(op,a,bx,0);}
  patch(pc,field,val){this.code[pc][field]=val;}
  addLocal(name){const reg=this._reg++;this._locals.push({name,reg});return reg;}
  findLocal(name){
    for(let i=this._locals.length-1;i>=0;i--)
      if(this._locals[i].name===name)return this._locals[i].reg;
    return -1;
  }
  findUpval(name){
    const idx=this._upvalNames.indexOf(name);
    if(idx>=0)return idx;
    // search parent
    if(this.parent){
      const pr=this.parent.findLocal(name);
      if(pr>=0){this._upvalNames.push(name);this.upvals.push({inStack:true,idx:pr});return this._upvalNames.length-1;}
      const pu=this.parent.findUpval(name);
      if(pu>=0){this._upvalNames.push(name);this.upvals.push({inStack:false,idx:pu});return this._upvalNames.length-1;}
    }
    return -1;
  }
}

// ── Compiler: Lua AST → bytecode ──
class Compiler {
  constructor(){this.proto=null;this.tokens=[];this.pos=0;}

  compile(src){
    const lex=new Lexer(src);
    this.tokens=lex.tokens;
    this.pos=0;
    this.proto=new Proto();
    this.proto.isVararg=true;
    this._block();
    this._expect(TK.EOF);
    // emit implicit RETURN
    this.proto.emit(OP.RETURN,0,1,0);
    return this.proto;
  }

  // ── Parser helpers ──
  peek(){return this.tokens[this.pos]||{t:TK.EOF,v:''};}
  adv(){return this.tokens[this.pos++]||{t:TK.EOF,v:''};}
  check(t){return this.peek().t===t;}
  match(...ts){if(ts.includes(this.peek().t)){return this.adv();}return null;}
  expect(t){const tk=this.adv();if(tk.t!==t)throw new Error(`Expected ${t}, got ${tk.t} ('${tk.v}')`);return tk;}
  _expect(t){return this.expect(t);}

  // ── Statement block ──
  _block(){
    while(true){
      const t=this.peek().t;
      if(t===TK.EOF||t==='end'||t==='else'||t==='elseif'||t==='until')break;
      if(t==='return'){this._returnStat();break;}
      this._statement();
    }
  }

  _statement(){
    const t=this.peek().t;
    if(t===';'){this.adv();return;}
    if(t==='if')return this._ifStat();
    if(t==='while')return this._whileStat();
    if(t==='do')return this._doStat();
    if(t==='for')return this._forStat();
    if(t==='repeat')return this._repeatStat();
    if(t==='function')return this._funcStat();
    if(t==='local')return this._localStat();
    if(t==='goto')return this._gotoStat();
    if(t===TK.DCOLON)return this._labelStat();
    if(t==='break'){this.adv();return;}
    this._exprStat();
  }

  _returnStat(){
    this.adv(); // 'return'
    const base=this.proto._reg;
    let nret=0;
    if(!this.check('end')&&!this.check('else')&&!this.check('elseif')&&!this.check('until')&&!this.check(TK.EOF)){
      nret=this._exprList(base);
    }
    this.proto.emit(OP.RETURN,base,nret+1,0);
    this.match(';');
  }

  _ifStat(){
    this.expect('if');
    const base=this.proto._reg;
    this._condJump(base); // emits TEST+JMP, returns jmpPc
    const jmpPc=this.proto.code.length-1;
    this.expect('then');
    this._block();
    const endJmps=[];
    while(this.check('elseif')||this.check('else')){
      if(this.check('else')){
        // patch previous jump to here+1
        endJmps.push(this.proto.emit(OP.JMP,0,0,0));
        this.proto.patch(jmpPc,'b',this.proto.code.length-jmpPc-1);
        this.adv();
        this._block();
        break;
      } else {
        endJmps.push(this.proto.emit(OP.JMP,0,0,0));
        this.proto.patch(jmpPc,'b',this.proto.code.length-jmpPc-1);
        this.adv();
        const base2=this.proto._reg;
        this._condJump(base2);
        const jpc2=this.proto.code.length-1;
        this.expect('then');
        this._block();
        endJmps.push(this.proto.emit(OP.JMP,0,0,0));
        this.proto.patch(jpc2,'b',this.proto.code.length-jpc2-1);
      }
    }
    this.expect('end');
    const here=this.proto.code.length;
    endJmps.forEach(pc=>this.proto.patch(pc,'b',here-pc-1));
    // patch original jmp if no else
    if(this.proto.code[jmpPc].b===0)
      this.proto.patch(jmpPc,'b',here-jmpPc-1);
  }

  _condJump(base){
    const reg=base;
    this._expr(reg);
    this.proto.emit(OP.TEST,reg,0,0);
    this.proto.emit(OP.JMP,0,0,0); // b = forward offset, patched later
  }

  _whileStat(){
    this.expect('while');
    const loopTop=this.proto.code.length;
    const base=this.proto._reg;
    this._condJump(base);
    const jmpPc=this.proto.code.length-1;
    this.expect('do');
    this._block();
    this.expect('end');
    // jump back
    const backOff=loopTop-this.proto.code.length-1;
    this.proto.emit(OP.JMP,0,backOff,0);
    this.proto.patch(jmpPc,'b',this.proto.code.length-jmpPc-1);
  }

  _doStat(){
    this.expect('do'); this._block(); this.expect('end');
  }

  _forStat(){
    this.expect('for');
    const name=this.expect(TK.NAME).v;
    if(this.check(TK.ASSIGN)){
      this.adv();
      // numeric for
      const rBase=this.proto._reg;
      this._expr(rBase); this.proto._reg++;
      this.expect(','); this._expr(rBase+1); this.proto._reg++;
      let rStep=rBase+2;
      if(this.match(',')){this._expr(rBase+2);this.proto._reg++;}
      else{this.proto.emit(OP.LOADK,rBase+2,-1-this.proto.addConst(1),0);this.proto._reg++;}
      const prepPc=this.proto.emit(OP.FORPREP,rBase,0,0);
      this.proto._locals.push({name,reg:rBase+3});
      this.expect('do'); this._block(); this.expect('end');
      const loopPc=this.proto.emit(OP.FORLOOP,rBase,0,0);
      this.proto.patch(prepPc,'b',loopPc-prepPc-1);
      this.proto.patch(loopPc,'b',prepPc-loopPc);
      this.proto._locals.pop();
      this.proto._reg=rBase;
    } else {
      // generic for — simplified: just emit CALL on iterator
      this.expect('in');
      const rBase=this.proto._reg;
      this._exprList(rBase);
      this.expect('do'); this._block(); this.expect('end');
    }
  }

  _repeatStat(){
    this.expect('repeat');
    const top=this.proto.code.length;
    this._block();
    this.expect('until');
    const base=this.proto._reg;
    this._expr(base);
    this.proto.emit(OP.TEST,base,0,1);
    this.proto.emit(OP.JMP,0,top-this.proto.code.length-1,0);
  }

  _funcStat(){
    this.expect('function');
    const name=this.expect(TK.NAME).v;
    const reg=this.proto._reg++;
    this._funcBody(reg);
    // assign to global
    const k=this.proto.addConst(name);
    this.proto.emit(OP.SETGLOBAL,reg,k,0);
    this.proto._reg--;
  }

  _localStat(){
    this.adv(); // 'local'
    if(this.check('function')){
      this.adv();
      const name=this.expect(TK.NAME).v;
      const reg=this.proto.addLocal(name);
      this._funcBody(reg);
    } else {
      const names=[];
      names.push(this.expect(TK.NAME).v);
      while(this.match(','))names.push(this.expect(TK.NAME).v);
      const base=this.proto._reg;
      if(this.match(TK.ASSIGN)){
        this._exprList(base);
      }
      names.forEach((n,i)=>{
        if(this.proto._reg<base+i+1){this.proto.emit(OP.LOADNIL,base+i,base+i,0);this.proto._reg++;}
        this.proto._locals.push({name:n,reg:base+i});
      });
      this.proto._reg=base+names.length;
    }
  }

  _gotoStat(){this.adv();this.adv();}
  _labelStat(){this.adv();this.adv();this.expect(TK.DCOLON);}

  _exprStat(){
    // assignment or function call
    const base=this.proto._reg;
    this._suffixedExpr(base);
    if(this.check(TK.ASSIGN)||this.check(',')){
      // assignment
      const targets=[base];
      while(this.match(',')){ this.proto._reg++; this._suffixedExpr(this.proto._reg-1); targets.push(this.proto._reg-1); }
      this.expect(TK.ASSIGN);
      const valBase=this.proto._reg;
      this._exprList(valBase);
      // store back
      targets.forEach((t,i)=>{
        this.proto.emit(OP.MOVE,t,valBase+i,0);
      });
      this.proto._reg=base;
    } else {
      // function call — result discarded
      this.proto._reg=base;
    }
  }

  // ── Expression ──
  _expr(dest){return this._binop(dest,0);}

  _binop(dest,minPrec){
    const PREC={
      [TK.OR]:1,[TK.AND]:2,
      [TK.LT]:3,[TK.GT]:3,[TK.LE]:3,[TK.GE]:3,[TK.EQ]:3,[TK.NEQ]:3,
      [TK.CONCAT]:4,
      [TK.PLUS]:5,[TK.MINUS]:5,
      [TK.STAR]:6,[TK.SLASH]:6,[TK.PERCENT]:6,
      [TK.CARET]:7,
    };
    const OPMAP={
      [TK.PLUS]:OP.ADD,[TK.MINUS]:OP.SUB,[TK.STAR]:OP.MUL,[TK.SLASH]:OP.DIV,
      [TK.PERCENT]:OP.MOD,[TK.CARET]:OP.POW,[TK.CONCAT]:OP.CONCAT,
      [TK.LT]:OP.LT,[TK.GT]:OP.LT,[TK.LE]:OP.LE,[TK.GE]:OP.LE,
      [TK.EQ]:OP.EQ,[TK.NEQ]:OP.EQ,
    };
    this._unop(dest);
    while(true){
      const op=this.peek().t;
      const prec=PREC[op];
      if(!prec||prec<=minPrec)break;
      this.adv();
      const rhs=this.proto._reg++;
      this._binop(rhs,prec);
      const lop=OPMAP[op]??OP.ADD;
      const flip=(op===TK.GT||op===TK.GE)?1:0;
      const neg=(op===TK.NEQ)?1:0;
      if(lop===OP.EQ||lop===OP.LT||lop===OP.LE){
        this.proto.emit(lop,neg,flip?this.proto.RK(rhs):this.proto.RK(dest),flip?this.proto.RK(dest):this.proto.RK(rhs));
        this.proto.emit(OP.JMP,0,1,0);
        this.proto.emit(OP.LOADBOOL,dest,0,1);
        this.proto.emit(OP.LOADBOOL,dest,1,0);
      } else {
        this.proto.emit(lop,dest,dest,rhs);
      }
      this.proto._reg--;
    }
  }

  _unop(dest){
    const t=this.peek().t;
    if(t===TK.MINUS){this.adv();this._unop(dest);this.proto.emit(OP.UNM,dest,dest,0);}
    else if(t==='not'){this.adv();this._unop(dest);this.proto.emit(OP.NOT,dest,dest,0);}
    else if(t===TK.HASH){this.adv();this._unop(dest);this.proto.emit(OP.LEN,dest,dest,0);}
    else this._simpleExpr(dest);
  }

  _simpleExpr(dest){
    const t=this.peek();
    if(t.t===TK.NUMBER){
      this.adv();
      const n=parseFloat(t.v);
      this.proto.emit(OP.LOADK,dest,-1-this.proto.addConst(n),0);
    } else if(t.t===TK.STRING){
      this.adv();
      this.proto.emit(OP.LOADK,dest,-1-this.proto.addConst(t.v),0);
    } else if(t.t==='true'){
      this.adv();this.proto.emit(OP.LOADBOOL,dest,1,0);
    } else if(t.t==='false'){
      this.adv();this.proto.emit(OP.LOADBOOL,dest,0,0);
    } else if(t.t==='nil'){
      this.adv();this.proto.emit(OP.LOADNIL,dest,dest,0);
    } else if(t.t===TK.VARARG){
      this.adv();this.proto.emit(OP.VARARG,dest,1,0);
    } else if(t.t==='function'){
      this.adv();this._funcBody(dest);
    } else if(t.t===TK.LBRACE){
      this._tableConstructor(dest);
    } else {
      this._suffixedExpr(dest);
    }
  }

  _suffixedExpr(dest){
    this._primaryExpr(dest);
    while(true){
      const t=this.peek().t;
      if(t===TK.DOT){
        this.adv();
        const field=this.expect(TK.NAME).v;
        const k=this.proto.constRK(field);
        this.proto.emit(OP.GETTABLE,dest,dest,k);
      } else if(t===TK.LBRACKET){
        this.adv();
        const kr=this.proto._reg++;
        this._expr(kr);
        this.expect(TK.RBRACKET);
        this.proto.emit(OP.GETTABLE,dest,dest,kr);
        this.proto._reg--;
      } else if(t===TK.COLON){
        this.adv();
        const meth=this.expect(TK.NAME).v;
        const k=this.proto.constRK(meth);
        this.proto.emit(OP.SELF,dest,dest,k);
        const argBase=dest+2;
        this._callArgs(argBase);
        const nargs=this.proto._reg-argBase;
        this.proto.emit(OP.CALL,dest,nargs+2,2);
        this.proto._reg=dest+1;
      } else if(t===TK.LPAREN||t===TK.STRING||t===TK.LBRACE){
        const argBase=dest+1;
        const savedReg=this.proto._reg;
        this.proto._reg=argBase;
        this._callArgs(argBase);
        const nargs=this.proto._reg-argBase;
        this.proto.emit(OP.CALL,dest,nargs+1,2);
        this.proto._reg=dest+1;
      } else break;
    }
  }

  _callArgs(base){
    if(this.check(TK.LPAREN)){
      this.adv();
      if(!this.check(TK.RPAREN)) this._exprList(base);
      this.expect(TK.RPAREN);
    } else if(this.check(TK.STRING)){
      const t=this.adv();
      this.proto.emit(OP.LOADK,base,-1-this.proto.addConst(t.v),0);
      this.proto._reg=base+1;
    } else if(this.check(TK.LBRACE)){
      this._tableConstructor(base);
      this.proto._reg=base+1;
    }
  }

  _primaryExpr(dest){
    const t=this.peek();
    if(t.t===TK.NAME){
      this.adv();
      const local=this.proto.findLocal(t.v);
      if(local>=0){
        if(local!==dest)this.proto.emit(OP.MOVE,dest,local,0);
      } else {
        const uv=this.proto.findUpval(t.v);
        if(uv>=0){this.proto.emit(OP.GETUPVAL,dest,uv,0);}
        else{const k=this.proto.addConst(t.v);this.proto.emit(OP.GETGLOBAL,dest,k,0);}
      }
    } else if(t.t===TK.LPAREN){
      this.adv(); this._expr(dest); this.expect(TK.RPAREN);
    }
  }

  _exprList(base){
    this._expr(base);
    let n=1;
    while(this.match(',')){ this.proto._reg=base+n; this._expr(base+n); n++; }
    this.proto._reg=base+n;
    return n;
  }

  _funcBody(dest){
    this.expect(TK.LPAREN);
    const sub=new Proto(this.proto);
    const savedProto=this.proto;
    this.proto=sub;
    // params
    while(!this.check(TK.RPAREN)){
      if(this.check(TK.VARARG)){this.adv();sub.isVararg=true;break;}
      const n=this.expect(TK.NAME).v;
      sub.addLocal(n); sub.params++;
      if(!this.check(TK.RPAREN))this.expect(',');
    }
    this.expect(TK.RPAREN);
    this._block();
    this.expect('end');
    sub.emit(OP.RETURN,0,1,0);
    this.proto=savedProto;
    const idx=savedProto.protos.length;
    savedProto.protos.push(sub);
    savedProto.emit(OP.CLOSURE,dest,idx,0);
  }

  _tableConstructor(dest){
    this.expect(TK.LBRACE);
    this.proto.emit(OP.NEWTABLE,dest,0,0);
    let i=1;
    while(!this.check(TK.RBRACE)){
      if(this.check(TK.LBRACKET)){
        // [expr]=expr
        this.adv();
        const kr=this.proto._reg++;
        this._expr(kr);
        this.expect(TK.RBRACKET);
        this.expect(TK.ASSIGN);
        const vr=this.proto._reg++;
        this._expr(vr);
        this.proto.emit(OP.SETTABLE,dest,kr,vr);
        this.proto._reg-=2;
      } else if(this.peek().t===TK.NAME&&this.tokens[this.pos+1]?.t===TK.ASSIGN){
        const n=this.adv().v; this.adv();
        const kr=this.proto.constRK(n);
        const vr=this.proto._reg++;
        this._expr(vr);
        this.proto.emit(OP.SETTABLE,dest,kr,vr);
        this.proto._reg--;
      } else {
        const vr=this.proto._reg++;
        this._expr(vr);
        this.proto.emit(OP.SETLIST,dest,i,vr);
        this.proto._reg--;
        i++;
      }
      this.match(','); this.match(';');
    }
    this.expect(TK.RBRACE);
  }
}

module.exports = { Compiler, OP, Proto };
