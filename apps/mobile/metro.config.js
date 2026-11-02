// Expo's default Metro config already understands npm workspaces (SDK 52+).
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// In-app subscriptions (react-native-purchases) are optional: a `require`
// inside try/catch that can't be resolved fails at runtime, not at build
// time, so the app still runs before `npx expo install react-native-purchases`.
config.transformer = { ...config.transformer, allowOptionalDependencies: true };

module.exports = withNativeWind(config, { input: "./global.css" });
