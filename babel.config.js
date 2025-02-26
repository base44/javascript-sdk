export default {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current',
          browsers: '>0.25%, not dead'
        },
      },
    ],
  ],
}; 