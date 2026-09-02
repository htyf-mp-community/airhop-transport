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
