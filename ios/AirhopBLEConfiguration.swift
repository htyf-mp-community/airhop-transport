import Foundation

// CoreBluetooth raises an Objective-C exception if a restoration identifier is
// supplied without the matching UIBackgroundModes entry. That exception cannot
// cross the React Native promise boundary, so decide before constructing a
// manager whether state restoration is available for this host.
enum AirhopBLEConfiguration {
    static func restorationOptions(
        infoDictionary: [String: Any],
        requiredMode: String,
        key: String,
        identifier: String
    ) -> [String: Any]? {
        guard
            let modes = infoDictionary["UIBackgroundModes"] as? [String],
            modes.contains(requiredMode)
        else {
            return nil
        }
        return [key: identifier]
    }

    static func restorationOptions(
        requiredMode: String,
        key: String,
        identifier: String,
        bundle: Bundle = .main
    ) -> [String: Any]? {
        restorationOptions(
            infoDictionary: bundle.infoDictionary ?? [:],
            requiredMode: requiredMode,
            key: key,
            identifier: identifier
        )
    }
}
