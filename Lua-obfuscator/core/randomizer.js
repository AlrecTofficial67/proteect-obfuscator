'use strict';
class Randomizer {
  constructor(seed){
    this.seed=(seed||(Math.floor(Math.random()*0xFFFFFFFF)))>>>0;
    this.seed2=(this.seed^0xDEADBEEF)>>>0;
  }
  next(){
    let s=this.seed;s^=s<<13;s^=s>>17;s^=s<<5;this.seed=s>>>0;
    let t=this.seed2;t^=t<<7;t^=t>>9;t^=t<<13;this.seed2=t>>>0;
    return ((this.seed^this.seed2)>>>0)/0x100000000;
  }
  nextInt(a,b){return a+Math.floor(this.next()*(b-a+1));}
  randomName(min,max){
    const a='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const n='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
    const len=this.nextInt(min||10,max||20);
    let s=a[this.nextInt(0,a.length-1)];
    for(let i=1;i<len;i++)s+=n[this.nextInt(0,n.length-1)];
    return s;
  }
  randomKeyArray(len){const k=[];for(let i=0;i<len;i++)k.push(this.nextInt(1,254));return k;}
  shuffle(arr){for(let i=arr.length-1;i>0;i--){const j=this.nextInt(0,i);[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
  pick(arr){return arr[this.nextInt(0,arr.length-1)];}
  randomHex(len){let h='';for(let i=0;i<len;i++)h+=(this.nextInt(0,15)).toString(16);return h;}
}
module.exports={Randomizer};
