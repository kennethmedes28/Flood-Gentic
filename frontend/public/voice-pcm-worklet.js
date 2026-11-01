/**
 * Turns microphone audio into the frames the backend's /ws/voice expects:
 * raw 16-bit little-endian mono PCM, in blocks of `frameSize` samples (80 ms at 16 kHz).
 *
 * It runs on the browser's audio thread, so it does as little as possible: it converts each sample
 * from a float (-1 to 1) to a 16-bit integer, fills a block, and posts the block to the page.
 * Loaded by useVoiceTranscription with audioContext.audioWorklet.addModule("/voice-pcm-worklet.js").
 */
class PcmRecorder extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.frame = new Int16Array(options.processorOptions.frameSize)
    this.filled = 0
  }

  process(inputs) {
    const samples = inputs[0] && inputs[0][0]
    if (!samples) return true // no microphone data in this block; keep running

    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]))
      this.frame[this.filled++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      if (this.filled === this.frame.length) {
        const block = this.frame.slice() // a copy, so the buffer can be handed over
        this.port.postMessage(block.buffer, [block.buffer])
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor("pcm-recorder", PcmRecorder)
