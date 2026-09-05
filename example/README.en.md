# Airhop Transport Example

[简体中文](./README.md) | [English](./README.en.md)

This Expo development build verifies raw-byte transfer over BLE, LAN, and Wi-Fi Aware between two physical devices using `@htyf-mp/airhop-transport`.

## Setup

```sh
cd packages/airhop-transport
yarn install
yarn example install
yarn example prebuild
```

Install Pods for iOS:

```sh
cd example/ios
pod install
```

## Run on two devices

Android:

```sh
yarn example android --device
```

iOS:

```sh
yarn example ios --device
```

Tap **Start BLE** on both physical devices. The screen displays all four BLE stages:

1. Grant nearby-device permission.
2. Start GATT advertising and scanning together.
3. Wait for the other device to establish a BLE link.
4. Select the link and send raw bytes.

After connecting, the Links section shows `BLE`, the native `linkID`, this device's central/peripheral role, and RSSI when available. The first BLE link is selected automatically, and another link can be selected by tapping it. Enter text and tap Send. The receiving device displays the link, byte count, and UTF-8 content under Recent events.

**Start Wi-Fi / LAN** is an independent, optional acceleration step. To verify Bluetooth clearly, start only BLE on both devices first, confirm bidirectional transfer, and then enable the faster links.

## Verify WebRTC DataChannel

The example installs `react-native-webrtc`, so run prebuild again and install a new development build. To test it:

1. Tap **Start BLE** on both physical devices and wait for a BLE link.
2. On one device only, select the BLE link and tap **Connect WebRTC over selected BLE signaling link**.
3. BLE carries the offer, answer, and ICE candidates. `WebRTC connected` appears after the direct connection opens.
4. Enter text and tap **Send WebRTC**. The other device displays the received byte count and UTF-8 content.

This demonstration uses the BLE `linkID` as an ephemeral remote identifier only to show serverless signaling. A production app must use a stable, session-authenticated peer ID and verify the signaling sender. Both devices still need a mutually reachable IP path because BLE carries signaling, not DataChannel traffic.

Expo Go cannot run this example because it does not contain this package's Swift and Kotlin modules. Run prebuild and reinstall the development build after changing native configuration.

## iOS Wi-Fi Aware

To enable iOS Wi-Fi Aware in the example, configure `expo.ios` in `app.json`:

```json
{
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
```

Then rebuild:

```sh
npx expo prebuild --clean
npx expo run:ios --device
```

A physical device running iOS 26 is required. The App ID and provisioning profile in Apple Developer must also contain the Wi-Fi Aware capability. Inspect the final signature with:

```sh
codesign -d --entitlements :- path/to/AirhopTransportExample.app
```

The output must contain `com.apple.developer.wifi-aware` with `Publish` and `Subscribe`. See the package-level `README.md` for the complete configuration.
