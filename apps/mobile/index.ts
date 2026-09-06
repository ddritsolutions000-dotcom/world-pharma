import { registerRootComponent } from 'expo';
import Constants from 'expo-constants';
import { App } from './src/app-root';
import {
  applyMobileRuntimeEnv,
  isReactNativeRuntime,
  packagerHostnameFromExpo,
} from './src/runtime-api';

applyMobileRuntimeEnv({
  env: typeof process === 'undefined' ? {} : process.env,
  packagerHost: packagerHostnameFromExpo(Constants),
  isReactNative: isReactNativeRuntime(),
});

registerRootComponent(App);
export { App };
