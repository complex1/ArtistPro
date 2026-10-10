import { readFile } from 'node:fs/promises'
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
if (process.env.GITHUB_REF_NAME !== `v${version}`) throw new Error(`Release tag must match package version v${version}`)
console.log('Release tag matches v' + version)
