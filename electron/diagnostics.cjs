const fs = require('node:fs')
const path = require('node:path')

// Local, bounded diagnostics. Callers provide event codes, never user content.
exports.createDiagnostics = (directory) => {
  const file = path.join(directory, 'desktop.jsonl')
  return (event, data = {}) => {
    try {
      fs.mkdirSync(directory, { recursive: true })
      if (fs.existsSync(file) && fs.statSync(file).size >= 1024 * 1024) {
        const previous = `${file}.1`
        if (fs.existsSync(previous)) fs.unlinkSync(previous)
        fs.renameSync(file, previous)
      }
      fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), event, ...data })}\n`)
    } catch { /* Logging must never break media or recovery. */ }
  }
}
