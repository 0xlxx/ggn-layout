/**
 * 运行时全局 `process` 的最小类型声明。
 *
 * 源码中的 `process.env.GGN_*` 均为调试开关，发布构建（tsdown define）会把它们
 * 替换成 `undefined` 并消除死分支，因此浏览器 bundle 永远不会真正访问 `process`。
 * 这里只声明库内实际用到的形状（`env` 的字符串索引），避免引入整个 @types/node
 * 而掩盖浏览器不可用的 Node 全局对象。
 */
export {}

declare global {
  const process: {
    env: Record<string, string | undefined>
  }
}
