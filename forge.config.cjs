module.exports = {
  packagerConfig: {
    platform: ['darwin', 'linux', 'win32'],
    prune: true,
    asar: {
      unpack: '*.{node,dll}'
    },
    ignore: [
      /^\/src/,
      /^\/tests/,
      /^\/docs/,
      /^\/examples/,
      /^\/proxy-service/,
      /^\/assets/,
      /^\/build/,
      /^\/resources/,
      /\.map$/,
      /\.md$/,
      /\.ts$/,
      /\.tsx$/,
      /tsconfig.*\.json$/,
      /tsconfig.*\.tsbuildinfo$/,
      /\.eslintrc/,
      /\.prettier/,
      /vitest\.config/,
      /electron\.vite\.config/,
      /forge\.config/,
      /tailwind\.config/,
      /postcss\.config/,
      /^\/\.\w+/
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
