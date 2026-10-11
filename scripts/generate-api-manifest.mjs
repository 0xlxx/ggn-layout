#!/usr/bin/env bun
/**
 * 从真实运行时模块生成 API 导出清单。
 *
 * 运行：bun scripts/generate-api-manifest.mjs
 * 输出只包含运行时值导出；类型导出由 d.ts 与类型测试负责。
 */

const keys = (moduleNamespace) => Object.keys(moduleNamespace)
  .filter((key) => key !== 'default')
  .sort()

const manifestFrom = ({ publicModule, internalModule, optionsModule }) => ({
  version: 2,
  publicValues: keys(publicModule),
  internalValues: keys(internalModule),
  optionsValues: keys(optionsModule),
  subpaths: {
    api: './src/api/index.ts',
    core: './src/core.ts',
    options: './src/options.ts',
  },
})

const modules = {
  publicModule: await import(new URL('../src/public.ts', import.meta.url).href),
  internalModule: await import(new URL('../src/core.ts', import.meta.url).href),
  optionsModule: await import(new URL('../src/options.ts', import.meta.url).href),
}
const manifest = manifestFrom(modules)

const render = (value) => JSON.stringify(value, null, 2) + String.fromCharCode(10)
const output = render(manifest)
const repeatedOutput = render(manifestFrom(modules))

// 生成过程必须是确定的：同一组真实模块导出连续渲染两次必须完全相同。
if (output !== repeatedOutput) {
  throw new Error('API manifest generation is not deterministic')
}

const manifestUrl = new URL('../docs/api-manifest.json', import.meta.url)
const previous = await Bun.file(manifestUrl).text().catch(() => '')
if (previous !== output) {
  await Bun.write(manifestUrl, output)
}

// 写入后再次读取，确保文件内容就是本次确定性输出。
const written = await Bun.file(manifestUrl).text()
if (written !== output) {
  throw new Error('Generated API manifest does not match deterministic output')
}

console.log('generated ' + manifestUrl.pathname)
