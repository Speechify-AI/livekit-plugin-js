import { readFileSync } from 'fs';
import { join } from 'path';
import { defineConfig, type Options } from 'tsup';

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));

export default defineConfig({
  entry: ['src/**/*.ts'],
  format: ['cjs', 'esm'],
  splitting: false,
  sourcemap: true,
  // for the type maps to work, we use tsc's declaration-only command on the success callback
  dts: false,
  clean: true,
  target: 'node16',
  bundle: false,
  shims: true,
  define: {
    __PACKAGE_NAME__: JSON.stringify(pkg.name),
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
  },
  esbuildOptions: (options, context) => {
    if (context.format === 'esm') {
      options.packages = 'external';
    }
  },
  plugins: [
    {
      // https://github.com/egoist/tsup/issues/953#issuecomment-2294998890
      // ensuring that all local requires/imports in `.cjs` files import from `.cjs` files.
      name: 'fix-cjs-imports',
      renderChunk(code) {
        if (this.format === 'cjs') {
          const regexCjs = /require\((?<quote>['"])(?<import>\.[^'"]+)\.js['"]\)/g;
          const regexDynamic = /import\((?<quote>['"])(?<import>\.[^'"]+)\.js['"]\)/g;
          const regexEsm = /from(?<space>[\s]*)(?<quote>['"])(?<import>\.[^'"]+)\.js['"]/g;
          return {
            code: code
              .replace(regexCjs, 'require($<quote>$<import>.cjs$<quote>)')
              .replace(regexDynamic, 'import($<quote>$<import>.cjs$<quote>)')
              .replace(regexEsm, 'from$<space>$<quote>$<import>.cjs$<quote>'),
          };
        }
      },
    },
  ],
});
