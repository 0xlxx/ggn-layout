/**
 * `release.yml`「校验已发布版本来源提交」步骤的集成测试。
 *
 * 该步骤的逻辑**内联**在工作流里（发布 job 持 id-token，不能执行仓库存放的脚本），
 * 因此它不在 typecheck / lint 的视野内，出错只会在发布当天暴露 —— 那是最坏的时刻。
 * 本测试从 release.yml 里抽出该步骤的 `run` 原文、用 stub `npm` + 本地 attestation
 * 服务真实跑一遍，确保：优先认签名的 SLSA provenance、无 provenance 回退 gitHead、
 * 两者都对不上时拒绝。
 */
import { spawn } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const WORKFLOW = '.github/workflows/release.yml'
const STEP_NAME = '校验已发布版本的来源提交与当前提交一致'

const SLSA_TYPE = 'https://slsa.dev/provenance/v1'

/** 取某个 step 的 `run: |` 块原文（按 YAML 块标量规则去掉公共缩进）。 */
function extractRunBlock(yaml: string, nameFragment: string): string {
  const lines = yaml.split('\n')
  const stepIdx = lines.findIndex((line) => line.includes('- name:') && line.includes(nameFragment))
  if (stepIdx === -1) throw new Error(`找不到步骤: ${nameFragment}`)

  let runIdx = -1
  for (let i = stepIdx; i < lines.length; i++) {
    if (i > stepIdx && /^\s*- name:/.test(lines[i])) break
    if (/^\s*run: \|\s*$/.test(lines[i])) {
      runIdx = i
      break
    }
  }
  if (runIdx === -1) throw new Error(`步骤「${nameFragment}」没有 \`run: |\` 块`)

  const base = (lines[runIdx].match(/^ */)?.[0].length ?? 0) + 2
  const body: string[] = []
  for (let i = runIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') {
      body.push('')
      continue
    }
    if ((lines[i].match(/^ */)?.[0].length ?? 0) < base) break
    body.push(lines[i].slice(base))
  }
  while (body.length > 0 && body[body.length - 1] === '') body.pop()
  return body.join('\n')
}

/** 造一个 SLSA v1 attestation bundle（结构对齐 registry 上真实返回）。 */
function slsaBundle(gitCommit: string) {
  const statement = {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name: 'pkg:npm/ggn-layout@9.9.9', digest: { sha512: 'deadbeef' } }],
    predicateType: SLSA_TYPE,
    predicate: {
      buildDefinition: {
        buildType: 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
        resolvedDependencies: [{ uri: 'git+https://example.com/repo@refs/tags/v9.9.9', digest: { gitCommit } }],
      },
    },
  }
  return {
    attestations: [
      { bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') } } },
    ],
  }
}

/** 只识别 `npm view <spec> <field>` 的假 npm，值从 STUB_NPM_CONFIG 指向的 JSON 取。 */
const STUB_NPM = `#!/usr/bin/env node
const cfg = JSON.parse(require('node:fs').readFileSync(process.env.STUB_NPM_CONFIG, 'utf8'))
const field = process.argv[process.argv.length - 1]
process.stdout.write((cfg[field] ?? '') + '\\n')
`

describe('release.yml 已发布版本来源提交校验', () => {
  let stubDir: string
  let scriptPath: string
  let configPath: string
  let server: Server
  let serverUrl: string
  let bundle: unknown = {}

  /** 跑一次工作流里的那段 run 脚本，返回退出码与输出。 */
  // 必须用异步 spawn: 脚本会 fetch 本测试同进程里的 http 服务, 若用 spawnSync 阻塞
  // 事件循环, 服务无法响应, 子进程的 fetch 会永久挂起 (实测死锁)。
  function runStep(values: Record<string, string>): Promise<{ status: number | null; stdout: string; stderr: string }> {
    writeFileSync(configPath, JSON.stringify(values))
    const env = {
      ...process.env,
      PATH: `${stubDir}:${process.env.PATH}`,
      STUB_NPM_CONFIG: configPath,
      PKG: 'ggn-layout',
      VERSION: '9.9.9',
      EXPECTED_SHA: 'cafebabe'.repeat(5),
    }
    return new Promise((resolve) => {
      const child = spawn('bash', [scriptPath], { env })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => (stdout += chunk))
      child.stderr.on('data', (chunk) => (stderr += chunk))
      child.on('close', (status) => resolve({ status, stdout, stderr }))
    })
  }

  beforeAll(async () => {
    stubDir = mkdtempSync(join(tmpdir(), 'release-guard-'))
    const npmPath = join(stubDir, 'npm')
    writeFileSync(npmPath, STUB_NPM)
    chmodSync(npmPath, 0o755)

    configPath = join(stubDir, 'config.json')
    scriptPath = join(stubDir, 'step.sh')
    writeFileSync(scriptPath, extractRunBlock(readFileSync(WORKFLOW, 'utf8'), STEP_NAME))

    // 真实 http 服务承载 attestation bundle，覆盖脚本里的 fetch 路径。
    server = createServer((req, res) => {
      void req
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(bundle))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    serverUrl = typeof address === 'object' && address ? `http://127.0.0.1:${address.port}/attestations` : ''
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const setBundle = (value: unknown) => {
    bundle = value
  }

  it('优先采用签名的 SLSA provenance，且与当前提交一致时通过', async () => {
    setBundle(slsaBundle('cafebabe'.repeat(5)))
    const result = await runStep({ 'dist.attestations.url': serverUrl, gitHead: 'f'.repeat(40) })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('SLSA provenance (signed)')
  })

  it('来源提交与当前提交不一致时拒绝', async () => {
    setBundle(slsaBundle('0'.repeat(40)))
    const result = await runStep({ 'dist.attestations.url': serverUrl, gitHead: 'cafebabe'.repeat(5) })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('不一致')
  })

  it('无 provenance 时回退到未签名的 gitHead', async () => {
    setBundle(slsaBundle('0'.repeat(40)))
    const result = await runStep({ 'dist.attestations.url': '', gitHead: 'cafebabe'.repeat(5) })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('gitHead (unsigned)')
  })

  it('bundle 里没有 SLSA 类型时也算无 provenance，回退 gitHead', async () => {
    setBundle({ attestations: [{ bundle: { dsseEnvelope: { payload: Buffer.from('{}').toString('base64') } } }] })
    const result = await runStep({ 'dist.attestations.url': serverUrl, gitHead: 'cafebabe'.repeat(5) })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('gitHead (unsigned)')
  })

  it('既无 provenance 也无 gitHead 时拒绝', async () => {
    setBundle({ attestations: [] })
    const result = await runStep({ 'dist.attestations.url': '', gitHead: '' })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('未记录')
  })
})
