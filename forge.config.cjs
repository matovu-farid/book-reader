module.exports = {
  packagerConfig: {
    ignore: [
      /^\/src/,
      /(.eslintrc.json)|(.gitignore)|(electron.vite.config.ts)|(forge.config.cjs)|(tsconfig.*)/
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32'],
      config: (arch) => ({
        // Note that we must provide this S3 URL here
        // in order to support smooth version transitions
        // especially when using a CDN to front your updates
        macUpdateManifestBaseUrl: `https://rishi-electron-app.s3.amazonaws.com/rishi-electron-app-updates/darwin/${arch}`
      })
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: (arch) => ({
        // Note that we must provide this S3 URL here
        // in order to generate delta updates
        remoteReleases: `https://rishi-electron-app.s3.amazonaws.com/rishi-electron-app-updates/win32/${arch}`
      })
    },

    {
      name: '@electron-forge/maker-deb',
      config: {}
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {}
    }
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-s3',
      config: {
        bucket: 'rishi-electron-app',
        public: false,
        region: 'us-east-1'
      }
    }
  ]
}
