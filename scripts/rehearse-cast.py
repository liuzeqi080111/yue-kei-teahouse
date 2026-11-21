"""Build standalone rehearsal films from the game's cast. Run in Blender background mode."""
import bpy, sys, json, math, wave, os, re
from bisect import bisect_right
from pathlib import Path
from mathutils import Vector, Quaternion
import numpy as np
from mathutils.bvhtree import BVHTree

ROOT=Path.cwd()
OUT=ROOT/'output'/'ba-review'
FPS=18
V=Vector
# Mouth landmarks measured against an orthographic front render of each actual posed mesh.
# Each row includes a fixed recorded line and its ordered syllables (tones omitted for the rig).
CAST={
 'aqing':(-.001,.868,'street-line-65c5964a033fdf','ji ngo gin lau jau bin zau hau bou gwo gaa ni gin mou fong ze ni gin m hai ngo ge wo'),
 'fang':(0,.873,'street-line-fang-12','nei jau mou daai zoeng ceoi gin daan lai aa'),
 'friend':(0,.873,'fp1-line-home','zou ba pei ni xia lou zhuan zhuan'),
 'regular':(-.003,.877,'story-photo-print','ngo tung fong ze zou zo jaa gei nin gaai fong jing ni zoeng soeng go maan keoi zung sai gan saam ngo bun zoeng dang gwo lai bong keoi lau wai'),
 'aming':(-.002,.866,'story-table-tea','jit naai caa siu tim gei zyu laa'),
 'ale':(-.004,.878,'street-line-3852e2eb415a04','lai tai dip aa maan maan gaan'),
 'buyer':(-.002,.875,'street-line-a176526070a34a','ngo dang gan aa lok lau bei ngo go zek dip'),
 'ling':(-.001,.874,'street-line-ling-18','gaan gin lau ngaam san sin hou lo aa'),
 'lin':(-.004,.867,'street-line-lam-15','co dai tau haa sin go zek dip hou ci gin gwo'),
 'vendor':(-.002,.877,'street-line-b7d05e6879dc36','haang dou hau hot aa ngo ngaam ngaam bou hou zuk ze seoi'),
 'southRice':(-.001,.833,'street-line-0963d3d2d3d48d','aa lam zung lau zyu fu kei hou aa sau pou ngo zau daai maai uk kei zek dip gwo heoi'),
}
def paint(o,color):
 attr=o.data.color_attributes.new(name='Studio color',type='FLOAT_COLOR',domain='POINT')
 rgb=[int(color[i:i+2],16)/255 for i in (0,2,4)]
 for v in attr.data:v.color_srgb=(*rgb,1)
 o.data.color_attributes.active_color=attr
 mat=bpy.data.materials.get('排演 '+color) or bpy.data.materials.new('排演 '+color)
 mat.diffuse_color=tuple(attr.data[0].color)
 o.data.materials.append(mat)
def box(name,loc,size,color):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
 o=bpy.context.object;o.name=name
 for v in o.data.vertices:
  v.co.x*=size[0];v.co.y*=size[1];v.co.z*=size[2]
 paint(o,color);return o
def disk(name,loc,r,h,color):
 bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=r,depth=h,location=loc)
 o=bpy.context.object;o.name=name;paint(o,color);return o
def cloth():
 # Sewn silhouette with folded front quarters, thickness and a visible right cuff.
 poly=[(-.036,0),(-.107,-.025),(-.141,-.167),(-.108,-.177),(-.079,-.092),(-.076,-.255),(.082,-.248),(.078,-.09),(.117,-.17),(.147,-.158),(.107,-.026),(.038,0),(0,-.025)]
 verts=[(x,y,z) for y in [0,.014] for x,z in poly];n=len(poly)
 faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh=bpy.data.meshes.new('Work jacket');mesh.from_pydata(verts,[],[f[::-1] for f in faces]);mesh.update();o=bpy.data.objects.new('面试外套',mesh);bpy.context.collection.objects.link(o);paint(o,'374958')
 for i in range(3):
  b=box('钮扣',(0,-.001,-.065-.057*i),(.009,.005,.009),'bbab85');b.parent=o
 for s in [-1,1]:
  b=box('翻领',(.024*s,-.0017,-.035),(.019,.006,.079),'647682');b.rotation_euler.y=-s*.58;b.parent=o
 b=box('右袖折边',(-.121,.0035,-.154),(.033,.015,.014),'5d6c77');b.rotation_euler=(.16,.26,-.085);b.parent=o
 return o
def bake_texture(o):
 mesh=o.data
 if not mesh.uv_layers.active:return
 uv=mesh.uv_layers.active.data
 # Bake the actual texture into the viewport colour layer for material-preview films.
 ca=mesh.color_attributes.active_color
 if ca and ca.domain=='POINT':
  ori=np.empty((len(ca.data),4),np.float32);ca.data.foreach_get('color',ori.ravel())
 else:ori=None
 loopids=np.empty(len(mesh.loops),np.int32);mesh.loops.foreach_get('vertex_index',loopids)
 rgba=np.ones((len(loopids),4),np.float32)
 if ca:
  if ori is not None:rgba=ori[loopids].copy()
  else:ca.data.foreach_get('color',rgba.ravel())
 mats=[m for m in mesh.materials]
 if not any(m and any(n.type=='TEX_IMAGE' for n in m.node_tree.nodes) for m in mats):return
 coords=np.empty((len(loopids),2),np.float32);uv.foreach_get('uv',coords.ravel())
 for mi,m in enumerate(mats):
  if not m:continue
  nodes=[n for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.colorspace_settings.name=='sRGB']
  if not nodes:continue
  img=nodes[0].image;w,h=img.size;buf=np.empty(w*h*4,np.float32);img.pixels.foreach_get(buf);pixels=buf.reshape(h,w,4)
  ids=np.array([i for poly in mesh.polygons if poly.material_index==mi for i in poly.loop_indices],dtype=np.int32)
  xy=(coords[ids]%1*[w,h]).astype(int);rgba[ids]=pixels[xy[:,1],xy[:,0]]
 layer=mesh.color_attributes.new(name='Review albedo',type='FLOAT_COLOR',domain='CORNER');layer.data.foreach_set('color',rgba.ravel());mesh.color_attributes.active_color=layer
def prepare_workbench_textures(o):
 mesh=o.data
 if not mesh.materials:return
 for mat in mesh.materials:
  if not mat or not mat.node_tree:continue
  base=next((n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and n.image.colorspace_settings.name=='sRGB'),None)
  if base:mat.node_tree.nodes.active=base;return
 ca=mesh.color_attributes.active_color
 if not ca or not mesh.polygons:return
 # Workbench uses one colour source across the shot. Encode the original
 # vertex palette, including the pupils, in a face-colour atlas for that mode.
 rgba=np.empty((len(ca.data),4),'f');ca.data.foreach_get('color',rgba.ravel())
 width=math.ceil(math.sqrt(len(mesh.polygons)))
 px=np.ones((width*width,4),'f');uv=mesh.uv_layers.new(name='试镜色板')
 for poly in mesh.polygons:
  ids=list(poly.vertices) if ca.domain=='POINT' else list(poly.loop_indices)
  px[poly.index]=rgba[ids].mean(axis=0)
  coord=((poly.index%width+.5)/width,(poly.index//width+.5)/width)
  for i in poly.loop_indices:uv.data[i].uv=coord
 mesh.uv_layers.active=uv;uv.active_render=True
 img=bpy.data.images.new(o.name+' 色板',width,width,float_buffer=True);img.pixels.foreach_set(px.ravel());img.pack()
 for mat in mesh.materials:
  if mat and mat.node_tree:
   tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img;tex.interpolation='Closest';mat.node_tree.nodes.active=tex
def phonemes(path):
 with wave.open(str(path),'rb') as recording:
  rate=recording.getframerate()
  samples=np.frombuffer(recording.readframes(recording.getnframes()),dtype='<i2')
  samples=samples.astype(float).reshape(-1,recording.getnchannels()).mean(axis=1)/32768
 starts,shapes=SPEECH_CUES[path.name]
 seq=[]
 for t in np.arange(0,len(samples)/rate,1/FPS):
  i=max(0,bisect_right(starts,t*100)-1)
  pose=np.array(MOUTH_SHAPES.get(shapes[i],MOUTH_SHAPES['X'])) if i<len(shapes) else np.zeros(4)
  if i+1<len(shapes):
   fade=min(3,(starts[i+1]-starts[i])*.4)
   blend=max(0,1-(starts[i+1]-t*100)/fade) if fade else 0
   pose=(1-blend)*pose+blend*np.array(MOUTH_SHAPES[shapes[i+1]])
  span=samples[max(0,int((t-.009)*rate)):int((t+.018)*rate)]
  amplitude=max(0,min(1,(float(np.sqrt(np.mean(span*span)))-.009)*8)) if len(span) else 0
  seq.append(pose*(.38+.62*amplitude) if amplitude else np.zeros(4))
 return seq

# Read the same calibration, mouth poses and timing used by the running game.
cue_source=(ROOT/'npc-voice-manifest.js').read_text(encoding='utf8')
SPEECH_CUES=json.loads(cue_source.split('export const NPC_SPEECH_CUES = ',1)[1].split(';',1)[0])
def browser_table(source,name):
 text=(ROOT/source).read_text(encoding='utf8').split('const '+name+'={',1)[1].split('};',1)[0]
 return {key:tuple(float(v) for v in values.split(',')) for key,values in re.findall(r'(\w+):\[([^\]]+)\]',text)}
LANDMARKS=browser_table('dining-room.js','mouthLandmarks')
MOUTH_SHAPES=browser_table('voice-clips.js','mouthShapes')

def bake_role(role):
 _,_,audio,_=CAST[role];cx,cz,width=LANDMARKS[role];dest=OUT/role;dest.mkdir(parents=True,exist_ok=True)
 bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene
 glb='shopkeepers/southRice' if role=='southRice' else role+'-styled-v3'
 bpy.ops.import_scene.gltf(filepath=str(ROOT/('assets/street/'+glb+'.glb')));s.frame_set(1)
 modelmeshes=[o for o in s.objects if o.type=='MESH' and not o.name.startswith('Icosphere')]
 for o in s.objects:
  if o.name.startswith('Icosphere'):o.hide_render=True
 arm=next((o for o in s.objects if o.type=='ARMATURE'),None)
 if arm:
  original={b.name:b.matrix_basis.copy() for b in arm.pose.bones};arm.animation_data_clear()
  for b in arm.pose.bones:b.matrix_basis=original[b.name]
 bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();mouth=[]
 for o in modelmeshes:
  bake_texture(o)
  if role in ['aqing','fang','southRice']:prepare_workbench_textures(o)
  if len(o.data.vertices)<600 or 'eye' in o.name.lower():continue
  ev=o.evaluated_get(dg);vs=np.empty((len(o.data.vertices),3),'f');ev.data.vertices.foreach_get('co',vs.ravel());M=np.array(o.matrix_world);world=vs@M[:3,:3].T+M[:3,3]
  if not o.data.shape_keys:o.shape_key_add(name='Basis')
  jaw=o.shape_key_add(name='下颌开口');purse=o.shape_key_add(name='圆唇');spread=o.shape_key_add(name='展唇')
  raw=np.empty_like(vs);o.data.vertices.foreach_get('co',raw.ravel())
  x=world[:,0]-cx;z=world[:,2]-cz;front=(world[:,1]<.004)
  edge=np.maximum(0,1-(x/(width*1.66))**2)**1.3
  # Unroll the lower lip from the dark commissure, then taper through the chin.
  lower=np.clip((-.002-z)/.005,0,1)*np.clip((z+.044)/.022,0,1)
  upper=np.clip((z+.0002)/.0024,0,1)*np.clip((.011-z)/.008,0,1)
  delta=np.zeros_like(vs);delta[:,2]=edge*front*(-.0048*lower+.0008*upper);delta[:,1]=edge*front*(.003*lower)
  jaw.data.foreach_set('co',(raw+delta@np.linalg.inv(M[:3,:3]).T).astype('f').ravel())
  delta*=0;rim=front*np.maximum(0,1-(z/.020)**2)*edge
  delta[:,0]=-.22*x*rim;delta[:,1]=-.004*rim
  purse.data.foreach_set('co',(raw+delta@np.linalg.inv(M[:3,:3]).T).astype('f').ravel())
  delta*=0;delta[:,0]=.12*x*rim
  spread.data.foreach_set('co',(raw+delta@np.linalg.inv(M[:3,:3]).T).astype('f').ravel())
  mouth.append((jaw,purse,spread))
 # Model a recessed oral opening with an upper tooth edge and inner tongue.
 # Sample each cast member's own facial surface before attaching it to the head.
 body=max(modelmeshes,key=lambda o:len(o.data.vertices))
 surf=BVHTree.FromObject(body,bpy.context.evaluated_depsgraph_get())
 layers=[]
 for name,color,top,bottom,inset,span in [('口腔','341519',.0009,-.0083,.00028,1),('上齿','c0a689',.00015,-.0015,.00053,.68),('舌面','88474e',-.0055,-.0079,.00048,.57)]:
  verts=[];opened=[];faces=[]
  for i in range(19):
   u=(i-9)/9;xx=cx+width*span*u;arc=max(.03,1-u*u)**.72;zz=cz-.0013*u*u
   hit=surf.ray_cast(body.matrix_world.inverted()@V((xx,-.5,zz)),V((0,1,0)))[0]
   yy=(body.matrix_world@hit).y if hit is not None else -.06
   yy-=inset
   for row,offset in enumerate([top,bottom]):
    verts.append((xx,yy,zz+(1-row)*.00012));opened.append((xx,yy,zz+offset*arc))
   if i:faces.append((2*i-2,2*i-1,2*i+1,2*i))
  m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new(name,m);s.collection.objects.link(o);paint(o,color)
  o.shape_key_add(name='Basis');op=o.shape_key_add(name='发音');op.data.foreach_set('co',np.array(opened,'f').ravel())
  round_key=o.shape_key_add(name='圆唇');spread_key=o.shape_key_add(name='展唇')
  for vert in round_key.data:vert.co.x += -.36*(vert.co.x-cx);vert.co.y-=.002
  for vert in spread_key.data:vert.co.x += .12*(vert.co.x-cx)
  if arm:
   mw=o.matrix_world.copy();o.parent=arm;o.parent_type='BONE';o.parent_bone=next(b.name for b in arm.pose.bones if b.name.endswith(':Head'));bpy.context.view_layer.update();o.matrix_world=mw
  layers.append((o,op,round_key,spread_key))
 seq=phonemes(ROOT/'assets'/(audio+'.wav'));s.render.fps=FPS;s.frame_start=1;s.frame_end=len(seq)+8
 for i,(jaw,rounded,wide,teeth) in enumerate([(0,0,0,0)]*3+seq+[(0,0,0,0)]*5):
  for o,op,purse,spread in layers:
   op.value=jaw;purse.value=rounded;spread.value=wide
   for key in (op,purse,spread):key.keyframe_insert(data_path='value',frame=i+1)
   o.hide_render=bool(jaw<.065 or o.name=='上齿' and teeth<.21)
   o.keyframe_insert(data_path='hide_render',frame=i+1)
  for group in mouth:
   for key,value in zip(group,(jaw,rounded,wide)):
    key.value=value;key.keyframe_insert(data_path='value',frame=i+1)
 allbones={b.name.split(':')[-1]:b for b in arm.pose.bones} if arm else {}
 qt0={k:b.matrix.to_quaternion().copy() for k,b in allbones.items()}
 def turn(b,q):
  mat=b.matrix.copy();loc=mat.translation.copy();mat=q.to_matrix().to_4x4()@mat;mat.translation=loc;b.matrix=mat;bpy.context.view_layer.update()
 def aim(b,child,at):
  axis=child.head-b.head
  if axis.length>.0001:turn(b,axis.rotation_difference(at-b.head))
 def reach(side,at):
  b=allbones;upper=b[side+'Arm'];el=b[side+'ForeArm'];end=b[side+'HandMiddle1'];goal=V(at);axis=goal-upper.head;dist=axis.length;axis.normalize()
  l1=(el.head-upper.head).length;l2=(end.head-el.head).length;d=min(l1+l2-.0002,max(abs(l1-l2)+.0002,dist))
  along=(l1*l1-l2*l2+d*d)/(2*d);hint=V((.65 if side=='Left' else -.65,.25,-1));hint=(hint-axis*hint.dot(axis)).normalized()
  aim(upper,el,upper.head+axis*along+hint*math.sqrt(max(0,l1*l1-along*along)));aim(el,end,goal)
 def prop(name):
  if name=='coat':return cloth()
  if name in ['photo','sleeve','paper']:
   w,h=(.195,.14) if name!='sleeve' else (.21,.21)
   o=box(name,(0,0,0),(w,.009,h),'d6c8a7' if name!='sleeve' else '854637')
   if name=='sleeve':
    p=disk('唱片标签',(0,-.006,0),.062,.002,'d7bd85');p.rotation_euler.x=math.pi/2;p.parent=o
   else:
    for i in range(4):
     p=box('印刷',(0,-.0048,.036-i*.021),(w*(.65 if i%2 else .78),.002,.004),'596363');p.parent=o
   return o
  if name=='vinyl':
   o=disk('黑胶',(0,0,0),.117,.006,'282528');p=disk('中心标',(0,0,.0034),.035,.001,'bb775a');p.parent=o;return o
  if name=='cup':
   rings=[(.027,-.027),(.036,.027),(.033,.027),(.029,-.022)]
   vs=[(r*math.cos(i*math.tau/32),r*math.sin(i*math.tau/32),z) for r,z in rings for i in range(32)]
   fs=[(k*32+i,k*32+(i+1)%32,(k+1)*32+(i+1)%32,(k+1)*32+i) for k in range(3) for i in range(32)]
   fs += [tuple(reversed(range(32))),tuple(range(96,128))]
   m=bpy.data.meshes.new('杯壁');m.from_pydata(vs,[],fs);m.update()
   o=bpy.data.objects.new('瓷杯',m);s.collection.objects.link(o);paint(o,'e7dbbf')
   p=disk('奶茶',(0,0,.023),.033,.0018,'b58756');p.parent=o;return o
  if name=='stone':return disk('棋子',(0,0,0),.011,.006,'322e2d')
  if name=='ladle':
   o=box('长柄勺',(0,0,0),(.009,.009,.12),'9b7d57');b=disk('勺头',(0,-.015,-.059),.021,.011,'8e8a77');b.parent=o;return o
  if name=='tape':return box('裁缝尺',(0,0,0),(.22,.012,.007),'d3b57d')
 # Distinct hand contacts per occupation; props follow the grasping hand.
 job={'aqing':'coat','fang':'coat','regular':'paper','aming':'cup','ale':'vinyl','buyer':'sleeve','ling':'tape','lin':'stone','vendor':'ladle','southRice':'vinyl','friend':None}[role]
 held=prop(job) if job else None
 data=[];phasekeys=[0,.18,.43,.65,.81,1]
 for phase in phasekeys:
  f=1+round(phase*(s.frame_end-1));s.frame_set(f)
  if arm:
   for b in arm.pose.bones:b.matrix_basis=original[b.name]
   bpy.context.view_layer.update();g=math.sin(phase*math.pi);sweep=math.sin(2*math.pi*phase)
   left=(.11,-.135,.59);right=(-.11,-.13,.59)
   if role=='friend':left=(.132,-.06,.47);right=(-.11-.13*g,-.08-.11*g,.52+.18*g)
   elif role in ['fang','aqing']:
    z=.55+(.125 if role=='aqing' else .045)*g;y=-.12-(.055 if role=='fang' else .02)*g
    left=(.112,y,z);right=(-.111+.075*g,y-.015*g,z-(.105 if role=='aqing' else .006)*g)
   elif role=='regular':left=(.093,-.15,.57);right=(-.105+.10*g,-.15,.57+.025*g)
   elif role=='aming':left=(.095,-.10,.52);right=(-.109,-.12-.113*g,.57-.05*g+.017*sweep)
   elif role=='ale':left=(.12,-.15,.56);right=(-.085,-.13-.09*g,.62-.09*g)
   elif role=='buyer':left=(.10,-.135,.58+.09*g);right=(-.103,-.135-.055*g,.58+.09*g)
   elif role=='ling':left=(.116,-.15,.55);right=(-.035-.135*g,-.15,.55)
   elif role=='lin':left=(.12,-.1,.50);right=(-.08+.075*g,-.12-.127*g,.53+.055*sweep)
   elif role=='vendor':left=(.13,-.09,.56);right=(-.015+.037*sweep,-.163+.028*math.cos(phase*2*math.pi),.59)
   tracker=allbones['Head'];turn(tracker,Quaternion((1,0,0),(.08 if role=='friend' else .21)*g));turn(tracker,Quaternion((0,0,1),(.42 if role=='friend' else .10)*sweep))
   reach('Left',left);reach('Right',right)
   for side in ['Left','Right']:
    for finger in ['Index','Middle','Ring','Pinky']:
     key=side+'Hand'+finger+'1'
     if key in allbones:
      b=allbones[key];b.rotation_mode='QUATERNION';b.rotation_quaternion=b.rotation_quaternion@Quaternion((0,0,1),(.13 if side=='Left' else -.13)*g)
   selected=['Head','RightForeArm','LeftForeArm','RightArm','LeftArm']+[k for k in allbones if 'Hand' in k and k.endswith('1')]
   bpy.context.view_layer.update();frame={}
   for k in selected:
    b=allbones[k];b.rotation_mode='QUATERNION';b.keyframe_insert(data_path='rotation_quaternion',frame=f,group='表演')
    diff=b.matrix.to_quaternion()@qt0[k].inverted();frame[k]=[round(v,6) for v in (diff.x,diff.z,-diff.y,diff.w)]
   data.append([phase,frame])
   r=allbones['RightHandMiddle1'].head.copy();l=allbones['LeftHandMiddle1'].head.copy()
   if held:
    if job=='coat':held.location=((l.x+r.x)/2,min(l.y,r.y)-.005,max(l.z,r.z)+.018);held.rotation_euler.y=(.17*g if role=='aqing' else 0)
    elif job in ['sleeve','paper','tape']:held.location=(l+r)*.5;held.rotation_euler.x=.16+.23*g
    elif job=='vinyl':held.location=r+V((.103,-.011,0));held.rotation_euler.x=-.24*(1-g)
    elif job=='cup':held.location=r+V((.011,-.027,-.012))
    else:held.location=r+V((0,-.003,-.004))
    held.keyframe_insert(data_path='location',frame=f);held.keyframe_insert(data_path='rotation_euler',frame=f)
  elif held:
   held.location=(-.032,-.147,.42+.018*math.sin(phase*math.pi));held.keyframe_insert(data_path='location',frame=f)
   for o in modelmeshes:
    if o.data.shape_keys:
     for key in o.data.shape_keys.key_blocks:
      if key.name.startswith('work'):key.value=.4+.35*math.sin(phase*math.pi);key.keyframe_insert(data_path='value',frame=f)
 (dest/'pose.json').write_text(json.dumps(data),encoding='utf8')
 s.world=bpy.data.worlds.new('Studio');s.world.color=(.21,.20,.18);s.render.engine='BLENDER_WORKBENCH';s.display.shading.color_type='VERTEX';s.display.shading.light='STUDIO';s.display.shading.show_specular_highlight=False;s.display.shading.background_type='WORLD'
 if role in ['aqing','fang','southRice']:s.display.shading.color_type='TEXTURE'
 s.view_settings.view_transform='Standard';s.render.resolution_percentage=100;s.render.image_settings.file_format='JPEG';s.render.image_settings.quality=90
 cam=bpy.data.objects.new('预览镜头',bpy.data.cameras.new('CAM'));s.collection.objects.link(cam);s.camera=cam;cam.data.type='ORTHO'
 def placecam(target,angle,scale):
  t=V(target);cam.location=t+V((math.sin(angle)*2,-math.cos(angle)*2,.12));cam.rotation_euler=(t-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
 for mode in ['action','face']:
  if mode=='action':placecam((0,-.02,.62),.28,.90);s.render.resolution_x=480;s.render.resolution_y=440
  else:placecam((cx,-.02,cz+.026),-.20,.243);s.render.resolution_x=400;s.render.resolution_y=440
  if mode=='action':
   s.frame_set(1);bpy.context.preferences.filepaths.save_version=0
   bpy.ops.wm.save_as_mainfile(filepath=str(dest/(role+'.blend')),compress=True)
  folder=dest/mode;folder.mkdir(exist_ok=True);s.render.filepath=str(folder)+'/';bpy.ops.render.render(animation=True)
 qa_path=os.environ.get('BLENDER_QA_SCRIPTS')
 if qa_path:
  sys.path.insert(0,qa_path)
  import qa_check,review_shots
  s.frame_set(int(s.frame_end*.45))
  props=[held.name]+[o.name for o in held.children_recursive] if held else []
  # The three facial films are separate deforming surfaces attached to the skin.
  groups=([props] if props else [])+[[o.name] for o,*_ in layers]
  reports=[qa_check.run(objects=g,profile='render',uv=False,eps=.00009,tol=.0018) for g in groups]
  (dest/'qa.json').write_text(json.dumps(reports,ensure_ascii=False,default=str),encoding='utf8')
  for shade in ['random','wire']:
   review_shots.run(objects=props or [body.name],out=str(dest/(shade+'.png')),views=['front','right','three_quarter'],mode=shade,res=160)
 print('FINISHED_ROLE',role,flush=True)
if __name__=='__main__':
 for role in (sys.argv[sys.argv.index('--')+1:] or list(CAST)):bake_role(role)

