"""Build a hanging cloth jacket with separate sleeves, lining and sewn lapels."""
from pathlib import Path
import math
import sys
import tempfile
import bpy
import bmesh
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1
variant=sys.argv[-1] if '--' in sys.argv else 'held'
if variant not in ('held','original','loan'):
    raise ValueError("Expected held, original or loan")
loan=variant=='loan'

def material(name, color):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    shader = next(n for n in result.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = .93
    return result

cloth = material("Ochre wool crepe" if loan else "Blue wool", (.55,.26,.095) if loan else (.027,.048,.092) if variant=='original' else (.055,.085,.115))
trim = material("Folded seam", (.32,.125,.039) if loan else (.046,.077,.128) if variant=='original' else (.085,.12,.15))
button_material = material("Horn buttons", (.26, .22, .14))

def mesh_object(name, vertices, faces, mat, thickness=.002):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in data.polygons:
        polygon.use_smooth = True
    if thickness:
        modifier = obj.modifiers.new("Cloth thickness", "SOLIDIFY")
        modifier.thickness = thickness
        modifier.offset = 0
        with bpy.context.temp_override(object=obj, active_object=obj):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj

def surface_depth(x, height):
    width = .165 + .012 * (-height / .52)
    rounded = math.sqrt(max(.03, 1-(x/width)**2))
    wrinkle = .0035*math.sin(height*45+x*23)*math.sin(math.pi*min(1,-height/.52))
    return .027*rounded + wrinkle

vertices, faces = [], []
rows, segments = 26, 64
for row in range(rows+1):
    t = row/rows
    width = .177 + .038*t if loan else .165 + .012*t
    for column in range(segments):
        angle = column*math.tau/segments
        x = width*math.cos(angle)
        top = -.044*(1-abs(math.cos(angle)))**1.7
        z = (1-t)*top - (.36 if loan else .52)*t
        depth = .027*math.sin(angle)
        depth += .003*math.sin(t*math.pi*7+angle*2)*math.sin(math.pi*t)*math.sin(angle)
        vertices.append((x,-depth,z))
for row in range(rows):
    for column in range(segments):
        a = row*segments+column
        b = row*segments+(column+1)%segments
        faces.append((a,b,b+segments,a+segments))
body=mesh_object("Jacket body",vertices,faces,cloth)

def assign_region(obj,mat,contains):
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        if contains(*poly.center):
            poly.material_index=len(obj.data.materials)-1

if loan:
    assign_region(body,trim,lambda x,y,z:y<0 and abs(x)>.077 and abs(x)<.15 and -.294<z<-.21)
if variant=='original':
    lining=material("Inner pocket lining",(.13,.19,.23))
    pocket_vertices=[]
    for row in range(13):
        t=row/12
        for col in range(17):
            u=col/16
            x=.047+.099*u
            z=-.151-.096*t+.012*(abs(2*u-1)**3)*(t**3)
            hit,inside,normal,face=body.ray_cast(Vector((x,0,z)),Vector((0,-1,0)))
            if not hit:raise ValueError("Missing left breast lining")
            # The bottom and side seams meet the inner jacket shell. The
            # curved upper edge is open so a finger could enter the pocket.
            bulge=.008*math.sin(math.pi*u)*(1-t)**.7
            pocket_vertices.append((x,inside.y+.0011+bulge,z))
    pocket_faces=[(r*17+c,r*17+c+1,(r+1)*17+c+1,(r+1)*17+c) for r in range(12) for c in range(16)]
    pocket=mesh_object("Left chest inside pocket",pocket_vertices,pocket_faces,lining,.0014)
    label=material("Embroidered name inside pocket",(.84,.77,.60))
    assign_region(pocket,label,lambda x,y,z:.069<x<.124 and -.209<z<-.188)
    # A woven two-character name tag is embedded in the exported material.
    tag=bpy.data.images.load(str(root/"scripts"/"qing-name-tag.png"))
    texture=label.node_tree.nodes.new("ShaderNodeTexImage");texture.image=tag
    tag_uv=label.node_tree.nodes.new("ShaderNodeUVMap");tag_uv.uv_map="Name embroidery"
    label.node_tree.links.new(tag_uv.outputs["UV"],texture.inputs["Vector"])
    label.node_tree.links.new(texture.outputs['Color'],next(n for n in label.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'])

def cloth_front(x,z):
    hit,point,normal,face=body.ray_cast(Vector((x,-1,z)),Vector((0,1,0)))
    if not hit:
        raise ValueError(f"No cloth under trim at {x}, {z}")
    return point.y

for side in (-1,1):
    vertices, faces = [], []
    rows, segments = 22, 32
    for row in range(rows+1):
        t = row/rows
        sleeve_drop=.237 if loan else .32
        center = Vector((side*(.145+.145*t-.017*t*t), .003*math.sin(t*math.pi), -.018-sleeve_drop*t))
        tangent = Vector((side*(.145-.034*t),0,-sleeve_drop)).normalized()
        across = Vector((0,1,0))
        normal = tangent.cross(across).normalized()
        radius = .061-.005*t if loan else .059-.025*t
        for column in range(segments):
            angle = column*math.tau/segments
            ripple = 1+.045*math.sin(t*math.pi*8+angle*2)
            point = center + across*(math.cos(angle)*radius*.48*ripple) + normal*(math.sin(angle)*radius*ripple)
            vertices.append(tuple(point))
    for row in range(rows):
        for column in range(segments):
            a = row*segments+column
            b = row*segments+(column+1)%segments
            faces.append((a,b,b+segments,a+segments))
    sleeve=mesh_object(("Right" if side<0 else "Left")+" sleeve",vertices,faces,cloth)
    if side<0 and variant=='original':
        repaired_sleeve=sleeve
        patch=material("Darned right cuff",(.027,.048,.092))
        assign_region(sleeve,patch,lambda x,y,z:y<0 and z<-.18)
        stitch=patch.node_tree.nodes.new("ShaderNodeTexImage")
        stitch.image=bpy.data.images.load(str(root/"scripts"/"qing-cuff-repair.png"))
        stitch.image.pack();stitch.extension='EXTEND'
        mapping=patch.node_tree.nodes.new("ShaderNodeUVMap");mapping.uv_map="Cuff embroidery"
        patch.node_tree.links.new(mapping.outputs["UV"],stitch.inputs["Vector"])
        patch.node_tree.links.new(stitch.outputs["Color"],next(n for n in patch.node_tree.nodes if n.type=='BSDF_PRINCIPLED').inputs['Base Color'])
    # A cuff is sewn around the actual sleeve surface.
    cuff_vertices = []
    for row in (rows-1,rows):
        ring = [Vector(point) for point in vertices[row*segments:(row+1)*segments]]
        center = sum(ring,Vector())/segments
        cuff_vertices.extend(tuple(point+(point-center).normalized()*.004) for point in ring)
    cuff_faces = [(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
    mesh_object(("Left" if side<0 else "Right")+" cuff",cuff_vertices,cuff_faces,trim,.003)
    if loan:
        continue
    corners=[Vector((side*x,z)) for x,z in [(.022,-.046),(.073,-.036),(.045,-.19),(.006,-.125)]]
    lapel_vertices,lapel_faces=[],[]
    for row in range(13):
        for column in range(5):
            u,v=column/4,row/12
            x,z=corners[0].lerp(corners[3],v).lerp(corners[1].lerp(corners[2],v),u)
            lapel_vertices.append((x,cloth_front(x,z)-(.0015+.003*u),z))
    for row in range(12):
        for column in range(4):
            a=row*5+column
            lapel_faces.append((a,a+1,a+6,a+5))
    mesh_object(("Left" if side<0 else "Right")+" lapel",lapel_vertices,lapel_faces,trim,.002)

for index in range(4 if loan else 3):
    x=(-.037 if index%2 else .037) if loan else 0
    z=-.136-(index//2)*.09 if loan else -.24-index*.09
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.009 if loan else .006,depth=.004,location=(x,cloth_front(x,z)-.003,z),rotation=(math.pi/2,0,0))
    obj=bpy.context.object
    obj.name=f"Button {index+1}"
    obj.data.materials.append(button_material)
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    bm=bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm,faces=[face for face in bm.faces if len(face.verts)>4])
    bm.to_mesh(obj.data)
    bm.free()

# UVs are packed by face, preserving area for these solid-colour materials.
for obj in [o for o in scene.objects if o.type=="MESH"]:
    data=obj.data
    uv=data.uv_layers.new(name="Cloth UV")
    tiles=math.ceil(math.sqrt(len(data.polygons)))
    for polygon in data.polygons:
        origin=data.vertices[polygon.vertices[0]].co
        u=(data.vertices[polygon.vertices[1]].co-origin).normalized()
        v=polygon.normal.cross(u).normalized()
        coords=[((data.vertices[data.loops[i].vertex_index].co-origin).dot(u),(data.vertices[data.loops[i].vertex_index].co-origin).dot(v)) for i in polygon.loop_indices]
        low_x=min(x for x,y in coords)
        low_y=min(y for x,y in coords)
        span=max(max(x for x,y in coords)-low_x,max(y for x,y in coords)-low_y,.000001)
        for i,(x,y) in zip(polygon.loop_indices,coords):
            uv.data[i].uv=((polygon.index%tiles+.08+.84*(x-low_x)/span)/tiles,(polygon.index//tiles+.08+.84*(y-low_y)/span)/tiles)

if variant=='original':
    cuff_uv=repaired_sleeve.data.uv_layers.new(name="Cuff embroidery")
    for i,loop in enumerate(repaired_sleeve.data.loops):
        co=repaired_sleeve.data.vertices[loop.vertex_index].co
        dx,dz=co.x+.247,co.z+.267
        cuff_uv.data[i].uv=(.5+(dx*.933-dz*.36)/.071,.5+(dx*.36+dz*.933)/.082)
    repaired_sleeve.data.uv_layers.active_index=0
    # Respect the full embroidered tag across the shell's individual quads.
    labelled=[p for p in pocket.data.polygons if pocket.data.materials[p.material_index]==label]
    coords=[pocket.data.vertices[v].co for p in labelled for v in p.vertices]
    x0,x1=min(v.x for v in coords),max(v.x for v in coords)
    z0,z1=min(v.z for v in coords),max(v.z for v in coords)
    uv=pocket.data.uv_layers.new(name="Name embroidery")
    for p in labelled:
        for i in p.loop_indices:
            v=pocket.data.vertices[pocket.data.loops[i].vertex_index].co
            uv.data[i].uv=((x1-v.x)/(x1-x0),(v.z-z0)/(z1-z0))
    tag.pack()
    pocket.data.uv_layers.active_index=0

out=Path(tempfile.gettempdir())/"mgoi-street-coat-review"
out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/(variant+"-coat.blend")))
bpy.ops.export_scene.gltf(filepath=str(root/("assets/street/"+variant+"-coat.glb")),export_format="GLB",export_animations=False)
print("COAT",[(o.name,len(o.data.polygons),tuple(round(x,4) for x in o.dimensions)) for o in scene.objects if o.type=="MESH"])
