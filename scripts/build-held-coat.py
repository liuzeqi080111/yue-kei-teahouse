"""Build a hanging cloth jacket with separate sleeves, lining and sewn lapels."""
from pathlib import Path
import math
import bpy
import bmesh
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1

def material(name, color):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    shader = next(n for n in result.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = .93
    return result

cloth = material("Blue wool", (.055, .085, .115))
trim = material("Folded seam", (.085, .12, .15))
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
    width = .165 + .012*t
    for column in range(segments):
        angle = column*math.tau/segments
        x = width*math.cos(angle)
        top = -.044*(1-abs(math.cos(angle)))**1.7
        z = (1-t)*top - .52*t
        depth = .027*math.sin(angle)
        depth += .003*math.sin(t*math.pi*7+angle*2)*math.sin(math.pi*t)*math.sin(angle)
        vertices.append((x,-depth,z))
for row in range(rows):
    for column in range(segments):
        a = row*segments+column
        b = row*segments+(column+1)%segments
        faces.append((a,b,b+segments,a+segments))
body=mesh_object("Jacket body",vertices,faces,cloth)

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
        center = Vector((side*(.145+.145*t-.017*t*t), .003*math.sin(t*math.pi), -.018-.32*t))
        tangent = Vector((side*(.145-.034*t),0,-.32)).normalized()
        across = Vector((0,1,0))
        normal = tangent.cross(across).normalized()
        radius = .059-.025*t
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
    mesh_object(("Left" if side<0 else "Right")+" sleeve",vertices,faces,cloth)
    # A cuff is sewn around the actual sleeve surface.
    cuff_vertices = []
    for row in (rows-1,rows):
        ring = [Vector(point) for point in vertices[row*segments:(row+1)*segments]]
        center = sum(ring,Vector())/segments
        cuff_vertices.extend(tuple(point+(point-center).normalized()*.004) for point in ring)
    cuff_faces = [(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
    mesh_object(("Left" if side<0 else "Right")+" cuff",cuff_vertices,cuff_faces,trim,.003)
    corners=[Vector(p) for p in [(side*.022,-.046),(side*.073,-.036),(side*.045,-.19),(side*.006,-.125)]]
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

for index in range(3):
    z=-.24-index*.09
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.006,depth=.004,location=(0,cloth_front(0,z)-.003,z),rotation=(math.pi/2,0,0))
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

out=root/"output/strict-review"
out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out/"held-coat.blend"))
bpy.ops.export_scene.gltf(filepath=str(root/"assets/street/held-coat.glb"),export_format="GLB",export_animations=False)
print("COAT",[(o.name,len(o.data.polygons),tuple(round(x,4) for x in o.dimensions)) for o in scene.objects if o.type=="MESH"])
