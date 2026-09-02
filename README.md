# @htyf-mp/airhop-transport

React Native 原始字节通信包，提供 BLE、同一局域网 LAN 和 Wi-Fi Aware 链路。

## 能力

| 链路 | Android | iOS | 跨平台 |
| --- | --- | --- | --- |
| BLE | 支持 | 支持 | 支持 |
| LAN（mDNS + TCP） | 支持 | 支持 | 支持 |
| Wi-Fi Aware | Android 10+ 数据链路 | iOS 26+ | Android 与 iOS 不互通 |

跨平台 WiFi 加速走 LAN。Wi-Fi Aware 是支持设备上的额外快速链路，BLE 负责发现和兜底。

## 安装

```sh
npm install @htyf-mp/airhop-transport
cd ios && pod install
```

iOS 宿主需在 `Info.plist` 提供蓝牙和本地网络用途说明，并声明 `_airhop-lan-v1._tcp` Bonjour 服务。启用 iOS Wi-Fi Aware 时还需配置相应 entitlement 和 `_airhop-mesh-v1._tcp` 服务。Android manifest 权限自动合并，运行时权限仍由宿主 App 请求。

## 使用

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

## Mesh 核心

`MeshTransportEngine` 在 raw transport 上组合 bitchat 兼容 packet、分片重组、去重和 TTL Flood。业务层仍决定消息类型和认证规则。

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
    // FRAGMENT 外层按 bitchat 协议不签名，重组后的内层 packet 必须认证。
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

包还导出 `NoiseHandshake`、`noiseXSeal/noiseXOpen` 和 Double Ratchet 原语。密钥生成、Keychain、会话授权和 peer 身份绑定由宿主注入，Noise 会话应按 peer 保存，不能按临时 link 保存。

原生层只收发原始字节。生产接入必须在应用层实现认证加密。Android 后台前台服务由宿主 App 实现，本包不假设通知文案、图标或 Activity。
