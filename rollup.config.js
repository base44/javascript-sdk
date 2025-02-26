import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import terser from '@rollup/plugin-terser';
import { readFileSync } from 'fs';

// Since we're using ES modules, we need to manually read the package.json
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default [
  // Browser-friendly UMD build
  {
    input: 'src/index.js',
    output: {
      name: 'base44SDK',
      file: pkg.browser,
      format: 'umd',
      globals: {
        axios: 'axios'
      }
    },
    external: ['axios'],
    plugins: [
      resolve(),
      commonjs(),
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**'
      }),
      terser()
    ]
  },
  // CommonJS (for Node) and ES module (for bundlers) builds
  {
    input: 'src/index.js',
    output: [
      { file: pkg.main, format: 'cjs' },
      { file: pkg.module, format: 'es' }
    ],
    external: ['axios'],
    plugins: [
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**'
      }),
      terser()
    ]
  }
]; 