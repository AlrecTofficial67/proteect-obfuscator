'use strict';

class Randomizer {
  constructor(seed) {
    this.seed = seed || (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0);
  }

  next() {
    this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }

  nextInt(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  randomName(minLen, maxLen) {
    const alpha = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const alnum = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
    const len = this.nextInt(minLen || 8, maxLen || 18);
    let name = alpha[this.nextInt(0, alpha.length - 1)];
    for (let i = 1; i < len; i++) name += alnum[this.nextInt(0, alnum.length - 1)];
    return name;
  }

  randomBytes(len) {
    const b = [];
    for (let i = 0; i < len; i++) b.push(this.nextInt(0, 255));
    return b;
  }

  randomKeyArray(len) {
    const k = [];
    for (let i = 0; i < len; i++) k.push(this.nextInt(1, 254));
    return k;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  pick(arr) {
    return arr[this.nextInt(0, arr.length - 1)];
  }
}

module.exports = { Randomizer };
