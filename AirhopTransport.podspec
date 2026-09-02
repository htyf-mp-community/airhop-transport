require "json"
package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |spec|
  spec.name = "AirhopTransport"
  spec.version = package["version"]
  spec.summary = package["description"]
  spec.homepage = package["homepage"]
  spec.license = package["license"]
  spec.authors = package["author"]
  spec.platforms = { :ios => "15.0" }
  spec.source = { :git => package["repository"]["url"], :tag => spec.version.to_s }
  spec.source_files = "ios/**/*.{h,m,mm,swift}"
  spec.swift_version = "5.9"
  spec.frameworks = "CoreBluetooth", "Network"
  # WiFiAware exists only in the iOS 26 SDK and must remain optional at runtime.
  spec.weak_frameworks = "WiFiAware"
  spec.dependency "React-Core"
end
