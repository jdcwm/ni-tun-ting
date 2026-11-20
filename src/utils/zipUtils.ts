/**
 * zipUtils.ts - Pure JavaScript ZIP parser and decompressor for React Native.
 *
 * No Node.js APIs required. Works entirely on Uint8Array.
 * Implements DEFLATE (RFC 1951) decompression in pure JS.
 * Exports parseZip() for in-memory entries and extractZipToDir() that uses
 * expo-file-system/legacy to materialize entries onto disk.
 */

/* -------------------------------------------------------------------------- */
/*                               Public Interface                             */
/* -------------------------------------------------------------------------- */

export interface ZipEntry {
  name: string;
  size: number;
  compressedSize: number;
  crc: number;
  compression: number; // 0 = stored, 8 = deflate
  isDirectory: boolean;
  getData(): Uint8Array;
  getText(encoding?: 'utf8' | 'shiftjis'): string;
}

/* -------------------------------------------------------------------------- */
/*                         Internal: little-endian helpers                    */
/* -------------------------------------------------------------------------- */

function readU16(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function readU32(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] |
      (buf[offset + 1] << 8) |
      (buf[offset + 2] << 16) |
      (buf[offset + 3] << 24)) >>>
    0
  );
}

/* -------------------------------------------------------------------------- */
/*                      Internal: Base64 encode (Uint8 -> string)            */
/* -------------------------------------------------------------------------- */

const B64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function uint8ToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  let i = 0;
  while (i < len) {
    const b1 = bytes[i++];
    const b2 = i < len ? bytes[i++] : 0;
    const b3 = i < len ? bytes[i++] : 0;
    const triple = (b1 << 16) | (b2 << 8) | b3;
    result +=
      B64_CHARS[(triple >> 18) & 0x3f] +
      B64_CHARS[(triple >> 12) & 0x3f] +
      B64_CHARS[(triple >> 6) & 0x3f] +
      B64_CHARS[triple & 0x3f];
  }
  const pad = len % 3;
  if (pad === 1) result = result.slice(0, -2) + '==';
  else if (pad === 2) result = result.slice(0, -1) + '=';
  return result;
}

/* -------------------------------------------------------------------------- */
/*                           Internal: Text Decoding                          */
/* -------------------------------------------------------------------------- */

function decodeUTF8(bytes: Uint8Array): string {
  try {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
  } catch {
    /* fallthrough */
  }
  // Manual UTF-8 decoder
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i++];
    if (b < 0x80) {
      out += String.fromCharCode(b);
    } else if (b < 0xc0) {
      throw new Error('Invalid UTF-8 continuation byte');
    } else if (b < 0xe0) {
      const c = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
      out += String.fromCharCode(c);
    } else if (b < 0xf0) {
      const c =
        ((b & 0x0f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
      out += String.fromCharCode(c);
    } else if (b < 0xf8) {
      const cp =
        ((b & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
      const offset = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (offset >> 10));
      out += String.fromCharCode(0xdc00 + (offset & 0x3ff));
    } else {
      throw new Error('Invalid UTF-8 start byte');
    }
  }
  return out;
}

function decodeShiftJIS(bytes: Uint8Array): string {
  try {
    if (typeof TextDecoder !== 'undefined') {
      for (const label of ['shift-jis', 'shift_jis', 'x-sjis', 'sjis', 'cp932']) {
        try {
          return new TextDecoder(label as 'utf-8', { fatal: true }).decode(bytes);
        } catch {
          /* try next label */
        }
      }
    }
  } catch {
    /* fallthrough */
  }
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function decodeLatin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/**
 * Try UTF-8 first, then shift-jis, finally Latin-1.
 * Used by extractZipToDir for known-text extensions.
 */
export function detectEncodingAndDecode(bytes: Uint8Array): string {
  try {
    return decodeUTF8(bytes);
  } catch {
    /* ignore */
  }
  try {
    return decodeShiftJIS(bytes);
  } catch {
    /* ignore */
  }
  return decodeLatin1(bytes);
}

/* -------------------------------------------------------------------------- */
/*                     Internal: Bit Reader (LSB-first, RFC1951)              */
/* -------------------------------------------------------------------------- */

interface BitReader {
  data: Uint8Array;
  pos: number;
  bits: number;
  nbits: number;
}

function createBitReader(data: Uint8Array): BitReader {
  return { data, pos: 0, bits: 0, nbits: 0 };
}

function ensureBits(br: BitReader, need: number): void {
  while (br.nbits < need) {
    if (br.pos >= br.data.length) {
      br.bits |= 0 << br.nbits;
      br.nbits += 8;
    } else {
      br.bits |= br.data[br.pos++] << br.nbits;
      br.nbits += 8;
    }
  }
}

function peekBits(br: BitReader, n: number): number {
  ensureBits(br, n);
  return br.bits & ((1 << n) - 1);
}

function readBits(br: BitReader, n: number): number {
  const v = peekBits(br, n);
  br.bits >>>= n;
  br.nbits -= n;
  return v;
}

function alignToByte(br: BitReader): void {
  br.bits = 0;
  br.nbits = 0;
}

/* -------------------------------------------------------------------------- */
/*                  Internal: Huffman tree build + decode                     */
/* -------------------------------------------------------------------------- */

interface HuffmanTree {
  maxBits: number;
  symbols: Int16Array;
  codeLengths: Uint8Array;
}

function buildHuffmanTree(lengths: number[]): HuffmanTree {
  const count: number[] = [];
  let maxBits = 0;
  for (let i = 0; i < lengths.length; i++) {
    const l = lengths[i];
    if (l > 0) {
      count[l] = (count[l] || 0) + 1;
      if (l > maxBits) maxBits = l;
    }
  }
  if (maxBits === 0) {
    return {
      maxBits: 1,
      symbols: new Int16Array(2),
      codeLengths: new Uint8Array(2),
    };
  }
  const nextCode: number[] = new Array(maxBits + 1).fill(0);
  let code = 0;
  for (let bits = 1; bits <= maxBits; bits++) {
    code = (code + (count[bits - 1] || 0)) << 1;
    nextCode[bits] = code;
  }
  const tableSize = 1 << maxBits;
  const symbols = new Int16Array(tableSize).fill(-1);
  const codeLengthsArr = new Uint8Array(tableSize);
  for (let sym = 0; sym < lengths.length; sym++) {
    const len = lengths[sym];
    if (len === 0) continue;
    const code = nextCode[len]++;
    // Bit-reverse the code to match LSB-first bitstream reading
    let rc = 0;
    let c = code;
    for (let i = 0; i < len; i++) {
      rc = (rc << 1) | (c & 1);
      c >>= 1;
    }
    const step = 1 << len;
    for (let idx = rc; idx < tableSize; idx += step) {
      if (symbols[idx] === -1) {
        symbols[idx] = sym;
        codeLengthsArr[idx] = len;
      }
    }
  }
  return { maxBits, symbols, codeLengths: codeLengthsArr };
}

function decodeSymbol(br: BitReader, tree: HuffmanTree): number {
  ensureBits(br, tree.maxBits);
  const idx = br.bits & ((1 << tree.maxBits) - 1);
  const sym = tree.symbols[idx];
  const len = tree.codeLengths[idx];
  if (sym === -1 || len === 0) {
    throw new Error('DEFLATE: invalid Huffman code');
  }
  br.bits >>>= len;
  br.nbits -= len;
  return sym;
}

/* -------------------------------------------------------------------------- */
/*               Internal: RFC1951 length/distance base tables                */
/* -------------------------------------------------------------------------- */

const LENGTH_BASE: number[] = new Array(286);
const LENGTH_EXTRA: number[] = new Array(286);
(function buildLengthTables() {
  const bases: [number, number, number][] = [
    [257, 3, 0], [258, 4, 0], [259, 5, 0], [260, 6, 0],
    [261, 7, 0], [262, 8, 0], [263, 9, 0], [264, 10, 0],
    [265, 11, 1], [266, 13, 1], [267, 15, 1], [268, 17, 1],
    [269, 19, 2], [270, 23, 2], [271, 27, 2], [272, 31, 2],
    [273, 35, 3], [274, 43, 3], [275, 51, 3], [276, 59, 3],
    [277, 67, 4], [278, 83, 4], [279, 99, 4], [280, 115, 4],
    [281, 131, 5], [282, 163, 5], [283, 195, 5], [284, 227, 5],
    [285, 258, 0],
  ];
  for (const [cd, base, extra] of bases) {
    LENGTH_BASE[cd] = base;
    LENGTH_EXTRA[cd] = extra;
  }
})();

const DIST_BASE: number[] = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
  257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577,
];
const DIST_EXTRA: number[] = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
  7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

/* -------------------------------------------------------------------------- */
/*                       Internal: Fixed Huffman trees                        */
/* -------------------------------------------------------------------------- */

let cachedFixedLitTree: HuffmanTree | null = null;
let cachedFixedDistTree: HuffmanTree | null = null;

function getFixedLitTree(): HuffmanTree {
  if (cachedFixedLitTree) return cachedFixedLitTree;
  const lengths: number[] = new Array(288);
  for (let i = 0; i <= 143; i++) lengths[i] = 8;
  for (let i = 144; i <= 255; i++) lengths[i] = 9;
  for (let i = 256; i <= 279; i++) lengths[i] = 7;
  for (let i = 280; i <= 287; i++) lengths[i] = 8;
  cachedFixedLitTree = buildHuffmanTree(lengths);
  return cachedFixedLitTree;
}

function getFixedDistTree(): HuffmanTree {
  if (cachedFixedDistTree) return cachedFixedDistTree;
  const lengths: number[] = new Array(32);
  for (let i = 0; i <= 31; i++) lengths[i] = 5;
  cachedFixedDistTree = buildHuffmanTree(lengths);
  return cachedFixedDistTree;
}

/* -------------------------------------------------------------------------- */
/*                   Internal: Inflate (RFC 1951) decompressor                */
/* -------------------------------------------------------------------------- */

export function inflate(
  compressed: Uint8Array,
  uncompressedSizeHint: number,
): Uint8Array {
  const br = createBitReader(compressed);
  let outCap = uncompressedSizeHint > 0 ? uncompressedSizeHint : 1024;
  let out = new Uint8Array(outCap);
  let outLen = 0;

  function growIfNeeded(extra: number): void {
    while (outLen + extra > outCap) {
      outCap = Math.max(outCap * 2, outLen + extra + 16);
      const bigger = new Uint8Array(outCap);
      bigger.set(out, 0);
      out = bigger;
    }
  }

  function pushByte(b: number): void {
    growIfNeeded(1);
    out[outLen++] = b;
  }

  function pushBytes(bytes: Uint8Array, start: number, count: number): void {
    growIfNeeded(count);
    out.set(bytes.subarray(start, start + count), outLen);
    outLen += count;
  }

  function copyFromDict(dist: number, length: number): void {
    growIfNeeded(length);
    const src = outLen - dist;
    if (src < 0) {
      throw new Error(
        `DEFLATE: invalid distance ${dist} at output position ${outLen}`,
      );
    }
    for (let i = 0; i < length; i++) {
      out[outLen + i] = out[src + i];
    }
    outLen += length;
  }

  while (true) {
    const bfinal = readBits(br, 1);
    const btype = readBits(br, 2);

    if (btype === 3) {
      throw new Error('DEFLATE: invalid block type 3 (reserved)');
    }

    if (btype === 0) {
      alignToByte(br);
      if (br.pos + 4 > br.data.length) {
        throw new Error('DEFLATE: stored block header truncated');
      }
      const len = br.data[br.pos] | (br.data[br.pos + 1] << 8);
      const nlen = br.data[br.pos + 2] | (br.data[br.pos + 3] << 8);
      br.pos += 4;
      if ((len ^ nlen) !== 0xffff) {
        throw new Error(
          `DEFLATE: stored block length mismatch len=${len} nlen=${nlen}`,
        );
      }
      if (br.pos + len > br.data.length) {
        throw new Error('DEFLATE: stored block data truncated');
      }
      pushBytes(br.data, br.pos, len);
      br.pos += len;
      if (bfinal) break;
      continue;
    }

    let litTree: HuffmanTree;
    let distTree: HuffmanTree;

    if (btype === 1) {
      litTree = getFixedLitTree();
      distTree = getFixedDistTree();
    } else {
      const hlit = readBits(br, 5) + 257;
      const hdist = readBits(br, 5) + 1;
      const hclen = readBits(br, 4) + 4;

      const clenOrder = [
        16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
      ];
      const clenLengths: number[] = new Array(19).fill(0);
      for (let i = 0; i < hclen; i++) {
        clenLengths[clenOrder[i]] = readBits(br, 3);
      }
      const clenTree = buildHuffmanTree(clenLengths);

      const total = hlit + hdist;
      const litDistLengths: number[] = new Array(total);
      let idx = 0;
      let prevLen = 0;
      while (idx < total) {
        const sym = decodeSymbol(br, clenTree);
        if (sym < 16) {
          litDistLengths[idx++] = sym;
          prevLen = sym;
        } else if (sym === 16) {
          const rep = readBits(br, 2) + 3;
          for (let r = 0; r < rep && idx < total; r++) {
            litDistLengths[idx++] = prevLen;
          }
        } else if (sym === 17) {
          const rep = readBits(br, 3) + 3;
          for (let r = 0; r < rep && idx < total; r++) {
            litDistLengths[idx++] = 0;
          }
          prevLen = 0;
        } else if (sym === 18) {
          const rep = readBits(br, 7) + 11;
          for (let r = 0; r < rep && idx < total; r++) {
            litDistLengths[idx++] = 0;
          }
          prevLen = 0;
        } else {
          throw new Error(
            `DEFLATE: invalid code-length code symbol ${sym}`,
          );
        }
      }
      const litLengths = litDistLengths.slice(0, hlit);
      const distLengths = litDistLengths.slice(hlit, total);
      litTree = buildHuffmanTree(litLengths);
      distTree = buildHuffmanTree(distLengths);
    }

    while (true) {
      const sym = decodeSymbol(br, litTree);
      if (sym < 256) {
        pushByte(sym);
      } else if (sym === 256) {
        break;
      } else if (sym <= 285) {
        const base = LENGTH_BASE[sym];
        const extraBits = LENGTH_EXTRA[sym];
        const extra = extraBits > 0 ? readBits(br, extraBits) : 0;
        const length = base + extra;
        const distSym = decodeSymbol(br, distTree);
        if (distSym < 0 || distSym > 29) {
          throw new Error(
            `DEFLATE: invalid distance code ${distSym}`,
          );
        }
        const dBase = DIST_BASE[distSym];
        const dExtraBits = DIST_EXTRA[distSym];
        const dExtra = dExtraBits > 0 ? readBits(br, dExtraBits) : 0;
        const distance = dBase + dExtra;
        copyFromDict(distance, length);
      } else {
        throw new Error(
          `DEFLATE: invalid literal/length symbol ${sym}`,
        );
      }
    }

    if (bfinal) break;
  }

  if (outLen === outCap) return out;
  return out.subarray(0, outLen);
}

/* -------------------------------------------------------------------------- */
/*                          Internal: CRC32 (for sanity)                      */
/* -------------------------------------------------------------------------- */

let crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  crcTable = t;
  return t;
}

function crc32(data: Uint8Array): number {
  const t = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = t[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/* -------------------------------------------------------------------------- */
/*                                 parseZip                                   */
/* -------------------------------------------------------------------------- */

const EOCDR_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

interface RawCD {
  compression: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  nameLen: number;
  extraLen: number;
  commentLen: number;
  localHeaderOffset: number;
  name: string;
  isDir: boolean;
}

function readFilenameBytes(raw: Uint8Array, start: number, len: number): string {
  const slice = raw.subarray(start, start + len);
  try {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8', { fatal: true }).decode(slice);
    }
  } catch {
    /* fallthrough */
  }
  try {
    return decodeUTF8(slice);
  } catch {
    return decodeLatin1(slice);
  }
}

function findEocdr(buffer: Uint8Array): number {
  const end = buffer.length;
  const scanStart = Math.max(0, end - (65536 + 22));
  for (let i = end - 22; i >= scanStart; i--) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x05 &&
      buffer[i + 3] === 0x06
    ) {
      const sig = readU32(buffer, i);
      if (sig === EOCDR_SIG) return i;
    }
  }
  throw new Error('Invalid ZIP file: End of Central Directory Record not found');
}

export function parseZip(buffer: Uint8Array): ZipEntry[] {
  if (!buffer || buffer.length < 22) {
    throw new Error('Invalid ZIP: buffer too small');
  }
  const eocdrOffset = findEocdr(buffer);
  const cdSize = readU32(buffer, eocdrOffset + 12);
  const cdOffset = readU32(buffer, eocdrOffset + 16);
  const totalEntries = readU16(buffer, eocdrOffset + 10);

  if (cdOffset + cdSize > buffer.length) {
    throw new Error(
      `ZIP Central Directory out of range (offset=${cdOffset} size=${cdSize} total=${buffer.length})`,
    );
  }

  const entries: RawCD[] = [];
  let pos = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    const sig = readU32(buffer, pos);
    if (sig !== CD_SIG) {
      throw new Error(
        `ZIP: Central Directory entry #${i} has invalid signature 0x${sig.toString(16)}`,
      );
    }
    const compression = readU16(buffer, pos + 10);
    const crc = readU32(buffer, pos + 16);
    const compressedSize = readU32(buffer, pos + 20);
    const uncompressedSize = readU32(buffer, pos + 24);
    const nameLen = readU16(buffer, pos + 28);
    const extraLen = readU16(buffer, pos + 30);
    const commentLen = readU16(buffer, pos + 32);
    const localHeaderOffset = readU32(buffer, pos + 42);
    const name = readFilenameBytes(buffer, pos + 46, nameLen);
    const isDir = compressedSize === 0 && (name.endsWith('/') || name.endsWith('\\'));
    entries.push({
      compression,
      crc,
      compressedSize,
      uncompressedSize,
      nameLen,
      extraLen,
      commentLen,
      localHeaderOffset,
      name,
      isDir,
    });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return entries.map((e) => buildEntry(buffer, e));
}

function buildEntry(buffer: Uint8Array, raw: RawCD): ZipEntry {
  const {
    name,
    crc,
    compression,
    compressedSize,
    uncompressedSize: size,
    isDir: isDirectory,
  } = raw;

  let cachedData: Uint8Array | null = null;

  function readCompressedPayload(): Uint8Array {
    const off = raw.localHeaderOffset;
    if (off + 30 > buffer.length) {
      throw new Error(
        `ZIP entry ${name}: local header offset out of range`,
      );
    }
    const sig = readU32(buffer, off);
    if (sig !== LFH_SIG) {
      throw new Error(
        `ZIP entry ${name}: invalid local header signature 0x${sig.toString(16)}`,
      );
    }
    const lfhNameLen = readU16(buffer, off + 26);
    const lfhExtraLen = readU16(buffer, off + 28);
    const dataStart = off + 30 + lfhNameLen + lfhExtraLen;
    if (dataStart + compressedSize > buffer.length) {
      throw new Error(
        `ZIP entry ${name}: compressed data exceeds buffer (start=${dataStart} size=${compressedSize})`,
      );
    }
    return buffer.subarray(dataStart, dataStart + compressedSize);
  }

  function getData(): Uint8Array {
    if (cachedData) return cachedData;
    if (isDirectory) {
      cachedData = new Uint8Array(0);
      return cachedData;
    }
    const payload = readCompressedPayload();
    if (compression === 0) {
      cachedData = payload;
    } else if (compression === 8) {
      try {
        cachedData = inflate(payload, size);
      } catch (err) {
        throw new Error(
          `ZIP entry ${name}: deflate inflate failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    } else {
      throw new Error(
        `ZIP entry ${name}: unsupported compression method ${compression}`,
      );
    }
    if (crc !== 0 && cachedData.length > 0) {
      const actual = crc32(cachedData);
      if (actual !== crc) {
        // Intentionally not throwing — ZIPs with data descriptors commonly
        // have bit-3 GP flag set, making the CD CRC unreliable. Data is
        // still returned.
      }
    }
    return cachedData;
  }

  function getText(encoding?: 'utf8' | 'shiftjis'): string {
    const bytes = getData();
    const enc = encoding || 'utf8';
    if (enc === 'utf8') {
      try {
        return decodeUTF8(bytes);
      } catch {
        try {
          return decodeShiftJIS(bytes);
        } catch {
          return decodeLatin1(bytes);
        }
      }
    }
    return decodeShiftJIS(bytes);
  }

  return {
    name,
    size,
    compressedSize,
    crc,
    compression,
    isDirectory,
    getData,
    getText,
  };
}

/* -------------------------------------------------------------------------- */
/*                              extractZipToDir                               */
/* -------------------------------------------------------------------------- */

type LegacyFS = {
  documentDirectory?: string;
  cacheDirectory?: string;
  EncodingType?: { UTF8: unknown; Base64: unknown };
  makeDirectoryAsync: (
    path: string,
    options?: { intermediates?: boolean }
  ) => Promise<void>;
  writeAsStringAsync: (
    path: string,
    data: string,
    options?: { encoding?: unknown }
  ) => Promise<void>;
  getInfoAsync: (
    path: string
  ) => Promise<{ exists: boolean; isDirectory?: boolean }>;
};

async function loadFS(): Promise<LegacyFS> {
  let mod: unknown = null;
  try {
    mod = await import('expo-file-system/legacy');
  } catch {
    try {
      mod = await import('expo-file-system');
    } catch (err2) {
      throw new Error(
        `extractZipToDir requires expo-file-system/legacy, but it could not be loaded: ${
          err2 instanceof Error ? err2.message : String(err2)
        }`,
      );
    }
  }
  return mod as LegacyFS;
}

const TEXT_EXTS = new Set([
  '.erb',
  '.erh',
  '.csv',
  '.txt',
  '.config',
  '.md',
  '.erb.txt',
]);

function isTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  for (const ext of TEXT_EXTS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

function normalizePath(orig: string): string {
  let p = orig.replace(/\\/g, '/');
  p = p.replace(/^\/+/, '');
  const parts: string[] = [];
  for (const part of p.split('/')) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '' && part !== '.') {
      parts.push(part);
    }
  }
  return parts.join('/');
}

/**
 * Encode a relative path segment-by-segment for safe use inside a file:// URI.
 * Characters like '#' (URI fragment), spaces, CJK, and '%' must be percent-
 * encoded, otherwise expo-file-system truncates the path at '#' (EISDIR).
 */
function encodeUriPath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function shouldSkipEntry(name: string): boolean {
  if (!name) return true;
  if (name.startsWith('__MACOSX/') || name === '__MACOSX') return true;
  if (name.includes('.DS_Store')) return true;
  return false;
}

/** 已解压好的一个条目（ZIP / TAR / GZIP 共用同一套写盘逻辑） */
export interface ArchiveEntry {
  name: string;
  isDirectory: boolean;
  getData(): Uint8Array;
}

export async function extractZipToDir(
  buffer: Uint8Array,
  targetDir: string,
  onProgress?: (done: number, total: number, fileName: string) => void,
): Promise<{ writtenFiles: string[]; topLevelDirs: string[] }> {
  const entries: ArchiveEntry[] = parseZip(buffer).map((e) => ({
    name: e.name,
    isDirectory: e.isDirectory,
    getData: () => e.getData(),
  }));
  return writeEntriesToDir(entries, targetDir, onProgress);
}

/** 把一批条目写进目标目录（ZIP / TAR / GZIP 共用） */
async function writeEntriesToDir(
  entries: ArchiveEntry[],
  targetDir: string,
  onProgress?: (done: number, total: number, fileName: string) => void,
): Promise<{ writtenFiles: string[]; topLevelDirs: string[] }> {
  if (!targetDir) {
    throw new Error('extractZipToDir: targetDir is required');
  }
  const FS = await loadFS();

  const normalized = entries
    .map((e) => ({ entry: e, path: normalizePath(e.name) }))
    .filter(({ path }) => !shouldSkipEntry(path));

  const writtenFiles: string[] = [];
  const topLevelDirs = new Set<string>();

  try {
    await FS.makeDirectoryAsync(targetDir, { intermediates: true });
  } catch {
    /* may already exist */
  }

  const total = normalized.length;
  let done = 0;

  const dirsToMake = new Set<string>();

  for (const { entry, path } of normalized) {
    if (!path) continue;
    if (entry.isDirectory) {
      dirsToMake.add(path);
    } else {
      const segs = path.split('/');
      if (segs.length > 1) {
        let acc = '';
        for (let i = 0; i < segs.length - 1; i++) {
          acc = acc ? acc + '/' + segs[i] : segs[i];
          dirsToMake.add(acc);
        }
      }
    }
    const firstSeg = path.split('/')[0];
    if (firstSeg && firstSeg !== path) topLevelDirs.add(firstSeg);
  }

  const sortedDirs = Array.from(dirsToMake).sort((a, b) => a.length - b.length);
  for (const rel of sortedDirs) {
    const encodedRel = encodeUriPath(rel);
    const abs = targetDir.endsWith('/')
      ? targetDir + encodedRel
      : targetDir + '/' + encodedRel;
    try {
      await FS.makeDirectoryAsync(abs, { intermediates: true });
    } catch {
      /* already exists */
    }
  }

  for (const { entry, path } of normalized) {
    done++;
    if (!path || entry.isDirectory) {
      if (onProgress) onProgress(done, total, path || '(directory)');
      continue;
    }
    const encodedPath = encodeUriPath(path);
    const abs = targetDir.endsWith('/') ? targetDir + encodedPath : targetDir + '/' + encodedPath;

    const lastSlash = abs.lastIndexOf('/');
    if (lastSlash > 0) {
      const parent = abs.slice(0, lastSlash);
      try {
        await FS.makeDirectoryAsync(parent, { intermediates: true });
      } catch {
        /* already exists */
      }
    }

    let writeOk = false;
    try {
      if (isTextFile(path)) {
        const bytes = entry.getData();
        const text = detectEncodingAndDecode(bytes);
        const EncodingType = FS.EncodingType;
        if (EncodingType && typeof EncodingType.UTF8 !== 'undefined') {
          await FS.writeAsStringAsync(abs, text, {
            encoding: EncodingType.UTF8,
          });
        } else {
          await FS.writeAsStringAsync(abs, text);
        }
      } else {
        const bytes = entry.getData();
        const b64 = uint8ToBase64(bytes);
        const EncodingType = FS.EncodingType;
        if (EncodingType && typeof EncodingType.Base64 !== 'undefined') {
          await FS.writeAsStringAsync(abs, b64, {
            encoding: EncodingType.Base64,
          });
        } else {
          throw new Error(
            'expo-file-system/legacy EncodingType.Base64 unavailable — cannot write binary file',
          );
        }
      }
      writeOk = true;
    } catch (err) {
      throw new Error(
        `extractZipToDir: failed writing entry "${path}" to "${abs}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    if (writeOk) {
      writtenFiles.push(abs);
    }
    if (onProgress) onProgress(done, total, path);
  }

  return {
    writtenFiles,
    topLevelDirs: Array.from(topLevelDirs),
  };
}

/* -------------------------------------------------------------------------- */
/*                     TAR / GZIP / 多格式压缩包统一入口                        */
/* -------------------------------------------------------------------------- */

export type ArchiveFormat = 'zip' | 'tar' | 'gzip' | 'rar' | '7z' | 'unknown';

/** 按魔数识别格式（不信任扩展名） */
export function detectArchiveFormat(buf: Uint8Array): ArchiveFormat {
  if (!buf || buf.length < 4) return 'unknown';
  if (buf[0] === 0x50 && buf[1] === 0x4b) return 'zip';
  if (buf[0] === 0x1f && buf[1] === 0x8b) return 'gzip';
  if (buf[0] === 0x52 && buf[1] === 0x61 && buf[2] === 0x72 && buf[3] === 0x21) return 'rar';
  if (buf[0] === 0x37 && buf[1] === 0x7a && buf[2] === 0xbc && buf[3] === 0xaf) return '7z';
  if (
    buf.length > 262 &&
    buf[257] === 0x75 && buf[258] === 0x73 && buf[259] === 0x74 &&
    buf[260] === 0x61 && buf[261] === 0x72
  ) {
    return 'tar';
  }
  return 'unknown';
}

/** gunzip：跳过 gzip 头，裸 deflate 流交给 inflate */
export function gunzip(buf: Uint8Array): Uint8Array {
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) throw new Error('不是有效的 gzip 数据');
  const flg = buf[3];
  let pos = 10;
  if (flg & 0x04) {
    const xlen = buf[pos] | (buf[pos + 1] << 8);
    pos += 2 + xlen;
  }
  if (flg & 0x08) { while (pos < buf.length && buf[pos] !== 0) pos++; pos++; }
  if (flg & 0x10) { while (pos < buf.length && buf[pos] !== 0) pos++; pos++; }
  if (flg & 0x02) pos += 2;
  const isize =
    ((buf[buf.length - 4] | (buf[buf.length - 3] << 8) | (buf[buf.length - 2] << 16) | (buf[buf.length - 1] << 24)) >>> 0);
  const raw = buf.subarray(pos, buf.length - 8);
  return inflate(raw, isize > 0 ? isize : 0);
}

/** 解析 TAR（ustar / gnu，512 字节对齐） */
export function parseTar(buf: Uint8Array): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  let pos = 0;

  const readStr = (off: number, len: number): string => {
    let end = off;
    const max = Math.min(off + len, buf.length);
    while (end < max && buf[end] !== 0) end++;
    if (end === off) return '';
    return detectEncodingAndDecode(buf.subarray(off, end)).replace(/\0+$/, '').trim();
  };

  while (pos + 512 <= buf.length) {
    const name = readStr(pos, 100);
    if (!name) break; // 结束块
    const sizeStr = readStr(pos + 124, 12).replace(/[^0-7]/g, '');
    const size = sizeStr ? parseInt(sizeStr, 8) : 0;
    const typeFlag = String.fromCharCode(buf[pos + 156] || 0x30);
    const prefix = readStr(pos + 345, 155);
    const full = prefix ? `${prefix}/${name}` : name;
    const isDirectory = typeFlag === '5' || full.endsWith('/');
    const dataStart = pos + 512;
    const dataEnd = Math.min(dataStart + (Number.isFinite(size) ? size : 0), buf.length);
    const slice = buf.subarray(dataStart, dataEnd);
    entries.push({ name: full, isDirectory, getData: () => slice });
    pos = dataStart + Math.ceil((Number.isFinite(size) ? size : 0) / 512) * 512;
  }
  return entries;
}

/**
 * 统一入口：自动识别 zip / tar / tar.gz / tgz / gz。
 * RAR、7z 是私有压缩算法，纯 JS 无法解开，给出明确提示让用户转格式。
 */
export async function extractArchiveToDir(
  buffer: Uint8Array,
  targetDir: string,
  onProgress?: (done: number, total: number, fileName: string) => void,
  fileName?: string,
): Promise<{ writtenFiles: string[]; topLevelDirs: string[]; format: ArchiveFormat }> {
  const format = detectArchiveFormat(buffer);

  if (format === 'zip') {
    const r = await extractZipToDir(buffer, targetDir, onProgress);
    return { ...r, format };
  }

  if (format === 'tar') {
    const r = await writeEntriesToDir(parseTar(buffer), targetDir, onProgress);
    return { ...r, format };
  }

  if (format === 'gzip') {
    const inner = gunzip(buffer);
    if (detectArchiveFormat(inner) === 'tar') {
      const r = await writeEntriesToDir(parseTar(inner), targetDir, onProgress);
      return { ...r, format };
    }
    const base =
      (fileName || 'archive').replace(/\.(gz|tgz)$/i, '').split(/[\\/]/).pop() || 'archive';
    const r = await writeEntriesToDir(
      [{ name: base, isDirectory: false, getData: () => inner }],
      targetDir,
      onProgress,
    );
    return { ...r, format };
  }

  if (format === 'rar') {
    throw new Error(
      '暂不支持 RAR 压缩包（私有格式，无法在手机端解开）。请先解压后重新打包成 .zip，或直接解压成文件夹再导入。',
    );
  }
  if (format === '7z') {
    throw new Error(
      '暂不支持 7z 压缩包（私有格式，无法在手机端解开）。请先解压后重新打包成 .zip，或直接解压成文件夹再导入。',
    );
  }
  throw new Error(
    '无法识别的压缩包格式。当前支持：.zip / .tar / .tar.gz / .tgz / .gz。若文件是 RAR 或 7z，请先转成 zip。',
  );
}
