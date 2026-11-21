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
palm=basis(V((.98,-.18,.025)),V((-.18,-.98,0)))@inverse_basis
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
 p=V((-.85,-.30,-.55));p=(p-axis*axis.dot(p)).normalized()
 aim(a,el,a.head+axis*along+p*math.sqrt(max(0,l*l-along*along)));aim(el,wrist,w)
 rotate_world(wrist,palm_orientation@wrist.matrix.to_quaternion().inverted())
def solid(name,verts,faces,color):
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>4]);bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:]);bm.to_mesh(mesh);bm.free()
 uv=mesh.uv_layers.new(name='Surface')
 tiles=math.ceil(math.sqrt(len(mesh.polygons)))
 for poly in mesh.polygons:
  origin=mesh.vertices[poly.vertices[0]].co
  u=(mesh.vertices[poly.vertices[1]].co-origin).normalized();v=poly.normal.cross(u).normalized()
  coords=[((mesh.vertices[mesh.loops[i].vertex_index].co-origin).dot(u),(mesh.vertices[mesh.loops[i].vertex_index].co-origin).dot(v)) for i in poly.loop_indices]
  minx=min(x for x,y in coords);miny=min(y for x,y in coords)
  span=max(max(x for x,y in coords)-minx,max(y for x,y in coords)-miny,.000001)
  for i,(x,y) in zip(poly.loop_indices,coords):
   uv.data[i].uv=((poly.index%tiles+.08+.84*(x-minx)/span)/tiles,(poly.index//tiles+.08+.84*(y-miny)/span)/tiles)
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
table=(.9425-.19)/1.72
keys=[
 (1,(-.105,-.135,.595),0,.05),(15,(-.100,-.158,.584),0,.12),
 (32,(-.081,-.165,.498),0,.42),(43,(-.070,-.172,table+.020),0,.60),
 (48,(-.070,-.173,table),0,.72),(54,(-.070,-.173,table),0,.72),
 (64,(-.070,-.173,table),.48,.50),(74,(-.070,-.173,table),.90,.20),
 (85,(-.070,-.173,table),1,.04)]
samples=[]
for frame in range(1,86):
 index=next((i for i in range(1,len(keys)) if keys[i][0]>=frame),len(keys)-1)
 a,b=keys[index-1],keys[index]
 t=(frame-a[0])/(b[0]-a[0]);t=t*t*(3-2*t)
 samples.append((frame,tuple(V(a[1]).lerp(V(b[1]),t)),a[2]+(b[2]-a[2])*t,a[3]+(b[3]-a[3])*t))
for frame,center,release,lean in samples:
 s.frame_set(frame)
 for n,b in bones.items():b.matrix_basis=base[n]
 update()
 for n,factor in [('Spine',.67),('Spine1',.32),('Head',-.28)]:
  rotate_world(bones[n],Quaternion((1,0,0),lean*factor))
 c=V(center);knuckle=c+V((-.0544,.0605,.0087))
 knuckle+=V((-.13*release,.055*release,.035*release**2))
 reach(knuckle-to_knuckle)
 # Extend each joint along its own segment. Keep finger spacing and length.
 for digit in ['Index','Middle','Ring','Pinky']:
  chain=[bones['RightHand'+digit+str(j)] for j in range(1,5)]
  for j in range(3):
   aim(chain[j],chain[j+1],chain[j].head+V([(1,-.1,.12),(.7,-.08,-.7),(-.6,.05,-.7)][j]))
 tip=bones['RightHandThumb4']
 aim(bones['RightHandThumb2'],tip,tip.head+V((0,0,.010)))

 for n,b in bones.items():
  b.rotation_mode='QUATERNION';b.keyframe_insert(data_path='rotation_quaternion',frame=frame)
  if n=='Hips':b.keyframe_insert(data_path='location',frame=frame)
 saucer.location=c;saucer.keyframe_insert(data_path='location',frame=frame)
s.frame_set(1);update()
for label,frame in [('托住碟边',1),('碟底落桌',48),('松开手指',55),('撤手完成',85)]:
 s.timeline_markers.new(label,frame=frame)
# Measure actual deformed skin against both vessels (not just against bone origins).
body=max((o for o in s.objects if o.type=='MESH' and o.find_armature()),key=lambda o:len(o.data.vertices))
arm_groups={g.index for g in body.vertex_groups if 'RightHand' in g.name or 'RightForeArm' in g.name}
torso_groups={g.index for g in body.vertex_groups if any(n in g.name for n in ('Spine','Hips'))}
arm_weight=[sum(g.weight for g in vertex.groups if g.group in arm_groups) for vertex in body.data.vertices]
torso_weight=[sum(g.weight for g in vertex.groups if g.group in torso_groups) for vertex in body.data.vertices]
arm_faces=[tuple(face.vertices) for face in body.data.polygons if all(arm_weight[i]>.8 for i in face.vertices)]
torso_faces=[tuple(face.vertices) for face in body.data.polygons if all(torso_weight[i]>.8 for i in face.vertices)]
def tree(o):
 dg=bpy.context.evaluated_depsgraph_get();e=o.evaluated_get(dg);m=e.to_mesh()
 tr=BVHTree.FromPolygons([e.matrix_world@v.co for v in m.vertices],[tuple(f.vertices) for f in m.polygons]);e.to_mesh_clear();return tr
checks=[];rim=[];depth=[];gap=[];table_hits=[];body_hits=[];rim_detail=[]
table_tree=BVHTree.FromPolygons([(x,y,z) for z in (table-.034,table) for y in (-.74,-.145) for x in (-.37,.37)],[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)])
for f in range(1,s.frame_end+1):
 s.frame_set(f);skin=tree(body)
 table_count=len(skin.overlap(table_tree))
 if table_count:table_hits.append((f,table_count))
 for obj in (hot,handle,cold):
  count=len(skin.overlap(tree(obj)))
  if count:checks.append((f,obj.name,count))
 plate=tree(saucer)
 overlaps=skin.overlap(plate);rim.append(len(overlaps))
 if overlaps and f in (1,48):
  dg=bpy.context.evaluated_depsgraph_get();ev=body.evaluated_get(dg)
  for face_index in sorted(set(a for a,b in overlaps)):
   face=ev.data.polygons[face_index]
   ids=list(face.vertices)
   point=sum((ev.matrix_world@ev.data.vertices[i].co for i in ids),V())/len(ids)-saucer.location
   groups=[body.vertex_groups[max(body.data.vertices[i].groups,key=lambda g:g.weight).group].name for i in ids]
   rim_detail.append({'frame':f,'point':tuple(round(x,5) for x in point),'bones':groups})
 # Signed skin-to-ceramic distance in the grip region. Check both a
 # convincing hold and how far the skinned fingertips enter the rim.
 d=bpy.context.evaluated_depsgraph_get();evaluated=body.evaluated_get(d)
 coordinates=[evaluated.matrix_world@vertex.co for vertex in evaluated.data.vertices]
 body_count=len(BVHTree.FromPolygons(coordinates,arm_faces).overlap(BVHTree.FromPolygons(coordinates,torso_faces)))
 if body_count:body_hits.append((f,body_count))
 nearest=[];closest=(1,None)
 for vertex in evaluated.data.vertices:
  point=evaluated.matrix_world@vertex.co
  local=point-saucer.location
  if local.xy.length>.080 or not -.025<local.z<.042:continue
  surface,normal,_,distance=plate.find_nearest(point)
  nearest.append(((point-surface).dot(normal),distance))
  if distance<closest[0]:closest=(distance,{'skin':tuple(round(n,5) for n in local),'ceramic':tuple(round(n,5) for n in surface-saucer.location)})
 if f==48:print('CLOSEST_GRIP',closest,flush=True)
 depth.append(round(max((max(0,-x) for x,_ in nearest),default=0),5))
 gap.append(round(min((dist for _,dist in nearest),default=.080),5))
print('HAND_CHECK',len(checks),checks[:8],'rim',max(rim),'depth',max(depth),'set-down gap',min(gap[46:54]),flush=True)
(out/'contact.json').write_text(json.dumps({'frames':s.frame_end,'cupIntersections':checks,'saucerContact':rim,'rimPenetration':depth,'nearestRim':gap,'tableIntersections':table_hits,'forearmTorsoIntersections':body_hits,'supportedFromFrame':48}))
(out/'rim-detail.json').write_text(json.dumps(rim_detail,indent=2))
print('TABLE_CHECK',table_hits[:10],flush=True)
print('BODY_CHECK',body_hits[:10],flush=True)
if checks or any(rim) or table_hits or body_hits or max(gap[:54])>.003 or max(depth)>.0018:
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
 bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-.4425,table-.017))
 support=bpy.context.object;support.name='Preview table';support.dimensions=(.74,.595,.034)
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
