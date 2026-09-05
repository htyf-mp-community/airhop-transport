// Frames one logical byte message across bounded RTCDataChannel writes. The
// receiver reassembles it so write() has the same semantics as other transports.

const MAGIC = new Uint8Array([0x41, 0x48, 0x57, 0x52]);
const HEADER_BYTES = 20;
export const DEFAULT_WEBRTC_CHUNK_BYTES = 16 * 1024;

export interface WebRTCFrame {
  messageID: number;
  chunkIndex: number;
  chunkCount: number;
  totalBytes: number;
  payload: Uint8Array;
}

export function frameWebRTCMessage(bytes: Uint8Array, messageID: number, chunkBytes = DEFAULT_WEBRTC_CHUNK_BYTES): Uint8Array[] {
  if (!Number.isInteger(chunkBytes) || chunkBytes <= HEADER_BYTES) throw new Error("Invalid WebRTC chunk size");
  const payloadBytes = chunkBytes - HEADER_BYTES;
  const chunkCount = Math.max(1, Math.ceil(bytes.byteLength / payloadBytes));
  return Array.from({ length: chunkCount }, (_, chunkIndex) => {
    const start = chunkIndex * payloadBytes;
    const payload = bytes.subarray(start, Math.min(start + payloadBytes, bytes.byteLength));
    const frame = new Uint8Array(HEADER_BYTES + payload.byteLength);
    frame.set(MAGIC, 0);
    const view = new DataView(frame.buffer);
    view.setUint32(4, messageID);
    view.setUint32(8, chunkIndex);
    view.setUint32(12, chunkCount);
    view.setUint32(16, bytes.byteLength);
    frame.set(payload, HEADER_BYTES);
    return frame;
  });
}

export function decodeWebRTCFrame(bytes: Uint8Array): WebRTCFrame | undefined {
  if (bytes.byteLength < HEADER_BYTES || !MAGIC.every((value, index) => bytes[index] === value)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunkIndex = view.getUint32(8);
  const chunkCount = view.getUint32(12);
  const totalBytes = view.getUint32(16);
  if (chunkCount === 0 || chunkIndex >= chunkCount) return undefined;
  return {
    messageID: view.getUint32(4),
    chunkIndex,
    chunkCount,
    totalBytes,
    payload: bytes.subarray(HEADER_BYTES),
  };
}
