# Airhop Transport Example

[简体中文](./README.md) | [English](./README.en.md)

这个 Expo development build 用于两台真机验证 `@htyf-mp/airhop-transport` 的 BLE、LAN 和 Wi-Fi Aware 原始字节传输。

## 准备

```sh
cd packages/airhop-transport
yarn install
yarn example install
yarn example prebuild
```

iOS 还需要安装 Pods：

```sh
cd example/ios
pod install
```

## 运行两台设备

Android：

```sh
yarn example android --device
```

iOS：

```sh
yarn example ios --device
```

分别在两台真机上点击 **Start BLE**。页面会直接显示 BLE 的四个阶段：

1. 获取附近设备权限。
2. 同时启动 GATT 广播和扫描。
3. 等待另一台设备建立 BLE 链路。
4. 选择链路并发送原始字节。

连接成功后，Links 区域会显示 `BLE`、原生 `linkID`、本机在该连接中的 central/peripheral 角色和可用的 RSSI。第一个 BLE 链路会自动选中，也可以点击其他链路切换目标。输入文字并点击 Send，对方会在 Recent events 中看到链路、字节数和 UTF-8 内容。

**Start Wi-Fi / LAN** 是独立的可选加速步骤，不影响 BLE 流程。为了清楚验证蓝牙，请先只在两台设备上启动 BLE，确认收发成功后再打开加速链路。

普通 Expo Go 不包含本包的 Swift/Kotlin 模块，因此不能运行此示例。修改原生配置后需要重新执行 prebuild 并重新安装 development build。

## iOS Wi-Fi Aware

示例要启用 iOS Wi-Fi Aware，需要在 `app.json` 的 `expo.ios` 中配置：

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

随后执行：

```sh
npx expo prebuild --clean
npx expo run:ios --device
```

必须使用 iOS 26 真机。还要确保 Apple Developer 后台的 App ID 和 provisioning profile 包含 Wi-Fi Aware capability。可以检查最终签名：

```sh
codesign -d --entitlements :- path/to/AirhopTransportExample.app
```

输出应包含 `com.apple.developer.wifi-aware`，并列出 `Publish` 和 `Subscribe`。完整配置说明见包根目录的 `README.md`。
