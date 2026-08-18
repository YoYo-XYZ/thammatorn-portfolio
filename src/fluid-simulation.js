/*
 * The solver below is adapted from Pavel Dobryakov's WebGL Fluid Simulation.
 * Original project: https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
 * The upstream project is distributed under the MIT License.
 */

const VERTEX_SHADER = `#version 300 es
precision highp float;

layout (location = 0) in vec2 aPosition;

out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;

uniform vec2 texelSize;

void main () {
    vUv = aPosition * 0.5 + 0.5;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const CLEAR_SHADER = `#version 300 es
precision mediump float;

in vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
out vec4 outColor;

void main () {
    outColor = value * texture(uTexture, vUv);
}
`;

const SPLAT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
out vec4 outColor;

void main () {
    vec2 p = vUv - point;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * color;
    vec3 base = texture(uTarget, vUv).xyz;
    outColor = vec4(base + splat, 1.0);
}
`;

const CURL_SHADER = `#version 300 es
precision mediump float;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uObstacle;
out vec4 outColor;

bool isSolid (vec2 uv) {
    return texture(uObstacle, uv).r > 0.5;
}

void main () {
    int solidNeighbors = 0;
    if (isSolid(vL)) solidNeighbors += 1;
    if (isSolid(vR)) solidNeighbors += 1;
    if (isSolid(vT)) solidNeighbors += 1;
    if (isSolid(vB)) solidNeighbors += 1;

    if (isSolid(vUv) || solidNeighbors >= 2) {
        outColor = vec4(0.0);
        return;
    }

    float L = texture(uVelocity, vL).y;
    float R = texture(uVelocity, vR).y;
    float T = texture(uVelocity, vT).x;
    float B = texture(uVelocity, vB).x;
    float vorticity = R - L - T + B;
    outColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
`;

const VORTICITY_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform sampler2D uObstacle;
uniform float curl;
uniform float dt;
out vec4 outColor;

bool isSolid (vec2 uv) {
    return texture(uObstacle, uv).r > 0.5;
}

void main () {
    if (isSolid(vUv)) {
        outColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Avoid amplifying mask and stencil noise directly at the obstacle boundary.
    if (isSolid(vL) || isSolid(vR) || isSolid(vT) || isSolid(vB)) {
        outColor = texture(uVelocity, vUv);
        return;
    }

    float L = texture(uCurl, vL).x;
    float R = texture(uCurl, vR).x;
    float T = texture(uCurl, vT).x;
    float B = texture(uCurl, vB).x;
    float C = texture(uCurl, vUv).x;

    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 0.0001;
    force *= curl * C;
    force.y *= -1.0;

    vec2 velocity = texture(uVelocity, vUv).xy;
    velocity += force * dt;
    velocity = clamp(velocity, vec2(-1000.0), vec2(1000.0));
    outColor = vec4(velocity, 0.0, 1.0);
}
`;

const DIVERGENCE_SHADER = `#version 300 es
precision mediump float;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uObstacle;
out vec4 outColor;

float obstacleAt (vec2 uv) {
    return texture(uObstacle, uv).r;
}

void main () {
    if (obstacleAt(vUv) > 0.95) {
        outColor = vec4(0.0);
        return;
    }

    vec2 C = texture(uVelocity, vUv).xy;
    float L = texture(uVelocity, vL).x;
    float R = texture(uVelocity, vR).x;
    float T = texture(uVelocity, vT).y;
    float B = texture(uVelocity, vB).y;
    float obstacleL = obstacleAt(vL);
    float obstacleR = obstacleAt(vR);
    float obstacleT = obstacleAt(vT);
    float obstacleB = obstacleAt(vB);

    if (vL.x < 0.0) L = -C.x;
    else L = mix(L, -C.x, obstacleL);
    if (vR.x > 1.0) R = -C.x;
    else R = mix(R, -C.x, obstacleR);
    if (vT.y > 1.0) T = -C.y;
    else T = mix(T, -C.y, obstacleT);
    if (vB.y < 0.0) B = -C.y;
    else B = mix(B, -C.y, obstacleB);

    float divergence = 0.5 * (R - L + T - B);
    outColor = vec4(divergence, 0.0, 0.0, 1.0);
}
`;

const PRESSURE_SHADER = `#version 300 es
precision mediump float;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform sampler2D uObstacle;
out vec4 outColor;

float obstacleAt (vec2 uv) {
    return texture(uObstacle, uv).r;
}

float pressureAt (vec2 uv, float center) {
    return mix(texture(uPressure, uv).x, center, obstacleAt(uv));
}

void main () {
    float C = texture(uPressure, vUv).x;
    if (obstacleAt(vUv) > 0.95) {
        outColor = vec4(0.0);
        return;
    }

    float L = pressureAt(vL, C);
    float R = pressureAt(vR, C);
    float T = pressureAt(vT, C);
    float B = pressureAt(vB, C);
    float divergence = texture(uDivergence, vUv).x;
    float pressure = (L + R + B + T - divergence) * 0.25;
    outColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

const GRADIENT_SUBTRACT_SHADER = `#version 300 es
precision mediump float;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform sampler2D uObstacle;
out vec4 outColor;

float obstacleAt (vec2 uv) {
    return texture(uObstacle, uv).r;
}

float pressureAt (vec2 uv, float center) {
    return mix(texture(uPressure, uv).x, center, obstacleAt(uv));
}

void main () {
    if (obstacleAt(vUv) > 0.95) {
        outColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    float C = texture(uPressure, vUv).x;
    float L = pressureAt(vL, C);
    float R = pressureAt(vR, C);
    float T = pressureAt(vT, C);
    float B = pressureAt(vB, C);
    vec2 velocity = texture(uVelocity, vUv).xy;
    velocity -= vec2(R - L, T - B);

    vec2 obstacleGradient = vec2(
        obstacleAt(vR) - obstacleAt(vL),
        obstacleAt(vT) - obstacleAt(vB)
    );
    float gradientLength = length(obstacleGradient);
    float boundaryWeight = smoothstep(0.02, 0.25, gradientLength);
    if (boundaryWeight > 0.0) {
        vec2 normal = obstacleGradient / gradientLength;
        velocity -= normal * dot(velocity, normal) * boundaryWeight;
    }

    outColor = vec4(velocity, 0.0, 1.0);
}
`;

const ADVECTION_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform sampler2D uObstacle;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
out vec4 outColor;

float obstacleAt (vec2 uv) {
    return texture(uObstacle, uv).r;
}

void main () {
    if (obstacleAt(vUv) > 0.95) {
        outColor = vec4(0.0);
        return;
    }

    vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
    vec4 result = texture(uSource, coord);
    float backtraceObstacle = obstacleAt(coord);

    result = mix(result, texture(uSource, vUv), backtraceObstacle);

    float decay = 1.0 + dissipation * dt;
    outColor = result / decay;
}
`;

const DISPLAY_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
uniform sampler2D uTexture;
uniform sampler2D uObstacle;
uniform vec3 background;
uniform vec2 texelSize;
uniform bool shading;
uniform bool bloom;
uniform float bloomIntensity;
uniform float bloomThreshold;
uniform bool sunrays;
uniform float sunraysWeight;
uniform bool transparent;
out vec4 outColor;

float obstacleAt (vec2 uv) {
    return smoothstep(0.4, 0.6, texture(uObstacle, uv).r);
}

vec3 fluidAt (vec2 uv) {
    float obstacle = obstacleAt(uv);
    return texture(uTexture, uv).rgb * (1.0 - obstacle);
}

void main () {
    vec3 fluid = fluidAt(vUv);

    if (shading) {
        vec3 lc = fluidAt(vL);
        vec3 rc = fluidAt(vR);
        vec3 tc = fluidAt(vT);
        vec3 bc = fluidAt(vB);
        float dx = length(rc) - length(lc);
        float dy = length(tc) - length(bc);
        vec3 normal = normalize(vec3(dx, dy, length(texelSize)));
        float diffuse = clamp(dot(normal, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);
        fluid *= diffuse;
    }

    if (bloom) {
        vec2 offset = texelSize * 5.0;
        vec3 blur = fluidAt(vUv - vec2(offset.x, 0.0));
        blur += fluidAt(vUv + vec2(offset.x, 0.0));
        blur += fluidAt(vUv - vec2(0.0, offset.y));
        blur += fluidAt(vUv + vec2(0.0, offset.y));
        blur *= 0.25;
        fluid += max(blur - vec3(bloomThreshold), vec3(0.0)) * bloomIntensity;
    }

    if (sunrays) {
        vec2 direction = (vUv - vec2(0.5)) * 0.06;
        vec2 coord = vUv;
        float illumination = 0.0;
        float decay = 1.0;
        for (int index = 0; index < 8; index += 1) {
            coord -= direction;
            vec3 sampleColor = fluidAt(coord);
            illumination += max(max(sampleColor.r, sampleColor.g), sampleColor.b) * decay;
            decay *= 0.86;
        }
        fluid += fluid * illumination * sunraysWeight * 0.12;
    }

    // Bloom samples neighboring fluid, so mask post-processing back out of the obstacle.
    fluid *= 1.0 - obstacleAt(vUv);

    vec3 color = transparent ? fluid : background + fluid;

    // Filmic-style compression keeps bright splats colorful without clipping.
    color = 1.0 - exp(-color * 1.35);
    color = pow(max(color, vec3(0.0)), vec3(0.92));
    float alpha = transparent ? clamp(max(max(color.r, color.g), color.b) * 1.5, 0.0, 1.0) : 1.0;
    outColor = vec4(color, alpha);
}
`;

const COLOR_SHADER = `#version 300 es
precision mediump float;

uniform vec4 color;
out vec4 outColor;

void main () {
    outColor = color;
}
`;

class FluidSimulation {
  constructor(canvas, title) {
    this.canvas = canvas;
    this.title = title;
    this.gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
      stencil: false,
    });

    if (!this.gl) {
      throw new Error("WebGL2 is not available.");
    }

    if (!this.gl.getExtension("EXT_color_buffer_float")) {
      throw new Error("Floating-point framebuffers are not available.");
    }

    this.config = {
      background: [0.012, 0.016, 0.018],
      bloom: true,
      bloomIntensity: 0.8,
      bloomThreshold: 0.6,
      colorful: true,
      curl: 30,
      colorUpdateSpeed: 10,
      dyeDissipation: 0.95,
      dyeResolution: window.innerWidth < 700 ? 448 : 640,
      pressure: 0.8,
      pressureIterations: 12,
      paused: false,
      shading: true,
      simResolution: window.innerWidth < 700 ? 112 : 160,
      splatForce: 4800,
      splatRadius: 0.22,
      sunrays: true,
      sunraysWeight: 1,
      transparent: false,
      velocityDissipation: 0.15,
    };

    this.gl.clearColor(0, 0, 0, 1);
    this.running = false;
    this.paused = false;
    this.userPaused = false;
    this.visibilityPaused = false;
    this.reducedMotion = false;
    this.seeded = false;
    this.idleTimer = 0;
    this.colorUpdateTimer = 0;
    this.lastTime = performance.now();
    this.pointers = new Map();
    this.maskCanvas = document.createElement("canvas");
    this.maskData = null;

    this.setupQuad();
    this.setupPrograms();
    this.bindInput();
    this.resize(true);
    this.seed();
    this.start();
  }

  setupQuad() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
      gl.STATIC_DRAW,
    );
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array([0, 1, 2, 0, 2, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.quad = { indexBuffer, vao, vertexBuffer };
  }

  setupPrograms() {
    this.programs = {
      advection: createProgram(this.gl, VERTEX_SHADER, ADVECTION_SHADER),
      clear: createProgram(this.gl, VERTEX_SHADER, CLEAR_SHADER),
      color: createProgram(this.gl, VERTEX_SHADER, COLOR_SHADER),
      curl: createProgram(this.gl, VERTEX_SHADER, CURL_SHADER),
      display: createProgram(this.gl, VERTEX_SHADER, DISPLAY_SHADER),
      divergence: createProgram(this.gl, VERTEX_SHADER, DIVERGENCE_SHADER),
      gradientSubtract: createProgram(this.gl, VERTEX_SHADER, GRADIENT_SUBTRACT_SHADER),
      pressure: createProgram(this.gl, VERTEX_SHADER, PRESSURE_SHADER),
      splat: createProgram(this.gl, VERTEX_SHADER, SPLAT_SHADER),
      vorticity: createProgram(this.gl, VERTEX_SHADER, VORTICITY_SHADER),
    };
  }

  bindInput() {
    this.handlePointerDown = (event) => {
      event.preventDefault();
      const point = this.pointerPosition(event);
      const pointer = {
        color: generateColor(),
        x: point.x,
        y: point.y,
        id: event.pointerId,
      };
      this.pointers.set(event.pointerId, pointer);
      this.canvas.setPointerCapture?.(event.pointerId);
      this.splat(point.x, point.y, 0, 0, pointer.color);
    };

    this.handlePointerMove = (event) => {
      event.preventDefault();
      const point = this.pointerPosition(event);
      let pointer = this.pointers.get(event.pointerId);

      if (!pointer) {
        if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;

        pointer = {
          color: generateColor(),
          x: point.x,
          y: point.y,
          id: event.pointerId,
        };
        this.pointers.set(event.pointerId, pointer);
        this.splat(point.x, point.y, 0, 0, pointer.color);
        return;
      }

      let deltaX = point.x - pointer.x;
      let deltaY = point.y - pointer.y;
      const aspectRatio = this.canvas.width / Math.max(this.canvas.height, 1);

      if (aspectRatio < 1) deltaX *= aspectRatio;
      if (aspectRatio > 1) deltaY /= aspectRatio;

      pointer.x = point.x;
      pointer.y = point.y;

      if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) {
        this.splat(point.x, point.y, deltaX * this.config.splatForce, deltaY * this.config.splatForce, pointer.color);
      }
    };

    this.handlePointerUp = (event) => {
      this.pointers.delete(event.pointerId);
    };

    this.canvas.addEventListener("pointerdown", this.handlePointerDown, { passive: false });
    this.canvas.addEventListener("pointermove", this.handlePointerMove, { passive: false });
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerUp);
    this.canvas.addEventListener("pointerleave", this.handlePointerUp);
  }

  pointerPosition(event) {
    const bounds = this.canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / Math.max(bounds.width, 1), 0, 1),
      y: clamp(1 - (event.clientY - bounds.top) / Math.max(bounds.height, 1), 0, 1),
    };
  }

  resize(refreshMask = false) {
    const bounds = this.canvas.getBoundingClientRect();
    const cssWidth = Math.max(bounds.width || window.innerWidth, 1);
    const cssHeight = Math.max(bounds.height || window.innerHeight, 1);
    const maxDpr = window.innerWidth < 700 ? 1.25 : 1.5;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const width = Math.max(Math.round(cssWidth * dpr), 1);
    const height = Math.max(Math.round(cssHeight * dpr), 1);
    const changed = width !== this.canvas.width || height !== this.canvas.height;

    if (!changed) {
      if (refreshMask && this.dye) {
        this.updateObstacleTexture();
        this.render();
      }
      return false;
    }

    this.canvas.width = width;
    this.canvas.height = height;

    const simSize = getResolution(this.config.simResolution, width, height);
    const dyeSize = getResolution(this.config.dyeResolution, width, height);
    this.initFramebuffers(simSize, dyeSize);
    this.updateObstacleTexture();
    this.render();
    return true;
  }

  updateConfig(name, value) {
    if (!(name in this.config)) return;

    if (name === "paused") {
      this.setPaused(Boolean(value));
      return;
    }

    const previousValue = this.config[name];
    this.config[name] = Array.isArray(value) ? [...value] : value;

    if (previousValue === value) return;

    if (name === "simResolution" || name === "dyeResolution") {
      const simSize = getResolution(this.config.simResolution, this.canvas.width, this.canvas.height);
      const dyeSize = getResolution(this.config.dyeResolution, this.canvas.width, this.canvas.height);
      this.initFramebuffers(simSize, dyeSize);
      this.updateObstacleTexture();
      this.seeded = false;
      this.seed();
      return;
    }

    this.render();
  }

  setTypography(property, value) {
    if (!["fontFamily", "fontSize", "fontStyle", "fontWeight", "letterSpacing"].includes(property)) return;
    this.title.style[property] = value;
    this.resize(true);
  }

  initFramebuffers(simSize, dyeSize) {
    const gl = this.gl;
    this.disposeFramebuffers();

    this.dye = createDoubleFbo(gl, dyeSize.width, dyeSize.height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
    this.velocity = createDoubleFbo(gl, simSize.width, simSize.height, gl.RG16F, gl.RG, gl.HALF_FLOAT, gl.LINEAR);
    this.divergence = createFbo(gl, simSize.width, simSize.height, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST);
    this.curl = createFbo(gl, simSize.width, simSize.height, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST);
    this.pressure = createDoubleFbo(gl, simSize.width, simSize.height, gl.R16F, gl.RED, gl.HALF_FLOAT, gl.NEAREST);

    this.simSize = simSize;
    this.dyeSize = dyeSize;
  }

  updateObstacleTexture() {
    if (!this.simSize || !this.dyeSize) return;

    // Keep diagonal and curved glyph edges detailed before the solver samples them.
    const width = this.dyeSize.width;
    const height = this.dyeSize.height;
    const context = this.maskCanvas.getContext("2d");
    const bounds = this.canvas.getBoundingClientRect();
    const titleStyle = getComputedStyle(this.title);
    const scale = height / Math.max(bounds.height, 1);
    const fontSize = parseFloat(titleStyle.fontSize) * scale;
    const letterSpacing = parseFloat(titleStyle.letterSpacing) * scale || 0;
    const text = this.title.textContent.trim();

    this.maskCanvas.width = width;
    this.maskCanvas.height = height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.font = `${titleStyle.fontStyle} ${titleStyle.fontVariant} ${titleStyle.fontWeight} ${fontSize}px ${titleStyle.fontFamily}`;
    context.textBaseline = "middle";
    context.textAlign = "left";

    let textWidth = 0;
    for (const character of text) {
      textWidth += context.measureText(character).width;
    }
    textWidth += letterSpacing * Math.max(text.length - 1, 0);

    let x = (width - textWidth) / 2;
    for (const character of text) {
      context.fillText(character, x, height / 2);
      x += context.measureText(character).width + letterSpacing;
    }

    this.maskData = context.getImageData(0, 0, width, height).data;

    const gl = this.gl;
    if (!this.obstacleTexture) {
      this.obstacleTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.obstacleTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.obstacleTexture);
    }

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, this.maskCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  seed() {
    if (this.seeded) return;

    for (let index = 0; index < 5; index += 1) {
      const point = this.freePoint();
      const angle = Math.random() * Math.PI * 2;
      const speed = 240 + Math.random() * 460;
      const color = generateColor(0.28);
      this.splat(point.x, point.y, Math.cos(angle) * speed, Math.sin(angle) * speed, color);
    }

    this.seeded = true;
    this.render();
  }

  randomSplats(amount = Math.floor(Math.random() * 16) + 5) {
    for (let index = 0; index < amount; index += 1) {
      const point = this.freePoint();
      const angle = Math.random() * Math.PI * 2;
      const speed = 240 + Math.random() * 460;
      const color = generateColor(0.28);
      this.splat(point.x, point.y, Math.cos(angle) * speed, Math.sin(angle) * speed, color);
    }

    this.render();
  }

  captureScreenshot() {
    const link = document.createElement("a");
    link.download = "fluid.png";
    link.href = this.canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  freePoint() {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const x = 0.08 + Math.random() * 0.84;
      const y = 0.08 + Math.random() * 0.84;
      if (!this.isSolid(x, y)) return { x, y };
    }

    return { x: 0.18, y: 0.5 };
  }

  isSolid(x, y) {
    if (!this.maskData || !this.simSize) return false;
    const width = this.maskCanvas.width;
    const height = this.maskCanvas.height;
    const px = clamp(Math.floor(x * width), 0, width - 1);
    const py = clamp(Math.floor((1 - y) * height), 0, height - 1);
    return this.maskData[(py * width + px) * 4] > 100;
  }

  splat(x, y, deltaX, deltaY, color) {
    if (!this.dye || this.isSolid(x, y)) return;

    const gl = this.gl;
    const program = this.programs.splat;
    this.use(program);
    this.uniform1f(program, "aspectRatio", this.canvas.width / Math.max(this.canvas.height, 1));
    this.uniform2f(program, "point", x, y);
    this.uniform1f(program, "radius", this.correctRadius(this.config.splatRadius / 100));

    this.uniform1i(program, "uTarget", this.velocity.read.attach(0));
    this.uniform3f(program, "color", deltaX, deltaY, 0);
    this.blit(this.velocity.write);
    this.velocity.swap();

    this.uniform1i(program, "uTarget", this.dye.read.attach(0));
    this.uniform3f(program, "color", color[0], color[1], color[2]);
    this.blit(this.dye.write);
    this.dye.swap();
    gl.bindTexture(gl.TEXTURE_2D, null);

    if (this.reducedMotion) this.render();
  }

  correctRadius(radius) {
    const aspectRatio = this.canvas.width / Math.max(this.canvas.height, 1);
    return aspectRatio > 1 ? radius * aspectRatio : radius;
  }

  start() {
    if (this.running || this.reducedMotion || this.paused) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.frame(time));
  }

  setPaused(paused) {
    this.userPaused = paused;
    this.config.paused = paused;
    this.applyPauseState();
  }

  setVisibilityPaused(paused) {
    this.visibilityPaused = paused;
    this.applyPauseState();
  }

  applyPauseState() {
    this.paused = this.userPaused || this.visibilityPaused;

    if (this.paused) {
      this.running = false;
      this.render();
    } else {
      this.start();
    }
  }

  setReducedMotion(reducedMotion) {
    this.reducedMotion = reducedMotion;

    if (reducedMotion) {
      this.running = false;
      this.render();
    } else {
      this.start();
    }
  }

  frame(time) {
    if (!this.running) return;

    const deltaTime = Math.min((time - this.lastTime) / 1000, 0.033);
    this.lastTime = time;
    this.resize(false);
    this.idleTimer += deltaTime;

    if (!this.paused) {
      this.updateColors(deltaTime);

      if (this.idleTimer > 3.8) {
        this.idleTimer = 0;
        const point = this.freePoint();
        const direction = Math.random() > 0.5 ? 1 : -1;
        this.splat(point.x, point.y, direction * (180 + Math.random() * 220), (Math.random() - 0.5) * 180, generateColor(0.18));
      }

      this.step(deltaTime);
    }

    this.render();
    requestAnimationFrame((nextTime) => this.frame(nextTime));
  }

  updateColors(deltaTime) {
    if (!this.config.colorful) return;

    this.colorUpdateTimer += deltaTime * this.config.colorUpdateSpeed;
    if (this.colorUpdateTimer < 1) return;

    this.colorUpdateTimer %= 1;
    this.pointers.forEach((pointer) => {
      pointer.color = generateColor();
    });
  }

  step(deltaTime) {
    const gl = this.gl;
    const obstacle = this.obstacleTexture;
    const { advection, clear, curl, divergence, gradientSubtract, pressure, vorticity } = this.programs;

    gl.disable(gl.BLEND);

    this.use(curl);
    this.uniform2f(curl, "texelSize", this.velocity.texelSizeX, this.velocity.texelSizeY);
    this.uniform1i(curl, "uVelocity", this.velocity.read.attach(0));
    this.uniform1i(curl, "uObstacle", this.attachObstacle(1));
    this.blit(this.curl);

    this.use(vorticity);
    this.uniform2f(vorticity, "texelSize", this.velocity.texelSizeX, this.velocity.texelSizeY);
    this.uniform1i(vorticity, "uVelocity", this.velocity.read.attach(0));
    this.uniform1i(vorticity, "uCurl", this.curl.attach(1));
    this.uniform1i(vorticity, "uObstacle", this.attachObstacle(2));
    this.uniform1f(vorticity, "curl", this.config.curl);
    this.uniform1f(vorticity, "dt", deltaTime);
    this.blit(this.velocity.write);
    this.velocity.swap();

    this.use(divergence);
    this.uniform2f(divergence, "texelSize", this.velocity.texelSizeX, this.velocity.texelSizeY);
    this.uniform1i(divergence, "uVelocity", this.velocity.read.attach(0));
    this.uniform1i(divergence, "uObstacle", this.attachObstacle(1));
    this.blit(this.divergence);

    this.use(clear);
    this.uniform1i(clear, "uTexture", this.pressure.read.attach(0));
    this.uniform1f(clear, "value", this.config.pressure);
    this.blit(this.pressure.write);
    this.pressure.swap();

    this.use(pressure);
    this.uniform2f(pressure, "texelSize", this.velocity.texelSizeX, this.velocity.texelSizeY);
    this.uniform1i(pressure, "uDivergence", this.divergence.attach(0));
    this.uniform1i(pressure, "uObstacle", this.attachObstacle(2));
    for (let index = 0; index < this.config.pressureIterations; index += 1) {
      this.uniform1i(pressure, "uPressure", this.pressure.read.attach(1));
      this.blit(this.pressure.write);
      this.pressure.swap();
    }

    this.use(gradientSubtract);
    this.uniform2f(gradientSubtract, "texelSize", this.velocity.texelSizeX, this.velocity.texelSizeY);
    this.uniform1i(gradientSubtract, "uPressure", this.pressure.read.attach(0));
    this.uniform1i(gradientSubtract, "uVelocity", this.velocity.read.attach(1));
    this.uniform1i(gradientSubtract, "uObstacle", this.attachObstacle(2));
    this.blit(this.velocity.write);
    this.velocity.swap();

    this.use(advection);
    this.uniform2f(advection, "texelSize", this.velocity.texelSizeX, this.velocity.texelSizeY);
    this.uniform1f(advection, "dt", deltaTime);
    this.uniform1f(advection, "dissipation", this.config.velocityDissipation);
    this.uniform1i(advection, "uVelocity", this.velocity.read.attach(0));
    this.uniform1i(advection, "uSource", this.velocity.read.attach(1));
    this.uniform1i(advection, "uObstacle", this.attachObstacle(2));
    this.blit(this.velocity.write);
    this.velocity.swap();

    this.uniform1f(advection, "dissipation", this.config.dyeDissipation);
    this.uniform1i(advection, "uVelocity", this.velocity.read.attach(0));
    this.uniform1i(advection, "uSource", this.dye.read.attach(1));
    this.uniform1i(advection, "uObstacle", this.attachObstacle(2));
    this.blit(this.dye.write);
    this.dye.swap();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, obstacle);
  }

  render() {
    if (!this.dye || !this.obstacleTexture) return;

    const gl = this.gl;
    const program = this.programs.display;
    gl.disable(gl.BLEND);
    this.use(program);
    this.uniform2f(program, "texelSize", 1 / Math.max(this.canvas.width, 1), 1 / Math.max(this.canvas.height, 1));
    this.uniform1i(program, "uTexture", this.dye.read.attach(0));
    this.uniform1i(program, "uObstacle", this.attachObstacle(1));
    this.uniform3f(program, "background", ...this.config.background);
    this.uniform1i(program, "shading", this.config.shading ? 1 : 0);
    this.uniform1i(program, "bloom", this.config.bloom ? 1 : 0);
    this.uniform1f(program, "bloomIntensity", this.config.bloomIntensity);
    this.uniform1f(program, "bloomThreshold", this.config.bloomThreshold);
    this.uniform1i(program, "sunrays", this.config.sunrays ? 1 : 0);
    this.uniform1f(program, "sunraysWeight", this.config.sunraysWeight);
    this.uniform1i(program, "transparent", this.config.transparent ? 1 : 0);
    this.blit(null);
  }

  attachObstacle(unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.obstacleTexture);
    return unit;
  }

  use(program) {
    this.gl.useProgram(program.program);
  }

  uniform1f(program, name, value) {
    const location = program.uniforms[name];
    if (location) this.gl.uniform1f(location, value);
  }

  uniform1i(program, name, value) {
    const location = program.uniforms[name];
    if (location) this.gl.uniform1i(location, value);
  }

  uniform2f(program, name, x, y) {
    const location = program.uniforms[name];
    if (location) this.gl.uniform2f(location, x, y);
  }

  uniform3f(program, name, x, y, z) {
    const location = program.uniforms[name];
    if (location) this.gl.uniform3f(location, x, y, z);
  }

  blit(target) {
    const gl = this.gl;
    if (target) {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.bindVertexArray(this.quad.vao);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  disposeFramebuffers() {
    if (!this.dye) return;

    deleteDoubleFbo(this.gl, this.dye);
    deleteDoubleFbo(this.gl, this.velocity);
    deleteFbo(this.gl, this.divergence);
    deleteFbo(this.gl, this.curl);
    deleteDoubleFbo(this.gl, this.pressure);
    this.dye = null;
    this.velocity = null;
    this.divergence = null;
    this.curl = null;
    this.pressure = null;
  }

  destroy() {
    this.running = false;
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
    this.canvas.removeEventListener("pointerleave", this.handlePointerUp);
    this.disposeFramebuffers();
    this.gl.deleteTexture(this.obstacleTexture);
    this.gl.deleteVertexArray(this.quad.vao);
    this.gl.deleteBuffer(this.quad.vertexBuffer);
    this.gl.deleteBuffer(this.quad.indexBuffer);
    Object.values(this.programs).forEach((program) => this.gl.deleteProgram(program.program));
  }
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Unable to link WebGL program.");
  }

  const uniforms = {};
  const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let index = 0; index < uniformCount; index += 1) {
    const uniform = gl.getActiveUniform(program, index);
    uniforms[uniform.name.replace("[0]", "")] = gl.getUniformLocation(program, uniform.name);
  }

  return { program, uniforms };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unable to compile WebGL shader.";
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createFbo(gl, width, height, internalFormat, format, type, filter) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("Unable to create a complete fluid framebuffer.");
  }

  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return {
    attach(unit) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      return unit;
    },
    fbo: framebuffer,
    height,
    texelSizeX: 1 / width,
    texelSizeY: 1 / height,
    texture,
    width,
  };
}

function createDoubleFbo(gl, width, height, internalFormat, format, type, filter) {
  let read = createFbo(gl, width, height, internalFormat, format, type, filter);
  let write = createFbo(gl, width, height, internalFormat, format, type, filter);

  return {
    get read() {
      return read;
    },
    set read(value) {
      read = value;
    },
    get write() {
      return write;
    },
    set write(value) {
      write = value;
    },
    height,
    texelSizeX: 1 / width,
    texelSizeY: 1 / height,
    width,
    swap() {
      const temp = read;
      read = write;
      write = temp;
    },
  };
}

function deleteFbo(gl, target) {
  if (!target) return;
  gl.deleteFramebuffer(target.fbo);
  gl.deleteTexture(target.texture);
}

function deleteDoubleFbo(gl, target) {
  if (!target) return;
  deleteFbo(gl, target.read);
  deleteFbo(gl, target.write);
}

function getResolution(resolution, width, height) {
  const aspectRatio = width / Math.max(height, 1);
  if (aspectRatio >= 1) {
    return {
      height: Math.max(Math.round(resolution), 1),
      width: Math.max(Math.round(resolution * aspectRatio), 1),
    };
  }

  return {
    height: Math.max(Math.round(resolution / aspectRatio), 1),
    width: Math.max(Math.round(resolution), 1),
  };
}

function generateColor(intensity = 0.22) {
  const hue = Math.random();
  const color = hsvToRgb(hue, 0.9, 1);
  return [color[0] * intensity, color[1] * intensity, color[2] * intensity];
}

function hsvToRgb(hue, saturation, value) {
  const index = Math.floor(hue * 6);
  const fraction = hue * 6 - index;
  const p = value * (1 - saturation);
  const q = value * (1 - fraction * saturation);
  const t = value * (1 - (1 - fraction) * saturation);

  switch (index % 6) {
    case 0:
      return [value, t, p];
    case 1:
      return [q, value, p];
    case 2:
      return [p, value, t];
    case 3:
      return [p, q, value];
    case 4:
      return [t, p, value];
    default:
      return [value, p, q];
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export { FluidSimulation };
