// Copyright 2026

import type { TurboModule } from "react-native";

export type TransportKind = "ble" | "lan" | "wifi";

export type TransportState = "idle" | "starting" | "running" | "stopping" | "error";

export type TransportPreference = readonly TransportKind[];

export interface TransportOptions {
  /**
   * Optional preference list used by callers that want to choose a deterministic
   * transport order.
   */
  preferredKinds: TransportKind[];
  /**
   * Optional BLE service UUID used when starting advertiser/scan.
   * Must be provided by app-layer policy.
   */
  bleServiceUUID: string;
  /**
   * Optional BLE local name used for advertiser identity.
   */
  bleLocalName: string;
  /**
   * Optional LAN service instance name. Must be opaque and rotate between launches.
   */
  lanInstanceName: string;
}

export interface TransportManagerConfig {
  /**
   * Whether this package should expose BLE transport APIs.
   */
  enableBle?: boolean;
  /**
   * Whether this package should expose LAN transport APIs.
   */
  enableLan?: boolean;
  /**
   * Whether this package should expose Wi-Fi transport APIs.
   */
  enableWifi?: boolean;
  /**
   * Optional native override for unit tests.
   */
  overrides?: {
    ble?: AirhopBLESpec | null;
    lan?: AirhopLANSpec | null;
    wifi?: AirhopWiFiSpec | null;
  };
  /**
   * Optional transport preference used by `startAll`.
   */
  transportOptions?: Partial<TransportOptions>;
}

export interface TransportEventBase {
  kind: TransportKind;
}

export interface TransportLinkConnectedEvent extends TransportEventBase {
  type: "linkConnected";
  linkID: string;
  kind: TransportKind;
  meta?: Record<string, unknown>;
}

export interface TransportLinkDisconnectedEvent extends TransportEventBase {
  type: "linkDisconnected";
  linkID: string;
}

export interface TransportPacketReceivedEvent extends TransportEventBase {
  type: "packetReceived";
  linkID: string;
  data: Uint8Array;
  length: number;
}

export interface TransportAvailabilityEvent extends TransportEventBase {
  type: "availabilityChanged";
  available: boolean;
}

export interface LanPeerEvent {
  serviceName: string;
}

export type TransportEvent =
  | TransportLinkConnectedEvent
  | TransportLinkDisconnectedEvent
  | TransportPacketReceivedEvent
  | TransportAvailabilityEvent;

export type TransportEventName = TransportEvent["type"];

export interface NativeRadioState {
  supported: boolean;
  poweredOn: boolean;
  authorization: "granted" | "denied" | "blocked" | "unknown";
  locationRequiredForScan: boolean;
  locationServicesEnabled: boolean;
  batteryPercent: number;
  charging: boolean;
}

export interface AirhopBLESpec extends TurboModule {
  startAdvertising(serviceUUID: string, localName: string): Promise<void>;
  stopAdvertising(): Promise<void>;
  startScanning(serviceUUIDs: string[]): Promise<void>;
  stopScanning(): Promise<void>;
  writeToLink(linkID: string, dataBase64: string): Promise<void>;
  getRadioState(): Promise<NativeRadioState>;
  setPowerMode(mode: string): Promise<void>;
  requestEnableBluetooth(): Promise<boolean>;
  openLocationSettings(): Promise<boolean>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export interface AirhopLANSpec extends TurboModule {
  startLAN(instanceName: string): Promise<void>;
  stopLAN(): Promise<void>;
  connectToPeer(serviceName: string): Promise<void>;
  writeToLANLink(linkID: string, dataBase64: string): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export interface AirhopWiFiSpec extends TurboModule {
  startWiFi(): Promise<void>;
  stopWiFi(): Promise<void>;
  writeToWiFiLink(linkID: string, dataBase64: string): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export interface WiFiPairingState { supported: boolean; count: number }
export type WiFiPairingMode = "find" | "discoverable";
export interface WiFiPairingLabels { action: string; cancel: string; unavailable: string }
export interface WiFiPairingColors {
  bg: string;
  surface: string;
  border: string;
  textPrimary: string;
  textMuted: string;
}
export interface AirhopWiFiPairingSpec extends TurboModule {
  getPairingState(): Promise<WiFiPairingState>;
  presentPairing(mode: WiFiPairingMode, labels: WiFiPairingLabels, colors: WiFiPairingColors): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export interface AirhopBLEEvents {
  packetReceived: { linkID: string; dataBase64: string };
  linkConnected: { linkID: string; role?: "central" | "peripheral"; rssi?: number };
  linkDisconnected: { linkID: string };
  availabilityChanged: { enabled: boolean };
}

export interface AirhopLANEvents {
  peerDiscovered: { serviceName: string };
  peerLost: { serviceName: string };
  linkConnected: { linkID: string };
  linkDisconnected: { linkID: string };
  packetReceived: { linkID: string; dataBase64: string };
  availabilityChanged: { available: boolean };
}

export interface AirhopWiFiEvents {
  linkConnected: { linkID: string };
  linkDisconnected: { linkID: string };
  packetReceived: { linkID: string; dataBase64: string };
  availabilityChanged: { available: boolean };
}
