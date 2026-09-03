# @htyf-mp/airhop-transport

[简体中文](./README.md) | [English](./README.en.md)

A raw-byte transport library for React Native, providing BLE, local-network LAN, and Wi-Fi Aware links.

## Capabilities

| Transport | Android | iOS | Cross-platform |
| --- | --- | --- | --- |
| BLE | Supported | Supported | Supported |
| LAN (mDNS + TCP) | Supported | Supported | Supported |
| Wi-Fi Aware | Android 10+ data link | iOS 26+ | Android and iOS do not interoperate |

Cross-platform Wi-Fi acceleration uses LAN. Wi-Fi Aware is an additional fast path on supported devices, while BLE provides discovery and fallback.

## Installation

```sh
npm install @htyf-mp/airhop-transport
cd ios && pod install
```

The iOS host must provide Bluetooth and local-network usage descriptions in `Info.plist` and declare the `_airhop-lan-v1._tcp` Bonjour service. Enabling iOS Wi-Fi Aware also requires its entitlement and the `_airhop-mesh-v1._tcp` service declaration. Android manifest permissions are merged automatically, but the host app must still request runtime permissions.

## Usage

```ts
import { AirhopTransport } from "@htyf-mp/airhop-transport";

const transport = new AirhopTransport({
  preferredKinds: ["wifi", "lan", "ble"],
  lanInstanceName: "random-session-name",
});

transport.on("packetReceived", ({ linkID, data }) => consumeBytes(linkID, data));
transport.onLanPeerDiscovered(({ serviceName }) => {
  void transport.connectLanPeer(serviceName);
});
await transport.startAll();
await transport.write(linkID, bytes);
```

## Mesh core

`MeshTransportEngine` combines bitchat-compatible packets, fragmentation and reassembly, deduplication, and TTL flooding on top of raw transports. The application still owns message types and authentication policy.

```ts
import "react-native-get-random-values";
import {
  AirhopTransport,
  MeshTransportEngine,
  PacketType,
  verifyPacket,
} from "@htyf-mp/airhop-transport";

const radio = new AirhopTransport();
const mesh = new MeshTransportEngine({
  transport: radio,
  localPeerID,
  acceptPacket(packet) {
    // The outer FRAGMENT packet is unsigned in the bitchat protocol. The
    // reassembled inner packet must be authenticated.
    if (packet.type === PacketType.FRAGMENT) return true;
    const publicKey = resolveSigningKey(packet.senderID);
    return publicKey !== undefined && verifyPacket(packet, publicKey);
  },
});

mesh.onPacket(({ packet, linkID }) => {
  dispatchBusinessPacket(packet, linkID);
});

await mesh.send(packet);
```

The package also exports `NoiseHandshake`, `noiseXSeal/noiseXOpen`, and Double Ratchet primitives. The host supplies key generation, Keychain storage, session authorization, and peer identity binding. Noise sessions must be stored by peer, not by temporary link.

QR invitations and session authentication remain application-layer responsibilities.

## iOS Wi-Fi Aware pairing

iOS 26 Wi-Fi Aware must first be paired through the system UI:

```ts
import { WiFiAwarePairing } from "@htyf-mp/airhop-transport";

const pairing = new WiFiAwarePairing();
const state = await pairing.getState();
if (state.supported && state.count === 0) {
  await pairing.present("find", labels, colors);
}
```

`labels` and `colors` are supplied by the application, so the native module does not hardcode product copy or theme values.

Wi-Fi Aware requires a physical device running iOS 26, an app entitlement, a service declaration, and a provisioning profile containing the capability. Simulators and older systems are unsupported.

Add the Wi-Fi Aware capability to the app target under Xcode's `Signing & Capabilities`, then include both operations:

```xml
<key>com.apple.developer.wifi-aware</key>
<array>
  <string>Publish</string>
  <string>Subscribe</string>
</array>
```

The host `Info.plist` must declare the same service name as the native module:

```xml
<key>WiFiAwareServices</key>
<dict>
  <key>_airhop-mesh-v1._tcp</key>
  <dict>
    <key>Publishable</key>
    <dict/>
    <key>Subscribable</key>
    <dict/>
  </dict>
</dict>
```

For Expo, keep the configuration in `app.json` so it survives prebuild:

```json
{
  "expo": {
    "ios": {
      "entitlements": {
        "com.apple.developer.wifi-aware": ["Publish", "Subscribe"]
      },
      "infoPlist": {
        "WiFiAwareServices": {
          "_airhop-mesh-v1._tcp": {
            "Publishable": {},
            "Subscribable": {}
          }
        }
      }
    }
  }
}
```

Regenerate and install the physical-device development build after changing native configuration:

```sh
npx expo prebuild --clean
npx expo run:ios --device
```

Inspect the final signed app. The following command must report both `Publish` and `Subscribe`:

```sh
codesign -d --entitlements :- path/to/YourApp.app
```

If the entitlement exists in source but not in the signed result, enable Wi-Fi Aware for the App ID in Apple Developer and regenerate the provisioning profile.

Apple documentation:

- [Adopting Wi-Fi Aware](https://developer.apple.com/documentation/wifiaware/adopting-wi-fi-aware)
- [com.apple.developer.wifi-aware](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.wifi-aware)
- [WiFiAwareServices](https://developer.apple.com/documentation/bundleresources/information-property-list/wifiawareservices)

The native layer only sends and receives raw bytes. Production integrations must implement authentication and encryption in the application layer. The host app owns the Android background foreground service because this package does not assume notification copy, icons, or an Activity.
