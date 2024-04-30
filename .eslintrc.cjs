module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    '@electron-toolkit/eslint-config-ts/recommended',
    '@electron-toolkit/eslint-config-prettier',
    'plugin:vitest-globals/recommended'
  ],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off'
  },
  env: {
    'vitest-globals/env': true
  }
}
