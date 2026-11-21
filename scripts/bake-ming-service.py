"""Bake Ming's actual skinned hand, raised saucer and two drinks on one Blender timeline."""
import bpy, bmesh, math, json, sys, os
from mathutils import Vector as V, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
from pathlib import Path
root=Path.cwd(); out=root/'output'/'service-review';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'assets/street/aming-styled-v3.glb'))
s=bpy.context.scene;s.frame_set(1);s.render.fps=24;s.frame_end=85
arm=next(o for o in s.objects if o.type=='ARMATURE')
bones={b.name.split(':')[-1]:b for b in arm.pose.bones}
base={n:b.matrix_basis.copy() for n,b in bones.items()}
arm.animation_data_clear()
for n,b in bones.items():b.matrix_basis=base[n]
update=bpy.context.view_layer.update;update()
def v3(x):return V(x)
def basis(along,across):
 d=along.normalized();a=(across-d*d.dot(across)).normalized()
 return Matrix((d,a,d.cross(a))).transposed().to_quaternion()
wrist=bones['RightHand'];middle=bones['RightHandMiddle1'];index=bones['RightHandIndex1'];pinky=bones['RightHandPinky1']
orientation=wrist.matrix.to_quaternion()
inverse_basis=basis(middle.head-wrist.head,index.head-pinky.head).inverted()
palm=basis(V((0,-1,.025)),V((-1,0,0)))@inverse_basis
palm_orientation=palm@orientation
to_knuckle=palm@(middle.head-wrist.head)
def rotate_world(b,q):
 mat=q.to_matrix().to_4x4()@b.matrix;mat.translation=b.head.copy();b.matrix=mat;update()
def aim(b,child,goal):
 delta=goal-b.head
 if delta.length>.0001:rotate_world(b,(child.head-b.head).rotation_difference(delta))
def reach(w):
 a=bones['RightArm'];el=bones['RightForeArm'];l=(el.head-a.head).length;r=(wrist.head-el.head).length
 axis=w-a.head;d=min(axis.length,l+r-.0001);axis.normalize();along=(l*l-r*r+d*d)/(2*d)
 p=V((-.85,.25,-.55));p=(p-axis*axis.dot(p)).normalized()
 aim(a,el,a.head+axis*along+p*math.sqrt(max(0,l*l-along*along)));aim(el,wrist,w)
 rotate_world(wrist,palm_orientation@wrist.matrix.to_quaternion().inverted())
def solid(name,verts,faces,color):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]);bm.to_mesh(mesh);bm.free()
 o=bpy.data.objects.new(name,mesh);s.collection.objects.link(o)
 mat=bpy.data.materials.new(name);mat.diffuse_color=(*color,1);mat.use_nodes=True
 shader=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED');shader.inputs['Base Color'].default_value=(*color,1);shader.inputs['Roughness'].default_value=.38
 o.data.materials.append(mat)
 for poly in mesh.polygons:poly.use_smooth=True
 return o
def lathe(name,profile,color):
 verts=[];rings=[];faces=[];count=64
 for r,z in profile:
  if r==0:rings.append([len(verts)]);verts.append((0,0,z));continue
  rings.append(list(range(len(verts),len(verts)+count)))
  verts.extend((r*math.cos(i*math.tau/count),r*math.sin(i*math.tau/count),z) for i in range(count))
 for a,b in zip(rings,rings[1:]):
  for i in range(count):
   n=(i+1)%count
   if len(a)==1:faces.append((a[0],b[n],b[i]))
   elif len(b)==1:faces.append((a[i],a[n],b[0]))
   else:faces.append((a[i],a[n],b[n],b[i]))
 return solid(name,verts,faces,color)
ceramic=(.80,.71,.52)
pedestal=.006
saucer=lathe('ServiceSaucer',[(0,0),(.022,0),(.024,.002),(.024,pedestal)]+[(r,z+pedestal) for r,z in [(.031,.002),(.049,.009),(.062,.016),(.064,.018),(.063,.020),(.060,.020),(.047,.014),(.030,.005),(.023,.0035),(0,.0035)]],ceramic)
hot=lathe('HotCup',[(0,.0035),(.017,.0035),(.020,.007),(.025,.037),(.025,.045),(.0235,.046),(.0225,.043),(.020,.013),(.016,.008),(0,.008)],(.83,.72,.52))
tea=lathe('HotTea',[(0,.036),(.022,.036),(.0224,.039),(0,.039)],(.44,.23,.09))
# The ceramic handle points away from the grasp on the back edge of the saucer.
verts=[];faces=[]
for i in range(21):
 a=-math.pi/2+i*math.pi/20;c=V((.022+.015*math.cos(a),0,.027+.012*math.sin(a)))
 for j in range(12):
  t=math.tau*j/12;verts.append(tuple(c+V((math.cos(a)*math.cos(t),math.sin(t),math.sin(a)*math.cos(t)))*.003))
 if i:
  for j in range(12):faces.append(((i-1)*12+j,(i-1)*12+(j+1)%12,i*12+(j+1)%12,i*12+j))
faces.extend([tuple(reversed(range(12))),tuple(range(240,252))])
handle=solid('HotHandle',verts,faces,ceramic)
cold=lathe('ColdGlass',[(0,.0035),(.018,.0035),(.021,.013),(.025,.088),(.024,.091),(.0225,.089),(.019,.016),(0,.012)],(.74,.69,.53))
liquid=lathe('ColdTea',[(0,.080),(.022,.08),(.022,.085),(0,.085)],(.33,.14,.041))
lemon=lathe('ColdLemon',[(0,0),(.013,0),(.014,.002),(.013,.004),(0,.004)],(.91,.65,.13))
lemon.location=(.005,-.002,.086);lemon.rotation_euler.y=.25
for o in [hot,tea,handle,cold,liquid,lemon]:o.parent=saucer;o.location.z+=pedestal
# One continuous take. The plate rests on the table from frame 48; fingers leave along its edge.
# Distances in the normalized character's space; the restaurant applies its 1.72 m scale.
table=(.945-.19)/1.72
keys=[
 (1,(-.105,-.135,.595),0,.05),(15,(-.100,-.158,.584),0,.12),
 (32,(-.081,-.218,.498),0,.37),(43,(-.070,-.246,table+.012),0,.53),
 (48,(-.070,-.25,table),0,.56),(54,(-.070,-.25,table),0,.56),
 (64,(-.070,-.25,table),.48,.45),(74,(-.070,-.25,table),.90,.19),
 (85,(-.070,-.25,table),1,.04)]
for frame,center,release,lean in keys:
 s.frame_set(frame)
 for n,b in bones.items():b.matrix_basis=base[n]
 update()
 for n,factor in [('Spine',.67),('Spine1',.32),('Head',-.28)]:
  rotate_world(bones[n],Quaternion((1,0,0),lean*factor))
 c=V(center);knuckle=c+V((-.002,.083,.006))
 knuckle+=V((-.055*release,.126*release,.035*release**2))
 reach(knuckle-to_knuckle)
 retreat=V((-.055*release,.126*release,.035*release**2))
 for digit in ['Index','Middle','Ring','Pinky','Thumb']:
  chain=[bones['RightHand'+digit+str(j)] for j in range(1,5)]
  if digit=='Thumb':
   # The thumb pad meets the upper rim before the wrist withdraws.
   tip=c+V((-.022,.045,.031))+retreat
   for j in range(3):
    aim(chain[j],chain[j+1],tip+V((-.004*(2-j),.004*(2-j),.003*(2-j))))
  else:
   x={'Index':-.020,'Middle':-.005,'Ring':.010,'Pinky':.021}[digit]
   for j,z in enumerate((.002,-.001,-.003)):
    aim(chain[j],chain[j+1],c+V((x,.072-.013*j,z))+retreat)
 for n,b in bones.items():
  b.rotation_mode='QUATERNION';b.keyframe_insert(data_path='rotation_quaternion',frame=frame)
  if n=='Hips':b.keyframe_insert(data_path='location',frame=frame)
 saucer.location=c;saucer.keyframe_insert(data_path='location',frame=frame)
s.frame_set(1);update()
for label,frame in [('托住碟边',1),('碟底落桌',48),('松开手指',55),('撤手完成',85)]:
 s.timeline_markers.new(label,frame=frame)
# Measure actual deformed skin against both vessels (not just against bone origins).
body=max((o for o in s.objects if o.type=='MESH' and o.find_armature()),key=lambda o:len(o.data.vertices))
def tree(o):
 dg=bpy.context.evaluated_depsgraph_get();e=o.evaluated_get(dg);m=e.to_mesh()
 tr=BVHTree.FromPolygons([e.matrix_world@v.co for v in m.vertices],[tuple(f.vertices) for f in m.polygons]);e.to_mesh_clear();return tr
checks=[];rim=[];depth=[];gap=[]
for f in range(1,s.frame_end+1):
 s.frame_set(f);skin=tree(body)
 for obj in (hot,handle,cold):
  count=len(skin.overlap(tree(obj)))
  if count:checks.append((f,obj.name,count))
 plate=tree(saucer)
 rim.append(len(skin.overlap(plate)))
 # Signed skin-to-ceramic distance in the grip region. Check both a
 # convincing hold and how far the skinned fingertips enter the rim.
 d=bpy.context.evaluated_depsgraph_get();evaluated=body.evaluated_get(d)
 nearest=[]
 for vertex in evaluated.data.vertices:
  point=evaluated.matrix_world@vertex.co
  local=point-saucer.location
  if local.xy.length>.080 or not -.025<local.z<.042:continue
  surface,normal,_,distance=plate.find_nearest(point)
  nearest.append(((point-surface).dot(normal),distance))
 depth.append(round(max((max(0,-x) for x,_ in nearest),default=0),5))
 gap.append(round(min((dist for _,dist in nearest),default=.080),5))
print('HAND_CHECK',len(checks),checks[:8],'rim',max(rim),'depth',max(depth),'set-down gap',min(gap[46:54]),flush=True)
(out/'contact.json').write_text(json.dumps({'frames':s.frame_end,'cupIntersections':checks,'saucerContact':rim,'rimPenetration':depth,'nearestRim':gap}))
if checks or any(rim[70:]) or min(gap[46:54])>.003 or max(depth)>.0018:
 raise RuntimeError('Inspect the grip, landing and release before using this take.')
s.frame_set(1);update()
# Export the same armature and animated saucer that will be rendered for review.
bpy.ops.export_scene.gltf(filepath=str(root/'assets/street/aming-service.glb'),export_format='GLB',export_animation_mode='SCENE',export_frame_range=True,export_force_sampling=True,export_cameras=False,export_lights=False,export_morph=False)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/'aming-service.blend'),compress=True)
if '--render' in sys.argv:
 s.render.engine='BLENDER_WORKBENCH';s.display.shading.color_type='VERTEX';s.display.shading.light='STUDIO'
 s.world=bpy.data.worlds.new('Preview');s.world.color=(.16,.14,.13);s.display.shading.background_type='WORLD'
 for o in [saucer,hot,handle,tea]:
  attr=o.data.color_attributes.new(name='Preview',type='FLOAT_COLOR',domain='POINT')
  for v in attr.data:v.color=o.data.materials[0].diffuse_color
  o.data.color_attributes.active_color=attr
 for o in (cold,liquid,lemon):o.hide_render=True;o.hide_set(True)
 bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-.46,table-.017))
 support=bpy.context.object;support.name='Preview table';support.dimensions=(.74,.56,.034)
 tint=support.data.color_attributes.new(name='Laminate',type='FLOAT_COLOR',domain='POINT')
 for pt in tint.data:pt.color=(.42,.33,.23,1)
 support.data.color_attributes.active_color=tint
 s.view_settings.view_transform='Standard';cam=bpy.data.objects.new('Camera',bpy.data.cameras.new('Camera'));s.collection.objects.link(cam);s.camera=cam;cam.data.type='ORTHO'
 s.render.image_settings.file_format='JPEG';s.render.resolution_percentage=100
 for mode,to,angle,scale in [('action',(0,-.09,.67),(-.74,-1.32,.21),.94),('detail',(-.072,-.185,.523),(-.74,-.94,.32),.40)]:
  folder=out/mode;folder.mkdir(exist_ok=True)
  cam.location=V(to)+V(angle);cam.rotation_euler=(-V(angle)).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
  s.render.resolution_x=540;s.render.resolution_y=440;s.render.filepath=str(folder)+'/';bpy.ops.render.render(animation=True)
 s.frame_set(1)
 for screen in bpy.data.screens:
  for area in screen.areas:
   if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'aming-service.blend'),compress=True)
