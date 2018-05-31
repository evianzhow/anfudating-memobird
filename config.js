const config = {
  memobird: {
    accesskey: '',
  },
  wechaty: {
    room: true,
    regex: /^安福大厅$/,
  },
  global: {
    chunkReadLines: 40,
    waitSec: 20 * 1000, // only applied to 'Print Book' logic, in caseof memobird overheating
    pollingSec: 20 * 1000,
    timeoutSec: 60 * 1000,
    preset: 'pipeline', // 'pipeline' or 'concurrent'
    api: 'best-effort', // 'best-effort' or 'complete'
  }
}

export default config;
