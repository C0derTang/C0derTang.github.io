# Asset attribution

All assets below are licensed **CC0 1.0 Universal** (public domain dedication) — no
attribution is legally required, but sources are credited here for provenance. Every asset
was downloaded from the original source. Resizing, excerpts, encoding, and playback treatments
are documented below.

Poly Haven textures were fetched at their `1k` resolution from
`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<slug>/<slug>_<map>_1k.jpg`; `rough`
and `ao` maps were then downsampled from 1024 px to 512 px with `sips -Z 512`. `color` and
`normal` maps were kept at the original 1024 px (1K).

## Textures

### thatch — `public/assets/tex/thatch/`

- Source asset: Thatch Roof Angled (`thatch_roof_angled`)
- Author(s): Rob Tuytel (processing), Dimitrios Savva (photography) — Poly Haven
- Source: https://polyhaven.com/a/thatch_roof_angled
- License: CC0 1.0
- Files: `color.jpg` (diff, 1024x1024), `normal.jpg` (nor_gl, 1024x1024), `rough.jpg`
  (resized 1024 -> 512), `ao.jpg` (resized 1024 -> 512)

### planks — `public/assets/tex/planks/`

- Source asset: Weathered Planks (`weathered_planks`)
- Author(s): Dario Barresi (processing), Dimitrios Savva (photography) — Poly Haven
- Source: https://polyhaven.com/a/weathered_planks
- License: CC0 1.0
- Files: `color.jpg` (diff, 1024x1024), `normal.jpg` (nor_gl, 1024x1024), `rough.jpg`
  (resized 1024 -> 512), `ao.jpg` (resized 1024 -> 512)

### plaster — `public/assets/tex/plaster/`

- Source asset: Worn Plaster Wall (`worn_plaster_wall`)
- Author(s): Dimitrios Savva — Poly Haven
- Source: https://polyhaven.com/a/worn_plaster_wall
- License: CC0 1.0
- Files: `color.jpg` (diff, 1024x1024), `normal.jpg` (nor_gl, 1024x1024), `rough.jpg`
  (resized 1024 -> 512), `ao.jpg` (resized 1024 -> 512)

### gravel — `public/assets/tex/gravel/`

- Source asset: Gravel Road (`gravel_road`)
- Author(s): Amal Kumar — Poly Haven
- Source: https://polyhaven.com/a/gravel_road
- License: CC0 1.0
- Files: `color.jpg` (diff, 1024x1024), `normal.jpg` (nor_gl, 1024x1024), `rough.jpg`
  (resized 1024 -> 512), `ao.jpg` (resized 1024 -> 512)

### moss — `public/assets/tex/moss/`

- Source asset: Forest Leaves 02 (`forest_leaves_02`)
- Author(s): Rob Tuytel — Poly Haven
- Source: https://polyhaven.com/a/forest_leaves_02
- License: CC0 1.0
- Files: `color.jpg` (diffuse, 1024x1024), `normal.jpg` (nor_gl, 1024x1024), `rough.jpg`
  (resized 1024 -> 512), `ao.jpg` (resized 1024 -> 512)
- Note: this set's diffuse file is named `..._diffuse_1k.jpg` (not `_diff_1k.jpg` like the
  others); found via the `files` API.

### stone — `public/assets/tex/stone/`

- Source asset: Japanese Stone Wall (`japanese_stone_wall`)
- Author(s): Rico Cilliers (tiling), Charlotte Baglioni (photography), Dario Barresi
  (processing) — Poly Haven
- Source: https://polyhaven.com/a/japanese_stone_wall
- License: CC0 1.0
- Files: `color.jpg` (diff, 1024x1024), `normal.jpg` (nor_gl, 1024x1024), `rough.jpg`
  (resized 1024 -> 512), `ao.jpg` (resized 1024 -> 512)

### mud — `public/assets/tex/mud/`

- Source asset: Brown Mud 03 (`brown_mud_03`)
- Author(s): Rob Tuytel — Poly Haven
- Source: https://polyhaven.com/a/brown_mud_03
- License: CC0 1.0
- Files: `color.jpg` (diff, 1024x1024), `normal.jpg` (nor_gl, 1024x1024), `rough.jpg`
  (resized 1024 -> 512), `ao.jpg` (resized 1024 -> 512)

### bark — `public/assets/tex/bark/`

- Source asset: Bark Willow (`bark_willow`)
- Author(s): Dario Barresi (processing), Dimitrios Savva (photography) — Poly Haven
- Source: https://polyhaven.com/a/bark_willow
- License: CC0 1.0
- Files: `color.jpg` (diff, 1024x1024), `normal.jpg` (nor_gl, 1024x1024), `rough.jpg`
  (resized 1024 -> 512), `ao.jpg` (resized 1024 -> 512)

### tatami — `public/assets/tex/tatami/`

- Source asset: Tatami005
- Author/site: ambientCG (Lennart Demes)
- Source: https://ambientcg.com/view?id=Tatami005 (downloaded as
  `Tatami005_1K-JPG.zip` from https://ambientcg.com/get?file=Tatami005_1K-JPG.zip)
- License: CC0 1.0
- Files: `color.jpg` (from `*_Color.jpg`, 1024x1024), `normal.jpg` (from `*_NormalGL.jpg`,
  1024x1024), `rough.jpg` (from `*_Roughness.jpg`, resized 1024 -> 512), `ao.jpg` (from
  `*_AmbientOcclusion.jpg`, resized 1024 -> 512). Renamed to match this project's layout;
  zip also contained Displacement/NormalDX/blend/mtlx/usdc/tres files, which were discarded.

### needles_alpha — `public/assets/tex/needles_alpha.png`

- Source asset: Fir Sapling (`fir_sapling`), twig alpha map
- Author(s): Rob Tuytel (photography), Rico Cilliers (modeling) — Poly Haven
- Source: https://polyhaven.com/a/fir_sapling (file:
  `https://dl.polyhaven.org/file/ph-assets/Models/png/1k/fir_sapling/fir_sapling_twigs_alpha_1k.png`)
- License: CC0 1.0
- Change: none besides renaming; kept at original 1024x1024 (1K), 16-bit grayscale PNG.

## HDRI

### kloofendal_overcast_1k — `public/assets/hdri/kloofendal_overcast_1k.hdr`

- Source asset: Kloofendal 48d Overcast (`kloofendal_overcast`)
- Author(s): Greg Zaal — Poly Haven
- Source: https://polyhaven.com/a/kloofendal_overcast (file:
  https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_overcast_1k.hdr)
- License: CC0 1.0
- Change: none; original 1K Radiance `.hdr` file.

## Audio

### light-rain — `public/assets/audio/light-rain.m4a`

- Source asset: Light Rain
- Author: soundrecorder7 — Freesound
- Source: https://freesound.org/people/soundrecorder7/sounds/167034/
- Download: https://cdn.freesound.org/previews/167/167034_2328971-hq.mp3
- License: CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/
- Change: excerpt 3.0–21.0 seconds from the site's HQ MP3 version of the original field
  recording; encoded as stereo AAC-LC at 32 kHz, target 72 kbps, in an M4A container.
- Playback: a 0.5-second seam crossfade creates a continuous loop. Static filtering, level
  adjustment, and soft limiting of sharp drip peaks make separate sheltered-roof and open-field layers. No generated rain or repeating
  volume envelope is added.

### leaf-drips — `public/assets/audio/leaf-drips.m4a`

- Source asset: Light rain drips on leaves
- Author: Valerej.aif — Freesound
- Source: https://freesound.org/people/Valerej.aif/sounds/851873/
- Download: https://cdn.freesound.org/previews/851/851873_16201576-hq.mp3
- License: CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/
- Original recording: Zoom H5 with high-pass filtering, as described by its author.
- Change: excerpt 1.0–13.0 seconds from the site's HQ MP3 version; encoded as stereo AAC-LC
  at 32 kHz, target 64 kbps, in an M4A container.
- Playback: a 0.5-second seam crossfade, static filtering, level adjustment, soft limiting of
  sharp drip peaks, and different
  starting offsets create the foliage and faint close-droplet layers.

Fire, sliding-door, and underwater-bubble loops are original procedural audio generated by the
site. The rain layers use only the two recordings credited above.

## Summary

| Asset dir                       | Change applied                                   |
| ------------------------------- | ------------------------------------------------ |
| tex/thatch                      | rough/ao resized 1024 -> 512; color/normal at 1K |
| tex/planks                      | rough/ao resized 1024 -> 512; color/normal at 1K |
| tex/plaster                     | rough/ao resized 1024 -> 512; color/normal at 1K |
| tex/gravel                      | rough/ao resized 1024 -> 512; color/normal at 1K |
| tex/moss                        | rough/ao resized 1024 -> 512; color/normal at 1K |
| tex/stone                       | rough/ao resized 1024 -> 512; color/normal at 1K |
| tex/mud                         | rough/ao resized 1024 -> 512; color/normal at 1K |
| tex/bark                        | rough/ao resized 1024 -> 512; color/normal at 1K |
| tex/tatami                      | unzipped, renamed; rough/ao resized 1024 -> 512  |
| tex/needles_alpha.png           | renamed only, no resize (already 1K)             |
| hdri/kloofendal_overcast_1k.hdr | none (original 1K file)                          |
| audio/light-rain.m4a            | 18-second excerpt; stereo AAC-LC, 32 kHz         |
| audio/leaf-drips.m4a            | 12-second excerpt; stereo AAC-LC, 32 kHz         |

No sets failed to download; every requested map (color/normal/rough/ao) was available for
every texture set, so no substitutions were needed.
