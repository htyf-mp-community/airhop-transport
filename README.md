# @htyf-mp/airhop-transport

[简体中文](./README.md) | [English](./README.en.md)

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

iOS 26 的 Wi-Fi Aware 必须先通过系统界面配对：

```ts
import { WiFiAwarePairing } from "@htyf-mp/airhop-transport";

const pairing = new WiFiAwarePairing();
const state = await pairing.getState();
if (state.supported && state.count === 0) {
  await pairing.present("find", labels, colors);
}
```

`labels` 和 `colors` 由业务传入，因此原生模块不会硬编码产品文案或主题。二维码邀请和会话认证仍由业务层处理。

### iOS Wi-Fi Aware 配置

Wi-Fi Aware 需要 iOS 26 真机、App entitlement、服务声明以及包含该能力的签名描述文件。模拟器和旧系统不支持。

在 Xcode 中打开 App target，进入 `Signing & Capabilities`，点击 `+ Capability` 并添加 `Wi-Fi Aware`。Airhop 同时发布和订阅服务，因此 entitlement 需要两个操作：

```xml
<key>com.apple.developer.wifi-aware</key>
<array>
  <string>Publish</string>
  <string>Subscribe</string>
</array>
```

宿主 App 的 `Info.plist` 还必须声明与原生模块完全相同的服务名：

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

Expo 项目应把配置写入 `app.json`，避免 `prebuild` 后丢失：

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

修改后重新生成并安装真机 development build：

```sh
npx expo prebuild --clean
npx expo run:ios --device
```

最终以签名后的 `.app` 为准。下面的命令应输出 `Publish` 和 `Subscribe`：

```sh
codesign -d --entitlements :- path/to/YourApp.app
```

如果源码中存在 entitlement，但签名结果没有，需要在 Apple Developer 后台为 App ID 启用 Wi-Fi Aware，并重新生成 provisioning profile。

Apple 官方说明：

- [Adopting Wi-Fi Aware](https://developer.apple.com/documentation/wifiaware/adopting-wi-fi-aware)
- [com.apple.developer.wifi-aware](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.wifi-aware)
- [WiFiAwareServices](https://developer.apple.com/documentation/bundleresources/information-property-list/wifiawareservices)

原生层只收发原始字节。生产接入必须在应用层实现认证加密。Android 后台前台服务由宿主 App 实现，本包不假设通知文案、图标或 Activity。
