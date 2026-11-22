"""Build the supper cast as alternate meshes in the existing rig packages.
Run with Blender -b --factory-startup -P scripts/style-reunion-cast.py.
Default street models keep their original meshes, animations and materials.
"""
import copy
import json
import sys
from pathlib import Path
import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from face_glb import Glb

OUT = ROOT / 'output' / 'ba-review'
OUT.mkdir(parents=True, exist_ok=True)


def mix(a, b, blend):
    return a + (b - a) * np.clip(blend, 0, 1)[:, None]


def bell(x, width):
    return np.exp(-(x / width) ** 2)


def style(pos, rgb, role, is_cloth, collar):
    x, y, z = pos.T
    ax = abs(x)
    out = pos.copy()
    c = np.power(rgb, 1 / 2.2)
    r, g, b = c.T
    if role == 'player':
        # Broader shoulders, tapered waist, firmer chin and swept asymmetric fringe.
        out[:, 0] *= 1 + .07 * bell(y - .745, .065) - .055 * bell(y - .54, .07)
        out[:, 0] *= 1 + .048 * bell(y - .866, .022)
        out[:, 2] += .006 * bell(y-.863,.025) * bell(x,.040) * (z>.035)
        hair = (y>.927) * np.clip((.44-r)*7,0,1)
        sweep=np.clip((y-.928)/.070,0,1)
        out[:, 0] += .012*sweep
        out[:, 1] += .007*sweep*bell(x-.015,.049)
        c = mix(c, c * [.57,.59,.64], hair)
        if is_cloth:
            jacket=(y>.485)&(y<.824)&(b>r*.88)
            trousers=(y>.059)&(y<.52)&(r>b*1.15)
            shade=np.clip(np.mean(c,axis=1),.08,.8)
            tint=np.array([.19,.37,.36])[None,:]*(.57+1.75*shade[:,None])
            c=mix(c,tint,jacket)
            c=mix(c,np.array([.22,.24,.27])*(.65+shade[:,None]),trousers)
            if collar:c[:]=[1.,1.,1.]
    else:
        # Lean cheek, lowered lids and close-cropped grey hair, as in the tea-house photographs.
        out[:, 0]*=1-.085*bell(y-.89,.037)-.035*bell(y-.70,.11)
        out[:, 1]-=.006*bell(y-.919,.016)*np.clip((z-.010)/.033,0,1)
        hair=(y>.95)&(r-g<.13)
        crown=np.clip((y-.927)/.063,0,1)
        out[:, 0]*=1-.07*crown
        out[:, 1]-=.004*crown
        clipped=np.array([.54,.49,.43])*(.58+.82*r[:,None])
        c=mix(c,clipped,hair)
        if is_cloth:
            shade=np.mean(c,axis=1)
            skin=(r-g>.15)&(r-b>.19)
            jacket=(y>.48)&(y<.839)&~skin
            c=mix(c,np.array([.235,.30,.28])*(.47+1.05*shade[:,None]),jacket)
            # Flat woven placket and contrasting pale undershirt, just inside the neck.
            c=mix(c,np.array([.185,.226,.212]),jacket&(abs(x)<.005)&(z>.035))
            neck=(ax<.030*np.clip((y-.762)/.058,0,1))&(z>.012)&(y>.762)
            c=mix(c,np.array([.73,.71,.65]),jacket&neck)
            c=mix(c,np.array([.20,.22,.215])*(.56+shade[:,None]),(y>.055)&(y<.48)&~skin)
    return out,np.clip(c,0,1)**2.2


def make_clasp(role):
    # A closed bevelled enamel lozenge on the hero's lapel, or a Bakelite jacket button.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=10)
    ob=bpy.context.object
    ob.name='Jade jacket lapel pin' if role=='player' else 'Horn jacket button'
    dims=(.007,.003,.012) if role=='player' else (.0042,.002,.0042)
    for v in ob.data.vertices:
        for i in range(3):v.co[i]*=dims[i]
    mat=bpy.data.materials.new(ob.name);mat.diffuse_color=(.64,.30,.07,1) if role=='player' else (.052,.039,.028,1)
    ob.data.materials.append(mat);ob.data.update()
    for poly in ob.data.polygons:poly.use_smooth=True
    return ob


def append_clasps(g, prim, styled_body, role, pin):
    local=np.array([(v.co.x,v.co.z,-v.co.y) for v in pin.data.vertices])
    norms=np.array([(v.normal.x,v.normal.z,-v.normal.y) for v in pin.data.vertices])
    pin.data.calc_loop_triangles()
    triangles=np.array([t.vertices[:] for t in pin.data.loop_triangles],dtype=np.uint16)
    a=prim['attributes']
    positions=g.read(a['POSITION'])
    skin_j=g.read(a['JOINTS_0']);skin_w=g.read(a['WEIGHTS_0'])
    spots=[(.065,.735)] if role=='player' else [(0,.744),(0,.685),(0,.625),(0,.567)]
    points=[];joints=[];weights=[]
    for x,y in spots:
        nearby=np.where((abs(positions[:,0]-x)<.014)&(abs(positions[:,1]-y)<.016))[0]
        i=nearby[np.argmax(positions[nearby,2])]
        points.append(local+styled_body[i]+[0,0,.001]);joints.extend([skin_j[i]]*len(local));weights.extend([skin_w[i]]*len(local))
    indx=np.concatenate([triangles+k*len(local) for k in range(len(spots))])
    mat={'name':pin.name,'pbrMetallicRoughness':{'baseColorFactor':list(pin.data.materials[0].diffuse_color),'metallicFactor':.50 if role=='player' else .08,'roughnessFactor':.42}}
    g.doc['materials'].append(mat)
    return {'attributes':{'POSITION':g.add(np.vstack(points),'VEC3',5126),'NORMAL':g.add(np.tile(norms,(len(spots),1)),'VEC3',5126),'JOINTS_0':g.add(joints,'VEC4',g.doc['accessors'][a['JOINTS_0']]['componentType']),'WEIGHTS_0':g.add(weights,'VEC4',g.doc['accessors'][a['WEIGHTS_0']]['componentType'],g.doc['accessors'][a['WEIGHTS_0']].get('normalized',False))},'indices':g.add(indx.reshape(-1),'SCALAR',5123),'material':len(g.doc['materials'])-1}


def clean_mesh(g, mesh):
    """Clean the character variants without changing shared bind vertices or morph indices."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    pieces=mesh['primitives']
    positions=[];triangles=[];counts=[];valid_uv=[]
    for p in pieces:
        a=p['attributes'];xyz=g.read(a['POSITION'])
        tris=g.read(p['indices']).reshape(-1,3).astype(int)
        triangles.append(tris+sum(len(part) for part in positions));positions.append(xyz)
        counts.append(len(tris))
        textured='baseColorTexture' in g.doc['materials'][p['material']].get('pbrMetallicRoughness',{})
        if not textured:
            # Vertex-painted skin and enamel: a projection also supplies a valid detail UV.
            uv=xyz @ np.array([[.86,-.21],[.39,.92],[-.33,.31]])
            uv=(uv-uv.min(0))/(np.ptp(uv,axis=0)+1e-9)*.96+.02
            a['TEXCOORD_0']=g.add(uv,'VEC2',5126)
        chart=g.read(a['TEXCOORD_0']).astype(float)[tris]
        ab,ac=chart[:,1]-chart[:,0],chart[:,2]-chart[:,0]
        valid_uv.append(abs(ab[:,0]*ac[:,1]-ab[:,1]*ac[:,0])>2e-11)
    xyz=np.vstack(positions);tris=np.vstack(triangles)
    key=np.unique(np.round(xyz,7),axis=0,return_inverse=True)[1]
    cross=np.cross(xyz[tris[:,1]]-xyz[tris[:,0]],xyz[tris[:,2]]-xyz[tris[:,0]])
    area=np.linalg.norm(cross,axis=1)
    keep=(area>4e-10)&np.concatenate(valid_uv)
    normals=cross/np.maximum(area[:,None],1.e-20)
    occupied=set()
    for index in np.argsort(-area):
        if not keep[index]:continue
        a,b,c=key[tris[index]]
        edges=((a,b),(b,c),(c,a))
        if any(edge in occupied for edge in edges):keep[index]=False;continue
        occupied.update(edges)
    tree=BVHTree.FromPolygons(xyz.tolist(),tris.tolist(),all_triangles=True)
    for index in np.argsort(-area):
        if not keep[index]:continue
        face=tris[index];corners=xyz[face];centre=corners.mean(0)
        probes=np.vstack([centre,centre*.4+corners*.6])
        for probe in probes:
            for near,normal,j,distance in tree.find_nearest_range(Vector(probe),.000055):
                if j==index or not keep[j] or np.dot(normals[index],normals[j])<.9989:continue
                if np.intersect1d(face,tris[j]).size:continue
                tri=xyz[tris[j]]
                sides=np.cross(np.roll(tri,-1,axis=0)-tri,probe-tri) @ normals[j]
                if min(sides)<-1.e-9:continue
                smaller=j if area[j]<=area[index] else index
                keep[smaller]=False
    begin=0;offset=0
    for p,n,v in zip(pieces,counts,positions):
        owned=tris[begin:begin+n][keep[begin:begin+n]]-offset
        p['indices']=g.add(owned.reshape(-1),'SCALAR',5125)
        begin+=n;offset+=len(v)


def build(role,donor):
    path=ROOT/'assets'/'street'/(donor+'-styled-v3.glb')
    data=path.read_bytes()
    g=Glb(data)
    extras=g.doc['asset'].setdefault('extras',{})
    existing=extras.get('reunionMeshSet')
    if existing:
        assert existing['role']==role
        for field,size in existing['source'].items():
            if field=='binary':g.bin=g.bin[:size]
            else:g.doc[field]=g.doc[field][:size]
    source={k:len(g.doc[k]) for k in ['meshes','accessors','materials','bufferViews']}
    source['binary']=len(g.bin)
    maps={}; pin=make_clasp(role)
    for i,original in enumerate(list(g.doc['meshes'])):
        mesh=copy.deepcopy(original);mesh['name']=role+' '+original['name']
        main='tripo_mesh' in original['name']
        for p in mesh['primitives']:
            a=p['attributes']
            pos=g.read(a['POSITION'])
            col=g.read(a['COLOR_0']) if 'COLOR_0'in a else np.ones((len(pos),4),np.float32)
            if col.dtype.kind=='u':col=col.astype(float)/np.iinfo(col.dtype).max
            collar=role=='player' and p['material']==3
            out,rgb=style(pos,col[:,:3],role,main,collar)
            a['POSITION']=g.add(out,'VEC3',5126)
            a['COLOR_0']=g.add(np.column_stack((np.rint(rgb*255),np.full(len(pos),255))),'VEC4',5121,True)
        if main:
            body=g.read(mesh['primitives'][0]['attributes']['POSITION'])
            mesh['primitives'].append(append_clasps(g,original['primitives'][0],body,role,pin))
        clean_mesh(g,mesh)
        maps[str(i)]=len(g.doc['meshes']);g.doc['meshes'].append(mesh)
    g.doc['asset'].setdefault('extras',{})['reunionMeshSet']={'role':role,'meshes':maps,'source':source}
    path.write_bytes(g.pack())
    for node in g.doc['nodes']:
        if 'mesh'in node:node['mesh']=maps[str(node['mesh'])]
    (OUT/(role+'-portrait.glb')).write_bytes(g.pack())
    return pin


if __name__=='__main__':
    for role,donor in [('player','ale'),('master','lin')]:
        build(role,donor)
    if '--qa' in sys.argv:
        qa_dir=Path.home()/'.codex/skills/blender-asset-qa/scripts';sys.path.insert(0,str(qa_dir))
        import qa_check,review_shots
        for role,name in [('player','Jade jacket lapel pin'),('master','Horn jacket button')]:
            q=qa_check.run(objects=[name],eps=.00002,tol=.0001)
            (OUT/(role+'-detail-qa.json')).write_text(json.dumps(q,default=str))
            for mode in ['random','wire']:
                review_shots.run(objects=[name],mode=mode,views=['front','right','three_quarter'],res=180,out=str(OUT/(role+'-'+mode+'.png')))
            print(role,q['pass'],q['errors'],q['warnings'])
