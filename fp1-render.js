const vertexSource = `
attribute vec3 point;
attribute vec3 normal;
attribute vec2 uv;
attribute vec3 tint;
uniform vec3 eye, right, up, forward, offset;
uniform vec2 turn, projection;
varying vec3 world, surface, color;
varying vec2 tex;
varying float depth;
void main() {
  vec3 p = vec3(point.x * turn.x + point.z * turn.y, point.y,
                point.z * turn.x - point.x * turn.y) + offset;
  vec3 q = p - eye;
  float z = dot(q, forward);
  gl_Position = vec4(dot(q, right) * projection.x, dot(q, up) * projection.y,
    z * 1.002002 - .1001001, z);
  world = p;
  surface = normal;
  color = tint;
  tex = uv;
  depth = z;
}`;

const fragmentSource = `
precision mediump float;
uniform sampler2D paint;
uniform float actor, luminous;
varying vec3 world, surface, color;
varying vec2 tex;
varying float depth;
void main() {
  vec4 sampleColor = texture2D(paint, tex);
  if (sampleColor.a < .55) discard;
  float sky = .66 + .24 * max(0.0, dot(surface, normalize(vec3(-.3, .8, .5))));
  float shop = 1.0 / (1.0 + .17 * dot(world - vec3(.1, 2.45, -17.8),
                                     world - vec3(.1, 2.45, -17.8)));
  float street = 1.0 / (1.0 + .45 * dot(world - vec3(-2.6, 2.5, -6.9),
                                       world - vec3(-2.6, 2.5, -6.9)));
  vec3 light = mix(vec3(sky), vec3(.94), actor) + (shop + street) * vec3(.25,.14,.055);
  vec3 rgb = sampleColor.rgb * color * mix(light, vec3(1.18), luminous);
  float fog = smoothstep(11.0, 42.0, depth) * .57;
  gl_FragColor = vec4(mix(rgb, vec3(.32,.38,.41), fog), 1.0);
}`;

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', {alpha:true, antialias:true});
  if (!gl) throw Error('此浏览器无法打开三维街景。');
  function shader(type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(result));
    return result;
  }
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
    const compiled = shader(type, source);
    gl.attachShader(program, compiled);
    gl.deleteShader(compiled);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const attrs = Object.fromEntries(['point','normal','uv','tint'].map(name=>[name,gl.getAttribLocation(program,name)]));
  const uni = Object.fromEntries(['eye','right','up','forward','offset','turn','projection','actor','luminous']
    .map(name=>[name,gl.getUniformLocation(program,name)]));
  const materials = new Set();
  const staticMeshes = new Map();
  const buffers = new Set();
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0,0,0,0);

  function material(canvasSource, luminous = false) {
    const texture = gl.createTexture();
    const result = {texture,luminous,vertices:[]};
    materials.add(result);
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvasSource);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    return result;
  }

  function append(out, corners, normal, tint) {
    const tex = [[0,1],[1,1],[1,0],[0,0]];
    for (const index of [0,1,2,0,2,3]) out.push(...corners[index],...normal,...tex[index],...tint);
  }
  function box(x,y,z,w,h,d,mat,tint=[1,1,1]) {
    const l=x-w/2,r=x+w/2,b=y,t=y+h,n=z-d/2,f=z+d/2;
    const faces = [
      [[[l,b,f],[r,b,f],[r,t,f],[l,t,f]],[0,0,1]],
      [[[r,b,n],[l,b,n],[l,t,n],[r,t,n]],[0,0,-1]],
      [[[l,b,n],[l,b,f],[l,t,f],[l,t,n]],[-1,0,0]],
      [[[r,b,f],[r,b,n],[r,t,n],[r,t,f]],[1,0,0]],
      [[[l,t,f],[r,t,f],[r,t,n],[l,t,n]],[0,1,0]],
      [[[l,b,n],[r,b,n],[r,b,f],[l,b,f]],[0,-1,0]]
    ];
    for (const [corners,normal] of faces) append(mat.vertices,corners,normal,tint);
  }
  function quad(corners, normal, mat, tint=[1,1,1]) {
    append(mat.vertices,corners,normal,tint);
  }
  function mesh(vertices) {
    const buffer=gl.createBuffer();
    buffers.add(buffer);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    return {buffer,count:vertices.length/11};
  }
  function seal() {
    for (const mat of materials) {
      if (mat.vertices.length) staticMeshes.set(mat,mesh(mat.vertices));
      mat.vertices.length=0;
    }
  }
  function figure(mat,height,width) {
    const vertices=[];
    append(vertices,[[-width/2,0,0],[width/2,0,0],[width/2,height,0],[-width/2,height,0]],
      [0,0,1],[1,1,1]);
    return {mat,mesh:mesh(vertices)};
  }
  function draw(mesh,mat,x=0,y=0,z=0,angle=0,actor=0) {
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);
    for (const [key,size,offset] of [['point',3,0],['normal',3,12],['uv',2,24],['tint',3,32]]) {
      gl.enableVertexAttribArray(attrs[key]);
      gl.vertexAttribPointer(attrs[key],size,gl.FLOAT,false,44,offset);
    }
    gl.bindTexture(gl.TEXTURE_2D,mat.texture);
    gl.uniform3f(uni.offset,x,y,z);
    gl.uniform2f(uni.turn,Math.cos(angle),Math.sin(angle));
    gl.uniform1f(uni.actor,actor);
    gl.uniform1f(uni.luminous,Number(mat.luminous));
    gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }
  function render({x,y,z,yaw,pitch},actors) {
    const scale=Math.min(devicePixelRatio||1,1.5,1440/Math.max(canvas.clientWidth,1));
    const width=Math.max(1,Math.round(canvas.clientWidth*scale));
    const height=Math.max(1,Math.round(canvas.clientHeight*scale));
    if (canvas.width!==width||canvas.height!==height) {canvas.width=width;canvas.height=height;}
    gl.viewport(0,0,width,height);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    const s=Math.sin(yaw),c=Math.cos(yaw),v=Math.sin(pitch),h=Math.cos(pitch);
    const fov=width<height?1.24:1.64;
    gl.uniform3f(uni.eye,x,y,z);
    gl.uniform3f(uni.right,c,0,s);
    gl.uniform3f(uni.forward,s*h,v,-c*h);
    gl.uniform3f(uni.up,-s*v,h,c*v);
    gl.uniform2f(uni.projection,fov*height/width,fov);
    for (const [mat,geometry] of staticMeshes) draw(geometry,mat);
    for (const a of actors) {
      if (!a.figure) continue;
      const facing=Math.atan2(x-a.x,z-a.z);
      draw(a.figure.mesh,a.figure.mat,a.x,a.y||0,a.z,facing,1);
    }
  }
  function destroy() {
    for (const mat of materials) gl.deleteTexture(mat.texture);
    for (const buffer of buffers) gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
  }
  return {material,box,quad,figure,seal,render,destroy};
}

export function surface(width,height,paint) {
  const canvas=document.createElement('canvas');
  canvas.width=width;
  canvas.height=height;
  paint(canvas.getContext('2d'),width,height);
  return canvas;
}

export async function loadImage(url) {
  const image=new Image();
  image.src=url;
  await image.decode();
  return image;
}
