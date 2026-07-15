import type { GradientStop, Layer, PostSettings } from './models'

const vertex = `#version 300 es
in vec2 p; out vec2 uv;
void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`

const fragment = `#version 300 es
precision highp float;
in vec2 uv; out vec4 outColor;
uniform vec2 resolution, offset, scroll;
uniform float time, rotation, transformScale, p0, p1, p2, p3, p4, p5, seed;
uniform int kind, polarMode, invertMode, solidMode;
uniform vec4 recipe;
uniform vec3 colorA,colorB,colorC,solidColor;
uniform vec3 postA,postB,postC,postD,postE;

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+seed)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p,float oct,float lac,float gain){float v=0.,a=.5;for(int i=0;i<8;i++){if(float(i)>=oct)break;v+=a*noise(p);p=p*lac+vec2(1.7,2.3);a*=gain;}return v;}
vec2 cell(vec2 p){vec2 i=floor(p),f=fract(p);float d1=9.,d2=9.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(x,y),o=vec2(hash(i+g),hash(i+g+19.));float d=length(g+mix(vec2(.5),o,p2)-f);if(d<d1){d2=d1;d1=d;}else d2=min(d2,d);}return vec2(d1,d2);}
float aa(float d,float w){return 1.-smoothstep(0.,max(.0005,w),d);}
float polygon(vec2 q,float sides,float radius){float a=atan(q.y,q.x),sector=6.283185/max(3.,floor(sides));return cos(floor(.5+a/sector)*sector-a)*length(q)-radius;}
float pattern(vec2 q){
 float family=recipe.x,variant=recipe.y,profile=recipe.z,spice=recipe.w;
 float r=length(q),a=atan(q.y,q.x),phase=time*p5+variant*.731+family*.417;
 float signature=fract(variant*.6180339+spice*.137+family*.193);
 if(profile<.5){
  float radius=p0*(1.+p3*.08*sin(a*(2.+mod(variant+family,7.))+phase));
  float body=aa(max(r-radius,0.),p1),fall=exp(-max(0.,r-radius)*p4*4.);
  float cres=aa(max(length(q+vec2(radius*.35,0.))-radius*.82,0.),p1);
  if(kind==1)return smoothstep(radius-p1,radius+p1,r);
  if(kind==6)return abs(body-cres)*p3;
  return mix(body*fall,body*(.65+.35*cos(a*(2.+variant)+phase)),signature*.28)*p3;
 }
 if(profile<1.5){
  float wr=p0+p3*sin(a*p2+phase)*p0;
  float ring=aa(abs(r-wr)-p1,p4),echo=aa(abs(r-(p0+p1*3.))-p1*.35,p4);
  float radial=aa(abs(fract(r/max(.01,p0)*(.5+signature*3.))-.5)-p1,p4);
  return mix(mix(ring,max(ring,echo),signature*.55),radial,step(.72,signature))*p5;
 }
 if(profile<2.5){
  float rays=pow(abs(cos(a*p1+phase+sin(r*(8.+variant+family))*p5*.3)),p2);
  float spokes=pow(max(0.,cos(a*(p1*.5+spice)+phase)),p2*.7);
  return max(exp(-r/max(.004,p4)),mix(rays,spokes,signature)*exp(-r*p3))*(.7+p5*.3);
 }
 if(profile<3.5){
  float sides=max(3.,p1+mod(variant+family,4.)-1.);
  vec2 z=q+p5*(noise(q*7.+phase)-.5);
  float d=polygon(z,sides,p0),fill=aa(max(d,0.),p2),outline=aa(abs(d)-p4,p2);
  float star=aa(max(polygon(z,sides,p0*(.7+.3*cos(a*sides))),0.),p2);
  return mix(mix(fill,outline,step(.01,p4)),star,signature*.5)*(1.-p3*.25*abs(sin(a*sides)));
 }
 if(profile<4.5){
  float arms=max(1.,p1+mod(variant+family,3.));
  float wave=abs(sin(a*arms+r*p2+phase+fbm(q*4.,4.,2.,.5)*p5));
  return aa(wave-p3,p3*.25)*exp(-r*p4);
 }
 if(profile<5.5){
  vec2 z=q*p0,id=floor(z),f=fract(z)-.5;f.x+=step(.5,mod(id.y,2.))*p3*.5;
  float lines=min(abs(f.x),abs(f.y)),checker=mod(id.x+id.y+floor(variant*.5),2.);
  float cells=step(p2,max(abs(f.x),abs(f.y))),grid=aa(lines-p1,p3);
  return mix(mix(cells,checker,signature),grid,step(.62,signature))*(1.-p4+p4*hash(id));
 }
 if(profile<6.5){
  vec2 z=q*p0,id=floor(z),f=fract(z)-.5;f.x+=step(.5,mod(id.y,2.))*p2;
  float radius=p1*(1.+p4*(hash(id)-.5));
  return aa(length(f)-radius,p3)*step(1.-p5,hash(id+31.));
 }
 if(profile<7.5){
  vec2 z=q*p0;float bend=p2*sin(z.y*p3+phase)+p5*(noise(z*.35)-.5);
  float stripe=abs(fract(z.x+bend+variant*.071)-.5),second=abs(fract(z.y-bend*.4)-.5);
  return mix(aa(stripe-p1*.5,p4),aa(min(stripe,second)-p1*.5,p4),step(.5,signature));
 }
 if(profile<8.5){
  float n=fbm(q*p0+vec2(time*p5),p1,p2,p3),ridge=1.-abs(n*2.-1.);
  float billow=abs(n*2.-1.);
  return pow(clamp(mix(mix(n,ridge,signature),billow,step(.8,signature)),0.,1.),p4);
 }
 if(profile<9.5){
  vec2 z=q*p0;
  for(int j=0;j<5;j++){if(float(j)>=p2)break;float n=noise(z+phase);z+=p1*vec2(sin(z.y+n+phase),cos(z.x-n-phase))*.22;}
  float bands=sin(z.x+z.y+fbm(z,4.,2.,.5)*4.+phase)*.5+.5;
  return pow(smoothstep(p3*.25,1.-p3*.25,bands),p4);
 }
 if(profile<10.5){
  vec2 c=cell(q*p0+vec2(time*p5*.15));
  return mix(aa((c.y-c.x)-p1,p3),aa(c.x-p4,p3),signature);
 }
 if(profile<11.5){
  vec2 z=q*p0;float row=floor(z.y),clock=floor(time*p5*8.);
  float gate=hash(vec2(row,clock+floor(z.x/p2)));
  float shifted=z.x+p3*(gate-.5);
  float block=hash(vec2(floor(shifted),row+clock));
  return smoothstep(p1-.06,p1+.06,mix(block,noise(z*vec2(.2,1.)),p4));
 }
 float beam=exp(-abs(q.y)/max(.001,p1))*exp(-abs(q.y)*p2);
 beam*=1.+p4*(noise(vec2(q.x*p3,time*p5))- .5);
 return beam*p5;
}
vec3 gradient(float x){return x<.5?mix(colorA,colorB,x*2.):mix(colorB,colorC,(x-.5)*2.);}
void main(){
 vec2 sampleUV=uv;if(postB.z>0.)sampleUV=mix(sampleUV,(floor(sampleUV*mix(400.,20.,postB.z))+.5)/mix(400.,20.,postB.z),postB.z);
 vec2 q=(sampleUV-.5-offset);float cs=cos(rotation),sn=sin(rotation);q=mat2(cs,-sn,sn,cs)*q/max(.02,transformScale);q+=scroll*time;
 if(postC.z>.01)q.x=mix(q.x,abs(q.x),postC.z);
 if(postC.y>.01){float kr=length(q),ka=atan(q.y,q.x),seg=mix(6.,24.,postC.y);ka=abs(mod(ka,6.283/seg)-3.1416/seg);q=vec2(cos(ka),sin(ka))*kr;}
 if(postD.x>.01){float wa=postD.x*length(q)*6.,wc=cos(wa),ws=sin(wa);q=mat2(wc,-ws,ws,wc)*q;}
 if(polarMode==1)q=vec2(atan(q.y,q.x)/6.283+.5,length(q)*2.-.5);
 float base=clamp(pattern(q),0.,1.),v=base;
 if(postA.y>0.){
  float bloomRadius=mix(2.,18.,postA.y)/min(resolution.x,resolution.y);
  vec2 bx=vec2(bloomRadius,0.),by=vec2(0.,bloomRadius);
  vec2 bd=vec2(bloomRadius*.7071);
  float glow=pattern(q+bx)+pattern(q-bx)+pattern(q+by)+pattern(q-by);
  glow+=pattern(q+bd)+pattern(q-bd)+pattern(q+vec2(bd.x,-bd.y))+pattern(q+vec2(-bd.x,bd.y));
  glow=clamp(glow*.125,0.,1.);
  v=clamp(base+glow*postA.y*.9,0.,1.);
 }
 if(invertMode==1)v=1.-v;
 v=mix(v,smoothstep(.15,.85,v),postA.x);
 v+=postA.z*(v-smoothstep(.3,.7,v));v=postD.z>0.?floor(v*(2.+postD.z*10.))/(2.+postD.z*10.):v;
 v*=1.-postB.y*smoothstep(.25,.72,length(uv-.5));
 v*=1.-postC.x*(sin(uv.y*resolution.y*3.1416)*.5+.5);
 v=mix(v,abs(dFdx(v))+abs(dFdy(v)),postD.y);
 v*=1.-postE.y*smoothstep(.2,.65,length(uv-.5));
 vec3 mapped=gradient(clamp(v,0.,1.));vec3 col=mix(vec3(v),mapped,postE.x);
 if(postB.x>0.)col=mix(col,vec3(gradient(clamp(v+postB.x*.08,0.,1.)).r,col.g,gradient(clamp(v-postB.x*.08,0.,1.)).b),postB.x);
 if(solidMode==1)col=solidColor;
 outColor=vec4(col,clamp(v,0.,1.));
}`

const hex = (value: string) => {
  const n = parseInt(value.slice(1), 16)
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] as const
}

export class TextureRenderer {
  private source = document.createElement('canvas')
  private gl: WebGL2RenderingContext
  private program: WebGLProgram
  private loc = new Map<string, WebGLUniformLocation>()

  constructor() {
    this.source.width = this.source.height = 768
    const gl = this.source.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('WebGL2 is required')
    this.gl = gl
    const compile = (type: number, code: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, code); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader error')
      return shader
    }
    this.program = gl.createProgram()!
    gl.attachShader(this.program, compile(gl.VERTEX_SHADER, vertex))
    gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, fragment))
    gl.linkProgram(this.program)
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program) ?? 'Link error')
    gl.useProgram(this.program)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)
    const pos = gl.getAttribLocation(this.program, 'p')
    gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
  }

  private uniform(name: string) {
    let location = this.loc.get(name)
    if (!location) {
      location = this.gl.getUniformLocation(this.program, name)!
      this.loc.set(name, location)
    }
    return location
  }

  private drawLayer(layer: Layer, colors: GradientStop[], post: PostSettings, time: number) {
    const gl = this.gl
    const f = (n: string, v: number) => gl.uniform1f(this.uniform(n), v)
    const i = (n: string, v: number) => gl.uniform1i(this.uniform(n), v)
    const v2 = (n: string, a: number, b: number) => gl.uniform2f(this.uniform(n), a, b)
    const v3 = (n: string, v: readonly number[]) => gl.uniform3f(this.uniform(n), v[0], v[1], v[2])
    gl.viewport(0, 0, this.source.width, this.source.height)
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT)
    i('kind', layer.generator.kind); f('seed', layer.seed); f('time', time * layer.speed)
    const parameter = (slot: number) => {
      const key = `p${slot}`
      return layer.params[key] ?? layer.generator.defaults[key] ?? 0
    }
    for (let slot = 0; slot < 6; slot++) f(`p${slot}`, parameter(slot))
    const recipe = layer.generator.recipe
    gl.uniform4f(this.uniform('recipe'), recipe[0], recipe[1], recipe[2], recipe[3])
    v2('offset', layer.transform.x, layer.transform.y); v2('scroll', layer.transform.scrollX, layer.transform.scrollY)
    f('rotation', layer.transform.rotation * Math.PI / 180); f('transformScale', layer.transform.scale)
    i('polarMode', +layer.polar); i('invertMode', +layer.invert); i('solidMode', +layer.solid)
    v2('resolution', this.source.width, this.source.height)
    v3('colorA', hex(colors[0]?.color ?? '#000000')); v3('colorB', hex(colors[Math.floor(colors.length / 2)]?.color ?? '#9b5cff'))
    v3('colorC', hex(colors.at(-1)?.color ?? '#ffffff')); v3('solidColor', hex(layer.solidColor))
    v3('postA', [post.blur, post.bloom, post.sharpen]); v3('postB', [post.chromatic, post.vignette, post.pixelation])
    v3('postC', [post.scanlines, post.kaleidoscope, post.mirror]); v3('postD', [post.swirl, post.edge, post.toon])
    v3('postE', [post.colorMap, post.vignetteMask, 0])
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  render(target: HTMLCanvasElement, layers: Layer[], colors: GradientStop[], post: PostSettings, time: number, size = 768) {
    if (this.source.width !== size) this.source.width = this.source.height = size
    target.width = target.height = size
    const ctx = target.getContext('2d')!
    ctx.clearRect(0, 0, size, size)
    for (const layer of [...layers].reverse()) {
      if (!layer.visible) continue
      this.drawLayer(layer, colors, post, time)
      ctx.save()
      ctx.globalAlpha = layer.opacity
      ctx.globalCompositeOperation = layer.blend === 'Add' ? 'lighter' : layer.blend === 'Multiply' ? 'multiply' :
        layer.blend === 'Screen' ? 'screen' : layer.blend === 'Mask' ? 'destination-in' : 'source-over'
      ctx.drawImage(this.source, 0, 0, size, size)
      ctx.restore()
    }
  }
}
