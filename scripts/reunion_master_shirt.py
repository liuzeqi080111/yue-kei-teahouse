"""Cut and fit the reunion singer's cotton shirt to his existing seated rig."""
from math import cos, exp, pi, sin
import bpy
import numpy as np
from mathutils.kdtree import KDTree


def cut_donor_coat(g, prim, xyz, srgb):
    """Discard the scanned suit, including its shirt collar, belt and turned cuffs.
    Keep the original indexed head, fingers and trousers with their bind weights
    and morph indices. The three cut edges sit inside the new sewn hems.
    """
    x,y,z=xyz.T
    red,green,blue=srgb.T
    skin=(red-green>.16)&(red-blue>.23)
    angle=np.arctan2(x+.005,z+.019)
    chin=.842+.024*(1-np.cos(angle))/2
    head=(y>chin+.009)|((y>chin-.006)&skin)
    hands=(abs(x)>.396)|((abs(x)>.387)&skin&(red>.59))
    keep=(y<.484)|head|hands
    faces=g.read(prim['indices']).reshape(-1,3)
    prim['indices']=g.add(faces[keep[faces].all(1)].reshape(-1),'SCALAR',5125)


def cotton_shirt(g, prim, original):
    # One continuous surface from hip to neck and from each armhole to its cuff.
    # Pattern coordinates and clearances are in the donor's 1-metre rest space.
    count=64
    vertices=[];shades=[];faces=[]

    def vert(xyz,tone=1):
        index=len(vertices);vertices.append(xyz);shades.append(tone)
        return index

    def seam(a,b):
        for j,k in zip(range(len(a)),[*range(1,len(a)),0]):
            faces.extend([(a[j],a[k],b[k]),(a[j],b[k],b[j])])

    def panel(y,width,front,back,rise):
        ring=[]
        for j in range(count):
            t=2*pi*j/count
            # Gentle vertical drape from the hip and under the arm, with a turned hem.
            fullness=.0022*(.55*cos(7*t+.6)+.38*cos(12*t-1.2)+.18*sin(16*t))*exp(-((y-.514)/.086)**2)
            depth=(front+back)/2+fullness
            front_fold=.0018*exp(-(min(t,2*pi-t)/.065)**2)
            hem_wave=(.0023*cos(3*t-.7)+.0013*sin(7*t))*exp(-((y-.468)/.043)**2)
            opening=min(t,2*pi-t)
            notch=.0038*exp(-(opening/.24)**2)*np.clip((y-.819)/.013,0,1)
            x=(width+fullness)*sin(t)-.003*np.clip((y-.78)/.06,0,1)
            h=y+rise*(1-cos(t))/2+hem_wave-notch
            z=(front-back)/2+depth*cos(t)+front_fold
            ring.append(vert((x,h,z),1+.035*cos(7*t+.6)*exp(-((y-.51)/.10)**2)))
        return ring

    # Each station defines height, half-width, front/back depths, and rise towards nape.
    stations=[
        (.467,.123,.074,.095,0),(.469,.124,.075,.096,0),(.475,.125,.076,.097,0),
        (.508,.127,.080,.102,0),(.557,.128,.080,.105,0),(.616,.126,.077,.106,0),
        (.675,.126,.071,.111,0),(.714,.126,.066,.113,0),
        (.738,.127,.061,.112,0),(.764,.129,.055,.108,0),(.786,.131,.047,.101,0),
        (.805,.129,.038,.091,0),(.811,.121,.037,.084,.002),
        (.816,.092,.034,.074,.007),(.818,.061,.030,.065,.014),
        (.819,.047,.026,.060,.018),(.821,.042,.025,.059,.018),
        (.829,.038,.025,.057,.019),(.832,.037,.025,.057,.019),
        (.8323,.0358,.0238,.0558,.019),(.829,.0355,.0235,.0555,.019)]
    rings=[panel(*station) for station in stations]
    under,top=7,12
    for r,(a,b) in enumerate(zip(rings,rings[1:])):
        for j in range(count):
            if under<=r<top and (9<=j<23 or 41<=j<55):continue
            k=(j+1)%count
            faces.extend([(a[j],a[k],b[k]),(a[j],b[k],b[j])])

    # Turn the underside of the hem inward so the seated camera sees a fabric edge.
    inside=panel(.469,.119,.070,.091,0);seam(inside,rings[0])

    for sign,lo,hi in [(1,9,23),(-1,41,55)]:
        loop=([rings[under][j] for j in range(lo,hi)]
              +[rings[r][hi] for r in range(under,top)]
              +[rings[top][j] for j in range(hi,lo,-1)]
              +[rings[r][lo] for r in range(top,under,-1)])
        shoulder=np.array([vertices[i] for i in loop])
        phase=np.arctan2(shoulder[:,1]-.766,shoulder[:,2]+.034)
        # Continue the actual cut into a tapered set-in sleeve; its centre
        # follows the asymmetric scanned forearm on each side.
        for x,cy,cz,ry,rz,tone in [
            (.148,.772,-.034,.045,.048,1),(.18,.773,-.030,.043,.044,1),
            (.217,.774,-.026,.040,.042,1),(.245,.774,-.024,.038,.040,1),
            (.262,.775,-.022,.036,.038,1),(.274,.776,-.020,.038,.039,.97),
            (.288,.777,-.018,.034,.036,1),(.310,.778,-.015,.033,.035,1),
            (.34,.780,-.013,.029,.031,1),(.354,.780,-.011,.027,.029,1),
            (.365,.780,-.008,.026,.029,.99),(.379,.780,-.002,.024,.028,.97),
            (.390,.780,.001,.023,.028,.95),(.3905,.780,.001,.021,.026,.94),(.388,.780,.001,.020,.025,.94)]:
            next_loop=[]
            for t in phase:
                fold=.0014*cos(3*t+.5)*exp(-((x-.270)/.043)**2)
                offset=.0018*sin(t+.5)*exp(-((x-.27)/.045)**2)
                next_loop.append(vert((sign*(x+offset),cy+(ry+fold)*sin(t),cz-.005*sign+(rz+fold)*cos(t)),tone))
            seam(loop,next_loop);loop=next_loop

    # Model the unobtrusive stitched centre facing and five matching cloth buttons.
    # Sample the centreline from the pattern, never from the hidden suit.
    heights=np.array([s[0] for s in stations[:19]])
    depths=np.array([vertices[r[0]][2] for r in rings[:19]])
    def front(y):return float(np.interp(y,heights,depths))
    for y in (.552,.622,.692,.761,.813):
        loops=[]
        for dz,radius in [(-.0014,.0018),(0,.0033),(.002,.0032),(.0031,.0018)]:
            loops.append([vert((-.002+radius*cos(t),y+radius*sin(t),front(y)+dz),.62) for t in np.arange(12)*2*pi/12])
        for a,b in zip(loops,loops[1:]):seam(a,b)
        for loop in [loops[0],loops[-1]]:
            faces.extend((loop[0],loop[k],loop[k+1]) for k in range(1,len(loop)-1))

    # A continuous strip of neck skin inside the low neckline covers the donor's
    # folded shirt edge. Its top tapers inside the underside of the original jaw.
    neck_start=len(vertices)
    previous=None
    for y,rx,front_z,back_z in [
        (.817,.030,.019,-.052),(.825,.030,.020,-.051),(.832,.030,.020,-.050),
        (.839,.029,.022,-.049),(.844,.027,.022,-.049),(.849,.025,.021,-.048),
        (.853,.021,.018,-.045),(.857,.015,.014,-.041)]:
        ring=[]
        for j in range(count):
            a=2*pi*j/count;rise=(1-cos(a))*.5
            height=y+.019*rise
            ring.append(vert((-.005+rx*sin(a),height,(front_z+back_z)/2+(front_z-back_z)*cos(a)/2),
                             .84+.08*cos(a+.4)-.12*exp(-((height-.847)/.007)**2)*max(0,cos(a))))
        if previous is not None:seam(previous,ring)
        previous=ring

    wrist_start=len(vertices)
    for sign in (-1,1):
        previous=None
        for x,cy,cz,ry,rz in [
            (.380,.779,-.002,.015,.018),(.387,.779,.001,.015,.019),
            (.394,.778,.003,.0145,.021),(.398,.777,.005,.012,.018),
            (.402,.776,.006,.009,.013)]:
            ring=[vert((sign*x,cy+ry*sin(a),cz-.006*sign+rz*cos(a)),
                       .93+.06*sin(a)) for a in np.arange(32)*2*pi/32]
            if previous is not None:seam(previous,ring)
            previous=ring

    # Bind to a neighbourhood of the donor surface, not a single closest vertex.
    from mathutils import Vector
    import bmesh
    mesh=bpy.data.meshes.new('Tailored slate cotton')
    mesh.from_pydata(vertices,[],faces);mesh.update()
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
    # The surfaces are open at the neck and wrists; orient from the outside.
    torso_front=max((p for p in mesh.polygons if .59<p.center.y<.67),key=lambda p:p.center.z)
    if torso_front.normal.z<0:
        for poly in mesh.polygons:poly.flip()
        mesh.update()
    attr=prim['attributes']
    tree=KDTree(len(original))
    for i,pos in enumerate(original): tree.insert(Vector(pos),i)
    tree.balance()
    joints=g.read(attr['JOINTS_0']);weights=g.read(attr['WEIGHTS_0'])
    joint_rows=[];weight_rows=[]
    skin=g.doc['skins'][0]['joints']
    legs={i for i,n in enumerate(skin) if 'Leg' in g.doc['nodes'][n]['name']}
    for point in vertices:
        influence={}
        for _,i,d in tree.find_n(point,12):
            for j,w in zip(joints[i],weights[i]):
                if not w:continue
                bone=int(j)
                if point[1]<.57 and bone in legs:bone=0
                influence[bone]=influence.get(bone,0)+float(w)/(.003+d)**2
        pairs=sorted(influence.items(),key=lambda p:-p[1])[:4]
        js,ws=zip(*pairs);joint_rows.append([*js,*[0]*(4-len(js))])
        weight_rows.append([*(np.array(ws)/sum(ws)),*[0]*(4-len(ws))])
    color=(np.array([.269,.344,.406])[None,:]**2.2)*np.array(shades)[:,None]
    raw=g.read(attr['COLOR_0']);raw=raw[:,:3].astype(float)/np.iinfo(raw.dtype).max
    srgb=raw**(1/2.2)
    neck_ids=np.flatnonzero((original[:,1]>.82)&(original[:,1]<.875)&(abs(original[:,0])<.055)
                            &(srgb[:,0]-srgb[:,1]>.17)&(srgb[:,0]-srgb[:,2]>.25))
    skin_tree=KDTree(len(neck_ids))
    for i in neck_ids:skin_tree.insert(Vector(original[i]),int(i))
    skin_tree.balance()
    for i in range(neck_start,wrist_start):
        nearby=[index for _,index,_ in skin_tree.find_n(vertices[i],18)]
        color[i]=np.median(raw[nearby],axis=0)*shades[i]
    color[wrist_start:]=np.array([.715,.489,.362])**2.2*np.array(shades[wrist_start:])[:,None]
    rgb=np.column_stack((np.rint(color*255),np.full(len(vertices),255)))
    attributes={
        'POSITION':g.add(vertices,'VEC3',5126),
        'NORMAL':g.add([v.normal[:] for v in mesh.vertices],'VEC3',5126),
        'COLOR_0':g.add(rgb,'VEC4',5121,True),
        'JOINTS_0':g.add(joint_rows,'VEC4',g.doc['accessors'][attr['JOINTS_0']]['componentType']),
        'WEIGHTS_0':g.add(weight_rows,'VEC4',5126)}
    g.doc['materials'].append({'name':'Washed slate cotton','doubleSided':True,
        'pbrMetallicRoughness':{'roughnessFactor':.96,'metallicFactor':0},
        'extensions':{'KHR_materials_specular':{'specularFactor':.16}}})
    return {'attributes':attributes,'indices':g.add([j for p in mesh.polygons for j in p.vertices],'SCALAR',5123),'material':len(g.doc['materials'])-1}
