# Airhop Transport Example

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

分别在两台真机上点击 Start。设备建立 BLE 或 LAN 链路后，Links 区域会显示 `linkID`。输入文字并点击 Send，对方会在 Recent events 中看到收到的数据。

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
