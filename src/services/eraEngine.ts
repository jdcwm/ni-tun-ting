// eraEngine.ts - Complete ERA Game Engine Interpreter
// Implements an Emuera-compatible interpreter for running era text games (eraTW, etc.)
// Supports: variable system, ERB parsing, statement execution, expression evaluation,
// CSV/ERH loading, async I/O, and the full ERA statement set.
//
// 第三方声明 (Third-Party Notice):
// 本引擎部分实现参考了 EraJS —— 一个 JavaScript 实现的 Emuera 运行时。
//   项目地址: https://github.com/undercrow/eraJS
//   许可证:   MIT License
//   版权:     Copyright 2020-2021 Undercrow
// 依据 MIT 许可要求，上述版权与许可声明保留于此。

import * as FileSystem from 'expo-file-system/legacy';

// ============================================================
// Path Utilities (replacing Node 'path' module)
// ============================================================

function joinPath(...parts: string[]): string {
  return parts.filter(p => p != null && p !== '').join('/').replace(/\/+/g, '/');
}

function getBaseName(filePath: string, ext?: string): string {
  const segs = filePath.split(/[\\/]/);
  let name = segs[segs.length - 1] || '';
  if (ext && name.toLowerCase().endsWith(ext.toLowerCase())) {
    name = name.slice(0, name.length - ext.length);
  }
  return name;
}

// ============================================================
// Public Interfaces
// ============================================================

export interface EraOutputLine {
  text: string;
  color?: string;
  bgColor?: string;
  alignment?: 'left' | 'center' | 'right';
  buttons?: EraButton[];
  isLine?: boolean;
}

export interface EraButton {
  text: string;
  value: number | string;
}

export type Alignment = 'left' | 'center' | 'right';
export type WaitMode = 'none' | 'input' | 'key';

// ============================================================
// Variable Storage Classes
// ============================================================

class NumVar {
  data: Float64Array;
  constructor(public name: string, size: number) {
    this.data = new Float64Array(Math.max(Math.floor(size), 1));
  }
  get(i: number = 0): number {
    if (i < 0 || i >= this.data.length) return 0;
    return this.data[i];
  }
  set(i: number, v: number): void {
    if (i >= 0 && i < this.data.length) this.data[i] = v;
  }
  fill(v: number, start: number = 0, end: number = this.data.length): void {
    const s = Math.max(0, Math.floor(start));
    const e = Math.min(this.data.length, Math.floor(end));
    for (let i = s; i < e; i++) this.data[i] = v;
  }
}

class StrVar {
  data: string[];
  constructor(public name: string, size: number) {
    this.data = new Array(Math.max(Math.floor(size), 1)).fill('');
  }
  get(i: number = 0): string {
    if (i < 0 || i >= this.data.length) return '';
    return this.data[i];
  }
  set(i: number, v: string): void {
    if (i >= 0 && i < this.data.length) this.data[i] = v;
  }
  fill(v: string, start: number = 0, end: number = this.data.length): void {
    const s = Math.max(0, Math.floor(start));
    const e = Math.min(this.data.length, Math.floor(end));
    for (let i = s; i < e; i++) this.data[i] = v;
  }
}

class CharaVar {
  data: Float64Array[] | string[][];
  constructor(public name: string, public size: number, public isStr: boolean) {
    this.data = [];
  }
  ensure(n: number): void {
    if (n < 0) return;
    while (this.data.length <= n) {
      if (this.isStr) (this.data as string[][]).push(new Array(this.size).fill(''));
      else (this.data as Float64Array[]).push(new Float64Array(this.size));
    }
  }
  addChara(): void {
    if (this.isStr) (this.data as string[][]).push(new Array(this.size).fill(''));
    else (this.data as Float64Array[]).push(new Float64Array(this.size));
  }
  getN(ci: number, ai: number): number {
    if (ci < 0) return 0;
    this.ensure(ci);
    const a = (this.data as Float64Array[])[ci];
    if (!a || ai < 0 || ai >= a.length) return 0;
    return a[ai];
  }
  setN(ci: number, ai: number, v: number): void {
    if (ci < 0) return;
    this.ensure(ci);
    const a = (this.data as Float64Array[])[ci];
    if (a && ai >= 0 && ai < a.length) a[ai] = v;
  }
  getS(ci: number, ai: number): string {
    if (ci < 0) return '';
    this.ensure(ci);
    const a = (this.data as string[][])[ci];
    if (!a || ai < 0 || ai >= a.length) return '';
    return a[ai];
  }
  setS(ci: number, ai: number, v: string): void {
    if (ci < 0) return;
    this.ensure(ci);
    const a = (this.data as string[][])[ci];
    if (a && ai >= 0 && ai < a.length) a[ai] = v;
  }
}

// ============================================================
// Tokenizer
// ============================================================

enum Tok {
  Num, Str, Id,
  Plus, Minus, Mul, Div, Mod,
  Eq, Ne, Lt, Gt, Le, Ge,
  And2, Or2, Not,
  BitAnd, BitOr, BitXor, Shl, Shr,
  Assign, PlusAssign, MinusAssign, MulAssign, DivAssign,
  Colon, LParen, RParen, Comma,
  Question, Sharp,
  EOF
}

interface Token { type: Tok; val: string; }

function isIdentStart(c: string): boolean {
  if (!c) return false;
  const code = c.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || c === '_' || code > 0x2E00;
}

function isIdentPart(c: string): boolean {
  if (!c) return false;
  const code = c.charCodeAt(0);
  return isIdentStart(c) || (code >= 48 && code <= 57);
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = expr.length;

  while (i < len) {
    const c = expr[i];

    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }

    if ((c >= '0' && c <= '9') || (c === '.' && i + 1 < len && expr[i + 1] >= '0' && expr[i + 1] <= '9')) {
      let num = '';
      if (c === '0' && (expr[i + 1] === 'x' || expr[i + 1] === 'X')) {
        num = expr.substring(i, i + 2);
        i += 2;
        while (i < len && ((expr[i] >= '0' && expr[i] <= '9') || (expr[i] >= 'a' && expr[i] <= 'f') || (expr[i] >= 'A' && expr[i] <= 'F'))) {
          num += expr[i]; i++;
        }
      } else {
        while (i < len && ((expr[i] >= '0' && expr[i] <= '9') || expr[i] === '.')) {
          num += expr[i]; i++;
        }
      }
      tokens.push({ type: Tok.Num, val: num });
      continue;
    }

    if (c === '"' || (c === '@' && i + 1 < len && expr[i + 1] === '"')) {
      // "@..." is Emuera's verbatim/raw string: no backslash escapes, just literal text
      // up to the closing quote. Regular "..." still processes \n \t \\ \" escapes.
      const verbatim = c === '@';
      if (verbatim) i++;
      i++;
      let str = '';
      while (i < len && expr[i] !== '"') {
        if (!verbatim && expr[i] === '\\' && i + 1 < len) {
          const next = expr[i + 1];
          if (next === '"') { str += '"'; i += 2; continue; }
          if (next === 'n') { str += '\n'; i += 2; continue; }
          if (next === 't') { str += '\t'; i += 2; continue; }
          if (next === '\\') { str += '\\'; i += 2; continue; }
        }
        str += expr[i]; i++;
      }
      i++;
      tokens.push({ type: Tok.Str, val: str });
      continue;
    }

    const two = i + 1 < len ? expr.substr(i, 2) : '';
    if (two === '==') { tokens.push({ type: Tok.Eq, val: '==' }); i += 2; continue; }
    if (two === '!=') { tokens.push({ type: Tok.Ne, val: '!=' }); i += 2; continue; }
    if (two === '<=') { tokens.push({ type: Tok.Le, val: '<=' }); i += 2; continue; }
    if (two === '>=') { tokens.push({ type: Tok.Ge, val: '>=' }); i += 2; continue; }
    if (two === '&&') { tokens.push({ type: Tok.And2, val: '&&' }); i += 2; continue; }
    if (two === '||') { tokens.push({ type: Tok.Or2, val: '||' }); i += 2; continue; }
    if (two === '<<') { tokens.push({ type: Tok.Shl, val: '<<' }); i += 2; continue; }
    if (two === '>>') { tokens.push({ type: Tok.Shr, val: '>>' }); i += 2; continue; }
    if (two === '+=') { tokens.push({ type: Tok.PlusAssign, val: '+=' }); i += 2; continue; }
    if (two === '-=') { tokens.push({ type: Tok.MinusAssign, val: '-=' }); i += 2; continue; }
    if (two === '*=') { tokens.push({ type: Tok.MulAssign, val: '*=' }); i += 2; continue; }
    if (two === '/=') { tokens.push({ type: Tok.DivAssign, val: '/=' }); i += 2; continue; }

    if (isIdentStart(c)) {
      let id = '';
      while (i < len && isIdentPart(expr[i])) { id += expr[i]; i++; }
      tokens.push({ type: Tok.Id, val: id });
      continue;
    }

    switch (c) {
      case '+': tokens.push({ type: Tok.Plus, val: '+' }); i++; continue;
      case '-': tokens.push({ type: Tok.Minus, val: '-' }); i++; continue;
      case '*': tokens.push({ type: Tok.Mul, val: '*' }); i++; continue;
      case '/': tokens.push({ type: Tok.Div, val: '/' }); i++; continue;
      case '%': tokens.push({ type: Tok.Mod, val: '%' }); i++; continue;
      case '<': tokens.push({ type: Tok.Lt, val: '<' }); i++; continue;
      case '>': tokens.push({ type: Tok.Gt, val: '>' }); i++; continue;
      case '!': tokens.push({ type: Tok.Not, val: '!' }); i++; continue;
      case '&': tokens.push({ type: Tok.BitAnd, val: '&' }); i++; continue;
      case '|': tokens.push({ type: Tok.BitOr, val: '|' }); i++; continue;
      case '^': tokens.push({ type: Tok.BitXor, val: '^' }); i++; continue;
      case '=': tokens.push({ type: Tok.Assign, val: '=' }); i++; continue;
      case ':': tokens.push({ type: Tok.Colon, val: ':' }); i++; continue;
      case '(': tokens.push({ type: Tok.LParen, val: '(' }); i++; continue;
      case ')': tokens.push({ type: Tok.RParen, val: ')' }); i++; continue;
      case ',': tokens.push({ type: Tok.Comma, val: ',' }); i++; continue;
      case '?': tokens.push({ type: Tok.Question, val: '?' }); i++; continue;
      case '#': tokens.push({ type: Tok.Sharp, val: '#' }); i++; continue;
      case "'": i++; continue; // stray ASCII single-quote (eraTW writes `html '= ...`); not a string delimiter in Emuera
      case '[': case ']': i++; continue; // eraTW named-character refs: CFLAG:[[紫]]:idx — brackets delimit a name
      default:
        throw new Error(`Unexpected character in expression: '${c}' (code ${c.charCodeAt(0)}) in "${expr}"`);
    }
  }

  tokens.push({ type: Tok.EOF, val: '' });
  return tokens;
}

// ============================================================
// Expression AST
// ============================================================

type AstNode =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'var'; name: string; indices: AstNode[] }
  | { type: 'call'; name: string; args: AstNode[] }
  | { type: 'unary'; op: string; operand: AstNode }
  | { type: 'binary'; op: string; left: AstNode; right: AstNode };

// ============================================================
// Expression Parser (Recursive Descent)
// ============================================================

class ExprParser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  peek(): Token { return this.tokens[this.pos]; }
  next(): Token { return this.tokens[this.pos++]; }
  expect(type: Tok): Token {
    const t = this.next();
    if (t.type !== type) throw new Error(`Expected token type ${type}, got ${t.type} ('${t.val}')`);
    return t;
  }

  parse(): AstNode {
    const node = this.parseOr();
    if (this.peek().type !== Tok.EOF) {
      throw new Error(`Unexpected token after expression: '${this.peek().val}'`);
    }
    return node;
  }

  parseOr(): AstNode {
    let left = this.parseAnd();
    while (this.peek().type === Tok.Or2) {
      this.next();
      const right = this.parseAnd();
      left = { type: 'binary', op: '||', left, right };
    }
    return left;
  }

  parseAnd(): AstNode {
    let left = this.parseBitOr();
    while (this.peek().type === Tok.And2) {
      this.next();
      const right = this.parseBitOr();
      left = { type: 'binary', op: '&&', left, right };
    }
    return left;
  }

  parseBitOr(): AstNode {
    let left = this.parseBitXor();
    while (this.peek().type === Tok.BitOr) {
      this.next();
      const right = this.parseBitXor();
      left = { type: 'binary', op: '|', left, right };
    }
    return left;
  }

  parseBitXor(): AstNode {
    let left = this.parseBitAnd();
    while (this.peek().type === Tok.BitXor) {
      this.next();
      const right = this.parseBitAnd();
      left = { type: 'binary', op: '^', left, right };
    }
    return left;
  }

  parseBitAnd(): AstNode {
    let left = this.parseEquality();
    while (this.peek().type === Tok.BitAnd) {
      this.next();
      const right = this.parseEquality();
      left = { type: 'binary', op: '&', left, right };
    }
    return left;
  }

  parseEquality(): AstNode {
    let left = this.parseRelational();
    while (this.peek().type === Tok.Eq || this.peek().type === Tok.Ne) {
      const op = this.next().val;
      const right = this.parseRelational();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  parseRelational(): AstNode {
    let left = this.parseShift();
    while ([Tok.Lt, Tok.Gt, Tok.Le, Tok.Ge].includes(this.peek().type)) {
      const op = this.next().val;
      const right = this.parseShift();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  parseShift(): AstNode {
    let left = this.parseAdditive();
    while (this.peek().type === Tok.Shl || this.peek().type === Tok.Shr) {
      const op = this.next().val;
      const right = this.parseAdditive();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  parseAdditive(): AstNode {
    let left = this.parseMul();
    while (this.peek().type === Tok.Plus || this.peek().type === Tok.Minus) {
      const op = this.next().val;
      const right = this.parseMul();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  parseMul(): AstNode {
    let left = this.parseUnary();
    while ([Tok.Mul, Tok.Div, Tok.Mod].includes(this.peek().type)) {
      const op = this.next().val;
      const right = this.parseUnary();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  parseUnary(): AstNode {
    if (this.peek().type === Tok.Not) {
      this.next();
      return { type: 'unary', op: '!', operand: this.parseUnary() };
    }
    if (this.peek().type === Tok.Minus) {
      this.next();
      return { type: 'unary', op: '-', operand: this.parseUnary() };
    }
    if (this.peek().type === Tok.Plus) {
      this.next();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  parsePrimary(): AstNode {
    const t = this.peek();
    if (t.type === Tok.Num) {
      this.next();
      let val: number;
      if (t.val.startsWith('0x') || t.val.startsWith('0X')) {
        val = parseInt(t.val, 16);
      } else {
        val = parseFloat(t.val);
        if (isNaN(val)) val = 0;
      }
      return { type: 'num', value: val };
    }
    if (t.type === Tok.Str) {
      this.next();
      return { type: 'str', value: t.val };
    }
    if (t.type === Tok.LParen) {
      this.next();
      const node = this.parseOr();
      this.expect(Tok.RParen);
      return node;
    }
    if (t.type === Tok.Id) {
      this.next();
      const name = t.val;
      if (this.peek().type === Tok.LParen) {
        this.next();
        const args: AstNode[] = [];
        if (this.peek().type !== Tok.RParen) {
          args.push(this.parseOr());
          while (this.peek().type === Tok.Comma) {
            this.next();
            args.push(this.parseOr());
          }
        }
        this.expect(Tok.RParen);
        return { type: 'call', name, args };
      }
      const indices: AstNode[] = [];
      while (this.peek().type === Tok.Colon) {
        this.next();
        indices.push(this.parseOr());
      }
      return { type: 'var', name, indices };
    }
    throw new Error(`Unexpected token: '${t.val}' (type ${t.type})`);
  }
}

// ============================================================
// ERB Parsing Types
// ============================================================

interface EraParam {
  name: string;
  isStr: boolean;
  defaultValue?: number | string;
}

interface DimDecl {
  name: string;
  size: number;
  isStr: boolean;
  isConst: boolean;
  value?: number | string;
}

interface Block {
  type: string;
  start: number;
  branches: number[];
  end: number;
}

interface EraFunction {
  name: string;
  params: EraParam[];
  dimDecls: DimDecl[];
  labels: Map<string, number>;
  statements: string[];
  blocks: Map<number, Block>;
  branchToBlock: Map<number, Block>;
  endToBlock: Map<number, Block>;
  filePath: string;
}

interface CallFrame {
  func: EraFunction;
  pc: number;
  localNum: Map<string, Float64Array>;
  localStr: Map<string, string[]>;
  argNum: number[];
  argStr: string[];
  sifSkip: boolean;
  selectValue: number | string;
  repeatTarget: number;
  returnValue: number;
  returnStr: string;
  returnFlag: boolean;
  forStack: ForLoopInfo[];
}

interface ForLoopInfo {
  varName: string;
  indices: number[];
  end: number;
  step: number;
  blockEnd: number;
}

// ============================================================
// Control Flow Signals
// ============================================================

class BeginSignal {
  constructor(public mode: string) {}
}

class ReturnSignal {
  constructor(public value: number, public str: string, public isReturnF: boolean) {}
}

class JumpSignal {
  constructor(public funcName: string, public numArgs: number[], public strArgs: string[]) {}
}

class GotoSignal {
  constructor(public label: string) {}
}

// RESTART re-enters the current function from its first statement with fresh locals
// (but the same arguments).
class RestartSignal {}

// ============================================================
// File Reading Helper (handles Shift-JIS and UTF-8)
// ============================================================

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function readFileText(filePath: string): Promise<string> {
  try {
    const utf8Content = await FileSystem.readAsStringAsync(filePath, { encoding: 'utf8' });

    if (utf8Content.charCodeAt(0) === 0xFEFF) {
      return utf8Content.slice(1);
    }
    if (!utf8Content.includes('\uFFFD')) {
      return utf8Content;
    }

    const base64 = await FileSystem.readAsStringAsync(filePath, { encoding: 'base64' });
    const bytes = base64ToBytes(base64);

    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    }
    try {
      const decoder = new TextDecoder('shift_jis');
      return decoder.decode(bytes);
    } catch {
      return utf8Content;
    }
  } catch (e) {
    console.error(`Error reading file ${filePath}: ${(e as Error).message}`);
    return '';
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(filePath);
  return info.exists;
}

async function walkDir(dirPath: string, ext: string): Promise<string[]> {
  const results: string[] = [];
  const info = await FileSystem.getInfoAsync(dirPath);
  if (!info.exists || !info.isDirectory) return results;

  const entries = await FileSystem.readDirectoryAsync(dirPath);
  for (const name of entries) {
    // Paths here are file:// URIs (documentDirectory-derived): readDirectoryAsync returns
    // *decoded* names, so re-encoding each segment is required for non-ASCII / '#' / spaces.
    const full = joinPath(dirPath, encodeURIComponent(name));
    const entryInfo = await FileSystem.getInfoAsync(full);
    if (entryInfo.isDirectory) {
      const sub = await walkDir(full, ext);
      results.push(...sub);
    } else if (entryInfo.exists && name.toLowerCase().endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

// ============================================================
// ERB Parser
// ============================================================

class ErbParser {
  parse(content: string, filePath: string): EraFunction[] {
    const lines = content.split(/\r?\n/);
    const functions: EraFunction[] = [];
    let currentFunc: EraFunction | null = null;
    let inHeaderDecls = true;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      let line = lines[lineNum];
      const semiIdx = line.indexOf(';');
      if (semiIdx >= 0) line = line.substring(0, semiIdx);
      line = line.trimEnd();
      if (line.trim() === '') continue;

      if (line.startsWith('@')) {
        if (currentFunc) {
          this.finalize(currentFunc);
          functions.push(currentFunc);
        }
        currentFunc = this.parseFunctionHeader(line, filePath);
        inHeaderDecls = true;
        continue;
      }

      if (!currentFunc) continue;

      const upperLine = line.toUpperCase().trim();
      if (upperLine.startsWith('#DIM ') || upperLine.startsWith('#DIMS ')) {
        const decl = this.parseDimDecl(line);
        // #DIM/#DIMS are always LOCAL declarations, never parameters. Function parameters
        // come exclusively from the @NAME(...) header (parseFunctionHeader). Pushing these
        // into params here would create a duplicate param that overwrites a header param's
        // default value (e.g. `@F(argCanselNo=-1)` + `#DIM argCanselNo` → -1 clobbered to 0).
        if (decl) {
          currentFunc.dimDecls.push(decl);
        }
        continue;
      }
      inHeaderDecls = false;

      if (line.startsWith('$')) {
        const labelName = line.substring(1).trim().toUpperCase();
        currentFunc.labels.set(labelName, currentFunc.statements.length);
        continue;
      }

      currentFunc.statements.push(line);
    }

    if (currentFunc) {
      this.finalize(currentFunc);
      functions.push(currentFunc);
    }

    return functions;
  }

  private parseFunctionHeader(line: string, filePath: string): EraFunction {
    let header = line.substring(1).trim();
    const parenIdx = header.indexOf('(');
    let funcName: string;
    let paramStr = '';

    if (parenIdx >= 0) {
      funcName = header.substring(0, parenIdx).trim();
      let depth = 0;
      let end = -1;
      for (let i = parenIdx; i < header.length; i++) {
        if (header[i] === '(') depth++;
        if (header[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
      }
      paramStr = header.substring(parenIdx + 1, end >= 0 ? end : header.length);
    } else {
      funcName = header.trim();
    }

    funcName = funcName.toUpperCase();

    const func: EraFunction = {
      name: funcName,
      params: [],
      dimDecls: [],
      labels: new Map(),
      statements: [],
      blocks: new Map(),
      branchToBlock: new Map(),
      endToBlock: new Map(),
      filePath,
    };

    if (paramStr.trim()) {
      const parts = paramStr.split(',').map(s => s.trim()).filter(s => s);
      for (const part of parts) {
        // eraTW headers look like: `ARGS`, `ARGS:0`, `argCanselNo=-1`, `argCanselText="中止"`,
        // `refChoices`. Split off a `=default` and detect string type from a quoted default.
        let namePart = part;
        let defaultValue: number | string | undefined;
        const eqIdx = namePart.indexOf('=');
        if (eqIdx >= 0) {
          const def = namePart.slice(eqIdx + 1).trim();
          namePart = namePart.slice(0, eqIdx).trim();
          if (def.startsWith('"') || def.startsWith('@"')) {
            defaultValue = def.replace(/^@"(.*)"$/, '$1').replace(/^"(.*)"$/, '$1');
          } else {
            defaultValue = parseFloat(def);
            if (isNaN(defaultValue)) defaultValue = 0;
          }
        }
        const upper = namePart.toUpperCase();
        const isStr = upper.startsWith('ARGS') || upper.startsWith('#DIMS') || typeof defaultValue === 'string';
        // Strip a leading "#DIM(S) " prefix, then take the identifier up to ':' / '=' / space.
        const name = namePart
          .replace(/^#DIMS?\s+/i, '')
          .split(/[:=\s]/)[0]
          .trim()
          .toUpperCase();
        if (!name) continue;
        func.params.push({ name, isStr, defaultValue });
      }
    }

    return func;
  }

  private parseDimDecl(line: string): DimDecl | null {
    // #DIM[S] [CONST] [DYNAMIC] [REF] NAME [, size | = value]
    const m = line.match(/^#DIM(S)?\s+(.*)$/i);
    if (!m) return null;
    const isStr = !!m[1];
    let rest = m[2].trim();

    let isConst = false;
    let isRef = false;
    let isDynamic = false;
    for (;;) {
      if (/^CONST\b/i.test(rest)) { isConst = true; rest = rest.replace(/^CONST\s+/i, '').trim(); continue; }
      if (/^DYNAMIC\b/i.test(rest)) { isDynamic = true; rest = rest.replace(/^DYNAMIC\s+/i, '').trim(); continue; }
      if (/^REF\b/i.test(rest)) { isRef = true; rest = rest.replace(/^REF\s+/i, '').trim(); continue; }
      break;
    }

    // NAME is up to the first whitespace / '=' / ',' (CJK names contain no spaces).
    const nameMatch = rest.match(/^([^\s=,]+)(.*)$/);
    if (!nameMatch) return null;
    const name = nameMatch[1].toUpperCase();
    let after = nameMatch[2].trim();

    let size = 1;
    let value: number | string | undefined;
    if (after.startsWith('=')) {
      const valStr = after.slice(1).trim();
      if (isStr) value = valStr.replace(/^"(.*)"$/, '$1');
      else { value = parseFloat(valStr); if (isNaN(value)) value = 0; }
      size = 1;
    } else if (after.startsWith(',')) {
      const sz = parseInt(after.slice(1).trim());
      if (!isNaN(sz)) size = sz;
    }
    if (isDynamic) size = Math.max(size, 1);

    const decl: DimDecl = { name, size, isStr, isConst, value };
    // isRef marks reference-passed string arrays (`#DIMS REF refChoices, 0`).
    (decl as DimDecl & { isRef?: boolean }).isRef = isRef;
    return decl;
  }

  private finalize(func: EraFunction): void {
    this.buildBlocks(func);
  }

  private buildBlocks(func: EraFunction): void {
    const stack: { type: string; start: number; branches: number[] }[] = [];
    const endKeywords: Record<string, string> = {
      'IF': 'ENDIF', 'SELECTCASE': 'ENDSELECT', 'FOR': 'NEXT',
      'WHILE': 'WEND', 'DO': 'LOOP', 'REPEAT': 'REND', 'PRINTDATA': 'ENDDATA',
    };
    const branchKeywords: Record<string, string[]> = {
      'IF': ['ELSEIF', 'ELSE'],
      'SELECTCASE': ['CASE', 'CASEELSE'],
    };

    for (let i = 0; i < func.statements.length; i++) {
      const stmt = func.statements[i];
      const kw = this.getBlockKeyword(stmt);

      if (['IF', 'SELECTCASE', 'FOR', 'WHILE', 'DO', 'REPEAT', 'PRINTDATA'].includes(kw)) {
        stack.push({ type: kw, start: i, branches: [] });
      } else if (kw === 'ELSEIF' || kw === 'ELSE' || kw === 'CASE' || kw === 'CASEELSE' || kw === 'DATA' || kw === 'DATAFORM') {
        if (stack.length > 0) {
          const top = stack[stack.length - 1];
          const expectedBranches = branchKeywords[top.type] || [];
          if (expectedBranches.includes(kw) || top.type === 'PRINTDATA') {
            top.branches.push(i);
          }
        }
      } else if (kw === 'ENDIF' || kw === 'ENDSELECT' || kw === 'NEXT' || kw === 'WEND' || kw === 'LOOP' || kw === 'REND' || kw === 'ENDDATA') {
        if (stack.length > 0) {
          const block = stack.pop()!;
          const expectedEnd = endKeywords[block.type];
          if (expectedEnd === kw) {
            const blockInfo: Block = { type: block.type, start: block.start, branches: block.branches, end: i };
            func.blocks.set(block.start, blockInfo);
            for (const bi of block.branches) {
              func.branchToBlock.set(bi, blockInfo);
            }
            func.endToBlock.set(i, blockInfo);
          }
        }
      }
    }
  }

  private getBlockKeyword(stmt: string): string {
    const trimmed = stmt.trim().toUpperCase();
    const keywords = [
      'ELSEIF', 'ELSE', 'ENDIF', 'IF', 'CASEELSE', 'ENDSELECT', 'SELECTCASE', 'CASE',
      'NEXT', 'FOR', 'WEND', 'WHILE', 'LOOP', 'DO', 'REND', 'REPEAT',
      'ENDDATA', 'PRINTDATA', 'DATAFORM', 'DATA',
    ];
    keywords.sort((a, b) => b.length - a.length);
    for (const kw of keywords) {
      if (trimmed.startsWith(kw)) {
        const next = trimmed[kw.length];
        if (next === undefined || next === ' ' || next === '\t') {
          return kw;
        }
        if (kw === 'DATA' || kw === 'DATAFORM') return kw;
      }
    }
    return '';
  }
}

// ============================================================
// Default Variable Configuration
// ============================================================

const DEFAULT_NUM_VARS: Record<string, number> = {
  FLAG: 10000, TFLAG: 1000, RESULT: 1500, LOCAL: 1000,
  MONEY: 1000, DAY: 1000, TIME: 1000, ITEM: 1000,
  ARG: 1000, COUNT: 100, SELECTCOM: 100, RELATION: 1000,
  RANDDATA: 1000, SAVEDATA: 100,
};

const DEFAULT_STR_VARS: Record<string, number> = {
  LOCALS: 100, ARGS: 100, SAVESTR: 100, RESULTS: 100,
  TSTR: 100, SAVESTRAIN: 100,
};

const DEFAULT_CHARA_NUM_VARS: Record<string, number> = {
  CFLAG: 1000, TALENT: 1000, ABL: 1000, BASE: 200,
  EXP: 1000, UP: 100, DOWN: 100, MARK: 100,
  SOURCE: 200, NOWEX: 100, EX: 100, JUEL: 100,
  PALAM: 100, STAIN: 100, EQUIP: 100, TEQUIP: 100,
  DOWNBASE: 100, UPBASE: 100, EKISS: 100, GOLD: 10,
};

const DEFAULT_CHARA_STR_VARS: Record<string, number> = {
  CSTR: 100, CALLNAME: 1, NAME: 1,
};

const STRING_VAR_NAMES = new Set(['LOCALS', 'ARGS', 'SAVESTR', 'RESULTS', 'TSTR', 'CSTR', 'CALLNAME', 'NAME', 'SAVESTRAIN']);

// ============================================================
// EraEngine - Main Engine Class
// ============================================================

export class EraEngine {
  private gamePath: string = '';

  private numVars: Map<string, NumVar> = new Map();
  private strVars: Map<string, StrVar> = new Map();
  private charaVars: Map<string, CharaVar> = new Map();
  private varSizes: Map<string, number> = new Map();

  private numConsts: Map<string, number> = new Map();
  private strConsts: Map<string, string> = new Map();

  private varNames: Map<string, Map<string, number>> = new Map();

  private functions: Map<string, EraFunction> = new Map();

  private target: number = -1;
  private master: number = -1;
  private charaCount: number = 0;
  private selectCom: number = 0;
  private result: number = 0;
  private resultStr: string = '';
  private mode: string = 'TITLE';

  private callStack: CallFrame[] = [];

  private outputLines: EraOutputLine[] = [];
  private currentLine: EraOutputLine = { text: '' };
  private currentColor: string | undefined;
  private currentBgColor: string | undefined;
  private currentAlignment: Alignment = 'left';

  private waitMode: WaitMode = 'none';
  private inputResolver: ((v: number | string) => void) | null = null;

  // Diagnostic/compatibility mode: when true, unknown builtin functions log their name
  // and return 0 instead of throwing, so a game can keep running and reveal ALL missing
  // pieces in one pass. Production callers should leave it false.
  lenient = false;
  missingBuiltins: Set<string> = new Set();

  // Diagnostic: record where every INPUT/WAIT suspends, so a menu loop can be located.
  trace = false;
  traceLog: string[] = [];

  private gameTitle: string = '';
  private gameAuthor: string = '';
  private gameVersion: string = '';

  private exprCache: Map<string, AstNode> = new Map();

  private charaTemplates: Map<number, Map<string, [number, number] | [string, string]>> = new Map();
  private charaTemplateValues: Map<number, { [varName: string]: Map<number, number> }> = new Map();
  private charaNameIndex: Map<string, number> = new Map(); // name/callname -> chara number (eraTW [[name]] refs)
  private _currentTemplateId: number = -1;

  constructor() {
    this.initDefaultVariables();
  }

  // ============================================================
  // Variable Initialization
  // ============================================================

  private initDefaultVariables(): void {
    for (const [name, size] of Object.entries(DEFAULT_NUM_VARS)) {
      this.numVars.set(name, new NumVar(name, size));
    }
    for (const [name, size] of Object.entries(DEFAULT_STR_VARS)) {
      this.strVars.set(name, new StrVar(name, size));
    }
    for (const [name, size] of Object.entries(DEFAULT_CHARA_NUM_VARS)) {
      if (!this.charaVars.has(name)) {
        this.charaVars.set(name, new CharaVar(name, size, false));
      }
    }
    for (const [name, size] of Object.entries(DEFAULT_CHARA_STR_VARS)) {
      if (!this.charaVars.has(name)) {
        this.charaVars.set(name, new CharaVar(name, size, true));
      }
    }
  }

  private applyVariableSizes(): void {
    for (const [name, size] of this.varSizes) {
      const upper = name.toUpperCase();
      if (STRING_VAR_NAMES.has(upper)) {
        this.strVars.set(upper, new StrVar(upper, size));
      } else if (this.charaVars.has(upper)) {
        const old = this.charaVars.get(upper)!;
        this.charaVars.set(upper, new CharaVar(upper, size, old.isStr));
      } else {
        this.numVars.set(upper, new NumVar(upper, size));
      }
    }
  }

  // ============================================================
  // File Loading
  // ============================================================

  async loadGame(gamePath: string): Promise<void> {
    this.gamePath = gamePath;

    // ERA games ship in (at least) two layouts:
    //   classic Emuera  : VariableSize.csv / GameBase.csv / Chara/ / ERB/ / CSV/ at root
    //   eraTW (this app): everything data-ish under CSV/ (CSV/VariableSize.csv, CSV/GameBase.csv,
    //                     CSV/Chara/), ERB+ERH under ERB/. Search candidates instead of assuming one.
    const csvDir = joinPath(gamePath, 'CSV');
    const erbDir = joinPath(gamePath, 'ERB');

    const varSizeCandidates = [joinPath(csvDir, 'VariableSize.csv'), joinPath(gamePath, 'VariableSize.csv')];
    for (const p of varSizeCandidates) {
      if (await pathExists(p)) { await this.loadVariableSize(p); break; }
    }
    this.applyVariableSizes();

    // ERH (constant / var declarations) can live in ERH/, CSV/, or scattered under ERB/.
    const erhSeen = new Set<string>();
    const loadErhFrom = async (dir: string) => {
      if (!(await pathExists(dir))) return;
      for (const f of await walkDir(dir, '.erh')) {
        const key = f.toLowerCase();
        if (!erhSeen.has(key)) { erhSeen.add(key); await this.loadErhFile(f); }
      }
    };
    await loadErhFrom(joinPath(gamePath, 'ERH'));
    await loadErhFrom(csvDir);
    await loadErhFrom(erbDir);

    await this.loadNameCsvs(gamePath);

    const gameBaseCandidates = [joinPath(csvDir, 'GameBase.csv'), joinPath(gamePath, 'GameBase.csv')];
    for (const p of gameBaseCandidates) {
      if (await pathExists(p)) { await this.loadGameBase(p); break; }
    }

    const charaCandidates = [joinPath(csvDir, 'Chara'), joinPath(gamePath, 'Chara')];
    for (const p of charaCandidates) {
      if (await pathExists(p)) { await this.loadCharaTemplates(p); break; }
    }

    // ERB: prefer ERB/; fall back to the whole root only when there is no ERB/ dir
    // (avoids accidentally ingesting パッチ/patch trees that ship beside ERB/).
    const parser = new ErbParser();
    const parsedNames = new Set<string>();
    const erbDirs = (await pathExists(erbDir)) ? [erbDir] : [gamePath];
    for (const dir of erbDirs) {
      for (const f of await walkDir(dir, '.erb')) {
        try {
          const content = await readFileText(f);
          const funcs = parser.parse(content, f);
          for (const func of funcs) {
            if (!parsedNames.has(func.name)) {
              parsedNames.add(func.name);
              this.functions.set(func.name, func);
            }
          }
        } catch (e) {
          console.error(`Error parsing ERB file ${f}: ${(e as Error).message}`);
        }
      }
    }

    for (const func of this.functions.values()) {
      for (const decl of func.dimDecls) {
        if (decl.isConst && decl.value !== undefined) {
          if (decl.isStr) {
            this.strConsts.set(decl.name, String(decl.value));
          } else {
            this.numConsts.set(decl.name, Number(decl.value));
          }
        }
      }
    }
  }

  private async loadVariableSize(filePath: string): Promise<void> {
    const content = await readFileText(filePath);
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) continue;
      const parts = trimmed.split(',');
      if (parts.length >= 2) {
        const name = parts[0].trim().toUpperCase();
        const size = parseInt(parts[1].trim());
        if (!isNaN(size)) {
          this.varSizes.set(name, size);
        }
      }
    }
  }

  private async loadErhFile(filePath: string): Promise<void> {
    const content = await readFileText(filePath);
    for (const line of content.split(/\r?\n/)) {
      let trimmed = line.trim();
      const semi = trimmed.indexOf(';');
      if (semi >= 0) trimmed = trimmed.substring(0, semi).trim();
      if (!trimmed) continue;

      const dimMatch = trimmed.match(/^#DIM(S)?\s+CONST\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/i);
      if (dimMatch) {
        const isStr = !!dimMatch[1];
        const name = dimMatch[2].toUpperCase();
        const val = dimMatch[3].trim();
        if (isStr) {
          this.strConsts.set(name, val.replace(/^"(.*)"$/, '$1'));
        } else {
          const num = parseFloat(val);
          this.numConsts.set(name, isNaN(num) ? 0 : num);
        }
        continue;
      }

      const dimNonConst = trimmed.match(/^#DIM(S)?\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/i);
      if (dimNonConst) {
        const isStr = !!dimNonConst[1];
        const name = dimNonConst[2].toUpperCase();
        const val = dimNonConst[3].trim();
        if (isStr) {
          this.strConsts.set(name, val.replace(/^"(.*)"$/, '$1'));
        } else {
          const num = parseFloat(val);
          this.numConsts.set(name, isNaN(num) ? 0 : num);
        }
        continue;
      }
    }
  }

  private async loadNameCsvs(gamePath: string): Promise<void> {
    const csvDir = joinPath(gamePath, 'CSV');
    // Standard Emuera names these `<VAR>NAME.csv`; eraTW drops the "NAME" suffix and
    // uses slightly different casing (Abl.csv / Base.csv / Exp.csv / Item.csv ...).
    // Build a case-insensitive index of every .csv we can find, then match both forms.
    const varNames = [
      'FLAG', 'TFLAG', 'CFLAG', 'ITEM', 'TRAIN', 'ABL', 'TALENT', 'EXP', 'MARK',
      'BASE', 'EX', 'NOWEX', 'SOURCE', 'STAIN', 'EQUIP', 'TEQUIP', 'JUEL', 'PALAM',
      'STR', 'CSTR', 'TCVAR',
    ];

    const csvIndex = new Map<string, string>();
    const indexDir = async (dir: string) => {
      if (!(await pathExists(dir))) return;
      for (const f of await walkDir(dir, '.csv')) {
        csvIndex.set(getBaseName(f).toLowerCase(), f);
      }
    };
    await indexDir(csvDir);
    await indexDir(gamePath);

    for (const varName of varNames) {
      const candidates = [`${varName}NAME.csv`, `${varName}.csv`];
      for (const cand of candidates) {
        const full = csvIndex.get(cand.toLowerCase());
        if (full) { await this.loadNameCsv(full, varName); break; }
      }
    }
  }

  private async loadNameCsv(filePath: string, varName: string): Promise<void> {
    const content = await readFileText(filePath);
    const nameMap = new Map<string, number>();
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) continue;
      const parts = trimmed.split(',');
      if (parts.length >= 2) {
        const idx = parseInt(parts[0].trim());
        const name = parts[1].trim();
        if (!isNaN(idx) && name) {
          nameMap.set(name, idx);
        }
      }
    }
    this.varNames.set(varName, nameMap);
  }

  private async loadGameBase(filePath: string): Promise<void> {
    const content = await readFileText(filePath);
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) continue;
      const parts = trimmed.split(',');
      if (parts.length >= 2) {
        const key = parts[0].trim().toUpperCase();
        const val = parts[1].trim();
        // Emuera GameBase.csv keys vary: some games use English, eraTW uses Japanese.
        if (key === 'TITLE' || key === 'タイトル') this.gameTitle = this.gameTitle || val;
        else if (key === 'AUTHOR' || key === '弄ってみた人' || key === '作者') this.gameAuthor = val;
        else if (key === 'VERSION' || key === 'バージョン') this.gameVersion = val;
      }
    }
  }

  private async loadCharaTemplates(charaDir: string): Promise<void> {
    for (const file of await walkDir(charaDir, '.csv')) {
      const baseName = getBaseName(file, '.csv');
      // eraTW names chara files "Chara0.csv", "Chara1 霊夢.csv", "Chara51 にとり.CSV".
      const m = baseName.match(/^Chara\s*(\d+)/i) || baseName.match(/^(\d+)$/);
      if (!m) continue;
      const num = parseInt(m[1]);
      if (isNaN(num)) continue;
      this._currentTemplateId = num;
      const template = await this.parseCharaCsv(file);
      this.charaTemplates.set(num, template);
      // Build name -> chara number for eraTW's `[[name]]` references.
      for (const key of ['NAME', 'CALLNAME']) {
        const rec = template.get(key);
        if (rec) this.charaNameIndex.set(rec[1] as string, num);
      }
      this._currentTemplateId = -1;
    }
  }

  private async parseCharaCsv(filePath: string): Promise<Map<string, [number, number] | [string, string]>> {
    const content = await readFileText(filePath);
    const template = new Map<string, [number, number] | [string, string]>();
    const tmplId = this._currentTemplateId;

    // eraTW's chara CSVs reference stats BY NAME (体力/技巧/処女), not by index, and the
    // first column is a Japanese/English category label. Map category -> chara variable
    // and resolve the stat name to its index via the loaded *NAME.csv tables.
    const CATEGORY_TO_VAR: Record<string, string> = {
      '名前': 'NAME', 'NAME': 'NAME',
      '呼び名': 'CALLNAME', 'CALLNAME': 'CALLNAME',
      '基礎': 'BASE', 'BASE': 'BASE',
      '能力': 'ABL', 'ABL': 'ABL',
      '素質': 'TALENT', 'TALENT': 'TALENT',
      'フラグ': 'CFLAG', 'CFLAG': 'CFLAG',
      '経験': 'EXP', 'EXP': 'EXP',
      '印': 'MARK', 'MARK': 'MARK',
    };

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';')) continue;
      const parts = trimmed.split(',');
      if (parts.length < 2) continue;
      const category = parts[0].trim();
      const varName = CATEGORY_TO_VAR[category.toUpperCase()] || CATEGORY_TO_VAR[category];
      if (!varName) continue;

      if (varName === 'NAME' || varName === 'CALLNAME') {
        template.set(varName, [varName, parts[1].trim()] as [string, string]);
        continue;
      }

      if (parts.length < 3) continue;
      const statName = parts[1].trim();
      const nameMap = this.varNames.get(varName);
      const idx = nameMap ? nameMap.get(statName) : undefined;
      if (idx === undefined) continue;
      // parseInt stops at a trailing ";comment" (eraTW writes e.g. "態度,-1;坦率")
      const val = parseInt(parts[2].trim());
      if (isNaN(val)) continue;

      if (!this.charaTemplateValues.has(tmplId)) {
        this.charaTemplateValues.set(tmplId, {});
      }
      const tmpl = this.charaTemplateValues.get(tmplId)!;
      if (!tmpl[varName]) tmpl[varName] = new Map();
      tmpl[varName].set(idx, val);
    }

    return template;
  }

  // ============================================================
  // Expression Evaluation
  // ============================================================

  private evalExpression(expr: string): number | string {
    expr = expr.trim();
    if (expr === '') return 0;

    if (expr.startsWith('\\@') || expr.startsWith('@@')) {
      const endMarker = expr.startsWith('\\@') ? '\\@' : '@@';
      const endIdx = expr.lastIndexOf(endMarker);
      if (endIdx > 2) {
        const inner = expr.slice(endMarker.length, endIdx);
        const qIdx = inner.indexOf('?');
        if (qIdx >= 0) {
          const sIdx = inner.indexOf('#', qIdx);
          if (sIdx >= 0) {
            const cond = inner.slice(0, qIdx).trim();
            const trueVal = inner.slice(qIdx + 1, sIdx).trim();
            const falseVal = inner.slice(sIdx + 1).trim();
            if (this.evalNum(cond)) {
              return this.evalExpression(trueVal);
            }
            return this.evalExpression(falseVal);
          }
        }
      }
    }

    // Emuera string-reference syntax: %NAME%, %NAME:idx%, %FUNC(...)% force the inner
    // expression to evaluate as a string (e.g. `SAVESTR:x = %eraTW_Version%`). Only treat
    // it as a reference when the WHOLE expression is exactly one %...% pair; a lone % in
    // `5 % 2` is still modulo (handled by the tokenizer below).
    const pctCount = expr.split('%').length - 1;
    if (pctCount === 2 && expr[0] === '%' && expr[expr.length - 1] === '%') {
      const inner = expr.slice(1, -1).trim();
      if (!inner) return '';
      const upper = inner.toUpperCase();
      if (this.isStringVar(upper)) return this.getString(upper, []);
      return String(this.evalExpression(inner));
    }

    let ast = this.exprCache.get(expr);
    if (!ast) {
      let tokens;
      try {
        tokens = tokenize(expr);
      } catch {
        // Bare string (e.g. map ASCII art with zero-width spaces / box-drawing chars)
        // that isn't a parseable expression: treat it as a literal with {}/% interpolation.
        return this.formatString(expr);
      }
      const parser = new ExprParser(tokens);
      try {
        ast = parser.parse();
      } catch {
        return this.formatString(expr);
      }
      if (this.exprCache.size < 5000) {
        this.exprCache.set(expr, ast);
      }
    }

    return this.evalNode(ast);
  }

  private evalNum(expr: string | AstNode): number {
    const v = typeof expr === 'string' ? this.evalExpression(expr) : this.evalNode(expr);
    return typeof v === 'number' ? v : (isNaN(parseFloat(v)) ? 0 : parseFloat(v));
  }

  private evalStr(expr: string | AstNode): string {
    const v = typeof expr === 'string' ? this.evalExpression(expr) : this.evalNode(expr);
    return typeof v === 'string' ? v : String(v);
  }

  // Evaluate a PRINTFORM/HTML_PRINT argument: a string expression where "..." literals
  // are %var%/{expr}-interpolated AND concatenated via '+' with variables/functions
  // (eraTW writes e.g. `HTML_PRINT "<p>" + "<br>" + html + "</p>"`). Falls back to plain
  // formatString when the argument isn't a parseable expression (e.g. `%GAMEBASE_TITLE%`).
  private evalPrintForm(expr: string): string {
    const trimmed = expr.trim();
    if (!trimmed) return '';
    try {
      const tokens = tokenize(trimmed);
      const ast = new ExprParser(tokens).parse();
      return this.evalStringNode(ast);
    } catch {
      return this.formatString(trimmed);
    }
  }

  private evalStringNode(node: AstNode): string {
    switch (node.type) {
      case 'num': return String(node.value);
      case 'str': return this.formatString(node.value);
      case 'var': {
        const n = node.name.toUpperCase();
        const idx = node.indices.map((i) => this.resolveIndex(i, n));
        return this.isStringVar(n) ? this.getString(n, idx) : String(this.getNumber(n, idx));
      }
      case 'call': {
        const v = this.evalBuiltin(node.name, node.args);
        return typeof v === 'string' ? v : String(v);
      }
      case 'unary': {
        const v = this.evalNode(node);
        return typeof v === 'string' ? v : String(v);
      }
      case 'binary': {
        if (node.op === '+') return this.evalStringNode(node.left) + this.evalStringNode(node.right);
        const v = this.evalBinary(node.op, node.left, node.right);
        return typeof v === 'string' ? v : String(v);
      }
    }
    return '';
  }

  private evalNode(node: AstNode): number | string {
    switch (node.type) {
      case 'num': return node.value;
      case 'str': return node.value;
      case 'var': return this.evalVarAccess(node);
      case 'call': return this.evalBuiltin(node.name, node.args);
      case 'unary': return this.evalUnary(node.op, node.operand);
      case 'binary': return this.evalBinary(node.op, node.left, node.right);
    }
  }

  private evalUnary(op: string, operand: AstNode): number | string {
    const v = this.evalNode(operand);
    const num = typeof v === 'number' ? v : parseFloat(v);
    switch (op) {
      case '!': return num ? 0 : 1;
      case '-': return -num;
      default: return v;
    }
  }

  private evalBinary(op: string, left: AstNode, right: AstNode): number | string {
    const lv = this.evalNode(left);
    const rv = this.evalNode(right);

    if (typeof lv === 'string' || typeof rv === 'string') {
      switch (op) {
        case '==': return lv === rv ? 1 : 0;
        case '!=': return lv !== rv ? 1 : 0;
        case '+': return String(lv) + String(rv);
        default: {
          const ln = typeof lv === 'number' ? lv : parseFloat(lv) || 0;
          const rn = typeof rv === 'number' ? rv : parseFloat(rv) || 0;
          return this.numericBinary(op, ln, rn);
        }
      }
    }

    return this.numericBinary(op, lv as number, rv as number);
  }

  private numericBinary(op: string, lv: number, rv: number): number {
    const li = Math.floor(lv);
    const ri = Math.floor(rv);
    switch (op) {
      case '+': return lv + rv;
      case '-': return lv - rv;
      case '*': return lv * rv;
      case '/': return rv !== 0 ? lv / rv : 0;
      case '%': return rv !== 0 ? li % ri : 0;
      case '==': return lv === rv ? 1 : 0;
      case '!=': return lv !== rv ? 1 : 0;
      case '<': return lv < rv ? 1 : 0;
      case '>': return lv > rv ? 1 : 0;
      case '<=': return lv <= rv ? 1 : 0;
      case '>=': return lv >= rv ? 1 : 0;
      case '&&': return (li && ri) ? 1 : 0;
      case '||': return (li || ri) ? 1 : 0;
      case '&': return li & ri;
      case '|': return li | ri;
      case '^': return li ^ ri;
      case '<<': return li << ri;
      case '>>': return li >> ri;
      default: throw new Error(`Unknown operator: ${op}`);
    }
  }

  // ============================================================
  // Variable Access
  // ============================================================

  private evalVarAccess(node: { name: string; indices: AstNode[] }): number | string {
    const name = node.name.toUpperCase();
    const indices = node.indices.map(idx => this.resolveIndex(idx, name));

    if (this.isStringVar(name)) {
      return this.getString(name, indices);
    }
    return this.getNumber(name, indices);
  }

  private resolveIndex(node: AstNode, varName: string): number {
    if (node.type === 'num') return Math.floor(node.value);

    if (node.type === 'var' && node.indices.length === 0) {
      const idName = node.name;
      const upperId = idName.toUpperCase();

      if (this.numConsts.has(upperId)) return Math.floor(this.numConsts.get(upperId)!);

      // eraTW named-character references: CFLAG:[[紫]]:idx → the chara whose name is 紫.
      if (this.charaNameIndex.has(idName)) return this.charaNameIndex.get(idName)!;

      const nameMap = this.varNames.get(varName);
      if (nameMap && nameMap.has(idName)) return nameMap.get(idName)!;

      const v = this.evalNode(node);
      return Math.floor(typeof v === 'number' ? v : (parseFloat(v) || 0));
    }

    const v = this.evalNode(node);
    return Math.floor(typeof v === 'number' ? v : (parseFloat(v) || 0));
  }

  private isStringVar(name: string): boolean {
    if (STRING_VAR_NAMES.has(name)) return true;
    if (this.strVars.has(name)) return true;
    const cv = this.charaVars.get(name);
    if (cv && cv.isStr) return true;
    const frame = this.currentFrame();
    if (frame && frame.localStr.has(name)) return true;
    if (this.strConsts.has(name)) return true;
    return false;
  }

  private currentFrame(): CallFrame | null {
    return this.callStack.length > 0 ? this.callStack[this.callStack.length - 1] : null;
  }

  private getNumber(name: string, indices: number[]): number {
    if (this.numConsts.has(name)) return this.numConsts.get(name)!;

    const frame = this.currentFrame();
    if (frame) {
      if (frame.localNum.has(name)) {
        const arr = frame.localNum.get(name)!;
        const idx = indices[0] ?? 0;
        return idx >= 0 && idx < arr.length ? arr[idx] : 0;
      }
      if (name === 'ARG') {
        const idx = indices[0] ?? 0;
        return frame.argNum[idx] ?? 0;
      }
    }

    switch (name) {
      case 'TARGET': return this.target;
      case 'MASTER': return this.master;
      case 'CHARANUM': return this.charaCount;
      case 'SELECTCOM': return this.selectCom;
      case 'RESULT': return this.result;
      case 'COUNT': {
        if (frame && frame.repeatTarget) return frame.repeatTarget;
        const nv = this.numVars.get('COUNT');
        return nv ? nv.get(indices[0] ?? 0) : 0;
      }
    }

    const nv = this.numVars.get(name);
    if (nv) return nv.get(indices[0] ?? 0);

    const cv = this.charaVars.get(name);
    if (cv) {
      const ci = indices[0] ?? this.target;
      const ai = indices[1] ?? 0;
      return cv.getN(ci, ai);
    }

    return 0;
  }

  private getString(name: string, indices: number[]): string {
    if (this.strConsts.has(name)) return this.strConsts.get(name)!;

    const frame = this.currentFrame();
    if (frame) {
      if (frame.localStr.has(name)) {
        const arr = frame.localStr.get(name)!;
        const idx = indices[0] ?? 0;
        return idx >= 0 && idx < arr.length ? arr[idx] : '';
      }
      if (name === 'ARGS') {
        const idx = indices[0] ?? 0;
        return frame.argStr[idx] ?? '';
      }
    }

    if (name === 'RESULTS') return this.resultStr;

    const sv = this.strVars.get(name);
    if (sv) return sv.get(indices[0] ?? 0);

    const cv = this.charaVars.get(name);
    if (cv && cv.isStr) {
      const ci = indices[0] ?? this.target;
      const ai = indices[1] ?? 0;
      return cv.getS(ci, ai);
    }

    return '';
  }

  private setNumber(name: string, indices: number[], value: number): void {
    const frame = this.currentFrame();

    if (frame && frame.localNum.has(name)) {
      const arr = frame.localNum.get(name)!;
      const idx = indices[0] ?? 0;
      if (idx >= 0 && idx < arr.length) arr[idx] = value;
      return;
    }

    switch (name) {
      case 'TARGET': this.target = Math.floor(value); return;
      case 'MASTER': this.master = Math.floor(value); return;
      case 'SELECTCOM': this.selectCom = Math.floor(value); return;
      case 'RESULT': this.result = Math.floor(value); return;
      case 'COUNT': {
        const nv = this.numVars.get('COUNT');
        if (nv) nv.set(indices[0] ?? 0, value);
        return;
      }
    }

    const nv = this.numVars.get(name);
    if (nv) { nv.set(indices[0] ?? 0, value); return; }

    const cv = this.charaVars.get(name);
    if (cv) {
      const ci = indices[0] ?? this.target;
      const ai = indices[1] ?? 0;
      cv.setN(ci, ai, value);
      return;
    }

    this.numVars.set(name, new NumVar(name, 1000));
    this.numVars.get(name)!.set(indices[0] ?? 0, value);
  }

  private setString(name: string, indices: number[], value: string): void {
    const frame = this.currentFrame();

    if (frame && frame.localStr.has(name)) {
      const arr = frame.localStr.get(name)!;
      const idx = indices[0] ?? 0;
      if (idx >= 0 && idx < arr.length) arr[idx] = value;
      return;
    }

    if (name === 'RESULTS') { this.resultStr = value; return; }

    const sv = this.strVars.get(name);
    if (sv) { sv.set(indices[0] ?? 0, value); return; }

    const cv = this.charaVars.get(name);
    if (cv && cv.isStr) {
      const ci = indices[0] ?? this.target;
      const ai = indices[1] ?? 0;
      cv.setS(ci, ai, value);
      return;
    }

    this.strVars.set(name, new StrVar(name, 100));
    this.strVars.get(name)!.set(indices[0] ?? 0, value);
  }

  // ============================================================
  // Built-in Functions
  // ============================================================

  private evalBuiltin(name: string, args: AstNode[]): number | string {
    const upper = name.toUpperCase();

    switch (upper) {
      case 'RAND': {
        if (args.length === 1) {
          const n = Math.floor(this.evalNum(args[0]));
          return n > 0 ? Math.floor(Math.random() * n) : 0;
        } else if (args.length >= 2) {
          const a = Math.floor(this.evalNum(args[0]));
          const b = Math.floor(this.evalNum(args[1]));
          return a + Math.floor(Math.random() * (b - a + 1));
        }
        return 0;
      }
      case 'ABS': return Math.abs(this.evalNum(args[0]));
      case 'MAX': return Math.max(...args.map(a => this.evalNum(a)));
      case 'MIN': return Math.min(...args.map(a => this.evalNum(a)));
      case 'STRLENS':
      case 'STRLEN': return this.evalStr(args[0]).length;
      case 'TOSTR': return String(this.evalNum(args[0]));
      case 'TOINT': {
        const s = this.evalStr(args[0]);
        return isNaN(parseInt(s)) ? 0 : parseInt(s);
      }
      case 'SUMARRAY': return this.builtinSumArray(args);
      case 'MATCH': return this.builtinMatch(args);
      case 'INRANGE': {
        const v = this.evalNum(args[0]);
        const lo = this.evalNum(args[1]);
        const hi = this.evalNum(args[2]);
        return v >= lo && v <= hi ? 1 : 0;
      }
      case 'GETBIT': {
        const v = Math.floor(this.evalNum(args[0]));
        const b = Math.floor(this.evalNum(args[1]));
        return (v >> b) & 1;
      }
      case 'GROUPMATCH': {
        const v = this.evalNum(args[0]);
        let count = 0;
        for (let i = 1; i < args.length; i++) {
          if (this.evalNum(args[i]) === v) count++;
        }
        return count;
      }
      case 'LIMIT': {
        const v = this.evalNum(args[0]);
        const lo = this.evalNum(args[1]);
        const hi = this.evalNum(args[2]);
        return Math.max(lo, Math.min(hi, v));
      }
      case 'CONVERT': {
        const v = this.evalNum(args[0]);
        const min1 = this.evalNum(args[1]);
        const max1 = this.evalNum(args[2]);
        const min2 = this.evalNum(args[3]);
        const max2 = this.evalNum(args[4]);
        if (max1 === min1) return min2;
        return min2 + (v - min1) * (max2 - min2) / (max1 - min1);
      }
      case 'SIGN': {
        const v = this.evalNum(args[0]);
        return v > 0 ? 1 : v < 0 ? -1 : 0;
      }
      case 'SQRT': return Math.sqrt(this.evalNum(args[0]));
      case 'POWER': return Math.pow(this.evalNum(args[0]), this.evalNum(args[1]));
      case 'LOG': return Math.log(this.evalNum(args[0]));
      case 'LOG10': return Math.log10(this.evalNum(args[0]));
      case 'EXP': return Math.exp(this.evalNum(args[0]));
      case 'SIN': return Math.sin(this.evalNum(args[0]));
      case 'COS': return Math.cos(this.evalNum(args[0]));
      case 'TAN': return Math.tan(this.evalNum(args[0]));
      case 'ASIN': return Math.asin(this.evalNum(args[0]));
      case 'ACOS': return Math.acos(this.evalNum(args[0]));
      case 'ATAN': return Math.atan(this.evalNum(args[0]));
      case 'ATAN2': return Math.atan2(this.evalNum(args[0]), this.evalNum(args[1]));
      case 'FLOOR': return Math.floor(this.evalNum(args[0]));
      case 'CEIL': return Math.ceil(this.evalNum(args[0]));
      case 'ROUND': return Math.round(this.evalNum(args[0]));
      case 'INT': return Math.floor(this.evalNum(args[0]));
      case 'MOD': {
        const a = Math.floor(this.evalNum(args[0]));
        const b = Math.floor(this.evalNum(args[1]));
        return b !== 0 ? a % b : 0;
      }
      case 'MINMAX': {
        const v = this.evalNum(args[0]);
        const lo = this.evalNum(args[1]);
        const hi = this.evalNum(args[2]);
        return Math.max(lo, Math.min(hi, v));
      }
      case 'CHKFONT': return 1;
      case 'SPRITECREATED': return 0;
      case 'FINDELEMENT':
      case 'FIND_LASTELEMENT': return -1;
      case 'GETTIME': return Math.floor(Date.now() / 1000);
      case 'GETMILLISECOND': return Math.floor(Date.now() % 1000);
      case 'GETSECOND': return new Date().getSeconds();
      case 'GETMINUTE': return new Date().getMinutes();
      case 'GETHOUR': return new Date().getHours();
      case 'GETDAY': return new Date().getDate();
      case 'GETMONTH': return new Date().getMonth() + 1;
      case 'GETYEAR': return new Date().getFullYear();
      case 'GETDAYOFWEEK': return new Date().getDay();
      case 'LINECOUNT': return this.outputLines.length;
      case 'CHARANUM': return this.charaCount;
      case 'GETBITCOUNT': {
        const v = Math.floor(this.evalNum(args[0]));
        let count = 0;
        let n = v;
        while (n) { count += n & 1; n >>>= 1; }
        return count;
      }
      case 'GETNUM': {
        if (args.length >= 2 && args[0].type === 'var') {
          const varName = (args[0] as { name: string }).name.toUpperCase();
          const idxName = this.evalStr(args[1]);
          const nameMap = this.varNames.get(varName);
          if (nameMap && nameMap.has(idxName)) return nameMap.get(idxName)!;
        }
        return -1;
      }
      case 'VARSIZE':
      case 'ARRAYSIZE': {
        const varName = this.evalStr(args[0]).trim().toUpperCase();
        return this.getVarSize(varName);
      }
      case 'UNICODE': {
        const s = this.evalStr(args[0]);
        const idx = args.length > 1 ? Math.floor(this.evalNum(args[1])) : 0;
        const chars = [...s];
        if (idx < 0 || idx >= chars.length) return 0;
        return chars[idx].codePointAt(0) ?? 0;
      }
      case 'STRLENU': {
        // full-width aware length (each code point = 1), used for alignment
        return [...this.evalStr(args[0])].length;
      }
      case 'STRFIND':
      case 'INSTR': {
        const hay = this.evalStr(args[0]);
        const needle = this.evalStr(args[1]);
        const start = args.length > 2 ? Math.floor(this.evalNum(args[2])) : 0;
        return hay.indexOf(needle, Math.max(0, start));
      }
      case 'STRCOUNT': {
        const hay = this.evalStr(args[0]);
        const needle = this.evalStr(args[1]);
        if (!needle) return 0;
        let count = 0;
        let from = 0;
        while ((from = hay.indexOf(needle, from)) !== -1) { count++; from += needle.length; }
        return count;
      }
      case 'SUBSTRING':
      case 'MIDSTR': {
        const s = this.evalStr(args[0]);
        const start = Math.floor(this.evalNum(args[1]));
        const len = args.length > 2 ? Math.floor(this.evalNum(args[2])) : s.length;
        if (start < 0 || start >= s.length) return '';
        return s.substr(start, len);
      }
      case 'REPLACE':
      case 'SUBSTITUTE': {
        const s = this.evalStr(args[0]);
        const from = this.evalStr(args[1]);
        const to = args.length > 2 ? this.evalStr(args[2]) : '';
        if (!from) return s;
        return s.split(from).join(to);
      }
      case 'TOFLOAT': {
        const v = parseFloat(this.evalStr(args[0]));
        return isNaN(v) ? 0 : v;
      }
      case 'TOSTRFORM':
      case 'FORM': {
        return String(this.evalNum(args[0]));
      }
      default: {
        // eraTW calls user-defined `#FUNCTIONS`/RETURNF functions inline inside
        // expressions (e.g. `X = HTML_SPACE(3)`). Fall back to a synchronous call.
        const func = this.functions.get(name.toUpperCase());
        if (func) {
          const numArgs: number[] = [];
          const strArgs: string[] = [];
          for (const a of args) {
            const v = this.evalNode(a);
            if (typeof v === 'string') strArgs.push(v);
            else numArgs.push(v);
          }
          const r = this.callFunctionSync(name, numArgs, strArgs);
          return r.str !== '' ? r.str : r.value;
        }
        if (this.lenient) {
          this.missingBuiltins.add(name.toUpperCase());
          return 0;
        }
        throw new Error(`Unknown function: ${name}`);
      }
    }
  }

  private builtinSumArray(args: AstNode[]): number {
    if (args.length === 0 || args[0].type !== 'var') return 0;
    const varNode = args[0] as { name: string; indices: AstNode[] };
    const name = varNode.name.toUpperCase();
    const start = args.length > 1 ? Math.floor(this.evalNum(args[1])) : 0;
    const size = this.getVarSize(name);
    const end = args.length > 2 ? Math.floor(this.evalNum(args[2])) : size;

    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += this.getNumber(name, [i]);
    }
    return sum;
  }

  private builtinMatch(args: AstNode[]): number {
    if (args.length === 0 || args[0].type !== 'var') return 0;
    const varNode = args[0] as { name: string; indices: AstNode[] };
    const name = varNode.name.toUpperCase();
    const matchVal = args.length > 1 ? this.evalNum(args[1]) : 0;
    const start = args.length > 2 ? Math.floor(this.evalNum(args[2])) : 0;
    const size = this.getVarSize(name);
    const end = args.length > 3 ? Math.floor(this.evalNum(args[3])) : size;

    let count = 0;
    for (let i = start; i < end; i++) {
      const v = this.getNumber(name, [i]);
      if (v === matchVal) count++;
    }
    return count;
  }

  private getVarSize(name: string): number {
    const nv = this.numVars.get(name);
    if (nv) return nv.data.length;
    const sv = this.strVars.get(name);
    if (sv) return sv.data.length;
    const cv = this.charaVars.get(name);
    if (cv) return cv.size;
    return 1000;
  }

  // ============================================================
  // String Formatting (PRINTFORM)
  // ============================================================

  private formatString(str: string): string {
    let result = '';
    let i = 0;
    const len = str.length;

    while (i < len) {
      const c = str[i];

      if (c === '%') {
        const end = str.indexOf('%', i + 1);
        if (end > i + 1) {
          const varExpr = str.substring(i + 1, end);
          // %VAR% is a string reference; %VAR, width% is Emuera field formatting
          // (same as {VAR, width}). formatField handles both plus alignment.
          if (varExpr.includes(',')) {
            result += this.formatField(varExpr);
          } else if (this.isStringVar(varExpr.toUpperCase())) {
            result += this.getString(varExpr.toUpperCase(), []);
          } else {
            result += String(this.evalExpression(varExpr));
          }
          i = end + 1;
          continue;
        }
      }

      if (c === '{') {
        const end = str.indexOf('}', i + 1);
        if (end > i + 1) {
          const inner = str.substring(i + 1, end);
          result += this.formatField(inner);
          i = end + 1;
          continue;
        }
      }

      if (c === '\\' && i + 1 < len) {
        const next = str[i + 1];
        if (next === 'n') { result += '\n'; i += 2; continue; }
        if (next === 't') { result += '\t'; i += 2; continue; }
        if (next === '%') { result += '%'; i += 2; continue; }
        if (next === '{') { result += '{'; i += 2; continue; }
        if (next === '}') { result += '}'; i += 2; continue; }
        if (next === '@') { result += '@'; i += 2; continue; }
        if (next === '\\') { result += '\\'; i += 2; continue; }
      }

      result += c;
      i++;
    }

    return result;
  }

  // 计算显示宽度（ASCII 半角算 1，其余全角算 2），与 Emuera 对齐一致
  private displayWidth(s: string): number {
    let w = 0;
    for (const ch of s) {
      w += ch.charCodeAt(0) < 0x80 ? 1 : 2;
    }
    return w;
  }

  // 处理 PRINTFORM 的 {表达式, 对齐, 宽度} 格式化字段
  private formatField(inner: string): string {
    // 按顶层逗号分割（括号内的逗号不分割，兼容 {MAX(A,B), 2, 10} 这类嵌套）
    const parts: string[] = [];
    let depth = 0;
    let cur = '';
    for (const ch of inner) {
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    parts.push(cur);

    const expr = parts[0].trim();
    let value = String(this.evalExpression(expr));

    if (parts.length > 1) {
      const align = parseInt(parts[1].trim(), 10) || 0;
      let width = 0;
      if (parts.length > 2) {
        width = parseInt(parts[2].trim(), 10) || 0;
      }
      if (width > 0) {
        const w = this.displayWidth(value);
        if (w < width) {
          const pad = ' '.repeat(width - w);
          value = align > 0 ? pad + value : value + pad;
        }
      }
    }
    return value;
  }

  // ============================================================
  // Output System
  // ============================================================

  private appendText(text: string): void {
    if (this.currentLine.text === '' && !this.currentLine.color) {
      this.currentLine.color = this.currentColor;
      this.currentLine.bgColor = this.currentBgColor;
      this.currentLine.alignment = this.currentAlignment;
    }
    this.currentLine.text += text;
  }

  private commitLine(): void {
    if (this.currentLine.text !== '' || this.currentLine.buttons !== undefined || this.currentLine.isLine) {
      this.outputLines.push({ ...this.currentLine });
    }
    this.currentLine = {
      text: '',
      color: this.currentColor,
      bgColor: this.currentBgColor,
      alignment: this.currentAlignment,
    };
  }

  private addButton(text: string, value: number | string): void {
    if (!this.currentLine.buttons) this.currentLine.buttons = [];
    this.currentLine.buttons.push({ text, value });
  }

  // ============================================================
  // Async I/O
  // ============================================================

  private async waitForInput(): Promise<number | string> {
    this.commitLine();
    return new Promise<number | string>((resolve) => {
      this.inputResolver = resolve;
    });
  }

  async provideInput(value: number | string): Promise<void> {
    if (this.inputResolver) {
      const r = this.inputResolver;
      this.inputResolver = null;
      this.waitMode = 'none';
      r(value);
    }
  }

  isWaitingForInput(): boolean {
    return this.waitMode === 'input';
  }

  isWaitingForKey(): boolean {
    return this.waitMode === 'key';
  }

  getOutputLines(): EraOutputLine[] {
    return [...this.outputLines];
  }

  clearOutput(): void {
    this.outputLines = [];
    this.currentLine = { text: '' };
  }

  // ============================================================
  // Function Call & Execution
  // ============================================================

  private enterFunction(func: EraFunction, numArgs: number[], strArgs: string[]): CallFrame {
    const localSize = this.varSizes.get('LOCAL') ?? 1000;
    const localsSize = this.varSizes.get('LOCALS') ?? 100;

    const frame: CallFrame = {
      func,
      pc: 0,
      localNum: new Map(),
      localStr: new Map(),
      argNum: numArgs,
      argStr: strArgs,
      sifSkip: false,
      selectValue: 0,
      repeatTarget: 0,
      returnValue: 0,
      returnStr: '',
      returnFlag: false,
      forStack: [],
    };

    frame.localNum.set('LOCAL', new Float64Array(localSize));
    frame.localStr.set('LOCALS', new Array(localsSize).fill(''));

    let numIdx = 0;
    let strIdx = 0;
    for (const param of func.params) {
      if (param.isStr) {
        const v = strIdx < strArgs.length
          ? strArgs[strIdx++]
          : (typeof param.defaultValue === 'string' ? param.defaultValue : '');
        frame.localStr.set(param.name, [v]);
      } else {
        const v = numIdx < numArgs.length
          ? numArgs[numIdx++]
          : (typeof param.defaultValue === 'number' ? param.defaultValue : 0);
        frame.localNum.set(param.name, Float64Array.of(v));
      }
    }

    for (const decl of func.dimDecls) {
      if (decl.isConst) continue;
      const upper = decl.name.toUpperCase();
      if (decl.isStr) {
        // #DIMS / #DIMS REF: the body declaration is authoritative for the type. A
        // same-named header param (e.g. `@COLOREDFIELD(AA, ...)` + `#DIMS REF AA`) would
        // otherwise leave `AA` numeric and string assignments like `AA:0 = ┏━...` would
        // be tokenized as expressions. Force it to a string array.
        if (frame.localNum.has(upper)) frame.localNum.delete(upper);
        if (!frame.localStr.has(upper)) {
          const size = Math.max(decl.size, (decl as DimDecl & { isRef?: boolean }).isRef ? 500 : 1);
          frame.localStr.set(upper, new Array(size).fill(''));
        }
        continue;
      }
      if (frame.localNum.has(upper) || frame.localStr.has(upper)) continue;
      frame.localNum.set(upper, new Float64Array(Math.max(decl.size, 1)));
    }

    return frame;
  }

  private async callFunction(funcName: string, numArgs: number[], strArgs: string[]): Promise<{ value: number; str: string; isReturnF: boolean; didReturn: boolean }> {
    const upper = funcName.toUpperCase();
    const func = this.functions.get(upper);
    if (!func) {
      throw new Error(`Function not found: ${funcName}`);
    }

    // RESTART re-enters the function with the same args and fresh locals.
    for (;;) {
      const frame = this.enterFunction(func, numArgs, strArgs);
      this.callStack.push(frame);

      try {
        await this.executeFrame(frame);
      } catch (e) {
        this.callStack.pop();
        if (e instanceof ReturnSignal) {
          return { value: e.value, str: e.str, isReturnF: e.isReturnF, didReturn: true };
        }
        if (e instanceof RestartSignal) {
          continue;
        }
        throw e;
      }

      this.callStack.pop();
      return { value: frame.returnValue, str: frame.returnStr, isReturnF: frame.returnFlag, didReturn: false };
    }
  }

  private async tryCallFunction(funcName: string, numArgs: number[], strArgs: string[]): Promise<{ value: number; str: string; isReturnF: boolean; found: boolean; didReturn: boolean }> {
    const upper = funcName.toUpperCase();
    if (!this.functions.has(upper)) {
      return { value: 0, str: '', isReturnF: false, found: false, didReturn: false };
    }
    const result = await this.callFunction(funcName, numArgs, strArgs);
    return { ...result, found: true };
  }

  private async executeFrame(frame: CallFrame): Promise<void> {
    const func = frame.func;
    // Guard against runaway game logic (WHILE/REPEAT/FOR that never advances pc) so a
    // single mis-parsed block can't hang the whole app forever.
    const recent: string[] = [];
    let steps = 0;
    const MAX_STEPS = 1000000;

    while (frame.pc >= 0 && frame.pc < func.statements.length) {
      if (++steps > MAX_STEPS) {
        recent.push(func.statements[frame.pc]);
        const tail = recent.slice(-12).map((s) => '  ' + String(s).slice(0, 120)).join('\n');
        throw new Error(`Infinite loop guard (${MAX_STEPS} steps) in @${func.name}, pc=${frame.pc}:\n${tail}`);
      }
      if (recent.length < 12) recent.push(func.statements[frame.pc]);
      if (frame.sifSkip) {
        frame.sifSkip = false;
        frame.pc++;
        continue;
      }

      const stmt = func.statements[frame.pc];
      await this.executeStatement(stmt, frame);
    }
  }

  // ============================================================
  // Statement Execution
  // ============================================================

  private async executeStatement(stmt: string, frame: CallFrame): Promise<void> {
    const trimmed = stmt.trim();
    if (trimmed === '') { frame.pc++; return; }

    const { keyword, rest } = this.getStatementKeyword(trimmed);

    try {
      switch (keyword) {
        case 'PRINT': this.appendText(rest); frame.pc++; break;
        case 'PRINTL': this.appendText(rest); this.commitLine(); frame.pc++; break;
        case 'PRINTW': this.appendText(rest); this.commitLine(); await this.waitForKey(); frame.pc++; break;
        case 'PRINTFORM': this.appendText(this.evalPrintForm(rest)); frame.pc++; break;
        case 'PRINTFORML': this.appendText(this.evalPrintForm(rest)); this.commitLine(); frame.pc++; break;
        case 'PRINTFORMW': this.appendText(this.evalPrintForm(rest)); this.commitLine(); await this.waitForKey(); frame.pc++; break;
        case 'PRINTS': this.appendText(this.evalStr(rest)); frame.pc++; break;
        case 'PRINTSL': this.appendText(this.evalStr(rest)); this.commitLine(); frame.pc++; break;
        case 'PRINTPLAIN': this.appendText(rest); frame.pc++; break;
        case 'PRINTPLAINFORM': this.appendText(this.evalPrintForm(rest)); frame.pc++; break;
        case 'PRINTLC': this.appendText(rest); frame.pc++; break;
        case 'PRINTDATAW': await this.execPrintData(frame); this.commitLine(); await this.waitForKey(); frame.pc++; break;
        case 'PRINTDATA': await this.execPrintData(frame); frame.pc++; break;
        case 'PRINTBUTTON': this.execPrintButton(rest); frame.pc++; break;
        case 'HTML_PRINT': this.appendText(this.evalPrintForm(rest)); this.commitLine(); frame.pc++; break;

        case 'INPUT': await this.execInput(rest, frame, false); break;
        case 'INPUTS': await this.execInput(rest, frame, true); break;
        case 'TINPUT': await this.execInput(rest, frame, false); break;
        case 'TINPUTS': await this.execInput(rest, frame, true); break;
        case 'ONEINPUT': await this.execInput(rest, frame, false); break;
        case 'ONEINPUTS': await this.execInput(rest, frame, true); break;

        case 'IF': this.execIf(rest, frame); break;
        case 'ELSEIF':
        case 'ELSE': {
          const block = frame.func.branchToBlock.get(frame.pc);
          if (block) frame.pc = block.end + 1;
          else frame.pc++;
          break;
        }
        case 'ENDIF': frame.pc++; break;
        case 'SELECTCASE': this.execSelectCase(rest, frame); break;
        case 'CASE': {
          const block = frame.func.branchToBlock.get(frame.pc);
          if (block) frame.pc = block.end + 1;
          else frame.pc++;
          break;
        }
        case 'CASEELSE': {
          const block = frame.func.branchToBlock.get(frame.pc);
          if (block) frame.pc = block.end + 1;
          else frame.pc++;
          break;
        }
        case 'ENDSELECT': frame.pc++; break;
        case 'FOR': this.execFor(rest, frame); break;
        case 'NEXT': this.execNext(frame); break;
        case 'WHILE': this.execWhile(rest, frame); break;
        case 'WEND': this.execWend(frame); break;
        case 'DO': frame.pc++; break;
        case 'LOOP': this.execLoop(rest, frame); break;
        case 'REPEAT': this.execRepeat(rest, frame); break;
        case 'REND': this.execRend(frame); break;
        case 'SIF': this.execSif(rest, frame); break;

        case 'CALL': await this.execCall(rest, frame, false); break;
        case 'TRYCALL': await this.execCall(rest, frame, true); break;
        case 'CALLFORM': await this.execCallForm(rest, frame, false); break;
        case 'TRYCALLFORM': await this.execCallForm(rest, frame, true); break;
        case 'TRYCALLEX':
        case 'CALLEX': await this.execCall(rest, frame, keyword.startsWith('TRY')); break;
        case 'JUMP': await this.execJump(rest, frame); break;
        case 'GOTO': this.execGoto(rest, frame); break;

        case 'RETURN': this.execReturn(rest, frame, false); break;
        case 'RETURNF': this.execReturn(rest, frame, true); break;
        case 'RESTART': throw new RestartSignal();

        case 'BEGIN': this.execBegin(rest); break;
        case 'DOTRAIN': this.execDoTrain(rest, frame); break;
        case 'ADDCHARA': this.execAddChara(rest, frame); break;
        case 'ADDDEFCHARA': this.execAddDefChara(frame); break;
        case 'DELCHARA': this.execDelChara(rest, frame); break;
        case 'LOADGLOBAL': await this.loadState(); frame.pc++; break;
        case 'SAVEGLOBAL': await this.saveState(); frame.pc++; break;
        case 'RESETDATA': this.execResetData(frame); break;
        case 'SAVEGAME': await this.saveState(); frame.pc++; break;
        case 'LOADGAME': await this.loadState(); frame.pc++; break;
        case 'GETTIME': this.execGetTime(frame); break;
        case 'PUTFORM': frame.pc++; break;

        case 'CLEARLINE': this.execClearLine(rest); frame.pc++; break;
        case 'DRAWLINE': this.execDrawLine(); frame.pc++; break;
        case 'CUSTOMDRAWLINE': this.execCustomDrawLine(rest); frame.pc++; break;
        case 'SETCOLOR': this.execSetColor(rest); frame.pc++; break;
        case 'RESETCOLOR': this.currentColor = undefined; frame.pc++; break;
        case 'SETBGCOLOR': this.execSetBgColor(rest); frame.pc++; break;
        case 'RESETBGCOLOR': this.currentBgColor = undefined; frame.pc++; break;
        case 'ALIGNMENT': this.execAlignment(rest); frame.pc++; break;
        case 'REDRAW': frame.pc++; break;

        case 'VARSET': this.execVarSet(rest); frame.pc++; break;
        case 'TIMES': this.execTimes(rest); frame.pc++; break;
        case 'CVARSET': this.execCVarSet(rest); frame.pc++; break;
        case 'ARRAYSHIFT': frame.pc++; break;

        case 'WAIT': await this.waitForKey(); frame.pc++; break;
        case 'DATA':
        case 'DATAFORM': frame.pc++; break;

        default:
          if (this.isAssignment(trimmed)) {
            this.execAssignment(trimmed, frame);
          } else {
            try {
              this.evalExpression(trimmed);
            } catch {
              // Unknown statement - skip
            }
            frame.pc++;
          }
          break;
      }
    } catch (e) {
      if (e instanceof ReturnSignal) {
        // RETURN / RETURNF must exit the current function: propagate the signal up to
        // callFunction(), which pops the frame and hands the value back to the caller.
        // Swallowing it here would leave frame.pc unchanged and re-run the statement.
        throw e;
      }
      if (e instanceof GotoSignal) {
        const labelIdx = frame.func.labels.get(e.label.toUpperCase());
        if (labelIdx !== undefined) {
          frame.pc = labelIdx;
        } else {
          throw new Error(`Label not found: ${e.label} in function ${frame.func.name}`);
        }
        return;
      }
      if (e instanceof BeginSignal) {
        this.mode = e.mode;
        frame.pc = frame.func.statements.length;
        throw e;
      }
      if (e instanceof JumpSignal) {
        throw e;
      }
      throw e;
    }
  }

  // ============================================================
  // Statement Keyword Detection
  // ============================================================

  private getStatementKeyword(stmt: string): { keyword: string; rest: string } {
    const upper = stmt.toUpperCase();

    const keywords = [
      'PRINTFORML', 'PRINTFORMW', 'PRINTFORM', 'PRINTDATAW', 'PRINTPLAINFORM',
      'PRINTBUTTON', 'PRINTPLAIN', 'PRINTLC', 'PRINTSL', 'PRINTS',
      'PRINTL', 'PRINTW', 'PRINTDATA',
      'TRYCALLFORM', 'TRYCALLEX', 'CALLFORM', 'CALLEX', 'TRYCALL', 'CALL',
      'SELECTCASE', 'ELSEIF', 'CASEELSE', 'ENDSELECT',
      'ENDDATA', 'DATAFORM', 'PRINT',
      'RETURNF', 'RETURN',
      'ONEINPUTS', 'ONEINPUT', 'TINPUTS', 'TINPUT', 'INPUTS', 'INPUT',
      'WHILE', 'WEND', 'LOOP', 'REPEAT', 'REND',
      'CLEARLINE', 'DRAWLINE', 'CUSTOMDRAWLINE',
      'SETBGCOLOR', 'RESETBGCOLOR', 'SETCOLOR', 'RESETCOLOR',
      'ALIGNMENT', 'REDRAW',
      'VARSET', 'TIMES', 'CVARSET', 'ARRAYSHIFT',
      'ADDDEFCHARA', 'ADDCHARA', 'DELCHARA',
      'LOADGLOBAL', 'SAVEGLOBAL', 'RESETDATA',
      'SAVEGAME', 'LOADGAME', 'GETTIME', 'PUTFORM',
      'RESTART', 'DOTRAIN', 'BEGIN', 'HTML_PRINT', 'WAIT',
      'PRINTPLAIN', 'DATA',
      'IF', 'ELSE', 'ENDIF', 'FOR', 'NEXT', 'DO',
      'JUMP', 'GOTO', 'CASE', 'SIF',
    ];

    keywords.sort((a, b) => b.length - a.length);

    for (const kw of keywords) {
      if (upper.startsWith(kw)) {
        const nextChar = upper[kw.length];
        if (nextChar === undefined || nextChar === ' ' || nextChar === '\t') {
          const rest = stmt.substring(kw.length).replace(/^\s+/, '');
          return { keyword: kw, rest };
        }
      }
    }

    return { keyword: '', rest: stmt };
  }

  // ============================================================
  // Assignment Detection & Execution
  // ============================================================

  private isAssignment(stmt: string): boolean {
    return this.parseAssignment(stmt) !== null;
  }

  private parseAssignment(stmt: string): { target: string; op: string; expr: string } | null {
    let depth = 0;
    let inStr = false;
    for (let i = 0; i < stmt.length; i++) {
      const c = stmt[i];
      if (c === '"') inStr = !inStr;
      if (inStr) continue;
      if (c === '(') depth++;
      else if (c === ')') depth--;

      if (depth === 0 && !inStr) {
        if (c === '=' && i > 0) {
          const prev = stmt[i - 1];
          if (prev !== '=' && prev !== '!' && prev !== '<' && prev !== '>' && stmt[i + 1] !== '=') {
            return { target: stmt.substring(0, i).trim(), op: '=', expr: stmt.substring(i + 1).trim() };
          }
        }
        if (c === '+' && stmt[i + 1] === '=' && i > 0 && stmt[i - 1] !== '<' && stmt[i - 1] !== '>') {
          return { target: stmt.substring(0, i).trim(), op: '+=', expr: stmt.substring(i + 2).trim() };
        }
        if (c === '-' && stmt[i + 1] === '=' && i > 0 && stmt[i - 1] !== '<' && stmt[i - 1] !== '>') {
          return { target: stmt.substring(0, i).trim(), op: '-=', expr: stmt.substring(i + 2).trim() };
        }
        if (c === '*' && stmt[i + 1] === '=' && i > 0) {
          return { target: stmt.substring(0, i).trim(), op: '*=', expr: stmt.substring(i + 2).trim() };
        }
        if (c === '/' && stmt[i + 1] === '=' && i > 0) {
          return { target: stmt.substring(0, i).trim(), op: '/=', expr: stmt.substring(i + 2).trim() };
        }
      }
    }
    return null;
  }

  private execAssignment(stmt: string, frame: CallFrame): void {
    const assign = this.parseAssignment(stmt);
    if (!assign) {
      frame.pc++;
      return;
    }

    const targetTokens = tokenize(assign.target);
    const parser = new ExprParser(targetTokens);
    const targetNode = parser.parse();

    if (targetNode.type !== 'var') {
      throw new Error(`Invalid assignment target: ${assign.target}`);
    }

    const targetName = targetNode.name.toUpperCase();
    const indices = targetNode.indices.map(idx => this.resolveIndex(idx, targetName));

    // String variables receive interpolated strings: eraTW writes bare strings like
    // `LOCALS = 第{LOCAL:1}年` or `CSTR:x = {LOCAL}/`. evalPrintForm evaluates "..." + var
    // concatenation AND falls back to {} / % interpolation for bare text.
    const targetIsStr = this.isStringVar(targetName);
    const exprVal = targetIsStr ? this.evalPrintForm(assign.expr) : this.evalExpression(assign.expr);
    let result: number | string;

    if (assign.op === '=') {
      result = exprVal;
    } else {
      const cur = this.isStringVar(targetName)
        ? this.getString(targetName, indices)
        : this.getNumber(targetName, indices);

      if (assign.op === '+=') {
        if (typeof exprVal === 'string' || typeof cur === 'string') {
          result = String(cur) + String(exprVal);
        } else {
          result = Number(cur) + Number(exprVal);
        }
      } else if (assign.op === '-=') {
        result = Number(cur) - Number(exprVal);
      } else if (assign.op === '*=') {
        result = Number(cur) * Number(exprVal);
      } else if (assign.op === '/=') {
        const d = Number(exprVal);
        result = d !== 0 ? Number(cur) / d : 0;
      } else {
        result = exprVal;
      }
    }

    if (typeof result === 'string') {
      this.setString(targetName, indices, result);
    } else {
      this.setNumber(targetName, indices, result);
    }

    frame.pc++;
  }

  // ============================================================
  // Control Flow Execution
  // ============================================================

  private execIf(rest: string, frame: CallFrame): void {
    const block = frame.func.blocks.get(frame.pc);

    if (this.evalNum(rest)) {
      frame.pc++;
    } else {
      let found = false;
      if (block) {
        for (const branchIdx of block.branches) {
          const branchStmt = frame.func.statements[branchIdx];
          const { keyword, rest: branchRest } = this.getStatementKeyword(branchStmt.trim());
          if (keyword === 'ELSE') {
            frame.pc = branchIdx + 1;
            found = true;
            break;
          } else if (keyword === 'ELSEIF') {
            if (this.evalNum(branchRest)) {
              frame.pc = branchIdx + 1;
              found = true;
              break;
            }
          }
        }
        if (!found) {
          frame.pc = block.end + 1;
        }
      } else {
        frame.pc++;
      }
    }
  }

  private execSelectCase(rest: string, frame: CallFrame): void {
    const block = frame.func.blocks.get(frame.pc);
    const selVal = this.evalExpression(rest);
    frame.selectValue = selVal;

    let found = false;
    if (block) {
      for (const branchIdx of block.branches) {
        const branchStmt = frame.func.statements[branchIdx];
        const { keyword, rest: branchRest } = this.getStatementKeyword(branchStmt.trim());
        if (keyword === 'CASEELSE') {
          frame.pc = branchIdx + 1;
          found = true;
          break;
        } else if (keyword === 'CASE') {
          if (this.matchCase(branchRest, selVal)) {
            frame.pc = branchIdx + 1;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        frame.pc = block.end + 1;
      }
    } else {
      frame.pc++;
    }
  }

  private matchCase(caseStr: string, selVal: number | string): boolean {
    const parts = this.splitTopLevel(caseStr, ',');
    for (const part of parts) {
      const trimmed = part.trim();
      const upperTrim = trimmed.toUpperCase();
      const toIdx = upperTrim.indexOf(' TO ');
      if (toIdx >= 0) {
        const s = trimmed.substring(0, toIdx).trim();
        const e = trimmed.substring(toIdx + 4).trim();
        const sv = this.evalNum(s);
        const ev = this.evalNum(e);
        const numVal = typeof selVal === 'number' ? selVal : parseFloat(selVal);
        if (numVal >= sv && numVal <= ev) return true;
      } else {
        const v = this.evalExpression(trimmed);
        if (typeof selVal === 'string' && typeof v === 'string') {
          if (v === selVal) return true;
        } else {
          if (this.evalNum(trimmed) === (typeof selVal === 'number' ? selVal : parseFloat(selVal))) return true;
        }
      }
    }
    return false;
  }

  private execFor(rest: string, frame: CallFrame): void {
    const block = frame.func.blocks.get(frame.pc);
    if (!block) { frame.pc++; return; }

    let varName: string;
    let startExpr: string;
    let endExpr: string;
    let stepExpr: string = '1';

    // Emuera FOR syntax is `FOR var, start, end [, step]` — the loop variable is the
    // FIRST comma-separated token (LOCAL / LOCAL:idx / ARRAY[idx] / named arrays), not
    // space-separated. eraTW writes e.g. `FOR LOCAL, 1, CHARANUM` and even
    // `FOR LOCAL,1,CHARANUM` (no spaces). Split the whole clause on top-level commas.
    const parts = this.splitTopLevel(rest, ',');
    if (parts.length < 3) {
      frame.pc = block.end + 1;
      return;
    }
    varName = parts[0].trim().toUpperCase();
    startExpr = parts[1].trim();
    endExpr = parts[2].trim();
    if (parts.length > 3) stepExpr = parts[3].trim();

    const startVal = this.evalNum(startExpr);
    const endVal = this.evalNum(endExpr);
    const step = this.evalNum(stepExpr);

    const varTokens = tokenize(varName);
    const varParser = new ExprParser(varTokens);
    const varNode = varParser.parse();
    if (varNode.type === 'var') {
      const idx = varNode.indices.map(i => this.resolveIndex(i, varNode.name.toUpperCase()));
      this.setNumber(varNode.name.toUpperCase(), idx, startVal);
      frame.forStack.push({
        varName: varNode.name.toUpperCase(),
        indices: idx,
        end: endVal,
        step,
        blockEnd: block.end,
      });
    }

    if ((step > 0 && startVal < endVal) || (step < 0 && startVal > endVal)) {
      frame.pc++;
    } else {
      frame.pc = block.end + 1;
    }
  }

  private execNext(frame: CallFrame): void {
    const block = frame.func.endToBlock.get(frame.pc);
    if (!block || frame.forStack.length === 0) { frame.pc++; return; }

    const loop = frame.forStack[frame.forStack.length - 1];
    const curVal = this.getNumber(loop.varName, loop.indices);
    const newVal = curVal + loop.step;
    this.setNumber(loop.varName, loop.indices, newVal);

    if ((loop.step > 0 && newVal < loop.end) || (loop.step < 0 && newVal > loop.end)) {
      frame.pc = block.start + 1;
    } else {
      frame.forStack.pop();
      frame.pc++;
    }
  }

  private execWhile(rest: string, frame: CallFrame): void {
    const block = frame.func.blocks.get(frame.pc);
    if (!block) { frame.pc++; return; }

    if (this.evalNum(rest)) {
      frame.pc++;
    } else {
      frame.pc = block.end + 1;
    }
  }

  private execWend(frame: CallFrame): void {
    const block = frame.func.endToBlock.get(frame.pc);
    if (!block) { frame.pc++; return; }
    const whileStmt = frame.func.statements[block.start];
    const { rest } = this.getStatementKeyword(whileStmt.trim());
    if (this.evalNum(rest)) {
      frame.pc = block.start + 1;
    } else {
      frame.pc++;
    }
  }

  private execLoop(rest: string, frame: CallFrame): void {
    const block = frame.func.endToBlock.get(frame.pc);
    if (!block) { frame.pc++; return; }

    if (this.evalNum(rest)) {
      frame.pc = block.start + 1;
    } else {
      frame.pc++;
    }
  }

  private execRepeat(rest: string, frame: CallFrame): void {
    const block = frame.func.blocks.get(frame.pc);
    if (!block) { frame.pc++; return; }

    const n = Math.floor(this.evalNum(rest));
    frame.repeatTarget = n;

    const nv = this.numVars.get('COUNT');
    if (nv) nv.set(0, 0);

    if (n > 0) {
      frame.pc++;
    } else {
      frame.pc = block.end + 1;
    }
  }

  private execRend(frame: CallFrame): void {
    const block = frame.func.endToBlock.get(frame.pc);
    if (!block) { frame.pc++; return; }

    const nv = this.numVars.get('COUNT');
    const curCount = nv ? nv.get(0) : 0;
    const newCount = curCount + 1;
    if (nv) nv.set(0, newCount);

    if (newCount < frame.repeatTarget) {
      frame.pc = block.start + 1;
    } else {
      frame.pc++;
    }
  }

  private execSif(rest: string, frame: CallFrame): void {
    const v = this.evalNum(rest);
    if (this.trace) {
      const fn = this.callStack.length ? this.callStack[this.callStack.length - 1].func.name : '(top)';
      if (fn === 'ASK_CHOICES') this.traceLog.push(`SIF @${fn} ${JSON.stringify(rest.slice(0, 60))} => ${v}`);
    }
    if (!v) {
      frame.sifSkip = true;
    }
    frame.pc++;
  }

  // ============================================================
  // Function Call Execution
  // ============================================================

  private parseCallArgs(stmt: string): { funcName: string; argTokens: string[] } {
    const parenIdx = stmt.indexOf('(');
    if (parenIdx >= 0) {
      const funcName = stmt.substring(0, parenIdx).trim();
      let depth = 0;
      let end = -1;
      let inStr = false;
      for (let i = parenIdx; i < stmt.length; i++) {
        const c = stmt[i];
        if (c === '"') inStr = !inStr;
        if (inStr) continue;
        if (c === '(') depth++;
        if (c === ')') { depth--; if (depth === 0) { end = i; break; } }
      }
      const argStr = stmt.substring(parenIdx + 1, end >= 0 ? end : stmt.length);
      const argTokens = argStr.trim() ? this.splitTopLevel(argStr, ',').map(s => s.trim()) : [];
      return { funcName, argTokens };
    }

    const spaceIdx = stmt.search(/\s/);
    if (spaceIdx >= 0) {
      const funcName = stmt.substring(0, spaceIdx).trim();
      const argStr = stmt.substring(spaceIdx + 1).trim();
      const argTokens = argStr ? this.splitTopLevel(argStr, ',').map(s => s.trim()) : [];
      return { funcName, argTokens };
    }

    return { funcName: stmt.trim(), argTokens: [] };
  }

  private evalArgTokens(argTokens: string[]): { numArgs: number[]; strArgs: string[] } {
    const numArgs: number[] = [];
    const strArgs: string[] = [];
    for (const token of argTokens) {
      const v = this.evalExpression(token);
      if (typeof v === 'string') {
        strArgs.push(v);
      } else {
        numArgs.push(v);
      }
    }
    return { numArgs, strArgs };
  }

  private async execCall(rest: string, frame: CallFrame, tryCall: boolean): Promise<void> {
    const { funcName, argTokens } = this.parseCallArgs(rest);
    const { numArgs, strArgs } = this.evalArgTokens(argTokens);

    if (tryCall) {
      const result = await this.tryCallFunction(funcName, numArgs, strArgs);
      if (result.found && result.didReturn) {
        this.result = result.value;
        this.resultStr = result.str;
      } else if (!result.found) {
        this.result = 0;
      }
    } else {
      const result = await this.callFunction(funcName, numArgs, strArgs);
      if (result.didReturn) {
        this.result = result.value;
        this.resultStr = result.str;
      }
    }
    frame.pc++;
  }

  private async execCallForm(rest: string, frame: CallFrame, tryCall: boolean): Promise<void> {
    const strMatch = rest.match(/^"(.*)"\s*(.*)$/);
    let funcName: string;
    let argPart: string;

    if (strMatch) {
      funcName = this.formatString(strMatch[1]);
      argPart = strMatch[2];
    } else {
      const parenIdx = rest.indexOf('(');
      if (parenIdx >= 0) {
        // The CALLFORM name is a literal (possibly {}/% -interpolated) function name,
        // e.g. `CALLFORM MAP_VIEWING(MAIN_MAP)` or `CALLFORM CUSTOM_%ARGS%_MENU(ARG)`.
        // evalStr would evaluate `MAP_VIEWING` as a variable -> 0; formatString keeps it
        // literal while still interpolating {expr} and %var%.
        funcName = this.formatString(rest.substring(0, parenIdx).trim());
        argPart = rest.substring(parenIdx);
      } else {
        funcName = this.formatString(rest.trim());
        argPart = '';
      }
    }

    let argTokens: string[] = [];
    if (argPart.startsWith('(')) {
      const parsed = this.parseCallArgs(funcName + argPart);
      argTokens = parsed.argTokens;
    }

    const { numArgs, strArgs } = this.evalArgTokens(argTokens);

    if (tryCall) {
      const result = await this.tryCallFunction(funcName, numArgs, strArgs);
      if (result.found && result.didReturn) {
        this.result = result.value;
        this.resultStr = result.str;
      } else if (!result.found) {
        this.result = 0;
        this.resultStr = '';
      }
    } else {
      const result = await this.callFunction(funcName, numArgs, strArgs);
      if (result.didReturn) {
        this.result = result.value;
        this.resultStr = result.str;
      }
    }
    frame.pc++;
  }

  private async execJump(rest: string, frame: CallFrame): Promise<void> {
    const { funcName, argTokens } = this.parseCallArgs(rest);
    const { numArgs, strArgs } = this.evalArgTokens(argTokens);
    throw new JumpSignal(funcName, numArgs, strArgs);
  }

  // ============================================================
  // Synchronous function call (inline `FUNC(...)` expressions)
  // ============================================================
  // Emuera lets a `#FUNCTIONS`/RETURNF function be called INLINE inside an expression,
  // e.g. `X = HTML_SPACE(3)`. Those calls happen during (synchronous) expression
  // evaluation, so they cannot await INPUT/WAIT; run a sync executor that covers the
  // pure subset of statements and throws on async ones.

  private callFunctionSync(funcName: string, numArgs: number[], strArgs: string[]): { value: number; str: string } {
    const upper = funcName.toUpperCase();
    const func = this.functions.get(upper);
    if (!func) throw new Error(`Function not found: ${funcName}`);
    for (;;) {
      const frame = this.enterFunction(func, numArgs, strArgs);
      this.callStack.push(frame);
      try {
        let steps = 0;
        while (frame.pc >= 0 && frame.pc < func.statements.length) {
          if (++steps > 1000000) throw new Error(`Infinite loop guard in sync call @${func.name}`);
          this.executeStatementSync(func.statements[frame.pc], frame);
        }
      } catch (e) {
        this.callStack.pop();
        if (e instanceof ReturnSignal) return { value: e.value, str: e.str };
        if (e instanceof RestartSignal) continue;
        throw e;
      }
      this.callStack.pop();
      return { value: frame.returnValue, str: frame.returnStr };
    }
  }

  private executeStatementSync(stmt: string, frame: CallFrame): void {
    const trimmed = stmt.trim();
    if (trimmed === '') { frame.pc++; return; }
    const { keyword, rest } = this.getStatementKeyword(trimmed);
    try {
      switch (keyword) {
        case 'PRINT': this.appendText(rest); frame.pc++; break;
        case 'PRINTL': this.appendText(rest); this.commitLine(); frame.pc++; break;
        case 'PRINTFORM': this.appendText(this.evalPrintForm(rest)); frame.pc++; break;
        case 'PRINTFORML': this.appendText(this.evalPrintForm(rest)); this.commitLine(); frame.pc++; break;
        case 'PRINTS': this.appendText(this.evalStr(rest)); frame.pc++; break;
        case 'PRINTSL': this.appendText(this.evalStr(rest)); this.commitLine(); frame.pc++; break;
        case 'PRINTPLAIN': this.appendText(rest); frame.pc++; break;
        case 'PRINTPLAINFORM': this.appendText(this.evalPrintForm(rest)); frame.pc++; break;
        case 'PRINTLC': this.appendText(rest); frame.pc++; break;
        case 'PRINTBUTTON': this.execPrintButton(rest); frame.pc++; break;
        case 'HTML_PRINT': this.appendText(this.evalPrintForm(rest)); this.commitLine(); frame.pc++; break;
        case 'IF': this.execIf(rest, frame); break;
        case 'ELSEIF': case 'ELSE': { const b = frame.func.branchToBlock.get(frame.pc); frame.pc = b ? b.end + 1 : frame.pc + 1; break; }
        case 'ENDIF': frame.pc++; break;
        case 'SELECTCASE': this.execSelectCase(rest, frame); break;
        case 'CASE': case 'CASEELSE': { const b = frame.func.branchToBlock.get(frame.pc); frame.pc = b ? b.end + 1 : frame.pc + 1; break; }
        case 'ENDSELECT': frame.pc++; break;
        case 'FOR': this.execFor(rest, frame); break;
        case 'NEXT': this.execNext(frame); break;
        case 'WHILE': this.execWhile(rest, frame); break;
        case 'WEND': this.execWend(frame); break;
        case 'DO': frame.pc++; break;
        case 'LOOP': this.execLoop(rest, frame); break;
        case 'REPEAT': this.execRepeat(rest, frame); break;
        case 'REND': this.execRend(frame); break;
        case 'SIF': this.execSif(rest, frame); break;
        case 'GOTO': this.execGoto(rest, frame); break;
        case 'RETURN': case 'RETURNF': this.execReturn(rest, frame, keyword === 'RETURNF'); break;
        case 'RESTART': throw new RestartSignal();
        case 'CALL': case 'TRYCALL': {
          const { funcName, argTokens } = this.parseCallArgs(rest);
          const { numArgs, strArgs } = this.evalArgTokens(argTokens);
          if (keyword === 'TRYCALL' && !this.functions.has(funcName.toUpperCase())) {
            this.result = 0; this.resultStr = '';
          } else {
            const r = this.callFunctionSync(funcName, numArgs, strArgs);
            this.result = r.value; this.resultStr = r.str;
          }
          frame.pc++;
          break;
        }
        case 'VARSET': this.execVarSet(rest); frame.pc++; break;
        case 'TIMES': this.execTimes(rest); frame.pc++; break;
        case 'CVARSET': this.execCVarSet(rest); frame.pc++; break;
        case 'BEGIN': this.execBegin(rest); break;
        case 'CLEARLINE': this.execClearLine(rest); frame.pc++; break;
        case 'SETCOLOR': this.execSetColor(rest); frame.pc++; break;
        case 'RESETCOLOR': this.currentColor = undefined; frame.pc++; break;
        case 'SETBGCOLOR': this.execSetBgColor(rest); frame.pc++; break;
        case 'RESETBGCOLOR': this.currentBgColor = undefined; frame.pc++; break;
        case 'ALIGNMENT': this.execAlignment(rest); frame.pc++; break;
        case 'DRAWLINE': this.execDrawLine(); frame.pc++; break;
        case 'CUSTOMDRAWLINE': this.execCustomDrawLine(rest); frame.pc++; break;
        case 'REDRAW': frame.pc++; break;
        case 'ADDCHARA': this.execAddChara(rest, frame); break;
        case 'ADDDEFCHARA': this.execAddDefChara(frame); break;
        case 'DELCHARA': this.execDelChara(rest, frame); break;
        case 'RESETDATA': this.execResetData(frame); break;
        case 'GETTIME': this.execGetTime(frame); break;
        case 'DOTRAIN': this.execDoTrain(rest, frame); break;
        case 'INPUT': case 'INPUTS': case 'TINPUT': case 'TINPUTS':
        case 'ONEINPUT': case 'ONEINPUTS': case 'PRINTW': case 'PRINTFORMW':
        case 'PRINTDATAW': case 'WAIT': case 'JUMP':
          throw new Error(`@${frame.func.name} uses async statement ${keyword}, which is not supported inside an inline expression`);
        default:
          if (this.isAssignment(trimmed)) this.execAssignment(trimmed, frame);
          else { try { this.evalExpression(trimmed); } catch { /* unknown statement: skip */ } frame.pc++; }
          break;
      }
    } catch (e) {
      if (e instanceof ReturnSignal) throw e;
      if (e instanceof GotoSignal) {
        const idx = frame.func.labels.get(e.label.toUpperCase());
        if (idx !== undefined) { frame.pc = idx; return; }
        throw new Error(`Label not found: ${e.label} in @${frame.func.name}`);
      }
      throw e;
    }
  }

  private execGoto(rest: string, frame: CallFrame): void {
    const label = rest.trim().toUpperCase();
    throw new GotoSignal(label);
  }

  private execReturn(rest: string, frame: CallFrame, isReturnF: boolean): void {
    let value = 0;
    let str = '';

    if (rest.trim()) {
      const parts = this.splitTopLevel(rest, ',');
      if (parts.length > 0) {
        const v = this.evalExpression(parts[0].trim());
        if (typeof v === 'number') value = v;
        else str = v;
      }
      if (parts.length > 1) {
        str = this.evalStr(parts[1].trim());
      }
    }

    this.result = value;
    this.resultStr = str;
    throw new ReturnSignal(value, str, isReturnF);
  }

  // ============================================================
  // Input Execution
  // ============================================================

  private async execInput(rest: string, frame: CallFrame, isString: boolean): Promise<void> {
    this.waitMode = 'input';
    if (this.trace) {
      const fn = this.callStack.length ? this.callStack[this.callStack.length - 1].func.name : '(top)';
      this.traceLog.push(`INPUT @${fn} pc=${frame.pc} rest=${JSON.stringify(rest.slice(0, 40))}`);
    }
    const value = await this.waitForInput();

    if (isString) {
      this.resultStr = String(value);
    } else {
      if (typeof value === 'number') {
        this.result = value;
      } else {
        const num = parseFloat(value);
        this.result = isNaN(num) ? 0 : Math.floor(num);
      }
    }
    frame.pc++;
  }

  private async waitForKey(): Promise<void> {
    this.waitMode = 'key';
    if (this.trace) {
      const fn = this.callStack.length ? this.callStack[this.callStack.length - 1].func.name : '(top)';
      this.traceLog.push(`WAITKEY @${fn}`);
    }
    await this.waitForInput();
  }

  // ============================================================
  // PRINTDATA Execution
  // ============================================================

  private async execPrintData(frame: CallFrame): Promise<void> {
    const block = frame.func.blocks.get(frame.pc);
    if (!block) { frame.pc++; return; }

    const dataEntries: string[] = [];
    for (const branchIdx of block.branches) {
      const stmt = frame.func.statements[branchIdx];
      const { keyword, rest } = this.getStatementKeyword(stmt.trim());
      if (keyword === 'DATA') {
        dataEntries.push(rest);
      } else if (keyword === 'DATAFORM') {
        dataEntries.push(this.evalPrintForm(rest));
      }
    }

    if (dataEntries.length > 0) {
      const idx = Math.floor(Math.random() * dataEntries.length);
      this.appendText(dataEntries[idx]);
    }

    frame.pc = block.end + 1;
  }

  // ============================================================
  // PRINTBUTTON Execution
  // ============================================================

  private execPrintButton(rest: string): void {
    const parts = this.splitTopLevel(rest, ',');
    if (parts.length >= 2) {
      const text = this.evalStr(parts[0].trim());
      const valExpr = parts[1].trim();
      let value: number | string;

      if (valExpr.startsWith('"')) {
        value = this.evalStr(valExpr);
      } else {
        const v = this.evalExpression(valExpr);
        value = typeof v === 'number' ? v : String(v);
      }
      this.addButton(text, value);
    }
  }

  // ============================================================
  // Display Execution
  // ============================================================

  private execClearLine(rest: string): void {
    const n = rest.trim() ? Math.floor(this.evalNum(rest.trim())) : 1;
    for (let i = 0; i < n && this.outputLines.length > 0; i++) {
      this.outputLines.pop();
    }
  }

  private execDrawLine(): void {
    this.currentLine.isLine = true;
    this.commitLine();
  }

  private execCustomDrawLine(rest: string): void {
    const ch = rest.trim() || '-';
    this.currentLine.isLine = true;
    this.currentLine.text = ch.repeat(40);
    this.commitLine();
  }

  private execSetColor(rest: string): void {
    const trimmed = rest.trim();
    if (trimmed.includes(',')) {
      const parts = trimmed.replace(/"/g, '').split(',');
      if (parts.length >= 3) {
        const r = Math.floor(this.evalNum(parts[0].trim()));
        const g = Math.floor(this.evalNum(parts[1].trim()));
        const b = Math.floor(this.evalNum(parts[2].trim()));
        this.currentColor = `rgb(${r},${g},${b})`;
      }
    } else if (trimmed) {
      const val = Math.floor(this.evalNum(trimmed));
      this.currentColor = `#${(val & 0xFFFFFF).toString(16).padStart(6, '0')}`;
    }
  }

  private execSetBgColor(rest: string): void {
    const trimmed = rest.trim();
    if (trimmed.includes(',')) {
      const parts = trimmed.split(',');
      if (parts.length >= 3) {
        const r = Math.floor(this.evalNum(parts[0].trim()));
        const g = Math.floor(this.evalNum(parts[1].trim()));
        const b = Math.floor(this.evalNum(parts[2].trim()));
        this.currentBgColor = `rgb(${r},${g},${b})`;
      }
    } else if (trimmed) {
      const val = Math.floor(this.evalNum(trimmed));
      this.currentBgColor = `#${(val & 0xFFFFFF).toString(16).padStart(6, '0')}`;
    }
  }

  private execAlignment(rest: string): void {
    const mode = rest.trim().toUpperCase();
    if (mode === 'LEFT' || mode === 'CENTER' || mode === 'RIGHT') {
      this.currentAlignment = mode.toLowerCase() as Alignment;
    }
  }

  // ============================================================
  // Variable Operations
  // ============================================================

  private execVarSet(rest: string): void {
    const parts = this.splitTopLevel(rest, ',');
    if (parts.length === 0) return;

    const varExpr = parts[0].trim();
    const value = parts.length > 1 ? this.evalExpression(parts[1].trim()) : 0;
    const start = parts.length > 2 ? Math.floor(this.evalNum(parts[2].trim())) : 0;
    const end = parts.length > 3 ? Math.floor(this.evalNum(parts[3].trim())) : this.getVarSize(varExpr.toUpperCase());

    const varTokens = tokenize(varExpr);
    const varParser = new ExprParser(varTokens);
    const varNode = varParser.parse();

    if (varNode.type === 'var') {
      const name = varNode.name.toUpperCase();
      const indices = varNode.indices.map(idx => this.resolveIndex(idx, name));

      if (typeof value === 'string') {
        for (let i = start; i < end; i++) {
          this.setString(name, [...indices.slice(0, -1), i], value);
        }
      } else {
        for (let i = start; i < end; i++) {
          this.setNumber(name, [...indices.slice(0, -1), i], value);
        }
      }
    }
  }

  private execTimes(rest: string): void {
    const parts = this.splitTopLevel(rest, ',');
    if (parts.length < 2) return;

    const varExpr = parts[0].trim();
    const multiplier = this.evalNum(parts[1].trim());

    const varTokens = tokenize(varExpr);
    const varParser = new ExprParser(varTokens);
    const varNode = varParser.parse();

    if (varNode.type === 'var') {
      const name = varNode.name.toUpperCase();
      const indices = varNode.indices.map(idx => this.resolveIndex(idx, name));
      const cur = this.getNumber(name, indices);
      this.setNumber(name, indices, Math.floor(cur * multiplier));
    }
  }

  private execCVarSet(rest: string): void {
    const parts = this.splitTopLevel(rest, ',');
    if (parts.length < 3) return;

    const varName = parts[0].trim().toUpperCase();
    const idx = Math.floor(this.evalNum(parts[1].trim()));
    const value = this.evalNum(parts[2].trim());
    const start = parts.length > 3 ? Math.floor(this.evalNum(parts[3].trim())) : 0;
    const end = parts.length > 4 ? Math.floor(this.evalNum(parts[4].trim())) : this.charaCount;

    const cv = this.charaVars.get(varName);
    if (cv) {
      for (let i = start; i < end; i++) {
        cv.setN(i, idx, value);
      }
    }
  }

  // ============================================================
  // System Execution
  // ============================================================

  private execBegin(rest: string): void {
    const mode = rest.trim().toUpperCase();
    throw new BeginSignal(mode);
  }

  private execDoTrain(rest: string, frame: CallFrame): void {
    const n = rest.trim() ? Math.floor(this.evalNum(rest.trim())) : 0;
    this.selectCom = n;
    this.mode = 'TRAIN';
    throw new BeginSignal('TRAIN');
  }

  private execAddChara(rest: string, frame: CallFrame): void {
    const templateId = rest.trim() ? Math.floor(this.evalNum(rest.trim())) : 0;

    for (const cv of this.charaVars.values()) {
      cv.addChara();
    }
    const charaIdx = this.charaCount;
    this.charaCount++;

    const template = this.charaTemplateValues.get(templateId);
    if (template) {
      for (const [varName, valueMap] of Object.entries(template)) {
        const cv = this.charaVars.get(varName.toUpperCase());
        if (cv) {
          for (const [idx, val] of valueMap) {
            cv.setN(charaIdx, idx, val);
          }
        }
      }
    }

    const tmpl = this.charaTemplates.get(templateId);
    if (tmpl) {
      const nameData = tmpl.get('NAME');
      if (nameData) {
        const cv = this.charaVars.get('NAME');
        if (cv) cv.setS(charaIdx, 0, nameData[1] as string);
      }
      const callNameData = tmpl.get('CALLNAME');
      if (callNameData) {
        const cv = this.charaVars.get('CALLNAME');
        if (cv) cv.setS(charaIdx, 0, callNameData[1] as string);
      }
    }

    frame.pc++;
  }

  private execAddDefChara(frame: CallFrame): void {
    for (const cv of this.charaVars.values()) {
      cv.addChara();
    }
    this.charaCount++;
    frame.pc++;
  }

  private execDelChara(rest: string, frame: CallFrame): void {
    const idx = rest.trim() ? Math.floor(this.evalNum(rest.trim())) : 0;
    for (const cv of this.charaVars.values()) {
      if (idx >= 0 && idx < cv.data.length) {
        cv.data.splice(idx, 1);
      }
    }
    if (idx < this.charaCount) this.charaCount--;
    frame.pc++;
  }

  private execResetData(frame: CallFrame): void {
    for (const nv of this.numVars.values()) {
      nv.fill(0);
    }
    for (const sv of this.strVars.values()) {
      sv.fill('');
    }
    for (const cv of this.charaVars.values()) {
      cv.data = [];
    }
    this.charaCount = 0;
    this.target = -1;
    this.master = -1;
    this.result = 0;
    this.resultStr = '';
    frame.pc++;
  }

  private execGetTime(frame: CallFrame): void {
    this.result = Math.floor(Date.now() / 1000);
    frame.pc++;
  }

  // ============================================================
  // Utility
  // ============================================================

  private splitTopLevel(str: string, sep: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let inStr = false;
    let current = '';
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === '"') { inStr = !inStr; current += c; continue; }
      if (inStr) { current += c; continue; }
      if (c === '(') { depth++; current += c; continue; }
      if (c === ')') { depth--; current += c; continue; }
      if (c === '[') { depth++; current += c; continue; }
      if (c === ']') { depth--; current += c; continue; }
      if (depth === 0 && c === sep) { parts.push(current); current = ''; continue; }
      current += c;
    }
    if (current.trim()) parts.push(current);
    return parts;
  }

  // ============================================================
  // Main Engine Interface
  // ============================================================

  async start(): Promise<void> {
    try {
      if (this.functions.has('EVENTFIRST')) {
        await this.callFunction('EVENTFIRST', [], []);
      } else if (this.functions.has('SYSTEM_TITLE')) {
        await this.callFunction('SYSTEM_TITLE', [], []);
      }
    } catch (e) {
      if (e instanceof BeginSignal) {
        this.mode = e.mode;
      } else if (e instanceof JumpSignal) {
        this.mode = 'TITLE';
      } else {
        throw e;
      }
    }

    while (this.mode !== 'EXIT' && this.mode !== 'NONE') {
      // Resolve mode -> entry function with candidates, because games name these
      // inconsistently (standard Emuera uses @TRAIN/@TURNEND; eraTW uses @EVENTTRAIN/
      // @EVENTTURNEND). Try each candidate until one exists.
      let candidates: string[] = [];
      switch (this.mode.toUpperCase()) {
        case 'TITLE': candidates = ['SYSTEM_TITLE', 'TITLE']; break;
        case 'FIRST': candidates = ['EVENTFIRST', 'FIRST']; break;
        case 'SHOP': candidates = ['SHOP', 'SHOW_SHOP', 'EVENTTRAIN']; break;
        case 'TRAIN': candidates = ['EVENTTRAIN', 'TRAIN']; break;
        case 'ABLITY': case 'ABLUP': candidates = ['ABLUP', 'COM_ABLUP', 'ABLITY', 'EVENTTRAIN']; break;
        case 'TURN': case 'TURNEND': candidates = ['EVENTTURNEND', 'TURNEND', 'EVENTTRAIN']; break;
        case 'AFTERTRAIN': candidates = ['AFTERTRAIN', 'EVENTAFTERTRAIN', 'EVENTTRAIN', 'EVENTTURNEND']; break;
        case 'EXIT': return;
        default: return;
      }

      let modeFunc = candidates.find((c) => this.functions.has(c)) || '';
      if (!modeFunc) {
        // No handler for this mode: fall back to the title screen instead of dying.
        this.mode = 'TITLE';
        modeFunc = this.functions.has('SYSTEM_TITLE') ? 'SYSTEM_TITLE'
          : this.functions.has('TITLE') ? 'TITLE' : '';
        if (!modeFunc) break;
      }

      try {
        await this.callFunction(modeFunc, [], []);
      } catch (e) {
        if (e instanceof BeginSignal) {
          this.mode = e.mode;
        } else if (e instanceof JumpSignal) {
          try {
            const result = await this.callFunction(e.funcName, e.numArgs, e.strArgs);
            this.result = result.value;
          } catch (e2) {
            if (e2 instanceof BeginSignal) {
              this.mode = e2.mode;
            } else {
              throw e2;
            }
          }
        } else {
          throw e;
        }
      }
    }
  }

  // ============================================================
  // Public Getters
  // ============================================================

  getGameTitle(): string { return this.gameTitle; }
  getGameAuthor(): string { return this.gameAuthor; }
  getGameVersion(): string { return this.gameVersion; }
  getCharaCount(): number { return this.charaCount; }
  getMode(): string { return this.mode; }

  // ============================================================
  // Save / Load (SAVEGAME / LOADGAME / SAVEGLOBAL / LOADGLOBAL)
  // ============================================================

  private saveStatePath(): string {
    return joinPath(this.gamePath, 'save_data.json');
  }

  private serializeState(): string {
    const numVars: Record<string, number[]> = {};
    for (const [name, nv] of this.numVars) numVars[name] = Array.from(nv.data);

    const strVars: Record<string, string[]> = {};
    for (const [name, sv] of this.strVars) strVars[name] = [...sv.data];

    const charaVars: Record<string, { isStr: boolean; size: number; data: (number[] | string[])[] }> = {};
    for (const [name, cv] of this.charaVars) {
      charaVars[name] = {
        isStr: cv.isStr,
        size: cv.size,
        data: cv.data.map((a) => Array.from(a as unknown as ArrayLike<number | string>)) as (number[] | string[])[],
      };
    }

    return JSON.stringify({
      v: 1,
      mode: this.mode,
      target: this.target,
      master: this.master,
      charaCount: this.charaCount,
      selectCom: this.selectCom,
      result: this.result,
      resultStr: this.resultStr,
      numVars,
      strVars,
      charaVars,
      numConsts: Object.fromEntries(this.numConsts),
      strConsts: Object.fromEntries(this.strConsts),
      varNames: Object.fromEntries([...this.varNames].map(([k, v]) => [k, Object.fromEntries(v)])),
      varSizes: Object.fromEntries(this.varSizes),
    });
  }

  private deserializeState(json: string): void {
    const s = JSON.parse(json);
    if (!s || s.v !== 1) return;

    this.mode = s.mode ?? 'TITLE';
    this.target = s.target ?? -1;
    this.master = s.master ?? -1;
    this.charaCount = s.charaCount ?? 0;
    this.selectCom = s.selectCom ?? 0;
    this.result = s.result ?? 0;
    this.resultStr = s.resultStr ?? '';

    if (s.numVars) {
      for (const [name, arr] of Object.entries(s.numVars)) {
        const nv = this.numVars.get(name) || new NumVar(name, 1);
        nv.data = Float64Array.from(arr as number[]);
        this.numVars.set(name, nv);
      }
    }
    if (s.strVars) {
      for (const [name, arr] of Object.entries(s.strVars)) {
        const sv = this.strVars.get(name) || new StrVar(name, 1);
        sv.data = [...(arr as string[])];
        this.strVars.set(name, sv);
      }
    }
    if (s.charaVars) {
      for (const [name, c] of Object.entries(s.charaVars)) {
        const cc = c as { isStr: boolean; size: number; data: (number[] | string[])[] };
        const cv = this.charaVars.get(name) || new CharaVar(name, cc.size || 1, cc.isStr);
        cv.size = cc.size || 1;
        cv.isStr = cc.isStr;
        if (cc.isStr) {
          cv.data = (cc.data as string[][]).map((a) => [...a]);
        } else {
          cv.data = (cc.data as number[][]).map((a) => Float64Array.from(a));
        }
        this.charaVars.set(name, cv);
      }
    }
    if (s.numConsts) {
      for (const [k, v] of Object.entries(s.numConsts)) this.numConsts.set(k, Number(v));
    }
    if (s.strConsts) {
      for (const [k, v] of Object.entries(s.strConsts)) this.strConsts.set(k, String(v));
    }
    if (s.varNames) {
      for (const [k, v] of Object.entries(s.varNames)) {
        this.varNames.set(k, new Map(Object.entries(v as Record<string, number>)));
      }
    }
    if (s.varSizes) {
      for (const [k, v] of Object.entries(s.varSizes)) this.varSizes.set(k, Number(v));
    }
  }

  async saveState(): Promise<void> {
    if (!this.gamePath) return;
    try {
      await FileSystem.writeAsStringAsync(this.saveStatePath(), this.serializeState(), { encoding: 'utf8' });
    } catch (e) {
      console.error(`eraEngine saveState failed: ${(e as Error).message}`);
    }
  }

  async loadState(): Promise<boolean> {
    if (!this.gamePath) return false;
    try {
      const info = await FileSystem.getInfoAsync(this.saveStatePath());
      if (!info.exists) return false;
      const json = await FileSystem.readAsStringAsync(this.saveStatePath(), { encoding: 'utf8' });
      this.deserializeState(json);
      return true;
    } catch (e) {
      console.error(`eraEngine loadState failed: ${(e as Error).message}`);
      return false;
    }
  }

  dispose(): void {
    this.outputLines.length = 0;
    this.callStack.length = 0;
    this.functions.clear();
    this.numVars.clear();
    this.strVars.clear();
    this.charaVars.clear();
    this.numConsts.clear();
    this.strConsts.clear();
    this.varNames.clear();
    this.varSizes.clear();
    this.charaTemplates.clear();
    this.charaTemplateValues.clear();
    this.exprCache.clear();
    this.waitMode = 'none';
    this.mode = 'NONE';
  }
}
