// Adapts any application byte path, including the Airhop mesh, to WebRTC
// signaling. Peer authentication remains the responsibility of that path.

import type {
  WebRTCSignal,
  WebRTCSignalEvent,
  WebRTCSignalingAdapter,
  WebRTCSignalingSubscription,
} from "./types";
import { decodeWebRTCFrame, frameWebRTCMessage } from "./message-framing";

const MAX_SIGNAL_BYTES = 128 * 1024;
const DEFAULT_SIGNAL_FRAME_BYTES = 16 * 1024;
const SIGNAL_REASSEMBLY_TIMEOUT_MS = 30_000;

export interface BinarySignalingChannel {
  send(targetPeerID: string, bytes: Uint8Array): Promise<void>;
  subscribe(listener: (fromPeerID: string, bytes: Uint8Array) => void): WebRTCSignalingSubscription;
}

export interface AirhopSignalingAdapterOptions {
  // Set this below the underlying transport's frame cap. BLE callers should
  // use 480 bytes, leaving room for any application-level signal discriminator.
  maxFrameBytes?: number;
}

interface SignalReassembly {
  createdAt: number;
  totalBytes: number;
  receivedChunks: number;
  chunks: Array<Uint8Array | undefined>;
}

export class AirhopSignalingAdapter implements WebRTCSignalingAdapter {
  private readonly listeners = new Set<(event: WebRTCSignalEvent) => void>();
  private readonly subscription: WebRTCSignalingSubscription;
  private readonly reassembly = new Map<string, SignalReassembly>();
  private messageID = Date.now() >>> 0;

  constructor(private readonly channel: BinarySignalingChannel, private readonly options: AirhopSignalingAdapterOptions = {}) {
    this.subscription = channel.subscribe((fromPeerID, bytes) => {
      this.receiveBytes(fromPeerID, bytes);
    });
  }

  async send(targetPeerID: string, signal: WebRTCSignal): Promise<void> {
    const bytes = new TextEncoder().encode(JSON.stringify(signal));
    if (bytes.byteLength > MAX_SIGNAL_BYTES) throw new Error("WebRTC signal exceeds 128 KiB");
    this.messageID = (this.messageID + 1) >>> 0;
    const frames = frameWebRTCMessage(
      bytes,
      this.messageID,
      this.options.maxFrameBytes ?? DEFAULT_SIGNAL_FRAME_BYTES,
    );
    for (const frame of frames) await this.channel.send(targetPeerID, frame);
  }

  subscribe(listener: (event: WebRTCSignalEvent) => void): WebRTCSignalingSubscription {
    this.listeners.add(listener);
    return { remove: () => this.listeners.delete(listener) };
  }

  dispose(): void {
    this.subscription.remove();
    this.listeners.clear();
    this.reassembly.clear();
  }

  private receiveBytes(fromPeerID: string, bytes: Uint8Array): void {
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_SIGNAL_BYTES) return;
    const frame = decodeWebRTCFrame(bytes);
    if (!frame) return this.emitDecoded(fromPeerID, bytes);
    if (frame.totalBytes > MAX_SIGNAL_BYTES || frame.chunkCount > 4096) return;
    const cutoff = Date.now() - SIGNAL_REASSEMBLY_TIMEOUT_MS;
    for (const [key, state] of this.reassembly) if (state.createdAt < cutoff) this.reassembly.delete(key);
    const key = `${fromPeerID}:${frame.messageID}`;
    let state = this.reassembly.get(key);
    if (!state) {
      state = {
        createdAt: Date.now(),
        totalBytes: frame.totalBytes,
        receivedChunks: 0,
        chunks: new Array(frame.chunkCount),
      };
      this.reassembly.set(key, state);
    }
    if (state.totalBytes !== frame.totalBytes || state.chunks.length !== frame.chunkCount || state.chunks[frame.chunkIndex]) return;
    state.chunks[frame.chunkIndex] = frame.payload;
    state.receivedChunks += 1;
    if (state.receivedChunks !== state.chunks.length) return;
    this.reassembly.delete(key);
    const complete = new Uint8Array(state.totalBytes);
    let offset = 0;
    for (const chunk of state.chunks) {
      if (!chunk || offset + chunk.byteLength > complete.byteLength) return;
      complete.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (offset === complete.byteLength) this.emitDecoded(fromPeerID, complete);
  }

  private emitDecoded(fromPeerID: string, bytes: Uint8Array): void {
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!isSignal(parsed)) return;
      for (const listener of this.listeners) listener({ fromPeerID, signal: parsed });
    } catch {
      // An untrusted mesh peer may send arbitrary bytes. Invalid signaling is
      // ignored at this boundary instead of reaching the native WebRTC stack.
    }
  }
}

function isSignal(value: unknown): value is WebRTCSignal {
  if (!value || typeof value !== "object") return false;
  const signal = value as Record<string, unknown>;
  if (signal.type === "close") return true;
  if (signal.type === "candidate") {
    return !!signal.candidate && typeof signal.candidate === "object" && !Array.isArray(signal.candidate);
  }
  if (signal.type !== "description" || !signal.description || typeof signal.description !== "object") return false;
  const description = signal.description as Record<string, unknown>;
  return (description.type === "offer" || description.type === "answer")
    && typeof description.sdp === "string"
    && description.sdp.length <= MAX_SIGNAL_BYTES;
}
