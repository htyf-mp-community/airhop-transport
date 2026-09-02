// Composes raw links with the bitchat-compatible codec, fragmentation and flood routing.
//
// Authentication policy is injected because the transport package cannot know
// which signing keys the host trusts. Rejecting before flood relay prevents an
// invalid packet from consuming the rest of the mesh's airtime.

import type { AirhopTransport, TransportSubscription } from "../transport-manager";
import { FragmentManager, MAX_BLE_FRAME, fragmentPacket } from "./fragment-manager";
import { FloodRouter } from "./flood-router";
import { decodePacket, encodePacket, PacketType, type Packet } from "../wire/packet-codec";

export interface MeshIngressContext {
  linkID: string;
  kind: "ble" | "lan" | "wifi";
  reassembled: boolean;
}

export interface MeshTransportEngineOptions {
  transport: AirhopTransport;
  localPeerID: string;
  acceptPacket?: (packet: Packet, context: MeshIngressContext) => boolean;
  getDegree?: () => number;
}

export interface MeshPacketEvent extends MeshIngressContext { packet: Packet }
export interface MeshPacketSubscription { remove(): void }

export class MeshTransportEngine {
  private readonly fragments = new FragmentManager();
  private readonly router: FloodRouter;
  private readonly packetListeners = new Set<(event: MeshPacketEvent) => void>();
  private readonly subscriptions: TransportSubscription[] = [];

  constructor(private readonly options: MeshTransportEngineOptions) {
    this.router = new FloodRouter(options.getDegree);
    this.subscriptions.push(
      options.transport.on("packetReceived", (event) => {
        this.receive(event.linkID, event.kind, event.data);
      }),
    );
  }

  onPacket(listener: (event: MeshPacketEvent) => void): MeshPacketSubscription {
    this.packetListeners.add(listener);
    return { remove: () => this.packetListeners.delete(listener) };
  }

  async send(packet: Packet): Promise<number> {
    this.router.originate(packet);
    const encoded = encodePacket(packet);
    if (encoded.byteLength <= MAX_BLE_FRAME) {
      return this.options.transport.writeAll(encoded);
    }

    // Fragmenting for every link keeps one wire representation across a mixed
    // BLE/LAN mesh. Fast links pay a small envelope cost but relays never need
    // to translate a packet based on their local radio.
    let successfulWrites = 0;
    for (const fragment of fragmentPacket(packet, { peerID: this.options.localPeerID })) {
      successfulWrites += await this.options.transport.writeAll(encodePacket(fragment));
    }
    return successfulWrites;
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.remove();
    this.subscriptions.length = 0;
    this.packetListeners.clear();
    this.fragments.reset();
    this.router.flush();
  }

  private receive(linkID: string, kind: "ble" | "lan" | "wifi", bytes: Uint8Array): void {
    const packet = decodePacket(bytes);
    if (packet === null) return;
    const context: MeshIngressContext = { linkID, kind, reassembled: false };
    if (this.options.acceptPacket && !this.options.acceptPacket(packet, context)) return;

    const isNew = this.router.receive(packet, (relay) => {
      void this.options.transport.writeAll(encodePacket(relay), linkID);
    });
    if (!isNew) return;

    if (packet.type === PacketType.FRAGMENT) {
      this.fragments.receive(packet.senderID, packet.payload, (inner) => {
        const innerContext: MeshIngressContext = { linkID, kind, reassembled: true };
        if (this.options.acceptPacket && !this.options.acceptPacket(inner, innerContext)) return;
        this.emit({ ...innerContext, packet: inner });
      });
      return;
    }
    this.emit({ ...context, packet });
  }

  private emit(event: MeshPacketEvent): void {
    for (const listener of this.packetListeners) listener(event);
  }
}
