module.exports = {
  packagerConfig: {
    platform: ['darwin', 'linux', 'win32'],
    ignore: [
      /^\/src/,
      /(.eslintrc.json)|(.gitignore)|(electron.vite.config.ts)|(forge.config.cjs)|(tsconfig.*)/,
      /^\/tests/,
      /^\/docs/,
      /^\/examples/,
      /\.map$/,
      /README/,
      /^\/proxy-service/,
      /^\/cypress/,
      /^\/assets/,
      /\.md$/,
      /node_modules\/.*\/test/,
      /node_modules\/.*\/tests/,
      /node_modules\/.*\/docs/,
      /node_modules\/.*\/examples/,
      /node_modules\/.*\/\.github/,
      /node_modules\/.*\/CHANGELOG/,
      /node_modules\/.*\/LICENSE/,
      /node_modules\/.*\/README/
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32'],
      config: (arch, platform) => {
        // Only add macOS update manifest for darwin platform
        if (platform === 'darwin') {
          return {
            // Note that we must provide this S3 URL here
            // in order to support smooth version transitions
            // especially when using a CDN to front your updates
            macUpdateManifestBaseUrl: `https://rishi-electron-app.s3.amazonaws.com/rishi-electron-app-updates/darwin/${arch}`
          }
        }
        return {}
      }
    }
    // Temporarily disabled for cross-platform builds
    // {
    //   name: '@electron-forge/maker-squirrel',
    //   config: (arch) => ({
    //     // Note that we must provide this S3 URL here
    //     // in order to generate delta updates
    //     remoteReleases: `https://rishi-electron-app.s3.amazonaws.com/rishi-electron-app-updates/win32/${arch}`
    //   })
    // },

    // Temporarily disabled for cross-platform builds
    // {
    //   name: '@electron-forge/maker-deb',
    //   config: {}
    // },
    // {
    //   name: '@electron-forge/maker-rpm',
    //   config: {}
    // }
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-s3',
      config: {
        bucket: 'rishi-electron-app',
        public: false,
        region: 'us-east-1',
        keyResolver: (filename, platform, arch) => {
          return `${platform}/${arch}/${filename}`
        }
      }
    }
  ]
}
