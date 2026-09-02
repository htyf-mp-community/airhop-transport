const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const packageRoot = path.resolve(projectRoot, "..");
const config = getDefaultConfig(projectRoot);

// Watch source changes in the parent library without publishing or packing it.
config.watchFolders = [packageRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(packageRoot, "node_modules"),
];

module.exports = config;
