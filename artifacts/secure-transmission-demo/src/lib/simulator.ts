export type ByteStep = {
  index: number;
  sourceByte: number;
  cipherByte: number;
  encoded: number[];
  received: number[];
  corrected: number[];
  syndrome: number;
  correction: number | null;
  correctedBit: number | null;
};

export type Simulation = {
  plaintext: string;
  plainBytes: number[];
  cipherBytes: number[];
  steps: ByteStep[];
  receivedBytes: number[];
  recovered: string;
  injected: { byteIndex: number; bitIndex: number } | null;
};

const KEY = new Uint8Array([
  0x73, 0x65, 0x63, 0x75, 0x72, 0x65, 0x2d, 0x75,
  0x61, 0x72, 0x74, 0x2d, 0x64, 0x65, 0x6d, 0x6f,
  0x2d, 0x6b, 0x65, 0x79, 0x2d, 0x32, 0x35, 0x36,
  0x2d, 0x62, 0x69, 0x74, 0x2d, 0x76, 0x31, 0x21,
]);
const NONCE = new Uint8Array([0x53, 0x54, 0x44, 0x45, 0x4d, 0x4f, 0x2d, 0x4e, 0x4f, 0x4e, 0x43, 0x45]);
const SIGMA = new Uint32Array([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]);
const ROTL = (v: number, n: number) => (v << n) | (v >>> (32 - n));

function quarterRound(x: Uint32Array, a: number, b: number, c: number, d: number) {
  x[a] = (x[a] + x[b]) >>> 0; x[d] = ROTL(x[d] ^ x[a], 16);
  x[c] = (x[c] + x[d]) >>> 0; x[b] = ROTL(x[b] ^ x[c], 12);
  x[a] = (x[a] + x[b]) >>> 0; x[d] = ROTL(x[d] ^ x[a], 8);
  x[c] = (x[c] + x[d]) >>> 0; x[b] = ROTL(x[b] ^ x[c], 7);
}

function chachaBlock(counter: number) {
  const keyWords = new Uint32Array(8);
  const nonceWords = new Uint32Array(3);
  const viewKey = new DataView(KEY.buffer);
  const viewNonce = new DataView(NONCE.buffer);
  for (let i = 0; i < 8; i++) keyWords[i] = viewKey.getUint32(i * 4, true);
  for (let i = 0; i < 3; i++) nonceWords[i] = viewNonce.getUint32(i * 4, true);
  const initial = new Uint32Array(16);
  initial.set(SIGMA, 0); initial.set(keyWords, 4);
  initial[12] = counter >>> 0;
  initial.set(nonceWords, 13);
  const x = new Uint32Array(initial);
  for (let i = 0; i < 10; i++) {
    quarterRound(x, 0, 4, 8, 12); quarterRound(x, 1, 5, 9, 13);
    quarterRound(x, 2, 6, 10, 14); quarterRound(x, 3, 7, 11, 15);
    quarterRound(x, 0, 5, 10, 15); quarterRound(x, 1, 6, 11, 12);
    quarterRound(x, 2, 7, 8, 13); quarterRound(x, 3, 4, 9, 14);
  }
  const out = new Uint8Array(64);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 16; i++) view.setUint32(i * 4, (x[i] + initial[i]) >>> 0, true);
  return out;
}

function keystream(length: number) {
  const out = new Uint8Array(length);
  let offset = 0;
  let counter = 1;
  while (offset < length) {
    const block = chachaBlock(counter++);
    const count = Math.min(block.length, length - offset);
    out.set(block.subarray(0, count), offset);
    offset += count;
  }
  return out;
}

function encodeHamming(byte: number) {
  const bits = new Array<number>(13).fill(0);
  const dataPositions = [2, 4, 5, 6, 8, 9, 10, 11];
  dataPositions.forEach((position, bit) => { bits[position] = (byte >>> bit) & 1; });
  for (const parity of [0, 1, 3, 7]) {
    let value = 0;
    for (let i = 0; i < 12; i++) if (((i + 1) & (parity + 1)) !== 0) value ^= bits[i];
    bits[parity] = value;
  }
  bits[12] = bits.slice(0, 12).reduce((acc, bit) => acc ^ bit, 0);
  return bits;
}

function decodeHamming(received: number[]) {
  const bits = [...received];
  let syndrome = 0;
  for (const parity of [0, 1, 3, 7]) {
    let value = 0;
    for (let i = 0; i < 12; i++) if (((i + 1) & (parity + 1)) !== 0) value ^= bits[i];
    if (value) syndrome |= parity + 1;
  }
  const overallMismatch = bits.reduce((acc, bit) => acc ^ bit, 0);
  let correctedBit: number | null = null;
  let correction: number | null = null;
  if (overallMismatch && syndrome > 0 && syndrome <= 12) {
    correctedBit = syndrome - 1;
    bits[correctedBit] ^= 1;
    correction = syndrome;
  } else if (overallMismatch && syndrome === 0) {
    correctedBit = 12;
    bits[12] ^= 1;
    correction = 13;
  }
  let byte = 0;
  [2, 4, 5, 6, 8, 9, 10, 11].forEach((position, bit) => { byte |= bits[position] << bit; });
  return { bits, syndrome, correction, correctedBit, byte };
}

export function runSimulation(message: string, inject: boolean, requestedBit: number): Simulation {
  const plainBytes = Array.from(new TextEncoder().encode(message));
  const stream = keystream(plainBytes.length);
  const cipherBytes = plainBytes.map((byte, i) => byte ^ stream[i]);
  let injected: Simulation['injected'] = null;
  if (inject && cipherBytes.length) injected = { byteIndex: 0, bitIndex: Math.max(0, Math.min(12, requestedBit)) };
  const steps = cipherBytes.map((cipherByte, index) => {
    const encoded = encodeHamming(cipherByte);
    const received = [...encoded];
    if (injected && injected.byteIndex === index) received[injected.bitIndex] ^= 1;
    const decoded = decodeHamming(received);
    return {
      index, sourceByte: plainBytes[index], cipherByte, encoded, received,
      corrected: decoded.bits, syndrome: decoded.syndrome, correction: decoded.correction,
      correctedBit: decoded.correctedBit,
    };
  });
  const receivedBytes = steps.map((step) => {
    const decoded = decodeHamming(step.received);
    return decoded.byte;
  });
  const recoveredBytes = receivedBytes.map((byte, i) => byte ^ stream[i]);
  const recovered = new TextDecoder().decode(new Uint8Array(recoveredBytes));
  return { plaintext: message, plainBytes, cipherBytes, steps, receivedBytes, recovered, injected };
}

export const bytesHex = (bytes: number[]) => bytes.length ? bytes.map((value) => value.toString(16).padStart(2, '0')).join(' ') : '—';
export const bytesBinary = (bytes: number[]) => bytes.length ? bytes.map((value) => value.toString(2).padStart(8, '0')).join('  ') : '—';
