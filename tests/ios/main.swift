import Foundation

private func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    guard condition() else {
        FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
        exit(1)
    }
}

let central = AirhopBLEConfiguration.restorationOptions(
    infoDictionary: ["UIBackgroundModes": ["bluetooth-central"]],
    requiredMode: "bluetooth-central",
    key: "restore-key",
    identifier: "central-id"
)
expect(central?["restore-key"] as? String == "central-id", "enables restoration for a declared mode")

let absent = AirhopBLEConfiguration.restorationOptions(
    infoDictionary: [:],
    requiredMode: "bluetooth-peripheral",
    key: "restore-key",
    identifier: "peripheral-id"
)
expect(absent == nil, "disables restoration when UIBackgroundModes is absent")

let wrongMode = AirhopBLEConfiguration.restorationOptions(
    infoDictionary: ["UIBackgroundModes": ["bluetooth-central"]],
    requiredMode: "bluetooth-peripheral",
    key: "restore-key",
    identifier: "peripheral-id"
)
expect(wrongMode == nil, "keeps central and peripheral requirements independent")

let malformed = AirhopBLEConfiguration.restorationOptions(
    infoDictionary: ["UIBackgroundModes": "bluetooth-peripheral"],
    requiredMode: "bluetooth-peripheral",
    key: "restore-key",
    identifier: "peripheral-id"
)
expect(malformed == nil, "rejects malformed UIBackgroundModes")
print("Airhop BLE configuration tests passed")
