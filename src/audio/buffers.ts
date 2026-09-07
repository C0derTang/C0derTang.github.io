import { mulberry32 } from '../util/math'
import type { SoundLayer } from './mix'
import { createRainBuffers } from './recorded-rain'

type Grain = 'ember' | 'slide' | 'wood' | 'bubble'
interface SoundRecipe {
  seconds: number
  channels: 1 | 2
  seed: number
  low: number
  high: number
  bed: number
  rms: number
  grains: readonly { kind: Grain; rate: number; gain: number }[]
}

const RECIPES = {
  fire: {
    seconds: 12,
    channels: 1,
    seed: 317,
    low: 100,
    high: 1150,
    bed: 0.16,
    rms: 0.038,
    grains: [
      { kind: 'ember', rate: 3.5, gain: 0.55 },
      { kind: 'wood', rate: 0.65, gain: 0.16 },
    ],
  },
  door: {
    seconds: 8,
    channels: 1,
    seed: 331,
    low: 280,
    high: 1900,
    bed: 0.25,
    rms: 0.042,
    grains: [
      { kind: 'slide', rate: 32, gain: 0.24 },
      { kind: 'wood', rate: 1.2, gain: 0.2 },
    ],
  },
  bubbles: {
    seconds: 12,
    channels: 2,
    seed: 337,
    low: 80,
    high: 350,
    bed: 0,
    rms: 0.014,
    grains: [{ kind: 'bubble', rate: 0.3, gain: 0.45 }],
  },
} as const satisfies Record<'fire' | 'door' | 'bubbles', SoundRecipe>

const TAU = Math.PI * 2
const filterRate = (hz: number, sampleRate: number): number =>
  1 - Math.exp((-TAU * Math.min(hz, sampleRate * 0.45)) / sampleRate)

/** Soft band-limited noise, with irregular slow changes in density instead of a repeating pulse. */
function noiseBed(
  data: Float32Array,
  recipe: SoundRecipe,
  sampleRate: number,
  random: () => number,
): void {
  if (recipe.bed === 0) return
  const upperRate = filterRate(recipe.high, sampleRate)
  const lowerRate = filterRate(recipe.low, sampleRate)
  const densityRate = filterRate(1.4, sampleRate)
  const interval = Math.round(sampleRate * 0.17)
  let upper = 0
  let softened = 0
  let lower = 0
  let density = 0.8
  let target = density
  for (let i = 0; i < data.length; i++) {
    if (i % interval === 0) target = 0.6 + random() * 0.45
    density += (target - density) * densityRate
    upper += (random() * 2 - 1 - upper) * upperRate
    softened += (upper - softened) * upperRate
    lower += (softened - lower) * lowerRate
    data[i] = (softened - lower) * density * recipe.bed
  }
}

/** Short noise transients; water/wood add only a heavily damped, inharmonic body. */
function addGrain(
  channels: Float32Array[],
  start: number,
  sampleRate: number,
  kind: Grain,
  gain: number,
  random: () => number,
): void {
  const bubble = kind === 'bubble'
  const wood = kind === 'wood'
  const duration = bubble
    ? 0.19 + random() * 0.12
    : wood
      ? 0.045 + random() * 0.035
      : 0.009 + random() * 0.03
  const frequency = bubble
    ? 140 + random() * 150
    : wood
      ? 160 + random() * 150
      : 680 + random() * 950
  const cutoff = bubble ? 450 : wood ? 1100 : kind === 'ember' ? 2400 : 1900
  const rate = filterRate(cutoff, sampleRate)
  const attack = bubble ? 0.007 : 0.0015
  const decay = duration * (bubble ? 0.21 : 0.17)
  const pan = 0.2 + random() * 0.6
  const gains = channels.length === 1 ? [gain] : [Math.sqrt(1 - pan) * gain, Math.sqrt(pan) * gain]
  const count = Math.ceil(duration * sampleRate)
  let filtered = 0
  let phase = 0
  for (let i = 0; i < count; i++) {
    const time = i / sampleRate
    const age = time / duration
    const envelope = (1 - Math.exp(-time / attack)) * Math.exp(-time / decay) * (1 - age) ** 2
    filtered += (random() * 2 - 1 - filtered) * rate
    // Small bubbles rise in pitch; rain drops settle quickly. No sustained pitches or harmonies.
    phase += (TAU * frequency * (bubble ? 1 + age * 0.9 : 1 - age * 0.22)) / sampleRate
    const body = Math.sin(phase) * 0.7 + Math.sin(phase * 1.61) * 0.18
    const sound = bubble
      ? body * 0.7 + filtered * 0.18
      : wood
        ? body * 0.28 + filtered * 0.65
        : filtered
    const value = sound * envelope
    for (let channel = 0; channel < channels.length; channel++) {
      const data = channels[channel]
      const level = gains[channel]
      const index = start + i
      if (data && level !== undefined && index < data.length)
        data[index] = (data[index] ?? 0) + value * level
    }
  }
}

function createBuffer(context: BaseAudioContext, recipe: SoundRecipe): AudioBuffer {
  // These softened environmental sounds need no ultrasonic bandwidth. Also bounds PCM at 19 MB.
  const sampleRate = Math.min(context.sampleRate, 32000)
  const length = Math.round(recipe.seconds * sampleRate)
  const overlap = Math.round(sampleRate * 0.3)
  const channels = Array.from({ length: recipe.channels }, (_, channel) => {
    const data = new Float32Array(length + overlap)
    noiseBed(data, recipe, sampleRate, mulberry32(recipe.seed + channel * 101))
    return data
  })
  const random = mulberry32(recipe.seed + 907)
  for (const grain of recipe.grains) {
    // Exponential waiting times keep drops irregular, with occasional natural gaps and clusters.
    let time = 0
    while (time < (length + overlap) / sampleRate) {
      time -= Math.log(Math.max(0.000001, 1 - random())) / grain.rate
      const start = Math.floor(time * sampleRate)
      addGrain(channels, start, sampleRate, grain.kind, grain.gain, random)
    }
  }

  const buffer = context.createBuffer(recipe.channels, length, sampleRate)
  let energy = 0
  let peak = 0
  for (let channel = 0; channel < channels.length; channel++) {
    const source = channels[channel]
    if (!source) continue
    const data = buffer.getChannelData(channel)
    let mean = 0
    for (let i = 0; i < length; i++) {
      // The loop begins with the continuation of its last sample; slowly blend into the head.
      const t = Math.min(1, i / overlap)
      const blend = t * t * (3 - 2 * t)
      data[i] = (source[i] ?? 0) * blend + (source[length + i] ?? 0) * (1 - blend)
      mean += data[i] ?? 0
    }
    mean /= length
    for (let i = 0; i < length; i++) {
      const value = (data[i] ?? 0) - mean
      data[i] = value
      energy += value * value
      peak = Math.max(peak, Math.abs(value))
    }
  }
  // Preserve sparse transients and stereo placement; never boost a quiet layer into clipping.
  const rms = Math.sqrt(energy / (length * channels.length))
  const scale = Math.min(recipe.rms / Math.max(rms, 0.000001), 0.28 / Math.max(peak, 0.000001))
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i++) data[i] = (data[i] ?? 0) * scale
  }
  return buffer
}

/** Load recorded rain and prepare the existing small detail loops behind the curtain. */
export async function createSoundBuffers(
  context: BaseAudioContext,
  signal?: AbortSignal,
): Promise<Record<SoundLayer, AudioBuffer>> {
  const rain = await createRainBuffers(context, signal)
  return {
    ...rain,
    fire: createBuffer(context, RECIPES.fire),
    door: createBuffer(context, RECIPES.door),
    bubbles: createBuffer(context, RECIPES.bubbles),
  }
}
