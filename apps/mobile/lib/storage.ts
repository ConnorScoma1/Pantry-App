import AsyncStorage from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "@kitchen-pantry/database";

/** Device storage behind the shared key-value interface. */
export const deviceStorage: KeyValueStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
};
