import { BEATS, FOCAL } from '../config/beats'
import { monotoneCubic } from '../util/math'
import { f } from './draw'

/**
 * The look-around inside the house is a pan, not a rotation: the camera holds cz = PAN.cz and
 * translates cx by one FACE per 90 degrees, so every part slides at its own rate and near posts
 * sweep past far walls like a head turn. The design-space window of a plane (depth d, restCz r)
 * moves by cx * P / (P + d - r) per unit of cx, independent of cz, so a part draws its faces
 * `facePitch(d)` apart; face 4 is a copy of face 0 and cx snaps back to 0 when the turn ends:
 * the two views are pixel-identical by construction, so the cut is invisible and every later
 * layer keeps its VP-centred authoring.
 */
export const PAN = { cz: 1400, faces: 4, refDepth: 1550, restCz: 1000, width: 1600 } as const

/** Design px the window of a plane at `depth` (authored at PAN.restCz) moves per unit of cx. */
export const pitchFactor = (depth: number): number => FOCAL / (FOCAL + depth - PAN.restCz)

/** Camera x travel per face: shifts the reference (room wall) plane by exactly one face width. */
export const FACE = PAN.width / pitchFactor(PAN.refDepth)

/** Distance between consecutive faces in a part's own design px. */
export const facePitch = (depth: number): number => FACE * pitchFactor(depth)
export const faceOffset = (face: number, depth: number): number => face * facePitch(depth)

const facesOfT = monotoneCubic([
  [BEATS.turn[0], 0],
  [0.335, 0],
  [0.345, 1],
  [0.375, 1],
  [0.39, 2],
  [0.42, 2],
  [0.435, 3],
  [0.465, 3],
  [0.48, 4],
  [BEATS.turn[1], 4],
])

/** Face the camera looks at during the turn (0..4, fractional between faces; 0 outside it). */
export const panFaces = (t: number): number =>
  t < BEATS.turn[0] || t >= BEATS.turn[1] ? 0 : facesOfT(t)

/** Extra camera x during the turn; 0 before and after (the wrap lands on face 4 == face 0). */
export const panCx = (t: number): number => FACE * panFaces(t)

/** View yaw in degrees: 0 faces the back shoji, 90 the right wall, 180 the entrance, 270 the left wall. */
export const yawOf = (pan: number): number => pan * 90

/**
 * Face-0 markup plus a live copy at face 4 so the wrap of the turn lands on identical pixels.
 * `id` must be unique in the document; the copy follows every attribute write on the original.
 */
export const withWrapFace = (id: string, depth: number, inner: string): string =>
  `<g id="${id}">${inner}</g><use href="#${id}" transform="translate(${f(faceOffset(PAN.faces, depth))} 0)"/>`

/** Wrap markup authored in the 1600-wide frame as face `face` of a part at `depth`. */
export const atFace = (face: number, depth: number, inner: string): string =>
  `<g transform="translate(${f(faceOffset(face, depth))} 0)">${inner}</g>`
