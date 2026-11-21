"""Block the continuous two-person exchange using one shared jacket and both actual armatures."""
import bpy, runpy, math
from pathlib import Path
from mathutils import Vector as V, Quaternion
lib=runpy.run_path(str(Path.cwd()/'scripts/rehearse-cast.py'))
root=Path.cwd()/'output/ba-review';out=root/'handoff';out.mkdir(exist_ok=True)
s=bpy.context.scene
bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene
def actor(role,x,yaw):
 # Character object names vary between GLB suppliers. Load all render meshes with their parents.
 with bpy.data.libraries.load(str(root/role/(role+'.blend')),link=False) as (src,dst):
  dst.objects=src.objects
 objects=list(dst.objects);arm=next(o for o in objects if o and o.type=='ARMATURE')
 model=[o for o in objects if o and (o==arm or (o.type=='MESH' and len(o.data.vertices)>128 and not o.name.startswith('Icosphere')))]
 transform=bpy.data.objects.new(role,None);s.collection.objects.link(transform)
 family=set(model)
 for o in model:
  parent=o.parent
  while parent:
   family.add(parent);parent=parent.parent
 for o in family:
  if o.name not in s.objects:s.collection.objects.link(o)
 for o in family:
  if not o.parent:o.parent=transform
 transform.location.x=x;transform.rotation_euler.z=yaw
 arm.animation_data_clear()
 for obj in model:
  if obj.type=='MESH' and obj.data.shape_keys:
   obj.data.shape_keys.animation_data_clear()
   for k in obj.data.shape_keys.key_blocks[1:]:k.value=0
 bpy.context.view_layer.update()
 bones={b.name.split(':')[-1]:b for b in arm.pose.bones}
 return arm,bones,{k:b.matrix_basis.copy() for k,b in bones.items()}
fang=actor('fang',-.235,1.12);qing=actor('aqing',.235,-1.12)
coat=lib['cloth']()
def aim(b,child,goal):
 m=b.matrix.copy();q=(child.head-b.head).rotation_difference(goal-b.head);pos=m.translation.copy();m=q.to_matrix().to_4x4()@m;m.translation=pos;b.matrix=m;bpy.context.view_layer.update()
def reach(model,side,target):
 arm,bones,_=model;b=bones[side+'Arm'];el=bones[side+'ForeArm'];finger=bones[side+'HandMiddle1']
 target=arm.matrix_world.inverted()@V(target);axis=target-b.head;n=axis.length;axis.normalize();l=(el.head-b.head).length;r=(finger.head-el.head).length;d=max(abs(l-r)+.0001,min(l+r-.0001,n));a=(l*l-r*r+d*d)/(2*d);pole=V((.6 if side=='Left' else -.6,.1,-1));pole=(pole-axis*pole.dot(axis)).normalized();aim(b,el,b.head+axis*a+pole*math.sqrt(max(0,l*l-a*a)));aim(el,finger,target)
def blend(a,b,t):return V(a).lerp(V(b),t)
for f,x,z,accept,release,tip in [(1,-.112,.55,0,0,0),(14,-.076,.58,.10,0,0),(25,-.015,.58,.75,0,0),(32,.005,.58,1,0,0),(38,.025,.58,1,.19,0),(50,.094,.61,1,.82,.12),(67,.113,.66,1,1,.33),(80,.102,.643,1,1,.27)]:
 s.frame_set(f)
 for arm,bones,rest in [fang,qing]:
  for name,b in bones.items():b.matrix_basis=rest[name]
 bpy.context.view_layer.update();coat.location=(x,-.135,z);coat.rotation_euler=(.03,tip,.21)
 bpy.context.view_layer.update()
 for role,model in [('fang',fang),('qing',qing)]:
  arm,bones,_=model
  for side in ['Left','Right']:
   if role=='fang':
    hold=coat.matrix_world@V((-.08 if side=='Right' else .058,.009,-.024))
    target=blend(hold,(-.22 if side=='Right' else -.165,-.065,.46),release)
   else:
    hold=coat.matrix_world@V((-.12 if side=='Right' else .079,-.008,-.148 if side=='Right' else -.024))
    target=blend((.20 if side=='Right' else .26,-.08,.48),hold,accept)
   reach(model,side,target)
  h=bones['Head'];h.rotation_mode='QUATERNION';h.rotation_quaternion=h.rotation_quaternion@Quaternion((1,0,0),(.08 if role=='fang' else .35)*accept)
  for n in ['RightArm','LeftArm','RightForeArm','LeftForeArm','Head']:
   b=bones[n];b.rotation_mode='QUATERNION';b.keyframe_insert(data_path='rotation_quaternion',frame=f)
 coat.keyframe_insert(data_path='location',frame=f);coat.keyframe_insert(data_path='rotation_euler',frame=f)
s.frame_start=1;s.frame_end=80;s.render.fps=18;s.render.engine='BLENDER_WORKBENCH';s.display.shading.color_type='VERTEX';s.display.shading.light='STUDIO';s.display.shading.show_specular_highlight=False;s.world=bpy.data.worlds.new('Studio');s.world.color=(.22,.20,.18);s.display.shading.background_type='WORLD';s.view_settings.view_transform='Standard'
s.display.shading.color_type='TEXTURE'
cam=bpy.data.objects.new('交接镜头',bpy.data.cameras.new('camera'));s.collection.objects.link(cam);s.camera=cam;cam.data.type='ORTHO'
s.render.resolution_percentage=100;s.render.image_settings.file_format='JPEG';s.render.image_settings.quality=91
for shot,target,offset,scale in [('action',(0,-.06,.61),(.12,-2,.28),1.02),('face',(0,-.12,.55),(-.11,-2,.18),.52)]:
 folder=out/shot;folder.mkdir(exist_ok=True);cam.location=V(target)+V(offset);cam.rotation_euler=(-V(offset)).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale;s.render.resolution_x=480 if shot=='action' else 400;s.render.resolution_y=440;s.render.filepath=str(folder)+'/'
 if shot=='action':
  s.frame_set(1);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(out/'handoff.blend'),compress=True)
 bpy.ops.render.render(animation=True)
