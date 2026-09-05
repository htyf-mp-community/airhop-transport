// Public WebRTC contracts. They intentionally avoid leaking react-native-webrtc
// classes so the base package can be imported when that optional peer is absent.

export type WebRTCDescription = {
  type: "offer" | "answer";
  sdp: string;
};

export type WebRTCIceCandidate = Record<string, unknown>;

export type WebRTCSignal =
  | { type: "description"; description: WebRTCDescription }
  | { type: "candidate"; candidate: WebRTCIceCandidate }
  | { type: "close" };

export interface WebRTCSignalEvent {
  fromPeerID: string;
  signal: WebRTCSignal;
}

export interface WebRTCSignalingSubscription {
  remove(): void;
}

export interface WebRTCSignalingAdapter {
  send(targetPeerID: string, signal: WebRTCSignal): Promise<void>;
  subscribe(listener: (event: WebRTCSignalEvent) => void): WebRTCSignalingSubscription;
}

export interface WebRTCDataChannelLike {
  readonly readyState: string;
  readonly bufferedAmount: number;
  binaryType: string;
  bufferedAmountLowThreshold: number;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onbufferedamountlow: (() => void) | null;
  send(data: ArrayBuffer): void;
  close(): void;
}

export interface WebRTCPeerConnectionLike {
  connectionState?: string;
  localDescription?: WebRTCDescription | null;
  onicecandidate: ((event: { candidate?: { toJSON(): WebRTCIceCandidate } | null }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  ondatachannel: ((event: { channel: WebRTCDataChannelLike }) => void) | null;
  createDataChannel(label: string, options: { ordered: boolean }): WebRTCDataChannelLike;
  createOffer(): Promise<WebRTCDescription>;
  createAnswer(): Promise<WebRTCDescription>;
  setLocalDescription(description: WebRTCDescription): Promise<void>;
  setRemoteDescription(description: WebRTCDescription): Promise<void>;
  addIceCandidate(candidate: WebRTCIceCandidate): Promise<void>;
  close(): void;
}

export interface WebRTCFactory {
  createPeerConnection(configuration: WebRTCConfiguration): WebRTCPeerConnectionLike;
}

export interface WebRTCConfiguration {
  iceServers?: ReadonlyArray<{
    urls: string | readonly string[];
    username?: string;
    credential?: string;
  }>;
}

export type WebRTCTransportEvent =
  | { type: "linkConnected"; linkID: string; peerID: string }
  | { type: "linkDisconnected"; linkID: string; peerID: string }
  | { type: "packetReceived"; linkID: string; peerID: string; data: Uint8Array; length: number }
  | { type: "error"; peerID?: string; error: Error };

export type WebRTCTransportEventName = WebRTCTransportEvent["type"];

export interface WebRTCTransportSubscription {
  remove(): void;
}
