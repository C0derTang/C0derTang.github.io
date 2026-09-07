type RainLayer = 'foliage' | 'puddles' | 'roof' | 'field'

interface RainTreatment {
  low: number
  high: number
  offset: number
  rms: number
}

/** Join only the recording's ends; its natural droplets and dynamics stay intact. */
function joinLoop(context: BaseAudioContext, recording: AudioBuffer): AudioBuffer {
  const overlap = Math.round(recording.sampleRate * 0.5)
  const length = recording.length - overlap
  if (length < overlap) throw new Error('Rain recording is too short')
  const loop = context.createBuffer(recording.numberOfChannels, length, recording.sampleRate)
  for (let channel = 0; channel < loop.numberOfChannels; channel++) {
    const input = recording.getChannelData(channel)
    const output = loop.getChannelData(channel)
    output.set(input.subarray(0, length))
    for (let i = 0; i < overlap; i++) {
      const angle = (i / overlap) * Math.PI * 0.5
      output[i] = (input[length + i] ?? 0) * Math.cos(angle) + (input[i] ?? 0) * Math.sin(angle)
    }
  }
  return loop
}

/** Static room/material filtering, with no recurring volume envelope or synthetic rain. */
async function treatRecording(
  context: BaseAudioContext,
  recording: AudioBuffer,
  treatment: RainTreatment,
): Promise<AudioBuffer> {
  const sampleRate = recording.sampleRate
  const warmup = Math.round(sampleRate * 0.2)
  const offline = new OfflineAudioContext(2, recording.length + warmup, sampleRate)
  const source = offline.createBufferSource()
  source.buffer = recording
  source.loop = true
  const highpass = offline.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = treatment.low
  highpass.Q.value = 0.5
  const lowpass = offline.createBiquadFilter()
  lowpass.type = 'lowpass'
  lowpass.frequency.value = treatment.high
  lowpass.Q.value = 0.5
  source.connect(highpass).connect(lowpass).connect(offline.destination)
  // Start in the previous loop so filters are settled at the returned loop's first sample.
  source.start(
    0,
    (recording.duration + treatment.offset - warmup / sampleRate) % recording.duration,
  )
  const rendered = await offline.startRendering()
  const buffer = context.createBuffer(2, recording.length, sampleRate)
  let energy = 0
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    data.set(rendered.getChannelData(channel).subarray(warmup))
    for (const value of data) {
      energy += value * value
    }
  }
  const rms = Math.sqrt(energy / (buffer.length * 2))
  if (!Number.isFinite(rms) || rms < 0.000001) throw new Error('Rain recording is silent')
  const level = treatment.rms / rms
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    // Tame individual close-up drips without ducking the whole recording around each one.
    for (let i = 0; i < data.length; i++)
      data[i] = 0.12 * Math.tanh(((data[i] ?? 0) * level) / 0.12)
  }
  return buffer
}

export async function createRainBuffers(
  context: BaseAudioContext,
  signal?: AbortSignal,
): Promise<Record<RainLayer, AudioBuffer>> {
  const load = async (name: string) => {
    const response = await fetch(`/assets/audio/${name}.m4a`, { signal })
    if (!response.ok) throw new Error(`Rain recording failed to load: ${response.status}`)
    const recording = await context.decodeAudioData(await response.arrayBuffer())
    signal?.throwIfAborted()
    return joinLoop(context, recording)
  }
  const [rain, leaves] = await Promise.all([load('light-rain'), load('leaf-drips')])
  const [foliage, puddles, roof, field] = await Promise.all([
    treatRecording(context, leaves, { low: 180, high: 6200, offset: 0, rms: 0.026 }),
    treatRecording(context, leaves, { low: 850, high: 6500, offset: 5, rms: 0.014 }),
    treatRecording(context, rain, { low: 260, high: 2800, offset: 0, rms: 0.026 }),
    treatRecording(context, rain, { low: 220, high: 5200, offset: 7, rms: 0.024 }),
  ])
  signal?.throwIfAborted()
  return { foliage, puddles, roof, field }
}
