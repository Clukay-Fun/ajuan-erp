/* eslint-disable */
const { app } = require('electron')
const name = process.argv[2]
if (!name) {
  console.error('用法：electron tests/e2e/run.cjs <scenario>')
  process.exit(2)
}
const scenario = require(`./${name}.e2e.cjs`)
scenario()
  .then(() => {
    console.log(`PASS ${name}`)
    app.exit(0)
  })
  .catch((err) => {
    console.error(`FAIL ${name}\n${err && err.stack ? err.stack : err}`)
    app.exit(1)
  })
