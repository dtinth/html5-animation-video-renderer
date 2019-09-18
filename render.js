const puppeteer = require('puppeteer')
const spawn = require('child_process').spawn
const tkt = require('tkt')
const fs = require('fs')
const path = require('path')

function createRendererFactory(url, { scale = 1 } = {}) {
  return function createRenderer() {
    const promise = (async () => {
      const browser = await puppeteer.launch()
      const page = await browser.newPage()
      await page.goto(url)
      const info = await page.evaluate(`({
        width: document.querySelector('#scene').offsetWidth,
        height: document.querySelector('#scene').offsetHeight,
        ...getInfo(),
      })`)
      await page.setViewport({
        width: info.width,
        height: info.height,
        deviceScaleFactor: scale,
      })
      return { browser, page, info }
    })()
    let rendering = false
    return {
      async getInfo() {
        return (await promise).info
      },
      async render(i) {
        if (rendering) {
          throw new Error('render() may not be called concurrently!')
        }
        rendering = true
        try {
          const { page, info } = await promise
          await page.evaluate(`seekToFrame(${i})`)
          const buffer = await page.screenshot({
            clip: { x: 0, y: 0, width: info.width, height: info.height },
          })
          return buffer
        } finally {
          rendering = false
        }
      },
      async end() {
        const { browser } = await promise
        browser.close()
      },
    }
  }
}

function createParallelRender(max, rendererFactory) {
  const available = []
  const working = new Set()
  let nextWorkerId = 1
  let waiting = null
  function obtainWorker() {
    if (available.length + working.size < max) {
      const worker = { id: nextWorkerId++, renderer: rendererFactory() }
      available.push(worker)
      console.log('Spawn worker %d', worker.id)
      if (waiting) waiting.nudge()
    }
    if (available.length > 0) {
      const worker = available.shift()
      working.add(worker)
      return worker
    }
    return null
  }
  const work = async (fn, taskDescription) => {
    for (;;) {
      const worker = obtainWorker()
      if (!worker) {
        if (!waiting) {
          let nudge
          const promise = new Promise(resolve => {
            nudge = () => {
              waiting = null
              resolve()
            }
          })
          waiting = { promise, nudge }
        }
        await waiting.promise
        continue
      }
      try {
        console.log('Worker %d: %s', worker.id, taskDescription)
        const result = await fn(worker.renderer)
        available.push(worker)
        if (waiting) waiting.nudge()
        return result
      } catch (e) {
        worker.renderer.end()
        throw e
      } finally {
        working.delete(worker)
      }
    }
  }
  return {
    async getInfo() {
      return work(r => r.getInfo(), 'getInfo')
    },
    async render(i) {
      return work(r => r.render(i), `render(${i})`)
    },
    async end() {
      return Promise.all([...available, ...working].map(r => r.renderer.end()))
    },
  }
}

function ffmpegOutput(fps, outPath) {
  const ffmpeg = spawn('ffmpeg', [
    '-f',
    'image2pipe',
    '-framerate',
    `${fps}`,
    '-i',
    '-',
    '-c:v',
    'libx264',
    '-crf',
    '16',
    '-preset',
    'ultrafast',
    '-y',
    outPath,
  ])
  ffmpeg.stderr.pipe(process.stderr)
  ffmpeg.stdout.pipe(process.stdout)
  return {
    writePNGFrame(buffer, _frameNumber) {
      ffmpeg.stdin.write(buffer)
    },
    end() {
      ffmpeg.stdin.end()
    },
  }
}

function pngFileOutput(dirname) {
  require('mkdirp').sync(dirname)
  return {
    writePNGFrame(buffer, frameNumber) {
      const basename = 'frame' + `${frameNumber}`.padStart(6, '0') + '.png'
      fs.writeFileSync(path.join(dirname, basename), buffer)
    },
    end() {},
  }
}

tkt
  .cli()
  .command(
    '$0',
    'Renders a video',
    {
      url: {
        description: 'The URL to render',
        type: 'string',
        default: `file://${__dirname}/examples/gsap-hello-world.html`,
      },
      video: {
        description: 'The path to video file to render',
        type: 'string',
        default: 'video.mp4',
      },
      parallelism: {
        description:
          'How many headless Chrome processes to use to render in parallel',
        type: 'number',
        default: require('os').cpus().length,
      },
      start: {
        description: 'Frame number to start rendering',
        type: 'number',
        default: 0,
      },
      end: {
        description:
          'Frame number to end rendering (that frame number will not be rendered)',
        type: 'number',
      },
      png: {
        description: 'Directory for PNG frame output',
        type: 'string',
      },
      scale: {
        description: 'Device scale factor',
        type: 'number',
        default: 1,
      },
    },
    async function main(args) {
      const renderer = createParallelRender(
        args.parallelism,
        createRendererFactory(args.url, { scale: args.scale }),
      )
      const info = await renderer.getInfo()
      console.log('Movie info:', info)

      const outputs = []
      if (args.video) {
        outputs.push(ffmpegOutput(info.fps, args.video))
      }
      if (args.png != null) {
        outputs.push(pngFileOutput(args.png))
      }

      const promises = []
      const start = args.start || 0
      const end = args.end || info.numberOfFrames
      for (let i = start; i < end; i++) {
        promises.push({ promise: renderer.render(i), frame: i })
      }
      for (let i = 0; i < promises.length; i++) {
        console.log(
          'Render frame %d %d/%d',
          promises[i].frame,
          i,
          promises.length,
        )
        const buffer = await promises[i].promise
        for (const o of outputs) o.writePNGFrame(buffer, promises[i].frame)
      }
      for (const o of outputs) o.end()
      renderer.end()
    },
  )
  .parse()
