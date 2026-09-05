// Reliable ordered RTCDataChannel transport for text and file bytes. Signaling
// is injected so applications can use Airhop mesh, QR, or an internet relay.

import { decodeWebRTCFrame, DEFAULT_WEBRTC_CHUNK_BYTES, frameWebRTCMessage } from "./message-framing";
import type {
  WebRTCConfiguration,
  WebRTCDataChannelLike,
  WebRTCFactory,
  WebRTCPeerConnectionLike,
  WebRTCSignal,
  WebRTCSignalingAdapter,
  WebRTCSignalingSubscription,
  WebRTCTransportEvent,
  WebRTCTransportEventName,
  WebRTCTransportSubscription,
} from "./types";

declare const require: (id: string) => unknown;

const DEFAULT_MAX_BUFFERED_BYTES = 256 * 1024;
const DEFAULT_MAX_MESSAGE_BYTES = 64 * 1024 * 1024;
const REASSEMBLY_TIMEOUT_MS = 60_000;

interface PeerLink {
  peerID: string;
  linkID: string;
  connection: WebRTCPeerConnectionLike;
  channel?: WebRTCDataChannelLike;
  pendingCandidates: Record<string, unknown>[];
  remoteDescriptionSet: boolean;
  connected: boolean;
}

interface Reassembly {
  createdAt: number;
  totalBytes: number;
  chunks: Array<Uint8Array | undefined>;
  receivedChunks: number;
  receivedBytes: number;
}

export interface AirhopWebRTCTransportOptions {
  localPeerID: string;
  signaling: WebRTCSignalingAdapter;
  configuration?: WebRTCConfiguration;
  factory?: WebRTCFactory;
  chunkBytes?: number;
  maxBufferedBytes?: number;
  maxMessageBytes?: number;
}

type Listener = (event: WebRTCTransportEvent) => void;

export class AirhopWebRTCTransport {
  private readonly factory: WebRTCFactory;
  private readonly peers = new Map<string, PeerLink>();
  private readonly links = new Map<string, PeerLink>();
  private readonly listeners = new Map<WebRTCTransportEventName, Set<Listener>>();
  private readonly reassembly = new Map<string, Reassembly>();
  private readonly earlyCandidates = new Map<string, Record<string, unknown>[]>();
  private readonly signalSubscription: WebRTCSignalingSubscription;
  private messageID = Date.now() >>> 0;

  constructor(private readonly options: AirhopWebRTCTransportOptions) {
    if (!options.localPeerID) throw new Error("localPeerID is required");
    this.factory = options.factory ?? loadDefaultFactory();
    for (const name of ["linkConnected", "linkDisconnected", "packetReceived", "error"] as const) {
      this.listeners.set(name, new Set());
    }
    this.signalSubscription = options.signaling.subscribe(({ fromPeerID, signal }) => {
      void this.receiveSignal(fromPeerID, signal).catch((error: unknown) => this.report(error, fromPeerID));
    });
  }

  on<N extends WebRTCTransportEventName>(
    name: N,
    listener: (event: Extract<WebRTCTransportEvent, { type: N }>) => void,
  ): WebRTCTransportSubscription {
    const common = listener as Listener;
    this.listeners.get(name)?.add(common);
    return { remove: () => this.listeners.get(name)?.delete(common) };
  }

  getLinks(): ReadonlyArray<{ linkID: string; peerID: string }> {
    return Array.from(this.links.values(), ({ linkID, peerID }) => ({ linkID, peerID }));
  }

  async connect(peerID: string): Promise<string> {
    if (!peerID || peerID === this.options.localPeerID) throw new Error("Invalid remote peerID");
    const existing = this.peers.get(peerID);
    if (existing) return existing.linkID;
    const peer = this.createPeer(peerID, true);
    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
    await this.options.signaling.send(peerID, { type: "description", description: offer });
    return peer.linkID;
  }

  async write(linkID: string, bytes: Uint8Array): Promise<void> {
    const peer = this.links.get(linkID);
    if (!peer?.channel || peer.channel.readyState !== "open") throw new Error(`WebRTC link is not open: ${linkID}`);
    const maxMessageBytes = this.options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
    if (bytes.byteLength > maxMessageBytes) throw new Error(`WebRTC message exceeds ${maxMessageBytes} bytes`);
    this.messageID = (this.messageID + 1) >>> 0;
    const frames = frameWebRTCMessage(bytes, this.messageID, this.options.chunkBytes ?? DEFAULT_WEBRTC_CHUNK_BYTES);
    for (const frame of frames) {
      await this.waitForCapacity(peer.channel);
      peer.channel.send(toArrayBuffer(frame));
    }
  }

  async disconnect(linkID: string): Promise<void> {
    const peer = this.links.get(linkID);
    if (!peer) return;
    await this.options.signaling.send(peer.peerID, { type: "close" }).catch(() => undefined);
    this.closePeer(peer);
  }

  dispose(): void {
    this.signalSubscription.remove();
    for (const peer of [...this.peers.values()]) this.closePeer(peer);
    for (const set of this.listeners.values()) set.clear();
    this.reassembly.clear();
    this.earlyCandidates.clear();
  }

  private createPeer(peerID: string, initiator: boolean): PeerLink {
    const connection = this.factory.createPeerConnection(this.options.configuration ?? {});
    const peer: PeerLink = {
      peerID,
      linkID: `webrtc:${peerID}`,
      connection,
      pendingCandidates: this.earlyCandidates.get(peerID) ?? [],
      remoteDescriptionSet: false,
      connected: false,
    };
    this.peers.set(peerID, peer);
    this.earlyCandidates.delete(peerID);
    this.links.set(peer.linkID, peer);
    connection.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      void this.options.signaling.send(peerID, { type: "candidate", candidate: candidate.toJSON() })
        .catch((error: unknown) => this.report(error, peerID));
    };
    connection.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(connection.connectionState ?? "")) this.closePeer(peer);
    };
    connection.ondatachannel = ({ channel }) => this.installChannel(peer, channel);
    if (initiator) this.installChannel(peer, connection.createDataChannel("airhop-reliable", { ordered: true }));
    return peer;
  }

  private installChannel(peer: PeerLink, channel: WebRTCDataChannelLike): void {
    peer.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = Math.floor((this.options.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES) / 2);
    channel.onopen = () => {
      if (peer.connected) return;
      peer.connected = true;
      this.emit({ type: "linkConnected", linkID: peer.linkID, peerID: peer.peerID });
    };
    channel.onmessage = ({ data }) => {
      const bytes = asBytes(data);
      if (!bytes) return this.report(new Error("Unsupported WebRTC message payload"), peer.peerID);
      this.receiveFrame(peer, bytes);
    };
    channel.onerror = (event) => this.report(new Error(`WebRTC data channel error: ${String(event)}`), peer.peerID);
    channel.onclose = () => this.closePeer(peer);
  }

  private async receiveSignal(peerID: string, signal: WebRTCSignal): Promise<void> {
    if (!peerID || peerID === this.options.localPeerID) return;
    if (signal.type === "close") {
      const peer = this.peers.get(peerID);
      if (peer) this.closePeer(peer);
      return;
    }
    let peer = this.peers.get(peerID);
    if (signal.type === "description" && signal.description.type === "offer") {
      // A stable peer-ID ordering resolves simultaneous offers without needing
      // a second negotiation protocol: the lexicographically smaller peer wins.
      if (peer && this.options.localPeerID < peerID) return;
      if (peer) this.closePeer(peer);
      peer = this.createPeer(peerID, false);
      await peer.connection.setRemoteDescription(signal.description);
      peer.remoteDescriptionSet = true;
      await this.flushCandidates(peer);
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      await this.options.signaling.send(peerID, { type: "description", description: answer });
      return;
    }
    if (!peer) {
      if (signal.type === "candidate") {
        const candidates = this.earlyCandidates.get(peerID) ?? [];
        if (candidates.length < 128) candidates.push(signal.candidate);
        this.earlyCandidates.set(peerID, candidates);
      }
      return;
    }
    if (signal.type === "description") {
      await peer.connection.setRemoteDescription(signal.description);
      peer.remoteDescriptionSet = true;
      await this.flushCandidates(peer);
    } else if (peer.remoteDescriptionSet) {
      await peer.connection.addIceCandidate(signal.candidate);
    } else {
      peer.pendingCandidates.push(signal.candidate);
    }
  }

  private async flushCandidates(peer: PeerLink): Promise<void> {
    for (const candidate of peer.pendingCandidates.splice(0)) await peer.connection.addIceCandidate(candidate);
  }

  private receiveFrame(peer: PeerLink, bytes: Uint8Array): void {
    this.expireReassembly();
    const frame = decodeWebRTCFrame(bytes);
    if (!frame) {
      this.emit({ type: "packetReceived", linkID: peer.linkID, peerID: peer.peerID, data: bytes, length: bytes.byteLength });
      return;
    }
    const max = this.options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;
    if (frame.totalBytes > max || frame.chunkCount > 65_536) return this.report(new Error("Invalid WebRTC frame bounds"), peer.peerID);
    const key = `${peer.linkID}:${frame.messageID}`;
    let state = this.reassembly.get(key);
    if (!state) {
      state = {
        createdAt: Date.now(),
        totalBytes: frame.totalBytes,
        chunks: new Array(frame.chunkCount),
        receivedChunks: 0,
        receivedBytes: 0,
      };
      this.reassembly.set(key, state);
    }
    if (state.totalBytes !== frame.totalBytes || state.chunks.length !== frame.chunkCount || state.chunks[frame.chunkIndex]) return;
    state.chunks[frame.chunkIndex] = frame.payload;
    state.receivedChunks += 1;
    state.receivedBytes += frame.payload.byteLength;
    if (state.receivedChunks !== state.chunks.length) return;
    this.reassembly.delete(key);
    if (state.receivedBytes !== state.totalBytes) return this.report(new Error("WebRTC message length mismatch"), peer.peerID);
    const data = new Uint8Array(state.totalBytes);
    let offset = 0;
    for (const chunk of state.chunks) {
      if (!chunk) return;
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.emit({ type: "packetReceived", linkID: peer.linkID, peerID: peer.peerID, data, length: data.byteLength });
  }

  private waitForCapacity(channel: WebRTCDataChannelLike): Promise<void> {
    const max = this.options.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
    if (channel.bufferedAmount <= max) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        channel.onbufferedamountlow = null;
        reject(new Error("WebRTC data channel backpressure timeout"));
      }, 15_000);
      channel.onbufferedamountlow = () => {
        clearTimeout(timer);
        channel.onbufferedamountlow = null;
        resolve();
      };
    });
  }

  private expireReassembly(): void {
    const cutoff = Date.now() - REASSEMBLY_TIMEOUT_MS;
    for (const [key, value] of this.reassembly) if (value.createdAt < cutoff) this.reassembly.delete(key);
  }

  private closePeer(peer: PeerLink): void {
    if (this.peers.get(peer.peerID) !== peer) return;
    this.peers.delete(peer.peerID);
    this.links.delete(peer.linkID);
    try { peer.channel?.close(); } catch { /* already closed */ }
    try { peer.connection.close(); } catch { /* already closed */ }
    if (peer.connected) this.emit({ type: "linkDisconnected", linkID: peer.linkID, peerID: peer.peerID });
  }

  private report(value: unknown, peerID?: string): void {
    const error = value instanceof Error ? value : new Error(String(value));
    this.emit({ type: "error", ...(peerID ? { peerID } : {}), error });
  }

  private emit(event: WebRTCTransportEvent): void {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
  }
}

function asBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return undefined;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function loadDefaultFactory(): WebRTCFactory {
  let module: unknown;
  try { module = require("react-native-webrtc"); }
  catch { throw new Error("Airhop WebRTC requires the optional react-native-webrtc peer dependency"); }
  const ctor = (module as { RTCPeerConnection?: new (configuration: WebRTCConfiguration) => WebRTCPeerConnectionLike }).RTCPeerConnection;
  if (!ctor) throw new Error("react-native-webrtc does not export RTCPeerConnection");
  return { createPeerConnection: (configuration) => new ctor(configuration) };
}
