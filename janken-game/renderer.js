/* renderer.js : 生WebGLのミニ3Dレンダラ（ライブラリなし）
 *
 * テーブル上の2つのオブジェクトとして手を描く。
 * WebGL が使えない環境（テスト用スタブや古いブラウザ）では create() が null を返し、
 * 呼び出し側は描画をスキップしてゲーム進行だけを続ける。
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.JankenRenderer = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ===== mat4 (column-major) ===== */
  function m4perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ];
  }

  function m4lookAt(eye, center, up) {
    var z = norm3(sub3(eye, center));
    var x = norm3(cross3(up, z));
    var y = cross3(z, x);
    return [
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1
    ];
  }

  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross3(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm3(a) {
    var len = Math.sqrt(dot3(a, a)) || 1;
    return [a[0] / len, a[1] / len, a[2] / len];
  }

  /* 並進 t / 回転 rot[XYZ] / 一様スケール s の合成（回転順は Y->X->Z） */
  function m4compose(t, rot, s) {
    var cx = Math.cos(rot[0]), sx = Math.sin(rot[0]);
    var cy = Math.cos(rot[1]), sy = Math.sin(rot[1]);
    var cz = Math.cos(rot[2]), sz = Math.sin(rot[2]);
    var r00 = cy * cz + sy * sx * sz;
    var r01 = -cy * sz + sy * sx * cz;
    var r02 = sy * cx;
    var r10 = cx * sz;
    var r11 = cx * cz;
    var r12 = -sx;
    var r20 = -sy * cz + cy * sx * sz;
    var r21 = sy * sz + cy * sx * cz;
    var r22 = cy * cx;
    return [
      r00 * s, r10 * s, r20 * s, 0,
      r01 * s, r11 * s, r21 * s, 0,
      r02 * s, r12 * s, r22 * s, 0,
      t[0], t[1], t[2], 1
    ];
  }

  /* ===== メッシュ生成 ===== */
  function transformMesh(mesh, t, rot, s) {
    var mat = m4compose(t, rot, s);
    var positions = new Float32Array(mesh.positions.length);
    var normals = new Float32Array(mesh.normals.length);
    for (var i = 0; i < mesh.positions.length; i += 3) {
      var x = mesh.positions[i], y = mesh.positions[i + 1], z = mesh.positions[i + 2];
      positions[i] = mat[0] * x + mat[4] * y + mat[8] * z + mat[12];
      positions[i + 1] = mat[1] * x + mat[5] * y + mat[9] * z + mat[13];
      positions[i + 2] = mat[2] * x + mat[6] * y + mat[10] * z + mat[14];
      var nx = mesh.normals[i], ny = mesh.normals[i + 1], nz = mesh.normals[i + 2];
      var ox = mat[0] * nx + mat[4] * ny + mat[8] * nz;
      var oy = mat[1] * nx + mat[5] * ny + mat[9] * nz;
      var oz = mat[2] * nx + mat[6] * ny + mat[10] * nz;
      var len = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
      normals[i] = ox / len;
      normals[i + 1] = oy / len;
      normals[i + 2] = oz / len;
    }
    return { positions: positions, normals: normals, indices: mesh.indices };
  }

  function makeBox(w, h, d) {
    var x = w / 2, y = h / 2, z = d / 2;
    var faces = [
      { n: [0, 0, 1], v: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
      { n: [0, 0, -1], v: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
      { n: [1, 0, 0], v: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]] },
      { n: [-1, 0, 0], v: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]] },
      { n: [0, 1, 0], v: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
      { n: [0, -1, 0], v: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] }
    ];
    var positions = [];
    var normals = [];
    var indices = [];
    for (var f = 0; f < faces.length; f++) {
      var base = positions.length / 3;
      for (var v = 0; v < 4; v++) {
        positions.push(faces[f].v[v][0], faces[f].v[v][1], faces[f].v[v][2]);
        normals.push(faces[f].n[0], faces[f].n[1], faces[f].n[2]);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      indices: new Uint16Array(indices)
    };
  }

  function makeSphere(r, seg, rings) {
    var positions = [];
    var normals = [];
    var indices = [];
    for (var lat = 0; lat <= rings; lat++) {
      var theta = lat * Math.PI / rings;
      var st = Math.sin(theta), ct = Math.cos(theta);
      for (var lon = 0; lon <= seg; lon++) {
        var phi = lon * 2 * Math.PI / seg;
        var px = st * Math.cos(phi), py = ct, pz = st * Math.sin(phi);
        positions.push(px * r, py * r, pz * r);
        normals.push(px, py, pz);
      }
    }
    for (var l = 0; l < rings; l++) {
      for (var s = 0; s < seg; s++) {
        var a = l * (seg + 1) + s;
        var b = a + seg + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      indices: new Uint16Array(indices)
    };
  }

  function concatMeshes(parts) {
    var positions = [];
    var normals = [];
    var indices = [];
    for (var p = 0; p < parts.length; p++) {
      var mesh = parts[p].mesh;
      var base = positions.length / 3;
      for (var i = 0; i < mesh.positions.length; i++) positions.push(mesh.positions[i]);
      for (var n = 0; n < mesh.normals.length; n++) normals.push(mesh.normals[n]);
      for (var k = 0; k < mesh.indices.length; k++) indices.push(mesh.indices[k] + base);
    }
    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      indices: new Uint16Array(indices)
    };
  }

  var PI = Math.PI;

  /* グー: 握った拳（いびつな球） */
  function buildRockMesh() {
    return concatMeshes([
      { mesh: transformMesh(makeSphere(0.44, 14, 10), [0, 0, 0], [0, 0, 0], 1) }
    ]);
  }

  /* チョキ: 交差した2本の刃 */
  function buildScissorsMesh() {
    return concatMeshes([
      { mesh: transformMesh(makeBox(0.15, 0.95, 0.15), [0, 0.12, 0], [0, 0, 0.5], 1) },
      { mesh: transformMesh(makeBox(0.15, 0.95, 0.15), [0, 0.12, 0], [0, 0, -0.5], 1) },
      { mesh: transformMesh(makeSphere(0.16, 10, 8), [0, -0.32, 0], [0, 0, 0], 1) }
    ]);
  }

  /* パー: 平たい札 */
  function buildPaperMesh() {
    return concatMeshes([
      { mesh: transformMesh(makeBox(0.95, 0.72, 0.07), [0, 0.05, 0], [0.18, 0, 0], 1) }
    ]);
  }

  /* ===== シェーダ ===== */
  var VERTEX_SRC = [
    'attribute vec3 aPos;',
    'attribute vec3 aNormal;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'uniform mat4 uModel;',
    'varying vec3 vNormal;',
    'void main() {',
    '  vNormal = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aNormal;',
    '  gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);',
    '}'
  ].join('\n');

  var FRAGMENT_SRC = [
    'precision mediump float;',
    'varying vec3 vNormal;',
    'uniform vec3 uColor;',
    'uniform vec3 uLight;',
    'void main() {',
    '  vec3 n = normalize(vNormal);',
    '  float d = max(dot(n, normalize(uLight)), 0.0);',
    '  vec3 c = uColor * (0.38 + 0.68 * d);',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, source) {
    var shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function create(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') return null;
    var gl = null;
    try {
      gl = canvas.getContext('webgl', { antialias: true, alpha: false })
        || canvas.getContext('experimental-webgl');
    } catch (e) {
      gl = null;
    }
    if (!gl) return null;
    /* テスト用スタブはすべての呼び出しが undefined を返すので VERSION で実体を判定する */
    var version = null;
    try { version = gl.getParameter(gl.VERSION); } catch (e) { version = null; }
    if (typeof version !== 'string') return null;

    var vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    if (!vertex) return null;
    var fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    if (!fragment) {
      gl.deleteShader(vertex);
      return null;
    }
    var program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return null;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return null;
    }
    gl.useProgram(program);

    var loc = {
      aPos: gl.getAttribLocation(program, 'aPos'),
      aNormal: gl.getAttribLocation(program, 'aNormal'),
      uProj: gl.getUniformLocation(program, 'uProj'),
      uView: gl.getUniformLocation(program, 'uView'),
      uModel: gl.getUniformLocation(program, 'uModel'),
      uColor: gl.getUniformLocation(program, 'uColor'),
      uLight: gl.getUniformLocation(program, 'uLight')
    };
    if (loc.aPos < 0 || loc.aNormal < 0 || !loc.uProj || !loc.uView || !loc.uModel || !loc.uColor || !loc.uLight) {
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return null;
    }

    function uploadMesh(mesh) {
      var vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
      var nbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
      var ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
      return { vbo: vbo, nbo: nbo, ibo: ibo, count: mesh.indices.length };
    }

    var floor = uploadMesh(transformMesh(makeBox(5.8, 0.14, 3.8), [0, 0, 0], [0, 0, 0], 1));
    var shadow = uploadMesh(transformMesh(makeBox(0.82, 0.02, 0.82), [0, 0, 0], [0, 0, 0], 1));
    var meshes = {
      rock: uploadMesh(buildRockMesh()),
      scissors: uploadMesh(buildScissorsMesh()),
      paper: uploadMesh(buildPaperMesh())
    };

    gl.enable(gl.DEPTH_TEST);
    gl.enableVertexAttribArray(loc.aPos);
    gl.enableVertexAttribArray(loc.aNormal);
    gl.clearColor(0.045, 0.065, 0.11, 1);
    gl.uniform3f(loc.uLight, 0.45, 0.9, 0.55);

    var width = canvas.width || 2;
    var height = canvas.height || 2;

    function resize(cssWidth, cssHeight, dpr) {
      var w = Math.max(2, Math.floor(cssWidth * dpr));
      var h = Math.max(2, Math.floor(cssHeight * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      width = w;
      height = h;
    }

    function drawMesh(mesh, model, color) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
      gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nbo);
      gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      gl.uniformMatrix4fv(loc.uModel, false, model);
      gl.uniform3fv(loc.uColor, color);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }

    function draw(s) {
      s = s || {};
      var t = (s.t || 0) / 1000;

      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      var aspect = width / height;
      var fov = aspect < 0.9 ? 58 : 44;
      var proj = m4perspective(fov * PI / 180, aspect, 0.1, 50);
      var view = m4lookAt([0, 1.5, 4.4], [0, -0.5, 0], [0, 1, 0]);
      gl.uniformMatrix4fv(loc.uProj, false, proj);
      gl.uniformMatrix4fv(loc.uView, false, view);

      drawMesh(floor, m4compose([0, -0.63, 0], [0, 0, 0], 1), [0.11, 0.14, 0.21]);

      var cpuBob = Math.sin(t * 1.7) * 0.035;
      var playerBob = Math.sin(t * 1.7 + PI) * 0.035;

      var cpuShake = s.cpuShake || 0;
      var playerShake = s.playerShake || 0;
      var cpuScale = s.cpuScale == null ? 1 : s.cpuScale;
      var playerScale = s.playerScale == null ? 1 : s.playerScale;

      drawMesh(shadow, m4compose([-1.0 + cpuShake * 0.06 * Math.sin(t * 34), -0.552, -0.78], [0, 0, 0], 1 + cpuShake * 0.2),
        [0.05, 0.06, 0.10]);
      drawMesh(shadow, m4compose([0.62 + playerShake * 0.06 * Math.sin(t * 34), -0.552, 0.7], [0, 0, 0], 1 + playerShake * 0.2),
        [0.05, 0.06, 0.10]);

      var cpuModel = m4compose(
        [-1.0 + cpuShake * 0.09 * Math.sin(t * 34), -0.1 + cpuBob, -0.78],
        [0.1, t * 0.55 + (s.cpuSpin || 0), 0],
        cpuScale
      );
      drawMesh(meshes[s.cpuHand] || meshes.rock, cpuModel,
        s.cpuHighlight ? [1.0, 0.55, 0.5] : [0.82, 0.33, 0.36]);

      var playerModel = m4compose(
        [0.62 + playerShake * 0.09 * Math.sin(t * 34), -0.1 + playerBob, 0.7],
        [0.12, -t * 0.5 + (s.playerSpin || 0), 0],
        playerScale
      );
      drawMesh(meshes[s.playerHand] || meshes.rock, playerModel,
        s.playerHighlight ? [0.6, 0.85, 1.0] : [0.33, 0.56, 0.92]);
    }

    return { draw: draw, resize: resize };
  }

  return { create: create };
});
