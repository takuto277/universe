/* renderer-webgl.js : TRASH TOSS のWebGLレンダラ（依存なし）
 * x/y/z のゲーム状態を、固定カメラの透視投影で描く。
 */
(function (root) {
  'use strict';

  function create(canvas) {
    if (!root.WebGLRenderingContext || !canvas || !canvas.getContext) return null;
    var gl = null;
    try { gl = canvas.getContext('webgl', { antialias: true, alpha: false }); } catch (e) { gl = null; }
    if (!gl) return null;

    var W = 360, H = 640;
    var cameraPos = { x: 0, y: 3.8, z: -2.8 };
    var cameraLook = { x: 0, y: 0.05, z: 2.8 };
    var proj = null, view = null, viewProj = null;
    var width = 390, height = 844, dpr = 1;
    var meshes = {};
    var lineBuffer = gl.createBuffer();
    var particleKeys = 0;
    var particles = [];
    var seenEvents = 0;
    var lost = false;
    var fallback = null;
    var textures = {};
    var whiteTexture = null;

    /* ---------- textures ---------- */
    function makeTexture(repeatS, repeatT) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([255, 255, 255, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeatS ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeatT ? gl.REPEAT : gl.CLAMP_TO_EDGE);
      return { tex: t, loaded: false };
    }

    function loadTexture(name, path, repeatS, repeatT) {
      var holder = makeTexture(repeatS, repeatT);
      textures[name] = holder;
      var ImageCtor = root.Image;
      if (!ImageCtor) return;
      var img = new ImageCtor();
      img.onload = function () {
        gl.bindTexture(gl.TEXTURE_2D, holder.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        holder.loaded = true;
      };
      img.src = path;
    }

    function initTextures() {
      whiteTexture = makeTexture(false, false);
      whiteTexture.loaded = true;
      loadTexture('floor', 'assets/textures/floor-wood.jpg', true, true);
      loadTexture('rug', 'assets/textures/rug.jpg', false, false);
      loadTexture('wall', 'assets/textures/wall-plaster.jpg', true, true);
      loadTexture('sofa', 'assets/textures/sofa-fabric.jpg', true, true);
      loadTexture('canWrap', 'assets/textures/can-wrap.jpg', true, false);
      loadTexture('tv', 'assets/textures/tv-screen.jpg', false, false);
      loadTexture('window', 'assets/textures/window-night.jpg', false, false);
      loadTexture('bag', 'assets/sprites/trash-bag.png', false, false);
      loadTexture('bottle', 'assets/sprites/bottle.png', false, false);
      loadTexture('can', 'assets/sprites/can.png', false, false);
      loadTexture('shadow', 'assets/sprites/soft-shadow.png', false, false);
    }

    /* ---------- tiny mat4 ---------- */
    function identity() {
      return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    }
    function mul(a, b) {
      var o = new Float32Array(16);
      for (var c = 0; c < 4; c++) {
        for (var r = 0; r < 4; r++) {
          o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
      }
      return o;
    }
    function perspective(fovy, aspect, near, far) {
      var f = 1 / Math.tan(fovy / 2);
      var nf = 1 / (near - far);
      return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
      ]);
    }
    function lookAt(eye, center, up) {
      var zx = eye.x - center.x, zy = eye.y - center.y, zz = eye.z - center.z;
      var zl = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
      zx /= zl; zy /= zl; zz /= zl;
      var xx = up.y * zz - up.z * zy;
      var xy = up.z * zx - up.x * zz;
      var xz = up.x * zy - up.y * zx;
      var xl = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
      xx /= xl; xy /= xl; xz /= xl;
      var yx = zy * xz - zz * xy;
      var yy = zz * xx - zx * xz;
      var yz = zx * xy - zy * xx;
      return new Float32Array([
        xx, xy, xz, 0,
        yx, yy, yz, 0,
        zx, zy, zz, 0,
        -(xx * eye.x + xy * eye.y + xz * eye.z),
        -(yx * eye.x + yy * eye.y + yz * eye.z),
        -(zx * eye.x + zy * eye.y + zz * eye.z),
        1
      ]);
    }
    function cameraBasis() {
      var fx = cameraLook.x - cameraPos.x;
      var fy = cameraLook.y - cameraPos.y;
      var fz = cameraLook.z - cameraPos.z;
      var fl = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
      var forward = { x: fx / fl, y: fy / fl, z: fz / fl };
      // Screen right in this mirrored projection is world +x.
      var right = { x: forward.z, y: 0, z: -forward.x };
      var rl = Math.sqrt(right.x * right.x + right.z * right.z) || 1;
      right.x /= rl; right.z /= rl;
      var up = {
        x: forward.y * right.z - forward.z * right.y,
        y: forward.z * right.x - forward.x * right.z,
        z: forward.x * right.y - forward.y * right.x
      };
      var ul = Math.sqrt(up.x * up.x + up.y * up.y + up.z * up.z) || 1;
      up.x /= ul; up.y /= ul; up.z /= ul;
      return { cam: cameraPos, forward: forward, right: right, up: up };
    }

    function model(x, y, z, sx, sy, sz) {
      return new Float32Array([
        sx, 0, 0, 0,
        0, sy, 0, 0,
        0, 0, sz, 0,
        x, y, z, 1
      ]);
    }
    function rotZ(a, x, y, z, sx, sy, sz) {
      var c = Math.cos(a), s = Math.sin(a);
      return new Float32Array([
        c * sx, s * sx, 0, 0,
        -s * sy, c * sy, 0, 0,
        0, 0, sz, 0,
        x, y, z, 1
      ]);
    }

    /* ---------- shaders ---------- */
    var litVs = [
      'attribute vec3 aPos; attribute vec2 aUV; attribute float aShade;',
      'uniform mat4 uViewProj; uniform mat4 uModel; uniform vec3 uColor; uniform vec2 uUVScale;',
      'varying vec2 vUV; varying vec3 vColor; varying float vShade;',
      'void main(){',
      ' vec4 world=uModel*vec4(aPos,1.0);',
      ' vColor=uColor; vShade=aShade; vUV=aUV*uUVScale;',
      ' gl_Position=uViewProj*world;',
      '}'
    ].join('\n');
    var litFs = [
      'precision mediump float;',
      'uniform sampler2D uTex; uniform float uUseTex;',
      'varying vec2 vUV; varying vec3 vColor; varying float vShade;',
      'void main(){',
      ' vec4 tex=uUseTex>0.5?texture2D(uTex,vUV):vec4(1.0);',
      ' gl_FragColor=vec4(clamp(tex.rgb*vColor*vShade,0.0,1.0),1.0);',
      '}'
    ].join('\n');
    var unlitVs = [
      'attribute vec3 aPos; uniform mat4 uViewProj; uniform mat4 uModel;',
      'void main(){ gl_Position=uViewProj*uModel*vec4(aPos,1.0); }'
    ].join('\n');
    var unlitFs = [
      'precision mediump float; uniform vec4 uColor;',
      'void main(){ gl_FragColor=uColor; }'
    ].join('\n');
    var texVs = [
      'attribute vec3 aPos; attribute vec2 aUV;',
      'uniform mat4 uViewProj; uniform mat4 uModel; uniform vec2 uUVScale;',
      'varying vec2 vUV;',
      'void main(){ vUV=aUV*uUVScale; gl_Position=uViewProj*uModel*vec4(aPos,1.0); }'
    ].join('\n');
    var texFs = [
      'precision mediump float; uniform sampler2D uTex; uniform vec4 uColor;',
      'varying vec2 vUV;',
      'void main(){ vec4 t=texture2D(uTex,vUV); gl_FragColor=vec4(t.rgb*uColor.rgb,t.a*uColor.a); }'
    ].join('\n');

    function compile(type, source) {
      var s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s));
      }
      return s;
    }
    function program(vs, fs) {
      var p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return {
        p: p,
        aPos: gl.getAttribLocation(p, 'aPos'),
        aUV: gl.getAttribLocation(p, 'aUV'),
        aShade: gl.getAttribLocation(p, 'aShade'),
        uViewProj: gl.getUniformLocation(p, 'uViewProj'),
        uModel: gl.getUniformLocation(p, 'uModel'),
        uColor: gl.getUniformLocation(p, 'uColor'),
        uTex: gl.getUniformLocation(p, 'uTex'),
        uUseTex: gl.getUniformLocation(p, 'uUseTex'),
        uUVScale: gl.getUniformLocation(p, 'uUVScale')
      };
    }

    var lit, unlit, texProg;
    try {
      lit = program(litVs, litFs);
      unlit = program(unlitVs, unlitFs);
      texProg = program(texVs, texFs);
    } catch (e) {
      return null;
    }

    /* ---------- meshes ---------- */
    function mesh(vertices, normals, indices, uvs) {
      var vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
      var ubo = null;
      if (uvs) {
        ubo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, ubo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
      }
      var shades = new Float32Array(normals.length / 3);
      var lx = -0.35, ly = 0.75, lz = 0.55;
      var ll = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
      lx /= ll; ly /= ll; lz /= ll;
      for (var i = 0; i < shades.length; i++) {
        var nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
        shades[i] = 0.54 + 0.62 * Math.max(0, nx * lx + ny * ly + nz * lz);
      }
      var sbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, sbo);
      gl.bufferData(gl.ARRAY_BUFFER, shades, gl.STATIC_DRAW);
      var ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
      return { vbo: vbo, ubo: ubo, sbo: sbo, ibo: ibo, count: indices.length };
    }

    function cubeMesh() {
      var p = [], n = [], idx = [];
      var faces = [
        { n: [0, 0, 1], v: [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]] },
        { n: [0, 0, -1], v: [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]] },
        { n: [1, 0, 0], v: [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5]] },
        { n: [-1, 0, 0], v: [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5]] },
        { n: [0, 1, 0], v: [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]] },
        { n: [0, -1, 0], v: [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]] }
      ];
      for (var f = 0; f < faces.length; f++) {
        var base = p.length / 3;
        for (var v = 0; v < 4; v++) { p.push.apply(p, faces[f].v[v]); n.push.apply(n, faces[f].n); }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      return mesh(p, n, idx);
    }

    function cylinderMesh(segments) {
      segments = segments || 24;
      var p = [], n = [], idx = [];
      for (var i = 0; i <= segments; i++) {
        var a = i / segments * Math.PI * 2;
        var cx = Math.cos(a), sz = Math.sin(a);
        p.push(cx, -.5, sz); n.push(cx, 0, sz);
        p.push(cx, .5, sz); n.push(cx, 0, sz);
      }
      for (var i2 = 0; i2 < segments; i2++) {
        var a0 = i2 * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
        idx.push(a0, b0, b1, a0, b1, a1);
      }
      var base = p.length / 3;
      p.push(0, .5, 0); n.push(0, 1, 0);
      for (var t = 0; t <= segments; t++) {
        var at = t / segments * Math.PI * 2;
        p.push(Math.cos(at), .5, Math.sin(at)); n.push(0, 1, 0);
      }
      for (var t2 = 0; t2 < segments; t2++) idx.push(base, base + 1 + t2, base + 2 + t2);
      var base2 = p.length / 3;
      p.push(0, -.5, 0); n.push(0, -1, 0);
      for (var b = 0; b <= segments; b++) {
        var ab = b / segments * Math.PI * 2;
        p.push(Math.cos(ab), -.5, Math.sin(ab)); n.push(0, -1, 0);
      }
      for (var b2 = 0; b2 < segments; b2++) idx.push(base2, base2 + 1 + b2, base2 + 2 + b2);
      return mesh(p, n, idx);
    }

    function sphereMesh(stacks, slices) {
      stacks = stacks || 8; slices = slices || 12;
      var p = [], n = [], idx = [];
      for (var y = 0; y <= stacks; y++) {
        var v = y / stacks, phi = v * Math.PI;
        for (var x = 0; x <= slices; x++) {
          var u = x / slices, theta = u * Math.PI * 2;
          var sx = Math.sin(phi) * Math.cos(theta);
          var sy = Math.cos(phi);
          var sz = Math.sin(phi) * Math.sin(theta);
          p.push(sx, sy, sz); n.push(sx, sy, sz);
        }
      }
      for (var yy = 0; yy < stacks; yy++) {
        for (var xx = 0; xx < slices; xx++) {
          var a = yy * (slices + 1) + xx;
          var b = a + slices + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      return mesh(p, n, idx);
    }

    function torusMesh(segments, tubeSegments) {
      segments = segments || 24; tubeSegments = tubeSegments || 8;
      var p = [], n = [], idx = [];
      for (var i = 0; i <= segments; i++) {
        var a = i / segments * Math.PI * 2;
        var ca = Math.cos(a), sa = Math.sin(a);
        for (var j = 0; j <= tubeSegments; j++) {
          var b = j / tubeSegments * Math.PI * 2;
          var cb = Math.cos(b), sb = Math.sin(b);
          var r = 1 + 0.08 * cb;
          p.push(r * ca, 0.08 * sb, r * sa);
          n.push(cb * ca, sb, cb * sa);
        }
      }
      for (var i2 = 0; i2 < segments; i2++) {
        for (var j2 = 0; j2 < tubeSegments; j2++) {
          var a0 = i2 * (tubeSegments + 1) + j2;
          var b0 = a0 + tubeSegments + 1;
          idx.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
        }
      }
      return mesh(p, n, idx);
    }

    function diskMesh(segments) {
      segments = segments || 28;
      var p = [0, 0, 0], n = [0, 1, 0], idx = [];
      for (var i = 0; i <= segments; i++) {
        var a = i / segments * Math.PI * 2;
        p.push(Math.cos(a), 0, Math.sin(a)); n.push(0, 1, 0);
      }
      for (var j = 0; j < segments; j++) idx.push(0, j + 1, j + 2);
      return mesh(p, n, idx);
    }

    function cubeTexturedMesh() {
      var p = [], n = [], uv = [], idx = [];
      var faces = [
        { n: [0, 0, 1], v: [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]] },
        { n: [0, 0, -1], v: [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]] },
        { n: [1, 0, 0], v: [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5]] },
        { n: [-1, 0, 0], v: [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5]] },
        { n: [0, 1, 0], v: [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]] },
        { n: [0, -1, 0], v: [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]] }
      ];
      var uvs = [[0, 0, 1, 0, 1, 1, 0, 1]];
      for (var f = 0; f < faces.length; f++) {
        var base = p.length / 3;
        for (var v = 0; v < 4; v++) { p.push.apply(p, faces[f].v[v]); n.push.apply(n, faces[f].n); }
        uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      return mesh(p, n, idx, uv);
    }

    function cylinderTexturedMesh(segments) {
      segments = segments || 24;
      var p = [], n = [], uv = [], idx = [];
      for (var i = 0; i <= segments; i++) {
        var a = i / segments * Math.PI * 2;
        var cx = Math.cos(a), sz = Math.sin(a);
        p.push(cx, -.5, sz); n.push(cx, 0, sz); uv.push(i / segments, 0);
        p.push(cx, .5, sz); n.push(cx, 0, sz); uv.push(i / segments, 1);
      }
      for (var i2 = 0; i2 < segments; i2++) {
        var a0 = i2 * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
        idx.push(a0, b0, b1, a0, b1, a1);
      }
      var base = p.length / 3;
      p.push(0, .5, 0); n.push(0, 1, 0); uv.push(0.5, 0.5);
      for (var t = 0; t <= segments; t++) {
        var at = t / segments * Math.PI * 2;
        p.push(Math.cos(at), .5, Math.sin(at)); n.push(0, 1, 0);
        uv.push(0.5 + Math.cos(at) * 0.5, 0.5 + Math.sin(at) * 0.5);
      }
      for (var t2 = 0; t2 < segments; t2++) idx.push(base, base + 1 + t2, base + 2 + t2);
      var base2 = p.length / 3;
      p.push(0, -.5, 0); n.push(0, -1, 0); uv.push(0.5, 0.5);
      for (var b = 0; b <= segments; b++) {
        var ab = b / segments * Math.PI * 2;
        p.push(Math.cos(ab), -.5, Math.sin(ab)); n.push(0, -1, 0);
        uv.push(0.5 + Math.cos(ab) * 0.5, 0.5 + Math.sin(ab) * 0.5);
      }
      for (var b2 = 0; b2 < segments; b2++) idx.push(base2, base2 + 1 + b2, base2 + 2 + b2);
      return mesh(p, n, idx, uv);
    }

    function quadXZ() {
      return mesh(
        [-.5, 0, -.5, .5, 0, -.5, .5, 0, .5, -.5, 0, .5],
        [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
        [0, 2, 1, 0, 3, 2],
        [0, 0, 1, 0, 1, 1, 0, 1]
      );
    }
    function quadXY() {
      return mesh(
        [-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0],
        [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        [0, 1, 2, 0, 2, 3],
        [0, 0, 1, 0, 1, 1, 0, 1]
      );
    }

    meshes.cube = cubeMesh();
    meshes.cubeTex = cubeTexturedMesh();
    meshes.cylinder = cylinderMesh(24);
    meshes.cylinderTex = cylinderTexturedMesh(24);
    meshes.sphere = sphereMesh(8, 14);
    meshes.torus = torusMesh(28, 8);
    meshes.disk = diskMesh(28);
    meshes.quadXZ = quadXZ();
    meshes.quadXY = quadXY();

    function bindMesh(m) {
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
      gl.enableVertexAttribArray(lit.aPos);
      gl.vertexAttribPointer(lit.aPos, 3, gl.FLOAT, false, 0, 0);
      if (m.ubo) {
        gl.bindBuffer(gl.ARRAY_BUFFER, m.ubo);
        gl.enableVertexAttribArray(lit.aUV);
        gl.vertexAttribPointer(lit.aUV, 2, gl.FLOAT, false, 0, 0);
      } else if (lit.aUV >= 0) {
        gl.disableVertexAttribArray(lit.aUV);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, m.sbo);
      gl.enableVertexAttribArray(lit.aShade);
      gl.vertexAttribPointer(lit.aShade, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
    }

    function drawMesh(name, mtx, color, texture, uvScale, useTexture) {
      var m = meshes[name];
      gl.useProgram(lit.p);
      gl.uniformMatrix4fv(lit.uViewProj, false, viewProj);
      gl.uniformMatrix4fv(lit.uModel, false, mtx);
      gl.uniform3fv(lit.uColor, color);
      var scale = uvScale || [1, 1];
      gl.uniform2f(lit.uUVScale, scale[0], scale[1]);
      var use = !!(useTexture && texture && texture.loaded);
      gl.uniform1f(lit.uUseTex, use ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, use ? texture.tex : whiteTexture.tex);
      gl.uniform1i(lit.uTex, 0);
      bindMesh(m);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
    }

    function useTextureUnit(texture) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture && texture.loaded ? texture.tex : whiteTexture.tex);
      gl.uniform1i(texProg.uTex, 0);
    }

    function drawTexturedQuad(mtx, texture, tint, uvScale) {
      var m = meshes.quadXY;
      gl.useProgram(texProg.p);
      gl.uniformMatrix4fv(texProg.uViewProj, false, viewProj);
      gl.uniformMatrix4fv(texProg.uModel, false, mtx);
      gl.uniform4fv(texProg.uColor, tint);
      gl.uniform2f(texProg.uUVScale, uvScale ? uvScale[0] : 1, uvScale ? uvScale[1] : 1);
      useTextureUnit(texture);
      gl.enableVertexAttribArray(texProg.aPos);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
      gl.vertexAttribPointer(texProg.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(texProg.aUV);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.ubo);
      gl.vertexAttribPointer(texProg.aUV, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
    }

    function billboardModel(basis, x, y, z, w, h) {
      var r = basis.right, u = basis.up;
      return new Float32Array([
        r.x * w, r.y * w, r.z * w, 0,
        u.x * h, u.y * h, u.z * h, 0,
        0, 0, 1, 0,
        x, y, z, 1
      ]);
    }

    function drawBillboard(basis, texture, x, y, z, w, h, tint) {
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      drawTexturedQuad(billboardModel(basis, x, y, z, w, h), texture, tint || [1, 1, 1, 1], [1, 1]);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    function drawShadow(basis, x, z, w, h, alpha) {
      if (!textures.shadow || !textures.shadow.loaded) return;
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      var m = model(x, 0.035, z, w, 1, h);
      // quadXZ uses an XZ plane; draw it with the textured program.
      gl.useProgram(texProg.p);
      gl.uniformMatrix4fv(texProg.uViewProj, false, viewProj);
      gl.uniformMatrix4fv(texProg.uModel, false, m);
      gl.uniform4fv(texProg.uColor, [1, 1, 1, alpha]);
      gl.uniform2f(texProg.uUVScale, 1, 1);
      useTextureUnit(textures.shadow);
      var q = meshes.quadXZ;
      gl.enableVertexAttribArray(texProg.aPos);
      gl.bindBuffer(gl.ARRAY_BUFFER, q.vbo);
      gl.vertexAttribPointer(texProg.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(texProg.aUV);
      gl.bindBuffer(gl.ARRAY_BUFFER, q.ubo);
      gl.vertexAttribPointer(texProg.aUV, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, q.ibo);
      gl.drawElements(gl.TRIANGLES, q.count, gl.UNSIGNED_SHORT, 0);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    function color(hex) {
      return new Float32Array([
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255
      ]);
    }

    function box(x0, x1, y0, y1, z0, z1, hex) {
      drawMesh('cube', model((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0), color(hex));
    }

    /* ---------- unlit / lines / transparent ---------- */
    function prepUnlit() {
      gl.useProgram(unlit.p);
      gl.uniformMatrix4fv(unlit.uViewProj, false, viewProj);
      gl.uniformMatrix4fv(unlit.uModel, false, identity());
      gl.enableVertexAttribArray(unlit.aPos);
    }
    function drawUnlitMesh(name, mtx, rgba) {
      var m = meshes[name];
      prepUnlit();
      gl.uniformMatrix4fv(unlit.uModel, false, mtx);
      gl.uniform4fv(unlit.uColor, rgba);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
      gl.vertexAttribPointer(unlit.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
    }
    function drawLines(points, rgba, mode) {
      if (points.length < 2) return;
      prepUnlit();
      gl.uniform4fv(unlit.uColor, rgba);
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(unlit.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(mode || gl.LINE_STRIP, 0, points.length / 3);
    }

    /* ---------- scene ---------- */
    function boxTex(x0, x1, y0, y1, z0, z1, texture, uvScale) {
      drawMesh('cubeTex', model((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0),
        [1, 1, 1], texture, uvScale || [1, 1], true);
    }

    function drawRoom(c) {
      var white = [1, 1, 1];

      // wood floor
      drawMesh('quadXZ', model(0, 0.006, 3.5, 7.2, 1, 7.4), white, textures.floor, [4, 4], true);
      // walls
      drawMesh('quadXY', model(0, 1.5, 7.19, 7.2, 3, 1), white, textures.wall, [2, 1], true);
      boxTex(-3.6, -3.45, 0, 3, -0.2, 7.2, textures.wall, [1, 1]);
      boxTex(3.45, 3.6, 0, 3, -0.2, 7.2, textures.wall, [1, 1]);

      // rug
      drawMesh('quadXZ', model(0, 0.035, 3.65, 4.9, 1, 3.9), white, textures.rug, [1, 1], true);
      // soft shadow under the sofa
      drawShadow(c, 0, 6.35, 4.6, 0.9, 0.28);

      // window with the generated night view, plus a simple frame
      box(-2.75, -1.15, 1.02, 2.28, 7.17, 7.22, '#2a2423');
      if (textures.window.loaded) drawTexturedQuad(model(-1.95, 1.65, 7.155, 1.45, 1.1, 1), textures.window, [1, 1, 1, 1], [1, 1]);
      drawLines([-1.95, 1.1, 7.14, -1.95, 2.2, 7.14], [0.8, 0.9, 1, 0.28], gl.LINES);
      drawLines([-2.67, 1.65, 7.14, -1.23, 1.65, 7.14], [0.8, 0.9, 1, 0.28], gl.LINES);

      // sofa
      boxTex(-2.15, 2.15, 0.0, 0.58, 5.85, 6.75, textures.sofa, [2, 2]);
      boxTex(-2.15, 2.15, 0.58, 1.35, 6.38, 6.8, textures.sofa, [2, 2]);
      boxTex(-2.4, -1.98, 0, 0.82, 5.8, 6.8, textures.sofa, [2, 2]);
      boxTex(1.98, 2.4, 0, 0.82, 5.8, 6.8, textures.sofa, [2, 2]);
      boxTex(-1.72, -0.08, 0.6, 0.95, 5.9, 6.48, textures.sofa, [2, 2]);
      boxTex(0.08, 1.72, 0.6, 0.95, 5.9, 6.48, textures.sofa, [2, 2]);

      // TV frame + generated screen
      box(-1.05, 1.05, 1.15, 2.25, 7.08, 7.2, '#141414');
      if (textures.tv.loaded) drawTexturedQuad(model(0, 1.7, 7.06, 1.8, 0.92, 1), textures.tv, [1, 1, 1, 1], [1, 1]);

      // side table / lamp
      box(-3.0, -2.35, 0, 0.44, 2.25, 3.25, '#4a372d');
      drawMesh('cylinder', model(-2.68, 0.92, 2.75, 0.025, 0.92, 0.025), color('#b88c58'));
      drawMesh('cylinder', model(-2.68, 1.4, 2.75, 0.22, 0.28, 0.22), color('#e0b26e'));
      drawUnlitMesh('sphere', model(-2.68, 1.42, 2.75, 0.09, 0.09, 0.09), [1.0, 0.72, 0.35, 1]);

      // plant
      drawMesh('cylinder', model(2.6, 0.18, 6.0, 0.28, 0.36, 0.28), color('#5b4238'));
      for (var li = 0; li < 7; li++) {
        var a = -0.9 + li * 0.3;
        var mx = rotZ(a, 2.6 + Math.cos(a) * 0.15, 0.8, 6.0, 0.06, 0.7, 0.06);
        drawMesh('cube', mx, color('#446b51'));
      }
    }

    function drawBin(c, state) {
      var b = state.bin;
      // generated soft contact shadow
      drawShadow(c, b.x, b.z, 0.9, 0.45, 0.42);
      // body wrapped in the generated can texture
      drawMesh('cylinderTex', model(b.x, 0.56, b.z, 0.36, 1.12, 0.36), [1, 1, 1], textures.canWrap, [1, 1], true);
      // dark inner opening
      drawUnlitMesh('disk', model(b.x, 1.125, b.z, 0.34, 1, 0.34), [0.02, 0.055, 0.065, 1]);
      // rim
      drawUnlitMesh('torus', model(b.x, 1.13, b.z, 0.35, 0.35, 0.35), [0.95, 0.7, 0.28, 1]);
      // eyes
      drawMesh('sphere', model(b.x - 0.12, 0.67, b.z - 0.35, 0.035, 0.035, 0.035), color('#081216'));
      drawMesh('sphere', model(b.x + 0.12, 0.67, b.z - 0.35, 0.035, 0.035, 0.035), color('#081216'));
      // little highlight stripe
      drawMesh('cube', model(b.x, 0.4, b.z - 0.355, 0.3, 0.018, 0.01), color('#b7e5df'));

      if (state.aimActive) {
        // aim ring in the air
        drawUnlitMesh('torus', model(state.aim.x, 0.93, state.aim.z, 0.34, 0.34, 0.34), [0.96, 0.78, 0.32, 1]);
        // target shadow/ring on floor
        drawUnlitMesh('torus', model(state.aim.x, 0.045, state.aim.z, 0.32, 0.32, 0.32), [0.28, 0.85, 0.76, 0.62]);
        drawLines([state.aim.x, 0.93, state.aim.z, state.aim.x, 0.05, state.aim.z], [0.95, 0.7, 0.31, 0.42], gl.LINES);
      }
    }

    function drawPreview(state) {
      if (!state.aimActive || !state.preview.length) return;
      var pts = [];
      for (var i = 0; i < state.preview.length; i++) {
        var p = state.preview[i];
        pts.push(p.x, p.y, p.z);
      }
      drawLines(pts, [0.45, 0.95, 0.88, 0.72], gl.LINE_STRIP);
      for (var j = 0; j < state.preview.length; j += 2) {
        var q = state.preview[j];
        drawUnlitMesh('sphere', model(q.x, q.y, q.z, 0.03, 0.03, 0.03), [0.55, 1, 0.92, 0.9]);
      }
    }

    function drawProjectiles(c, state) {
      var list = state.projectiles.slice().sort(function (a, b) { return b.t - a.t; });
      for (var i = 0; i < list.length; i++) {
        var pr = list[i];
        var t = Math.max(0, Math.min(1, pr.t / pr.duration));
        var px = pr.from.x + (pr.to.x - pr.from.x) * t;
        var py = pr.from.y + (pr.to.y - pr.from.y) * t + Math.sin(Math.PI * t) * pr.arc;
        var pz = pr.from.z + (pr.to.z - pr.from.z) * t;
        var gx = pr.from.x + (pr.to.x - pr.from.x) * t;
        var gz = pr.from.z + (pr.to.z - pr.from.z) * t;
        drawShadow(c, gx, gz, 0.34, 0.14, 0.26);
        var tex = textures[pr.type] || textures.bag;
        var w = pr.type === 'bottle' ? 0.28 : (pr.type === 'can' ? 0.26 : 0.42);
        var h = pr.type === 'bottle' ? 0.58 : (pr.type === 'can' ? 0.38 : 0.42);
        drawBillboard(c, tex, px, py, pz, w, h, [1, 1, 1, 1]);
      }
    }

    function spawnEffects(state) {
      if (state.events.length < seenEvents) seenEvents = 0;
      for (var i = seenEvents; i < state.events.length; i++) {
        var ev = state.events[i];
        if (ev.type !== 'in' && ev.type !== 'perfect' && ev.type !== 'miss') continue;
        var count = ev.type === 'perfect' ? 18 : (ev.type === 'miss' ? 5 : 10);
        for (var n = 0; n < count; n++) {
          var hue = ev.type === 'perfect' ? 0.13 : (ev.type === 'miss' ? 0.95 : 0.45);
          particles.push({
            x: ev.x || 0, y: 1.0, z: ev.z || 3.4,
            vx: (Math.random() - 0.5) * 2.4,
            vy: 0.8 + Math.random() * 2.2,
            vz: (Math.random() - 0.5) * 2.4,
            life: 0.55 + Math.random() * 0.5,
            max: 1.0, size: 0.02 + Math.random() * 0.035, hue: hue
          });
        }
      }
      seenEvents = state.events.length;
      if (particles.length > 220) particles.splice(0, particles.length - 220);
    }

    function drawParticles(dt) {
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy -= 3.6 * dt; p.vx *= 0.99; p.vz *= 0.99;
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        var a = Math.max(0, p.life / p.max);
        var c = p.hue < 0.2 ? [1, 0.75, 0.28, a] : (p.hue > 0.8 ? [1, 0.35, 0.45, a] : [0.35, 1, 0.76, a]);
        drawUnlitMesh('cube', model(p.x, p.y, p.z, p.size, p.size, p.size), c);
      }
    }

    function makeFallback() {
      if (fallback || !canvas || !canvas.parentNode) return;
      var c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;';
      canvas.parentNode.appendChild(c);
      fallback = root.TrashTossRenderer ? root.TrashTossRenderer.create(c) : null;
    }

    function onContextLost(event) {
      if (event && event.preventDefault) event.preventDefault();
      lost = true;
      makeFallback();
      if (fallback) fallback.resize();
    }

    canvas.addEventListener('webglcontextlost', onContextLost, false);

    function resize() {
      if (!canvas) return;
      dpr = Math.min(2, root.devicePixelRatio || 1);
      var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      width = rect && rect.width ? rect.width : 390;
      height = rect && rect.height ? rect.height : 844;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      proj = perspective(68 * Math.PI / 180, width / height, 0.1, 40);
      // The fixed camera looks toward +z. Mirror the projection so world +x
      // lands on screen +x, matching the swipe-to-left/right mapping.
      proj[0] = -proj[0];
      view = lookAt(cameraPos, cameraLook, { x: 0, y: 1, z: 0 });
      viewProj = mul(proj, view);
      if (fallback) fallback.resize();
    }

    function draw(state, t) {
      if (lost || gl.isContextLost()) {
        if (!fallback) makeFallback();
        if (fallback) { fallback.resize(); fallback.draw(state, t || 0); }
        return;
      }
      var now = t || 0;
      var dt = now - (draw._last || now);
      draw._last = now;
      dt = Math.min(0.05, Math.max(0, dt));
      gl.clearColor(0.025, 0.025, 0.035, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(lit.p);
      gl.uniformMatrix4fv(lit.uViewProj, false, viewProj);
      var c = cameraBasis();

      drawRoom(c);
      drawBin(c, state);
      drawPreview(state);
      drawProjectiles(c, state);
      spawnEffects(state);
      drawParticles(dt);

      gl.disable(gl.BLEND);
    }

    initTextures();
    resize();
    return { resize: resize, draw: draw, kind: 'webgl' };
  }

  root.TrashTossWebGLRenderer = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
