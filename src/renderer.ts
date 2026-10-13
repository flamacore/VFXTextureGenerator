import type { GradientStop, Layer, PostSettings } from './models'
import { identityCorners } from './models'

export const PROFILE_COUNT = 28

const vertex = `#version 300 es
in vec2 p; out vec2 uv;
void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`

const fragmentPreamble = `#version 300 es
precision highp float;
in vec2 uv; out vec4 outColor;
uniform vec2 resolution, offset, scroll, uvOffset, corner0, corner1, corner2, corner3;
uniform float time, rotation, transformScale, p0, p1, p2, p3, p4, p5, seed, cornerFeather, cornerRound;
uniform int kind, polarMode, invertMode, solidMode, seamlessMode, warpMode, uvRepeatMode;
uniform vec4 recipe;
uniform vec3 gradientColors[8],solidColor;
uniform float gradientPositions[8];
uniform int gradientCount;
uniform vec3 postA,postB,postC,postD,postE;

const float TAU=6.283185307179586;
float positiveInt(float x){return max(1.,floor(abs(x)+.5));}
vec2 wrapTorus(vec2 p){return fract(p+.5)-.5;}
float torusRadius(vec2 p){vec2 d=sin(3.141592653589793*(p-.5));return length(d)*.707106781186548;}
vec2 quarterTurn(vec2 p,float turns){
 float t=mod(turns,4.);
 if(t<.5)return p;
 if(t<1.5)return vec2(-p.y,p.x);
 if(t<2.5)return -p;
 return vec2(p.y,-p.x);
}
float aa(float d,float w){return 1.-smoothstep(0.,max(.0005,w),d);}
float smax(float a,float b,float k){
 k=max(k,1e-5);
 float h=clamp(.5+.5*(b-a)/k,0.,1.);
 return mix(a,b,h)+k*h*(1.-h);
}
float lineSD(vec2 p,vec2 a,vec2 b){
 vec2 e=b-a;float l=max(length(e),1e-8);
 return dot(p-a,vec2(e.y,-e.x)/l);
}
vec2 invBilinear(vec2 p,vec2 a,vec2 b,vec2 c,vec2 d){
 vec2 e=b-a,f=d-a,g=a-b+c-d,st=vec2(.5);
 for(int j=0;j<12;j++){
  vec2 residual=a+e*st.x+f*st.y+g*st.x*st.y-p;
  vec2 du=e+g*st.y,dv=f+g*st.x;float det=du.x*dv.y-du.y*dv.x;
  if(abs(det)<1e-7)break;
  st-=vec2(residual.x*dv.y-residual.y*dv.x,du.x*residual.y-du.y*residual.x)/det;
 }
 return st;
}
float quadMask(vec2 p,float feather,float roundness){
 float k=roundness*.5;
 float sd=smax(smax(lineSD(p,corner0,corner1),lineSD(p,corner1,corner2),k),smax(lineSD(p,corner2,corner3),lineSD(p,corner3,corner0),k),k);
 return 1.-smoothstep(0.,max(feather*2.,.00015),sd);
}`

const glslHash = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+seed)*43758.5453);}
vec2 wrapIndex(vec2 p,vec2 period){return mod(mod(p,period)+period,period);}
float periodicHash(vec2 p,vec2 period){return hash(wrapIndex(p,period));}`

const glslNoise = `
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float periodicNoise(vec2 p,vec2 period){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(periodicHash(i,period),periodicHash(i+vec2(1,0),period),f.x),
            mix(periodicHash(i+vec2(0,1),period),periodicHash(i+1.,period),f.x),f.y);
}`

const glslFbm = `
float fbm(vec2 p,float oct,float lac,float gain){float v=0.,a=.5;for(int i=0;i<8;i++){if(float(i)>=oct)break;v+=a*noise(p);p=p*lac+vec2(1.7,2.3);a*=gain;}return v;}
float periodicFbm(vec2 p,vec2 period,float oct,float lac,float gain){
 float v=0.,a=.5,l=positiveInt(lac);
 for(int i=0;i<8;i++){if(float(i)>=oct)break;v+=a*periodicNoise(p,period);p=p*l+vec2(1.7,2.3);period*=l;a*=gain;}
 return v;
}`

const glslCell = `
vec2 cell(vec2 p){vec2 i=floor(p),f=fract(p);float d1=9.,d2=9.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(x,y),o=vec2(hash(i+g),hash(i+g+19.));float d=length(g+mix(vec2(.5),o,p2)-f);if(d<d1){d2=d1;d1=d;}else d2=min(d2,d);}return vec2(d1,d2);}
vec2 periodicCell(vec2 p,vec2 period){
 vec2 i=floor(p),f=fract(p);float d1=9.,d2=9.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 g=vec2(x,y),id=i+g;
  vec2 o=vec2(periodicHash(id,period),periodicHash(id+19.,period));
  float d=length(g+mix(vec2(.5),o,p2)-f);
  if(d<d1){d2=d1;d1=d;}else d2=min(d2,d);
 }
 return vec2(d1,d2);
}`

const glslPolygon = `
float polygon(vec2 q,float sides,float radius){
 float count=clamp(floor(sides),3.,16.),nearest=100.;bool inside=true;
 for(int i=0;i<16;i++){
  if(float(i)>=count)break;
  float a=TAU*float(i)/count,b=TAU*(float(i)+1.)/count;
  vec2 v=radius*vec2(cos(a),sin(a)),edge=radius*vec2(cos(b),sin(b))-v,rel=q-v;
  float h=clamp(dot(rel,edge)/max(dot(edge,edge),1e-8),0.,1.);
  nearest=min(nearest,length(rel-edge*h));
  if(edge.x*rel.y-edge.y*rel.x<0.)inside=false;
 }
 return inside?-nearest:nearest;
}`

const glslEven = `
float compatibleEven(float x){return 2.*max(1.,floor(abs(x)*.5+.5));}`

const patternHeader = `
float pattern(vec2 q){
 float r=length(q),a=atan(q.y,q.x),phase=time*p5;
`

// Each entry is a distinct algorithm. Parameters map directly to catalog slots.
const patternBodies = [
 `float d=length(q*vec2(1./p2,1.));return pow(aa(d-p0,p1),p4)*p3;`,
 `float d=abs(r-(p0+p3*sin(a*p2+phase)));return aa(d-p1,p4);`,
 `float rays=pow(.5+.5*cos(a*p1+phase),p2);return max(exp(-r/p4),rays*exp(-pow(r/p0,p3)*3.));`,
 `float d=polygon(q,p1,max(.001,p0-p3))-p3;return p4>.0001?aa(abs(d)-p4,p2):aa(d,p2);`,
 `vec2 halfSize=vec2(p0,p1)*.5;float round=min(p2,min(halfSize.x,halfSize.y));vec2 z=abs(q)-halfSize+round;
 float d=length(max(z,0.))+min(max(z.x,z.y),0.)-round;return aa(d,p3)*(1.-p4*clamp(1.+d/max(.01,min(halfSize.x,halfSize.y)),0.,1.));`,
 `float wave=abs(sin((a*p1+r/p0*p2+phase+fbm(q*5.,4.,2.,.5)*p4)*.5));return aa(wave-p3,.03)*aa(r-p0,.04);`,
 `vec2 z=q*vec2(p0,p0*p2);vec2 d=abs(fract(z+.5)-.5);return aa(min(d.x,d.y)-p1,p3);`,
 `float cycles=seamlessMode==1?compatibleEven(p0):p0;vec2 z=q*cycles;float row=floor(z.y);z.x+=mod(row,2.)*p2;
 vec2 id=floor(z),f=fract(z)-.5;float h=periodicHash(id,vec2(cycles));float h2=periodicHash(id+31.,vec2(cycles));
 return aa(length(f)-p1*(1.+p4*(h-.5)),p3)*step(1.-p5,h2);`,
 `float cycles=seamlessMode==1?positiveInt(p0):p0;float wave=p2*sin(TAU*p3*q.y+phase);return aa(abs(fract(q.x*cycles+wave)-.5)-p1*.5,p4);`,
 `float freq=seamlessMode==1?positiveInt(p0):p0;float n=seamlessMode==1?periodicFbm(q*freq+phase,vec2(freq),p1,p2,p3):fbm(q*freq+phase,p1,p2,p3);
 float norm=.5*(1.-pow(p3,p1))/(1.-p3);return pow(clamp(n/max(.001,norm),0.,1.),p4);`,
 `float freq=seamlessMode==1?positiveInt(p0):p0;vec2 z=q*freq;
 for(int j=0;j<8;j++){if(float(j)>=p2)break;float n=periodicNoise(z+phase,vec2(freq));z+=p1*vec2(sin(TAU*z.y/freq+n*TAU+phase),cos(TAU*z.x/freq-n*TAU-phase))*.22;}
 float n=periodicFbm(z+phase,vec2(freq),4.,2.,.5);float ridge=1.-abs(2.*n-1.);return pow(smoothstep(p3,1.,ridge),p4);`,
 `float freq=seamlessMode==1?positiveInt(p0):p0;vec2 cp=q*freq+phase*.15;vec2 c=seamlessMode==1?periodicCell(cp,vec2(freq)):cell(cp);
 return mix(aa(c.y-c.x-p1,p3),1.-smoothstep(0.,.8,c.x),p4);`,
 `float cycles=seamlessMode==1?positiveInt(p0):p0;vec2 z=q*cycles;float row=floor(z.y),clock=floor(phase*8.);
 float gate=periodicHash(vec2(row,clock),vec2(cycles));z.x+=p3*(gate-.5)*cycles;
 float groups=max(1.,floor(cycles/p2));float block=periodicHash(vec2(floor(z.x/cycles*groups),row+clock),vec2(groups,cycles));
 float n=periodicNoise(q*cycles,vec2(cycles));return smoothstep(p1-.04,p1+.04,mix(block,n,p4));`,
 `float d=abs(q.y);float pulse=.75+.25*cos(q.x*p3*TAU-phase*4.);float n=1.+p4*(noise(vec2(q.x*20.,phase))-.5);
 return (exp(-d/p1)+.45*exp(-pow(d/p0,p2)))*pulse*n;`,
 `float sector=TAU/p1;float angle=mod(a+1.57079632679+sector*.5,sector)-sector*.5;
 vec2 v0=vec2(p0,0.),v1=vec2(cos(sector*.5),sin(sector*.5))*p0*p2;vec2 z=vec2(cos(abs(angle)),sin(abs(angle)))*r;
 vec2 edge=v1-v0;float d=(edge.x*(z.y-v0.y)-edge.y*(z.x-v0.x))/length(edge);d=-d;
 return p4>.0001?aa(abs(d)-p4,p3):aa(d,p3);`,
 `vec2 z=abs(q)/vec2(p0,p1);float bound=1.-max(0.,(z.y-(1.-p3))/p3);float d=max(z.y-1.,z.x-bound)*min(p0,p1);
 float facet=q.x<0.? .45:.9;facet=mix(facet,.7,step(z.x,z.y*.6));return aa(d,p4)*mix(1.,facet,p2);`,
 `float h=(q.y+.48)/p1;vec2 z=vec2(q.x*p3/p0*.3,h*p3-phase*3.);
 float n=fbm(z,5.,2.,.5);float tongues=(n-.5)*p2+sin(q.x/p0*p3*3.+phase*2.)*.12*p2;
 float envelope=1.-abs(q.x)/p0-h+ tongues;float detail=fbm(z*2.+17.,3.,2.,.5);
 return smoothstep(0.,.12,envelope)*smoothstep(0.,.08,h)*(1.-smoothstep(.85,1.1,h))*clamp(.65+detail*p4-h*.45,0.,1.);`,
 `float freq=seamlessMode==1?positiveInt(p0):p0;vec2 z=q*freq*TAU;
 float n=periodicNoise(q*freq+phase,vec2(freq));z+=p2*n*TAU;
 float w=sin(z.x+phase)+sin(z.y-phase)+p3*sin(z.x+z.y+phase*.7+seed*.01);
 return pow(exp(-abs(w)/p1),p4);`,
 `float y=q.y/p0+.5;float clock=floor(phase*6.);float jag=(noise(vec2(y*p3,clock))-.5)*p2;
 float d=abs(q.x-jag);float branch=abs(q.x-jag-(y-.5)*p4*2.);branch+=max(0.,.45-y);
 float arc=min(d,branch);return (exp(-arc/p1)+.25*exp(-arc/(p1*4.)))*aa(abs(q.y)-p0*.5,.02);`,
 `float outer=aa(r-p0,p3);float cut=aa(length(q-vec2(p1,0.))-p0*p2,p3);return outer*(1.-cut);`,
 `float lo=min(p0,p1),hi=max(p0,p1);return pow(clamp((q.x+.5-lo)/max(.001,hi-lo),0.,1.),p2);`,
 `float freq=seamlessMode==1?compatibleEven(p0):p0;vec2 f=fract(q*freq*.5);vec2 v=smoothstep(vec2(p1-p2),vec2(p1+p2),f);return abs(v.x-v.y);`,
 `float field=0.;for(int i=0;i<12;i++){if(float(i)>=p1)break;float id=float(i),h=hash(vec2(id));vec2 center=vec2(cos(h*TAU+phase),sin(id*2.4+phase*.8))*p0;
 field+=p2*p2/max(.0001,dot(q-center,q-center));}return smoothstep(p3,p3+p4,field);`,
 `float n=fbm(q*p2+phase,4.,2.,.5);float rings=abs(fract(r*p0+n*p1)-.5);return aa(rings-p3*.5,p4);`,
 `float freq=seamlessMode==1?positiveInt(p0):p0;float h=periodicHash(floor(q*freq)+vec2(floor(time*p3*8.)),vec2(freq));return pow(smoothstep(p1,1.,h),p2);`,
 `vec2 halfSize=vec2(p0,p1);float round=min(p2,p1);vec2 z1=abs(q)-halfSize+round,z2=abs(q)-halfSize.yx+round;
 float d1=length(max(z1,0.))+min(max(z1.x,z1.y),0.)-round;
 float d2=length(max(z2,0.))+min(max(z2.x,z2.y),0.)-round;return aa(min(d1,d2),p3);`,
 `float h=q.y+.48;vec2 z=vec2(q.x*p2,h*p2-phase*2.);float n=fbm(z,5.,2.,.5);
 float drift=(noise(vec2(h*3.,phase))-.5)*p4*2.;float width=p0+h*p1;
 float envelope=exp(-pow(abs(q.x-drift)/max(.01,width),2.)*3.);
 float wisps=smoothstep(.18,.7,n);return clamp(envelope*wisps*p3,0.,1.)*smoothstep(0.,.08,h)*(1.-smoothstep(.65,1.,h));`,
 `float ribbon=-.15+p2*sin(q.x*p3*TAU+phase)+p2*.3*sin(q.x*p3*TAU*2.-phase);
 float height=q.y-ribbon;float streak=.2+.8*noise(vec2(q.x*p4+phase,phase*.3));
 float curtain=exp(-max(0.,height)/p0)*smoothstep(-p1,p1,height)*streak;
 float edge=exp(-abs(height)/p1);return max(curtain*.8,edge)*aa(abs(q.x)-.43,.06);`,
]

const fragmentMain = `
}
vec3 gradient(float x){
 vec3 previous=gradientColors[0];float position=gradientPositions[0];
 if(x<=position)return previous;
 for(int i=1;i<8;i++){
  if(i>=gradientCount)break;
  float next=gradientPositions[i];
  if(x<=next)return mix(previous,gradientColors[i],clamp((x-position)/max(.00001,next-position),0.,1.));
  previous=gradientColors[i];position=next;
 }
 return previous;
}
float samplePattern(vec2 q){return clamp(pattern(seamlessMode==1?wrapTorus(q):q),0.,1.);}
float softPattern(vec2 q,float radius){
 vec2 dx=vec2(radius,0.),dy=vec2(0.,radius);
 return (samplePattern(q)*4.+(samplePattern(q+dx)+samplePattern(q-dx)+samplePattern(q+dy)+samplePattern(q-dy))*2.
  +samplePattern(q+dx+dy)+samplePattern(q+dx-dy)+samplePattern(q-dx+dy)+samplePattern(q-dx-dy))/16.;
}
void main(){
 vec2 sampleUV=uv;
 if(postB.z>0.){
  float pixels=floor(mix(400.,20.,postB.z)+.5);
  sampleUV=mix(sampleUV,(floor(sampleUV*pixels)+.5)/pixels,postB.z);
 }
 float warpMask=1.;
 if(warpMode==1){
  vec2 st=invBilinear(sampleUV,corner0,corner1,corner2,corner3);
  warpMask=quadMask(sampleUV,cornerFeather,cornerRound);
  if(warpMask<=0.){outColor=vec4(0);return;}
  sampleUV=clamp(st,0.,1.);
 }
 if(uvRepeatMode==1) sampleUV=fract(sampleUV-uvOffset);
 else {
  sampleUV=sampleUV-uvOffset;
  if(any(lessThan(sampleUV,vec2(0.)))||any(greaterThan(sampleUV,vec2(1.)))){outColor=vec4(0);return;}
 }
 vec2 q;
 if(seamlessMode==1){
  float scaleCycles=positiveInt(1./max(.02,abs(transformScale)));
  float turns=floor(rotation/1.570796326794897+.5);
  q=wrapTorus(quarterTurn((sampleUV-offset+scroll*time)*scaleCycles,turns));
 }else{
  q=(sampleUV-.5-offset);float cs=cos(rotation),sn=sin(rotation);q=mat2(cs,-sn,sn,cs)*q/max(.02,transformScale);q+=scroll*time;
  if(postC.z>.01)q.x=mix(q.x,abs(q.x),postC.z);
  if(postC.y>.01){float kr=length(q),ka=atan(q.y,q.x),seg=mix(6.,24.,postC.y);ka=abs(mod(ka,6.283/seg)-3.1416/seg);q=vec2(cos(ka),sin(ka))*kr;}
  if(postD.x>.01){float wa=postD.x*length(q)*6.,wc=cos(wa),ws=sin(wa);q=mat2(wc,-ws,ws,wc)*q;}
  if(polarMode==1)q=vec2(atan(q.y,q.x)/6.283+.5,length(q)*2.-.5);
 }
 float base=clamp(pattern(q),0.,1.),v=base;
 if(postA.x>0.)v=softPattern(q,mix(.5,8.,postA.x)/min(resolution.x,resolution.y));
 if(postA.z>0.)v=clamp(v+(base-softPattern(q,1.5/min(resolution.x,resolution.y)))*postA.z*2.,0.,1.);
 if(postA.y>0.){
  float bloomRadius=mix(2.,18.,postA.y)/min(resolution.x,resolution.y);
  vec2 bx=vec2(bloomRadius,0.),by=vec2(0.,bloomRadius);
  vec2 bd=vec2(bloomRadius*.7071);
  float glow;
  if(seamlessMode==1){
   glow=pattern(wrapTorus(q+bx))+pattern(wrapTorus(q-bx))+pattern(wrapTorus(q+by))+pattern(wrapTorus(q-by));
   glow+=pattern(wrapTorus(q+bd))+pattern(wrapTorus(q-bd))+pattern(wrapTorus(q+vec2(bd.x,-bd.y)))+pattern(wrapTorus(q+vec2(-bd.x,bd.y)));
  }else{
   glow=pattern(q+bx)+pattern(q-bx)+pattern(q+by)+pattern(q-by);
   glow+=pattern(q+bd)+pattern(q-bd)+pattern(q+vec2(bd.x,-bd.y))+pattern(q+vec2(-bd.x,bd.y));
  }
  glow=clamp(glow*.125,0.,1.);
  v=clamp(v+glow*postA.y*.9,0.,1.);
 }
 if(invertMode==1)v=1.-v;
 v=postD.z>0.?floor(v*(2.+postD.z*10.))/(2.+postD.z*10.):v;
 float screenRadius=seamlessMode==1?torusRadius(uv):length(uv-.5);
 v*=1.-postB.y*smoothstep(.25,.72,screenRadius);
 float scan=seamlessMode==1
  ?cos(TAU*positiveInt(resolution.y*.5)*uv.y)*.5+.5
  :sin(uv.y*resolution.y*3.1416)*.5+.5;
 v*=1.-postC.x*scan;
 v=mix(v,abs(dFdx(v))+abs(dFdy(v)),postD.y);
 v*=1.-postE.y*smoothstep(.2,.65,screenRadius);
 vec3 mapped=gradient(clamp(v,0.,1.));vec3 col=mix(vec3(v),mapped,postE.x);
 if(solidMode==1)col=solidColor;
 if(postB.x>0.){
  vec2 shift=vec2(postB.x*12./resolution.x,0.);
  float right=samplePattern(q+shift),left=samplePattern(q-shift);
  if(invertMode==1){right=1.-right;left=1.-left;}
  vec3 rightColor=solidMode==1?solidColor:mix(vec3(right),gradient(right),postE.x);
  vec3 leftColor=solidMode==1?solidColor:mix(vec3(left),gradient(left),postE.x);
  float coverage=max(v,max(right,left));
  col=vec3(rightColor.r*right,col.g*v,leftColor.b*left)/max(.00001,coverage);
  v=coverage;
 }
 v*=warpMask;
 outColor=vec4(col,clamp(v,0.,1.));
}`

const simpleProfiles = new Set([0, 1, 2, 4, 6, 8, 14, 15, 19, 20, 21])
const helpersForProfile = Array.from({ length: PROFILE_COUNT }, (_, index) => {
 if (index === 3) return [glslPolygon]
 if (index === 6 || index === 21) return [glslEven]
 if (simpleProfiles.has(index)) return []
 return [glslHash, glslNoise, glslFbm, glslCell, glslEven]
})

export function fragmentShaderForProfile(profile: number) {
  const index = Math.max(0, Math.min(PROFILE_COUNT - 1, profile | 0))
  return fragmentPreamble + helpersForProfile[index].join('') + patternHeader + patternBodies[index] + fragmentMain
}

export const parseHexColor = (value: string) => {
  const raw = value.replace(/^#/, '')
  const expanded = raw.length === 3 ? [...raw].map((c) => c + c).join('') : raw
  const n = /^[\da-f]{6}$/i.test(expanded) ? parseInt(expanded, 16) : 0xffffff
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] as const
}

const profileOf = (layer: Layer) => Math.max(0, Math.min(PROFILE_COUNT - 1, layer.generator.recipe[2] | 0))

const nearly = (a: number, b: number) => Math.abs(a - b) < 1e-4
const usesWarp = (layer: Layer) => {
  const { feather, roundness, corners } = layer.transform
  if (feather > 1e-4 || roundness > 1e-4) return true
  return identityCorners.some((point, index) => !nearly(corners[index].x, point.x) || !nearly(corners[index].y, point.y))
}

export class TextureRenderer {
  private source = document.createElement('canvas')
  private gl: WebGL2RenderingContext
  private vertexShader: WebGLShader
  private programs = new Map<number, WebGLProgram>()
  private locations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>()
  private activeProgram: WebGLProgram | null = null
  private prefetchStarted = false

  constructor() {
    this.source.width = this.source.height = 768
    const gl = this.source.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('WebGL2 is required')
    this.gl = gl
    this.vertexShader = this.compile(gl.VERTEX_SHADER, vertex)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW)
  }

  private compile(type: number, code: string) {
    const gl = this.gl
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, code); gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader error')
    return shader
  }

  private ensureProgram(profile: number) {
    const index = Math.max(0, Math.min(PROFILE_COUNT - 1, profile | 0))
    const cached = this.programs.get(index)
    if (cached) return cached
    const gl = this.gl
    const fragment = this.compile(gl.FRAGMENT_SHADER, fragmentShaderForProfile(index))
    const program = gl.createProgram()!
    gl.attachShader(program, this.vertexShader)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Link error')
    this.programs.set(index, program)
    return program
  }

  private useProfile(profile: number) {
    const program = this.ensureProgram(profile)
    if (this.activeProgram === program) return
    const gl = this.gl
    gl.useProgram(program)
    this.activeProgram = program
    const pos = gl.getAttribLocation(program, 'p')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
  }

  private uniform(name: string) {
    const program = this.activeProgram!
    let map = this.locations.get(program)
    if (!map) {
      map = new Map()
      this.locations.set(program, map)
    }
    if (!map.has(name)) map.set(name, this.gl.getUniformLocation(program, name))
    return map.get(name)!
  }

  prefetchProfiles() {
    if (this.prefetchStarted || this.programs.size >= PROFILE_COUNT) return
    this.prefetchStarted = true
    const compileNext = () => {
      for (let i = 0; i < PROFILE_COUNT; i++) {
        if (this.programs.has(i)) continue
        this.ensureProgram(i)
        this.schedulePrefetch(compileNext)
        return
      }
    }
    window.setTimeout(() => this.schedulePrefetch(compileNext), 1200)
  }

  private schedulePrefetch(callback: () => void) {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => callback())
    else window.setTimeout(callback, 400)
  }

  private drawLayer(layer: Layer, colors: GradientStop[], post: PostSettings, time: number) {
    const gl = this.gl
    this.useProfile(profileOf(layer))
    const f = (n: string, v: number) => gl.uniform1f(this.uniform(n), v)
    const i = (n: string, v: number) => gl.uniform1i(this.uniform(n), v)
    const v2 = (n: string, a: number, b: number) => gl.uniform2f(this.uniform(n), a, b)
    const v3 = (n: string, v: readonly number[]) => gl.uniform3f(this.uniform(n), v[0], v[1], v[2])
    gl.viewport(0, 0, this.source.width, this.source.height)
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT)
    i('kind', layer.generator.kind); i('seamlessMode', +(layer.seamless && layer.generator.tileable))
    f('seed', layer.seed); f('time', time * layer.speed)
    const parameter = (slot: number) => {
      const key = `p${slot}`
      return layer.params[key] ?? layer.generator.defaults[key] ?? 0
    }
    for (let slot = 0; slot < 6; slot++) f(`p${slot}`, parameter(slot))
    const recipe = layer.generator.recipe
    gl.uniform4f(this.uniform('recipe'), recipe[0], recipe[1], recipe[2], recipe[3])
    v2('offset', layer.transform.x, layer.transform.y); v2('scroll', layer.transform.scrollX, layer.transform.scrollY)
    v2('uvOffset', layer.transform.u, layer.transform.v)
    i('uvRepeatMode', +layer.transform.uvRepeat)
    const [bl, br, tr, tl] = layer.transform.corners
    v2('corner0', bl.x, bl.y); v2('corner1', br.x, br.y); v2('corner2', tr.x, tr.y); v2('corner3', tl.x, tl.y)
    f('cornerFeather', layer.transform.feather); f('cornerRound', layer.transform.roundness)
    i('warpMode', +usesWarp(layer))
    f('rotation', layer.transform.rotation * Math.PI / 180); f('transformScale', layer.transform.scale)
    i('polarMode', +layer.polar); i('invertMode', +layer.invert); i('solidMode', +layer.solid)
    v2('resolution', this.source.width, this.source.height)
    const stops = [...colors].sort((a, b) => a.position - b.position).slice(0, 8)
    if (!stops.length) stops.push({ id: 'fallback', position: 0, color: '#ffffff' })
    i('gradientCount', stops.length)
    for (let index = 0; index < stops.length; index++) {
      v3(`gradientColors[${index}]`, parseHexColor(stops[index].color))
      f(`gradientPositions[${index}]`, stops[index].position)
    }
    v3('solidColor', parseHexColor(layer.solidColor))
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
