import dts from 'rollup-plugin-dts';
import esbuild from 'rollup-plugin-esbuild';
import nodeResolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';

const name = './dist/index';

const bundle = (config) => ({
    ...config,
    input: 'src/index.ts',
});

export default [
    bundle({
        plugins: [
            nodeResolve(),
            esbuild({
                minify: true,
            }),
            json(),
        ],
        output: [
            {
                file: `${name}.umd.js`,
                format: 'umd',
                name: 'FrontifyFinder',
                sourcemap: true,
            },
            {
                file: `${name}.es.js`,
                format: 'es',
                sourcemap: true,
            },
            {
                file: `${name}.js`,
                format: 'iife',
                name: 'FrontifyFinder',
                sourcemap: true,
            },
        ],
    }),
    bundle({
        plugins: [dts()],
        output: {
            file: `${name}.d.ts`,
            format: 'es',
        },
    }),
];
