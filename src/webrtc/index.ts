// Optional WebRTC entry point. Keeping it outside the root module lets Metro
// bundle BLE-only applications without resolving react-native-webrtc.

export { AirhopWebRTCTransport } from "./webrtc-transport";
export type { AirhopWebRTCTransportOptions } from "./webrtc-transport";
export { AirhopSignalingAdapter } from "./signaling-adapter";
export type { AirhopSignalingAdapterOptions, BinarySignalingChannel } from "./signaling-adapter";
export { DEFAULT_WEBRTC_CHUNK_BYTES, decodeWebRTCFrame, frameWebRTCMessage } from "./message-framing";
export type {
  WebRTCConfiguration,
  WebRTCFactory,
  WebRTCSignal,
  WebRTCSignalEvent,
  WebRTCSignalingAdapter,
  WebRTCSignalingSubscription,
  WebRTCTransportEvent,
  WebRTCTransportSubscription,
} from "./types";
