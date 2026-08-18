# THAMMATORN Portfolio

A one-screen portfolio page with a full-screen WebGL fluid background. The word `THAMMATORN` is an invisible but real obstacle, so the fluid flows around the letters instead of just sitting behind them.

## Run it

```bash
npm install
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`.

For a production check:

```bash
npm run build
npm run preview
```

## What is here

- Vite 7 and vanilla JavaScript. No framework.
- WebGL2 fluid simulation based on Pavel Dobryakov's project.
- HTML/CSS for the layout and accessible page structure.
- Right-side debug control GUI for tuning the active solver at runtime.
- A small offscreen Canvas 2D surface for making the text obstacle mask.

## Main files

| File | What it does |
| --- | --- |
| `index.html` | Page metadata, canvas, semantic `h1`, hidden interaction hint, and fallback text. |
| `src/main.js` | Starts the simulation and handles visibility, resize, fonts, and reduced motion. |
| `src/debug-controls.js` | Wires the right-side solver controls to the live simulation configuration. |
| `src/fluid-simulation.js` | WebGL solver, shaders, framebuffers, text mask, input, and animation loop. |
| `src/styles.css` | Full-screen layout, transparent title, responsive sizing, dark background, and fallback state. |
| `src/vendor/webgl-fluid-simulation-LICENSE.txt` | MIT license for the adapted solver. |

## How the title works

The HTML `h1` is still there for semantics, but its paint is transparent. Its current styling is:

- `Doto`, with a sans-serif fallback
- Font weight `10`
- Letter spacing `0.02em`
- Desktop size `clamp(2.75rem, 10vw, 10rem)`
- Mobile size `clamp(2.25rem, 10vw, 4.5rem)`

The simulation reads those computed font settings, draws `THAMMATORN` character by character onto a small Canvas 2D mask, then uploads it as an `R8` WebGL texture. That mask is used by the divergence, pressure, gradient, advection, and display shaders, which keeps velocity and dye from passing through the letters.

## Fluid loop

Each frame does the usual fluid-sim work:

1. Calculate curl and add vorticity.
2. Calculate divergence around the text obstacle.
3. Solve pressure with 12 Jacobi passes.
4. Subtract the pressure gradient.
5. Advect velocity and dye, rejecting samples inside the letters.
6. Render the dye over a near-black background with light color compression.

The solver uses double-buffered velocity, dye, and pressure textures. It uses `RG16F`, `RGBA16F`, and `R16F` render targets, so it needs WebGL2 plus `EXT_color_buffer_float`.

## Input and behavior

- Move a mouse or pen across the page to stir the fluid. Clicking is not required.
- Touch input can drag across the page.
- A small idle splat is added every `3.8s` so the background does not go completely still.
- The animation pauses when the tab is hidden.
- Reduced-motion mode stops the continuous loop but still renders explicit pointer input.
- The right-side Control GUI exposes simulation resolution, dissipation, pressure, vorticity, splat settings, shading, colorful cycling, Bloom, Sunrays, pause, random splats, transparent capture, and background color.
- The Typography section adjusts title size, letter spacing, font family, weight, and style while refreshing the solver obstacle mask.
- Desktop device pixel ratio is capped at `1.5`; mobile is capped at `1.25`.
- Simulation resolution is `160` desktop and `112` mobile. Dye resolution is `640` desktop and `448` mobile.
- If WebGL is unavailable, the canvas hides and the page shows a simple fallback message.

## Quick tuning

Most feel/performance settings are near the top of `FluidSimulation` in `src/fluid-simulation.js`:

| Setting | Current value |
| --- | --- |
| `curl` | `30` |
| `pressureIterations` | `12` |
| `splatForce` | `4800` |
| `splatRadius` | `0.22` before `/100` conversion |
| `velocityDissipation` | `0.15` |
| `dyeDissipation` | `0.95` |

Higher simulation/dye resolutions look smoother but use more GPU memory and time. Lowering them is the easiest performance knob.

## Attribution

The fluid solver is adapted from:

`https://github.com/PavelDoGreat/WebGL-Fluid-Simulation`

It is MIT licensed. The full license is kept in `src/vendor/webgl-fluid-simulation-LICENSE.txt`.
