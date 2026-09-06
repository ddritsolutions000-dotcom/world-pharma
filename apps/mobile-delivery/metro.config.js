const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

function pkgDir(name) {
  return path.dirname(require.resolve(`${name}/package.json`, { paths: [projectRoot] }));
}

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.unstable_enableSymlinks = true;

const existingBlock = config.resolver.blockList;
const extraBlock = [
  /node_modules[\\/]\.pnpm[\\/]react-native@0\.87\./,
  /[\\/]android[\\/]build[\\/]/,
  /[\\/]ios[\\/]build[\\/]/,
];
config.resolver.blockList = existingBlock
  ? [existingBlock, extraBlock].flat()
  : extraBlock;

config.resolver.extraNodeModules = {
  'react-native': pkgDir('react-native'),
  react: pkgDir('react'),
  '@babel/runtime': pkgDir('@babel/runtime'),
};

const previousResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@babel/runtime' || moduleName.startsWith('@babel/runtime/')) {
    return {
      type: 'sourceFile',
      filePath: require.resolve(moduleName, { paths: [projectRoot] }),
    };
  }
  if (previousResolve) {
    return previousResolve(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
