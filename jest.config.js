export default {
  testEnvironment: 'jsdom',
  transform: {
    // Hermetic babel config: src/package.json sets "type":"module", which stops
    // the root .babelrc from applying to files under src/. Pass presets inline
    // (babelrc/configFile disabled) so jest transforms ESM regardless.
    '^.+\\.(js|jsx)$': ['babel-jest', {
      babelrc: false,
      configFile: false,
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        ['@babel/preset-react', { runtime: 'automatic' }],
      ],
    }],
  },
  modulePathIgnorePatterns: ['<rootDir>/src/package.json'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/src/__mocks__/fileMock.js',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'],
  testMatch: ['**/__tests__/**/*.test.(js|jsx)'],
  moduleFileExtensions: ['js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    '!src/main.jsx',
    '!src/vite-env.d.ts',
  ],
};