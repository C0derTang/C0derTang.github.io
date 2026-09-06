import {
  Color,
  HalfFloatType,
  Uniform,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three'
import {
  DepthOfFieldEffect,
  Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  VignetteEffect,
} from 'postprocessing'
import type { Quality } from '../config/quality'
import type { SceneState } from './state'

/** Per-beat colour grade: a tint mixed in by strength, a saturation pull, an underwater teal lift. */
class GradeEffect extends Effect {
  constructor() {
    super(
      'GradeEffect',
      /* glsl */ `
      uniform vec3 tint;
      uniform float strength;
      uniform float saturation;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(vec3(l), c, saturation);
        c = mix(c, c * tint * 2.0, strength);
        outputColor = vec4(c, inputColor.a);
      }`,
      {
        uniforms: new Map<string, Uniform>([
          ['tint', new Uniform(new Color('#6f8090'))],
          ['strength', new Uniform(0.16)],
          ['saturation', new Uniform(0.9)],
        ]),
      },
    )
  }
  set(tint: string, strength: number, saturation: number): void {
    const u = this.uniforms
    ;(u.get('tint')?.value as Color | undefined)?.set(tint)
    const s = u.get('strength')
    if (s) s.value = strength
    const sat = u.get('saturation')
    if (sat) sat.value = saturation
  }
}

/**
 * pmndrs postprocessing: one render pass into a half-float target with a depth texture, then
 * one merged effect pass (depth of field reading that depth, grade, vignette, SMAA). The
 * renderer's ACES tone mapping and sRGB output are applied by the final pass.
 */
export interface Post {
  render(dt: number): void
  resize(w: number, h: number): void
  apply(state: SceneState): void
}

export function createPost(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  quality: Quality,
): Post {
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType })
  composer.addPass(new RenderPass(scene, camera))
  const grade = new GradeEffect()
  const vignette = new VignetteEffect({ offset: 0.35, darkness: 0.45 })
  const dof = quality.dof
    ? new DepthOfFieldEffect(camera, {
        focusDistance: 12,
        focusRange: 10,
        bokehScale: 2.5,
        resolutionScale: 0.5,
      })
    : null
  const smaa = new SMAAEffect({ preset: SMAAPreset.MEDIUM })
  const effects = dof ? [dof, grade, vignette, smaa] : [grade, vignette, smaa]
  composer.addPass(new EffectPass(camera, ...effects))
  return {
    render(dt) {
      composer.render(dt)
    },
    resize(w, h) {
      composer.setSize(w, h)
    },
    apply(state) {
      grade.set(state.grade.tint, state.grade.strength, state.grade.saturation)
      vignette.darkness = state.grade.vignette
      if (dof) {
        dof.cocMaterial.focusDistance = state.focus.distance
        dof.cocMaterial.focusRange = state.focus.range
        dof.bokehScale = state.focus.bokeh
      }
    },
  }
}
