import { resolve } from 'node:path'

// layout 实时渲染 demo.
// 直接 import ../src/index.ts (development export), 修改 src 触发 HMR 热更新.
// 注: 不 import 'vite' (该包在 ggn-editor/node_modules, 此处解析不到), 直接导出对象即可.
export default {
  root: resolve(import.meta.dirname),
  define: {
    // layout src 里 GGN_GREEDY_OFF 等调试开关引用 process.env, 浏览器无 process → 替换为空对象.
    'process.env': '{}',
  },
  server: {
    port: 5199,
    strictPort: true,
    fs: { allow: [resolve(import.meta.dirname, '..')] },
  },
  optimizeDeps: {
    // layout 源码由 Vite 直接转译 (不在 node_modules), 保持 HMR 生效
    exclude: ['../src/index.ts'],
  },
}
