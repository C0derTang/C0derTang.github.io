import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  PlaneGeometry,
  Vector3,
  CatmullRomCurve3,
  TubeGeometry,
} from 'three'
import type { Materials } from '../materials'
import { mulberry32 } from '../../util/math'
import { WATER_Y, type SceneState } from '../state'
import type { Quality } from '../../config/quality'

/**
 * Blocking-out geometry for every beat so the camera path, lighting, fog, rain and post can be
 * tuned before the real models land. Each world module replaces one group; the interfaces
 * (a Group plus an update hook) stay.
 */
export interface WorldPart {
  group: Group
  update?(state: SceneState): void
}

const shadowed = (m: Mesh, cast = true, receive = true): Mesh => {
  m.castShadow = cast
  m.receiveShadow = receive
  return m
}

export function placeholderGround(mats: Materials): WorldPart {
  const group = new Group()
  const ground = new Mesh(new PlaneGeometry(400, 400), mats.ground)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = 0
  shadowed(ground, false, true)
  group.add(ground)
  // gravel path to the door
  const path = new Mesh(new PlaneGeometry(3, 26), mats.gravel)
  path.rotation.x = -Math.PI / 2
  path.position.set(0, 0.01, 12)
  shadowed(path, false, true)
  group.add(path)
  // puddles: thin water discs on the path
  for (const [x, z, r] of [
    [0.4, 8, 0.9],
    [-0.6, 14, 1.2],
    [0.2, 19, 0.7],
  ] as const) {
    const p = new Mesh(new CylinderGeometry(r, r, 0.02, 24), mats.water)
    p.position.set(x, 0.015, z)
    group.add(p)
  }
  return { group }
}

export function placeholderHouse(mats: Materials): WorldPart {
  const group = new Group()
  const W = 11
  const D = 7
  const H = 3.2
  const plinth = shadowed(new Mesh(new BoxGeometry(W + 1, 0.35, D + 1.6), mats.stone))
  plinth.position.set(0, 0.175, -D / 2 + 0.3)
  group.add(plinth)
  const wall = (w: number, h: number, x: number, y: number, z: number, rotY = 0) => {
    const m = shadowed(new Mesh(new BoxGeometry(w, h, 0.25), mats.plaster))
    m.position.set(x, y, z)
    m.rotation.y = rotY
    group.add(m)
  }
  // front wall with the doorway (2.4 wide, 2.2 high)
  wall(4.3, H - 0.35, -3.35, 0.35 + (H - 0.35) / 2, 0)
  wall(4.3, H - 0.35, 3.35, 0.35 + (H - 0.35) / 2, 0)
  wall(2.4, H - 2.55, 0, 2.55 + (H - 2.55) / 2, 0)
  // sides
  wall(D, H - 0.35, -W / 2, 0.35 + (H - 0.35) / 2, -D / 2, Math.PI / 2)
  wall(D, H - 0.35, W / 2, 0.35 + (H - 0.35) / 2, -D / 2, Math.PI / 2)
  // back wall: shoji frames and two sliding panels (the opening is x -1.05..1.05)
  const backL = shadowed(new Mesh(new BoxGeometry(4.45, H - 0.35, 0.12), mats.plaster))
  backL.position.set(-3.275, 0.35 + (H - 0.35) / 2, -D)
  const backR = backL.clone()
  backR.position.x = 3.275
  group.add(backL, backR)
  const panelL = shadowed(new Mesh(new BoxGeometry(1.1, 2.1, 0.05), mats.paper), false, false)
  panelL.position.set(-0.55, 0.35 + 1.05, -D + 0.05)
  const panelR = panelL.clone()
  panelR.position.x = 0.55
  group.add(panelL, panelR)
  const lintel = shadowed(new Mesh(new BoxGeometry(2.3, H - 2.55, 0.12), mats.plaster))
  lintel.position.set(0, 2.55 + (H - 2.55) / 2, -D)
  group.add(lintel)
  // floor (tatami) and ceiling
  const floor = shadowed(new Mesh(new BoxGeometry(W - 0.5, 0.06, D - 0.3), mats.tatami), false)
  floor.position.set(0, 0.38, -D / 2)
  group.add(floor)
  const ceiling = shadowed(new Mesh(new BoxGeometry(W, 0.1, D), mats.woodDark), false, false)
  ceiling.position.set(0, H + 0.05, -D / 2)
  group.add(ceiling)
  // hip roof: a low pyramid
  const roof = shadowed(new Mesh(new CylinderGeometry(0.2, 8.2, 2.8, 4), mats.thatch))
  roof.rotation.y = Math.PI / 4
  roof.scale.set(1.15, 1, 0.8)
  roof.position.set(0, H + 1.4, -D / 2 + 0.2)
  group.add(roof)
  // posts along the front and the engawa deck
  for (const x of [-5.3, -1.4, 1.4, 5.3]) {
    const post = shadowed(new Mesh(new CylinderGeometry(0.1, 0.1, H, 10), mats.wood))
    post.position.set(x, H / 2 + 0.35, 0.6)
    group.add(post)
  }
  const deck = shadowed(new Mesh(new BoxGeometry(W, 0.12, 1.4), mats.wood), false)
  deck.position.set(0, 0.4, 0.7)
  group.add(deck)
  // noren
  for (const x of [-0.55, 0.55]) {
    const cloth = new Mesh(new PlaneGeometry(1.05, 0.9), mats.cloth)
    cloth.position.set(x, 2.1, 0.02)
    group.add(cloth)
  }
  // interior props: hearth, kettle, lamp, kitchen block on +x, shelf on -x
  const hearth = shadowed(new Mesh(new BoxGeometry(1.2, 0.3, 1.2), mats.woodDark))
  hearth.position.set(0, 0.55, -3.4)
  group.add(hearth)
  const kettle = shadowed(new Mesh(new CylinderGeometry(0.28, 0.32, 0.36, 16), mats.woodDark))
  kettle.position.set(0, 1.25, -3.4)
  group.add(kettle)
  const lampBody = new Mesh(new CylinderGeometry(0.22, 0.22, 0.6, 12), mats.paper)
  lampBody.position.set(1.5, 2.3, -4)
  group.add(lampBody)
  const kamado = shadowed(new Mesh(new BoxGeometry(1.6, 0.9, 1.0), mats.stone))
  kamado.position.set(4.6, 0.8, -3.6)
  group.add(kamado)
  const shelf = shadowed(new Mesh(new BoxGeometry(0.3, 0.05, 1.6), mats.wood))
  shelf.position.set(-5.2, 1.6, -3.5)
  group.add(shelf)
  // bicycle, lantern, pole and wires
  for (const z of [0.9, 0.3]) {
    const wheel = shadowed(new Mesh(new CylinderGeometry(0.33, 0.33, 0.03, 20), mats.woodDark))
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(-3.2, 0.68, z + 0.6)
    group.add(wheel)
  }
  const lantern = shadowed(new Mesh(new BoxGeometry(0.5, 1.6, 0.5), mats.stone))
  lantern.position.set(5, 0.8, 4)
  group.add(lantern)
  const pole = shadowed(new Mesh(new CylinderGeometry(0.12, 0.15, 8, 8), mats.woodDark))
  pole.position.set(7.5, 4, 3)
  group.add(pole)
  const arm = shadowed(new Mesh(new BoxGeometry(1.6, 0.1, 0.1), mats.woodDark))
  arm.position.set(7.5, 7.6, 3)
  group.add(arm)
  for (const dy of [0, -0.25, -0.5]) {
    const curve = new CatmullRomCurve3([
      new Vector3(-60, 7.2 + dy, 3),
      new Vector3(-26, 6.4 + dy, 3),
      new Vector3(7.5, 7.6 + dy, 3),
      new Vector3(40, 6.5 + dy, 3),
      new Vector3(70, 7.3 + dy, 3),
    ])
    const wire = new Mesh(new TubeGeometry(curve, 48, 0.012, 4, false), mats.woodDark)
    group.add(wire)
  }
  return {
    group,
    update(state) {
      panelL.position.x = -0.55 - 1.05 * state.doors
      panelR.position.x = 0.55 + 1.05 * state.doors
    },
  }
}

export function placeholderLandscape(mats: Materials, quality: Quality): WorldPart {
  const group = new Group()
  const rnd = mulberry32(5)
  // cedars: cone stacks
  const cedar = (x: number, z: number, s: number) => {
    const trunk = shadowed(new Mesh(new CylinderGeometry(0.18 * s, 0.28 * s, 4 * s, 8), mats.bark))
    trunk.position.set(x, 2 * s, z)
    group.add(trunk)
    for (let i = 0; i < 5; i++) {
      const r = (3.2 - i * 0.5) * s
      const cone = shadowed(new Mesh(new ConeGeometry(r, 3 * s, 10), mats.needle), true, false)
      cone.position.set(x, (3.5 + i * 1.9) * s, z)
      group.add(cone)
    }
  }
  cedar(-9, 14, 1.4)
  cedar(-13, 8, 1.7)
  cedar(10, 8, 1.2)
  cedar(13, 12, 1.5)
  for (let i = 0; i < 14; i++) cedar(-40 + i * 6 + rnd() * 3, -70 - rnd() * 10, 1 + rnd() * 0.6)
  // hydrangea blobs
  for (const [x, z] of [
    [-3.5, 2],
    [3.5, 2],
    [-2, 12],
    [2.2, 12.5],
  ] as const) {
    const bush = shadowed(new Mesh(new ConeGeometry(0.9, 1.1, 8), mats.rice), true, false)
    bush.position.set(x, 0.55, z)
    group.add(bush)
  }
  // terraces: curved steps as boxes
  for (let i = 0; i < 4; i++) {
    const step = shadowed(new Mesh(new BoxGeometry(120, 1.2 + i * 0.2, 6), mats.ground), false)
    step.position.set(0, 0.6 + i * 1.4, -50 - i * 6)
    group.add(step)
    const wall = shadowed(new Mesh(new BoxGeometry(120, 0.9 + i * 0.2, 0.4), mats.stone))
    wall.position.set(0, 0.45 + i * 1.4, -47 - i * 6)
    group.add(wall)
  }
  // far ridges
  for (const [z, h, tone] of [
    [-150, 40, mats.ground],
    [-300, 90, mats.stone],
    [-600, 160, mats.stone],
  ] as const) {
    const geo = new PlaneGeometry(1200, h, 120, 1)
    const pos = geo.attributes.position
    if (pos) {
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        if (pos.getY(i) > 0) pos.setY(i, h * (0.5 + 0.5 * Math.sin(x / 90) * Math.cos(x / 37)))
      }
      pos.needsUpdate = true
    }
    const ridge = new Mesh(geo, tone)
    ridge.position.set(0, 0, z)
    group.add(ridge)
  }
  // rice: instanced thin cards
  const count = quality.riceCount
  const rice = new InstancedMesh(new PlaneGeometry(0.12, 0.55), mats.rice, count)
  rice.castShadow = false
  rice.receiveShadow = false
  const m = new Matrix4()
  const o = new Object3D()
  for (let i = 0; i < count; i++) {
    const row = i % 100
    const col = Math.floor(i / 100)
    o.position.set(-25 + row * 0.5 + (rnd() - 0.5) * 0.15, WATER_Y + 0.25, -9 - col * 0.5)
    o.rotation.y = rnd() * Math.PI
    o.updateMatrix()
    m.copy(o.matrix)
    rice.setMatrixAt(i, m)
  }
  group.add(rice)
  // dikes
  for (const x of [-2.6, 2.6]) {
    const dike = shadowed(new Mesh(new BoxGeometry(0.9, 0.5, 40), mats.mud))
    dike.position.set(x, WATER_Y + 0.15, -28)
    group.add(dike)
  }
  return { group }
}

export function placeholderWater(mats: Materials): WorldPart {
  const group = new Group()
  const water = new Mesh(new PlaneGeometry(90, 44), mats.water)
  water.rotation.x = -Math.PI / 2
  water.position.set(0, WATER_Y, -30)
  group.add(water)
  // underwater: mud bed and stems
  const mud = shadowed(new Mesh(new PlaneGeometry(90, 60), mats.mud), false)
  mud.rotation.x = -Math.PI / 2
  mud.position.set(0, -3, -38)
  group.add(mud)
  const rnd = mulberry32(9)
  const stems = new InstancedMesh(new CylinderGeometry(0.02, 0.03, 2.7, 6), mats.rice, 500)
  const o = new Object3D()
  for (let i = 0; i < 500; i++) {
    o.position.set(-20 + rnd() * 40, -1.65, -12 - rnd() * 44)
    o.updateMatrix()
    stems.setMatrixAt(i, o.matrix)
  }
  group.add(stems)
  return { group }
}
