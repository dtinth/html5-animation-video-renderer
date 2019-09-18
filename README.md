# html5-animation-video-renderer

A Node.js script that renders an HTML5-based animation (\*) into a high-quality video.
It renders the animation frame-by-frame using Puppeteer without using screen capturing, so no frameskips!

It works by opening a headless browser and calls `seekToFrame(frameNumber)` for each frame of your animation.
Your web page is expected to display that frame on the screen.
It then captures a screenshot for that frame.
Each frame is then sent to `ffmpeg` to encode the video without needing to save temporary files to disk.
Because it works by capturing the page screenshot, it can render:

- HTML elements
- SVG elements
- Canvas
- WebGL

However, the renderer needs to get the webpage to display a specific frame before rendering. Therefore, it does not support:

- CSS animations and transitions
- Nondeterministic animation

Features:

- Works with GSAP.
- It can run multiple instances of headless Chrome to speed up rendering.

## Examples

TBD

## Demo

It has been used to render a 4-minute long 1080p60 video. That’s 15000 frames.
The speed on my Late 2013 MacBook Pro is around 4.5 frames per second.

```
frame=15000 fps=4.5 q=-1.0 Lsize=  644441kB time=00:04:09.98 bitrate=21118.5kbits/s speed=0.0758x
video:644374kB audio:0kB subtitle:0kB other streams:0kB global headers:0kB muxing overhead: 0.010475%
```
