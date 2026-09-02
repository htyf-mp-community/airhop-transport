// Coordinates raw-byte links. Packet framing, routing and encryption stay in the caller.
import { NativeEventEmitter } from "react-native";
import { decodeFromBase64, encodeToBase64 } from "./base64";
import { getBleModule, getLanModule, getWifiModule } from "./native";
import type { AirhopBLEEvents, AirhopBLESpec, AirhopLANEvents, AirhopLANSpec, AirhopWiFiEvents, AirhopWiFiSpec, LanPeerEvent, TransportAvailabilityEvent, TransportEvent, TransportEventName, TransportKind, TransportState } from "./types";

export interface AirhopTransportOptions {
  preferredKinds?: readonly TransportKind[];
  bleServiceUUID?: string;
  bleLocalName?: string;
  lanInstanceName?: string;
  enableBle?: boolean;
  enableLan?: boolean;
  enableWifi?: boolean;
  nativeModules?: { ble?: AirhopBLESpec; lan?: AirhopLANSpec; wifi?: AirhopWiFiSpec };
}
export interface TransportSubscription { remove(): void }
export interface TransportSendResult { ok: boolean; error?: string }
export interface TransportLink { linkID: string; kind: TransportKind }
type Listener<E extends TransportEvent> = (event: E) => void;
type EventFor<N extends TransportEventName> = Extract<TransportEvent, { type: N }>;
interface TypedNativeEmitter {
  addListener<E extends object>(eventName: string, listener: (event: E) => void): TransportSubscription;
}
const typedEmitter = (module: AirhopBLESpec | AirhopLANSpec | AirhopWiFiSpec): TypedNativeEmitter =>
  new NativeEventEmitter(module) as unknown as TypedNativeEmitter;
const DEFAULT_UUID = "F47B5E2D-4A9E-4C5A-9B3F-8E1D2C3A4B5C";

export class AirhopTransport {
  private readonly ble?: AirhopBLESpec;
  private readonly lan?: AirhopLANSpec;
  private readonly wifi?: AirhopWiFiSpec;
  private readonly links = new Map<string, TransportKind>();
  private readonly states = new Map<TransportKind, TransportState>();
  private readonly nativeSubscriptions: TransportSubscription[] = [];
  private readonly listeners = new Map<TransportEventName, Set<Listener<TransportEvent>>>();
  private readonly lanPeerListeners = new Set<(event: LanPeerEvent) => void>();
  private readonly lanPeerLostListeners = new Set<(event: LanPeerEvent) => void>();

  constructor(private readonly options: AirhopTransportOptions = {}) {
    this.ble = options.nativeModules?.ble ?? getBleModule();
    this.lan = options.nativeModules?.lan ?? getLanModule();
    this.wifi = options.nativeModules?.wifi ?? getWifiModule();
    for (const kind of ["ble", "lan", "wifi"] as const) this.states.set(kind, "idle");
    for (const event of ["linkConnected", "linkDisconnected", "packetReceived", "availabilityChanged"] as const) this.listeners.set(event, new Set());
    this.bindEvents();
  }

  isSupported(kind: TransportKind): boolean {
    if (kind === "ble") return this.options.enableBle !== false && !!this.ble;
    if (kind === "lan") return this.options.enableLan !== false && !!this.lan;
    return this.options.enableWifi !== false && !!this.wifi;
  }
  getState(kind: TransportKind): TransportState { return this.states.get(kind) ?? "idle"; }
  getLinkKind(linkID: string): TransportKind | undefined { return this.links.get(linkID); }
  getLinks(): readonly TransportLink[] {
    return Array.from(this.links, ([linkID, kind]) => ({ linkID, kind }));
  }

  onLanPeerDiscovered(listener: (event: LanPeerEvent) => void): TransportSubscription {
    this.lanPeerListeners.add(listener);
    return { remove: () => this.lanPeerListeners.delete(listener) };
  }

  onLanPeerLost(listener: (event: LanPeerEvent) => void): TransportSubscription {
    this.lanPeerLostListeners.add(listener);
    return { remove: () => this.lanPeerLostListeners.delete(listener) };
  }

  on<N extends TransportEventName>(event: N, listener: Listener<EventFor<N>>): TransportSubscription {
    const set = this.listeners.get(event);
    if (!set) throw new Error(`Unknown event: ${event}`);
    // The map stores a union listener, while the public generic preserves the
    // exact payload type selected by the event name.
    const commonListener = listener as unknown as Listener<TransportEvent>;
    set.add(commonListener);
    return { remove: () => set.delete(commonListener) };
  }

  async startAll(): Promise<void> {
    for (const kind of this.options.preferredKinds ?? ["wifi", "lan", "ble"]) {
      if (!this.isSupported(kind)) continue;
      try {
        if (kind === "ble") await this.startBle();
        else if (kind === "lan") await this.startLan();
        else await this.startWifi();
      } catch {
        // One unavailable fast path must not prevent LAN or BLE fallback from
        // starting. The per-transport state remains "error" for diagnostics.
      }
    }
  }
  async stopAll(): Promise<void> {
    const tasks: Promise<void>[] = [];
    if (this.ble) tasks.push(this.stopBle());
    if (this.lan) tasks.push(this.stopLan());
    if (this.wifi) tasks.push(this.stopWifi());
    await Promise.allSettled(tasks);
    this.links.clear();
  }
  async startBle(): Promise<void> {
    if (!this.isSupported("ble") || !this.ble) return;
    this.states.set("ble", "starting");
    try {
      const uuid = this.options.bleServiceUUID ?? DEFAULT_UUID;
      await this.ble.startAdvertising(uuid, this.options.bleLocalName ?? "airhop");
      await this.ble.startScanning([uuid]);
      this.states.set("ble", "running");
    } catch (error) { this.states.set("ble", "error"); throw error; }
  }
  async stopBle(): Promise<void> {
    if (!this.ble) return;
    this.states.set("ble", "stopping");
    await this.ble.stopScanning(); await this.ble.stopAdvertising();
    this.states.set("ble", "idle");
  }
  async startLan(): Promise<void> {
    if (!this.isSupported("lan") || !this.lan) return;
    this.states.set("lan", "starting");
    try { await this.lan.startLAN(this.options.lanInstanceName ?? "airhop"); this.states.set("lan", "running"); }
    catch (error) { this.states.set("lan", "error"); throw error; }
  }
  async stopLan(): Promise<void> { if (this.lan) { this.states.set("lan", "stopping"); await this.lan.stopLAN(); this.states.set("lan", "idle"); } }
  async startWifi(): Promise<void> {
    if (!this.isSupported("wifi") || !this.wifi) return;
    this.states.set("wifi", "starting");
    try { await this.wifi.startWiFi(); this.states.set("wifi", "running"); }
    catch (error) { this.states.set("wifi", "error"); throw error; }
  }
  async stopWifi(): Promise<void> { if (this.wifi) { this.states.set("wifi", "stopping"); await this.wifi.stopWiFi(); this.states.set("wifi", "idle"); } }
  async connectLanPeer(serviceName: string): Promise<void> { if (!this.lan) throw new Error("LAN transport is unavailable"); await this.lan.connectToPeer(serviceName); }

  async write(linkID: string, bytes: Uint8Array): Promise<TransportSendResult> {
    const kind = this.links.get(linkID);
    if (!kind) return { ok: false, error: `Unknown link: ${linkID}` };
    const payload = encodeToBase64(bytes);
    try {
      if (kind === "ble" && this.ble) await this.ble.writeToLink(linkID, payload);
      else if (kind === "lan" && this.lan) await this.lan.writeToLANLink(linkID, payload);
      else if (kind === "wifi" && this.wifi) await this.wifi.writeToWiFiLink(linkID, payload);
      else return { ok: false, error: `Transport unavailable: ${kind}` };
      return { ok: true };
    } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  }

  async writeAll(bytes: Uint8Array, excludeLinkID?: string): Promise<number> {
    const results = await Promise.all(
      this.getLinks()
        .filter(({ linkID }) => linkID !== excludeLinkID)
        .map(({ linkID }) => this.write(linkID, bytes)),
    );
    return results.filter(({ ok }) => ok).length;
  }
  async dispose(): Promise<void> {
    for (const subscription of this.nativeSubscriptions) subscription.remove();
    this.nativeSubscriptions.length = 0;
    for (const set of this.listeners.values()) set.clear();
    this.lanPeerListeners.clear();
    this.lanPeerLostListeners.clear();
    await this.stopAll();
  }

  private emit(event: TransportEvent): void { for (const listener of this.listeners.get(event.type) ?? []) listener(event); }
  private bindEvents(): void {
    if (this.ble) {
      const emitter = typedEmitter(this.ble);
      this.nativeSubscriptions.push(
        emitter.addListener("AirhopBLE.linkConnected", (e: AirhopBLEEvents["linkConnected"]) => this.connected("ble", e.linkID, { role: e.role, rssi: e.rssi })),
        emitter.addListener("AirhopBLE.linkDisconnected", (e: AirhopBLEEvents["linkDisconnected"]) => this.disconnected("ble", e.linkID)),
        emitter.addListener("AirhopBLE.packetReceived", (e: AirhopBLEEvents["packetReceived"]) => this.packet("ble", e.linkID, e.dataBase64)),
        emitter.addListener("AirhopBLE.adapterStateChanged", (e: { enabled: boolean }) => this.emit({ type: "availabilityChanged", kind: "ble", available: e.enabled })),
      );
    }
    if (this.lan) this.bindLan(this.lan);
    if (this.wifi) this.bindWifi(this.wifi);
  }
  private bindLan(module: AirhopLANSpec): void {
    const emitter = typedEmitter(module);
    this.nativeSubscriptions.push(
      emitter.addListener("AirhopLAN.linkConnected", (e: AirhopLANEvents["linkConnected"]) => this.connected("lan", e.linkID)),
      emitter.addListener("AirhopLAN.linkDisconnected", (e: AirhopLANEvents["linkDisconnected"]) => this.disconnected("lan", e.linkID)),
      emitter.addListener("AirhopLAN.packetReceived", (e: AirhopLANEvents["packetReceived"]) => this.packet("lan", e.linkID, e.dataBase64)),
      emitter.addListener("AirhopLAN.availabilityChanged", (e: AirhopLANEvents["availabilityChanged"]) => this.emit({ type: "availabilityChanged", kind: "lan", available: e.available })),
      emitter.addListener("AirhopLAN.peerDiscovered", (e: AirhopLANEvents["peerDiscovered"]) => { for (const listener of this.lanPeerListeners) listener(e); }),
      emitter.addListener("AirhopLAN.peerLost", (e: AirhopLANEvents["peerLost"]) => { for (const listener of this.lanPeerLostListeners) listener(e); }),
    );
  }
  private bindWifi(module: AirhopWiFiSpec): void {
    const emitter = typedEmitter(module);
    this.nativeSubscriptions.push(
      emitter.addListener("AirhopWiFi.linkConnected", (e: AirhopWiFiEvents["linkConnected"]) => this.connected("wifi", e.linkID)),
      emitter.addListener("AirhopWiFi.linkDisconnected", (e: AirhopWiFiEvents["linkDisconnected"]) => this.disconnected("wifi", e.linkID)),
      emitter.addListener("AirhopWiFi.packetReceived", (e: AirhopWiFiEvents["packetReceived"]) => this.packet("wifi", e.linkID, e.dataBase64)),
      emitter.addListener("AirhopWiFi.availabilityChanged", (e: AirhopWiFiEvents["availabilityChanged"]) => this.emit({ type: "availabilityChanged", kind: "wifi", available: e.available })),
    );
  }
  private connected(kind: TransportKind, linkID: string, meta?: Record<string, unknown>): void { this.links.set(linkID, kind); this.emit({ type: "linkConnected", kind, linkID, ...(meta ? { meta } : {}) }); }
  private disconnected(kind: TransportKind, linkID: string): void { this.links.delete(linkID); this.emit({ type: "linkDisconnected", kind, linkID }); }
  private packet(kind: TransportKind, linkID: string, encoded: string): void { const data = decodeFromBase64(encoded); this.emit({ type: "packetReceived", kind, linkID, data, length: data.byteLength }); }
}
