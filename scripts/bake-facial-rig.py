"""Bake articulated facial patches into the game GLBs. Run on the original assets
(or pass --source DIR to rebuild). All dimensions are in the actor's bind space.
The lip line is traced in each original albedo. Triangles crossing that line are
split with their UVs, skinning, vertex colours and existing job poses interpolated.
"""
import argparse
import copy
import json
from pathlib import Path
import numpy as np
from face_glb import Glb, ROOT, DTYPES

# Original front-view camera centre, lip half width and three heights (left, centre, right).
# Traces were marked on 240 x 75 crops of a .130-wide, 160-pixel orthographic portrait.
TRACES = {
 'aming':(-.001,.876,49,184,41,42,41),'friend':(-.002,.883,67,184,42,43,40),
 'aqing':(0,.874,67,172,45,51,44),'fang':(.001,.880,65,178,45,46,46),
 'ale':(-.002,.887,54,175,41,40,41),'ling':(-.001,.882,63,177,40,46,40),
 'lin':(-.001,.880,54,174,42,43,45),'buyer':(.001,.884,55,153,39,38,35),
 'regular':(0,.885,49,178,41,39,42),'vendor':(-.003,.884,55,179,38,38,39),
 'southRice':(.002,.832,44,194,47,48,40),'westBread':(-.002,.850,27,179,42,46,34),
 'eastBread':(-.001,.870,48,190,37,37,32),'radio':(.002,.863,40,174,52,52,50),
 'herbs':(-.003,.828,52,202,43,47,42),'arcade':(.002,.855,35,184,41,39,39),
 'marketBack':(-.002,.863,49,185,54,52,52),'riceCorner':(-.001,.878,51,194,52,45,49),
 'banyanCloth':(.001,.862,49,181,46,47,46),'lanePrint':(.001,.855,68,208,46,48,51),
 'southPrint':(-.001,.864,57,174,47,45,45),'southCloth':(.001,.859,46,169,44,44,40),
 'eastPrint':(.001,.851,39,184,41,36,37),'eastRice':(.001,.853,32,177,41,44,39),
 'westCorner':(-.002,.829,42,196,38,60,40),'workshop':(-.002,.842,64,207,40,45,37),
 'gardenHomes':(.002,.844,64,192,37,40,32),'northTurn':(-.001,.875,43,190,46,46,45),
 'eastTurn':(0,.854,34,169,36,45,37)
}
NAMES = ['jawOpen','mouthPucker','mouthStretch','upperLipRaise','mouthPress','lowerLipTuck',
         'tongueUp','mouthSmileLeft','mouthSmileRight','browInnerUp']
def rig(path, data, role):
    g=Glb(data); doc=g.doc
    if any('jawOpen' in m.get('extras',{}).get('targetNames',[]) for m in doc['meshes']):
        raise ValueError(f'{path} already has a rig. Pass the original assets with --source.')
    bx,by,left,right,ly,my,ry=TRACES[role]
    pixel=.130/160
    cx=bx+((left+right)/6-40)*pixel
    cy=by+(16.2-my/2.5)*pixel
    width=(right-left)/6*pixel
    def seam(x):
        u=np.clip((x-cx)/width,-1.4,1.4)
        return cy-pixel/2.5*((ly+ry-2*my)*u*u+(ry-ly)*u)*.5
    candidates=[]
    for node in list(doc['nodes']):
        if 'mesh' not in node:continue
        mesh=doc['meshes'][node['mesh']]
        if 'eye' in mesh.get('name','').lower() or 'iris' in mesh.get('name','').lower():continue
        for p in mesh['primitives']:
            position=g.read(p['attributes']['POSITION'])
            central=(abs(position[:,0]-cx)<.011)&(abs(position[:,1]-cy)<.009)
            if central.any():candidates.append((node,mesh,p,position,float(position[central,2].max())))
    front=max(c[-1] for c in candidates)
    count=0
    for node,mesh,p,pos,zmax in candidates:
        if zmax<front-.010:continue
        f=g.read(p['indices']).reshape(-1,3)
        x,y,z=pos.T
        near=(abs(x-cx)<.054)&(y>cy-.054)&(y<cy+.077)&(z>front-.047)
        chosen=near[f].any(axis=1)
        if not chosen.any():continue
        original_indices,local=np.unique(f[chosen],return_inverse=True)
        local=local.reshape(-1,3)
        base=pos[original_indices]
        dist=base[:,1]-seam(base[:,0])
        # Store new vertices as weighted samples of original triangle edges.
        records=[(i,i,0.) for i in range(len(base))]
        sides=list(np.sign(dist)); cache={};skin=[]; spans=[]
        def edge(a,b,side):
            lo,hi=sorted((int(a),int(b)))
            key=(lo,hi,side)
            if key not in cache:
                t=float(dist[lo]/(dist[lo]-dist[hi]))
                cache[key]=len(records);records.append((lo,hi,t));sides.append(side)
            return cache[key]
        for row in local:
            ds=dist[row]
            if ds.min()>=0 or ds.max()<=0 or np.min(abs(base[row,0]-cx))>width+.008 or base[row,2].max()<front-.018:
                skin.append(row.tolist());continue
            line=[]
            for side in [1,-1]:
                poly=[]
                for a,b in zip(row,np.roll(row,-1)):
                    if side*dist[a]>=0:poly.append(int(a))
                    if (dist[a]>0)!=(dist[b]>0):
                        v=edge(a,b,side);poly.append(v)
                        if side==1:line.append(v)
                skin.extend([[poly[0],poly[i],poly[i+1]] for i in range(1,len(poly)-1)])
            if len(line)==2:spans.append(line)
        if not spans:continue
        av,bv,t=np.array(records).T
        av,bv=av.astype(int),bv.astype(int);t=t[:,None]
        def interpolate(arr):return arr[av]*(1-t)+arr[bv]*t
        attrs={}
        for key,index in p['attributes'].items():
            arr=g.read(index)[original_indices];attrs[key]=interpolate(arr)
        if 'JOINTS_0' in attrs:
            # At the lip line these scans are head weighted. Preserve the complete
            # weight vector for every split edge, including mixed neck influences.
            joints=g.read(p['attributes']['JOINTS_0'])[original_indices]
            weights=g.read(p['attributes']['WEIGHTS_0'])[original_indices]
            for i in range(len(base),len(records)):
                mix={}
                for source,mult in [(av[i],1-t[i,0]),(bv[i],t[i,0])]:
                    for joint,w in zip(joints[source],weights[source]):
                        mix[int(joint)]=mix.get(int(joint),0)+float(w)*mult
                best=sorted(mix,key=mix.get,reverse=True)[:4]
                attrs['JOINTS_0'][i]=0;attrs['WEIGHTS_0'][i]=0
                attrs['JOINTS_0'][i,:len(best)]=best
                ws=np.array([mix[j] for j in best]);attrs['WEIGHTS_0'][i,:len(best)]=ws/max(1e-12,ws.sum())*weights[av[i]].sum()
        verts=attrs['POSITION'];x,y,z=verts.T
        localx=x-cx;u=localx/width;h=y-seam(x);side=np.array(sides)
        def smooth(a,b,x):
            v=np.clip((x-a)/(b-a),0,1);return v*v*(3-2*v)
        mask=smooth(front-.044,front-.015,z)*(1-smooth(.044,.052,abs(localx)))
        aperture=np.maximum(0,1-u*u)**.9
        # Hinge weighting keeps the nose, fixed maxilla and back of the head still.
        mandible=smooth(0,.017,-h)
        chin_width=np.exp(-(localx/.038)**4)
        jaw=mask*(side<0)*smooth(-.018,-.003,h)*((1-mandible)*aperture+mandible*chin_width)
        lip=mask*np.exp(-(h/.011)**2)*np.exp(-(u/1.13)**4)
        corner=mask*np.exp(-((abs(u)-.86)/.47)**2-(h/.022)**2)
        delta=np.zeros((len(NAMES),len(x),3))
        delta[0,:,1]=-.0089*jaw;delta[0,:,2]=-.0028*jaw
        round_mask=mask*np.exp(-(h/.014)**2-(u/1.42)**6)
        delta[1,:,0]=-.48*localx*round_mask;delta[1,:,2]=.0073*lip
        delta[1,:,1]=.00145*aperture*lip*side
        delta[2,:,0]=.0045*np.tanh(u*2)*mask*np.exp(-(h/.019)**2-(u/1.35)**4)
        delta[3,:,1]=.0036*aperture*lip*(side>0)
        delta[4,:,1]=-.0012*np.tanh(h/.003)*lip;delta[4,:,2]=-.0016*lip
        if role in ('fang','westCorner'):
            # These two scans smile with a visible strip of baked enamel at rest.
            # Roll that strip behind the advancing lip for actual bilabial closure.
            enamel=.0055 if role=='westCorner' else .0017
            roll=(side>0)*aperture*mask*(1-smooth(enamel,enamel+.010,h))
            delta[4,:,1]-=np.clip(h,0,enamel)*roll*.97
            delta[4,:,2]-=enamel*roll*smooth(0,enamel,h)
        delta[5,:,2]=-.0045*lip*(side<0);delta[5,:,1]=.0024*lip*(side<0)
        for i,half in [(7,u>0),(8,u<0)]:
            delta[i,:,1]=corner*half*.0048;delta[i,:,0]=np.sign(u)*corner*half*.0026
        delta[9,:,1]=.0036*mask*np.exp(-((h-.055)/.013)**2-(localx/.031)**4)
        # Boundary vertices of the extracted patch must match the neighbouring body.
        shared=np.isin(original_indices,np.unique(f[~chosen]))
        fixed=shared[av]&shared[bv];delta[:,fixed]=0
        oldtargets=[{k:interpolate(g.read(a)[original_indices]) for k,a in target.items()} for target in p.get('targets',[])]
        def encode(name,v):
            a=doc['accessors'][p['attributes'][name]];component=a['componentType']
            if component!=5126:v=np.rint(v)
            if name=='NORMAL':v=v/np.maximum(1e-8,np.linalg.norm(v,axis=1,keepdims=True))
            return g.add(v,a['type'],component,a.get('normalized',False))
        def target(a):return g.vector(a)
        def normals(points,faces):
            fs=np.asarray(faces);n=np.zeros_like(points);face=np.cross(points[fs[:,1]]-points[fs[:,0]],points[fs[:,2]]-points[fs[:,0]])
            for k in range(3):np.add.at(n,fs[:,k],face)
            return n/np.maximum(1e-12,np.linalg.norm(n,axis=1,keepdims=True))
        ref=normals(verts,skin)
        def baked_normals(d):
            change=normals(verts+d,skin)-ref;change[fixed]=0
            return change
        face={'attributes':{k:encode(k,v) for k,v in attrs.items()},'indices':g.add(skin,'SCALAR',5125),'material':p['material'],
              'targets':[{k:target(v) for k,v in pose.items()} for pose in oldtargets]+[{'POSITION':target(d),'NORMAL':target(baked_normals(d))} for d in delta]}
        # Fold the inside of each cut back into the skull. Upper teeth stay on
        # the maxilla, the tongue and lower lining travel with the mandible.
        # Profiles are ordered from the upper vermilion to the lower vermilion.
        profiles=[(0,0,0),(.0019,.0009,0),(.0038,.0005,0),(.0048,-.0015,0),
                  (.009,.001,.12),(.0085,-.0015,.63),(.0046,-.001,.75),(.003,-.0017,1),(.0018,-.0007,1),(0,0,1)]
        colors=[(.145,.040,.039),(.17,.056,.051),(.63,.51,.39),(.096,.021,.027),(.049,.012,.018),
                (.115,.027,.032),(.24,.063,.071),(.16,.044,.048),(.14,.039,.038)]
        # Sample the outermost lip surface. Interior scan shells must not each
        # generate another layer of enamel or tongue behind the same opening.
        ends=np.asarray(spans)
        ends=np.take_along_axis(ends,np.argsort(u[ends],axis=1),axis=1)
        origins=[];neighbours=[];fractions=[];offs=[];od=[];oc=[];of=[]
        for column,q in enumerate(np.linspace(-.993,.993,49)):
            matches=ends[(u[ends[:,0]]<=q)&(u[ends[:,1]]>=q)&(u[ends[:,1]]>u[ends[:,0]]+1e-8)]
            if len(matches):
                a,b=matches.T
                blend=(q-u[a])/(u[b]-u[a])
                best=np.argmax((1-blend)*z[a]+blend*z[b])
                a,b=matches[best];fraction=blend[best]
            else:
                # A UV or topology seam may leave no triangle at precisely q.
                a=b=ends.ravel()[np.argmin(abs(u[ends.ravel()]-q))];fraction=0
            def at(value):return value[a]*(1-fraction)+value[b]*fraction
            lows=[cache[(*records[i][:2],-1)] for i in (a,b)]
            upper=at(np.moveaxis(delta,0,1))
            lower=delta[:,lows[0]]*(1-fraction)+delta[:,lows[1]]*fraction
            arc=(1-q*q)**.78
            start=len(od)
            for row,color in enumerate(colors):
                for r in (row,row+1):
                    depth,height,jawpart=profiles[r]
                    behind=.00075
                    if r==0:height+=.00085
                    if r==len(profiles)-1:height-=.00085
                    if r in (2,3):depth+=.003*q*q
                    if r==3:height+=.00055*q*q+.00023*np.cos(q*15)**6
                    if r in (5,6):height+=.0015*arc
                    d=upper*(1-jawpart)+lower*jawpart
                    if r in (5,6):d[6,1]+=.0048*arc;d[6,2]+=.0017*arc
                    origins.append(a);neighbours.append(b);fractions.append(fraction)
                    offs.append((cx+q*width-at(x),height*arc,-behind-depth))
                    od.append(d)
                    tone=np.array(color)
                    if row==2:tone=tone*(1-.75*abs(q)**3)*(.95+.05*abs(np.sin(q*15)))
                    oc.append(tone)
                if column:
                    right=start+2*row;left=right-2*len(colors)
                    of.extend([(left,left+1,right+1),(left,right+1,right)])
        hmix=np.array(fractions)[:,None]
        def sampled(v):return v[origins]*(1-hmix)+v[neighbours]*hmix
        # All split lip edges carry head skinning; use one complete endpoint
        # palette for new inside vertices so joint IDs never get averaged.
        nearest=np.where(hmix[:,0]<.5,origins,neighbours)
        oralattrs={k:encode(k,v[nearest]) for k,v in attrs.items() if k in ('JOINTS_0','WEIGHTS_0')}
        oralattrs.update(POSITION=target(sampled(verts)+offs),COLOR_0=target(oc))
        lining=len(doc['materials']);doc['materials'].append({'name':'Oral tissue and enamel','doubleSided':True,'pbrMetallicRoughness':{'metallicFactor':0,'roughnessFactor':.86}})
        oral={'attributes':oralattrs,'indices':g.add(of,'SCALAR',5125),'material':lining,
              'targets':[{k:target(sampled(v)) for k,v in pose.items() if k=='POSITION'} for pose in oldtargets]+[{'POSITION':target(d)} for d in np.moveaxis(od,1,0)]}
        # Same transform and same skeleton as the source mesh, with a small
        # independent morph texture. The rest of the body keeps its original cost.
        names=mesh.get('extras',{}).get('targetNames',[])+NAMES
        doc['meshes'].append({'name':role+' facial rig','primitives':[face,oral],'extras':{'targetNames':names},'weights':[0]*len(names)})
        ni=next(i for i,n in enumerate(doc['nodes']) if n is node)
        newnode={k:copy.deepcopy(v) for k,v in node.items() if k in ('skin','translation','scale','rotation','matrix')}
        newnode.update(mesh=len(doc['meshes'])-1,name=role+' articulation')
        newidx=len(doc['nodes']);doc['nodes'].append(newnode)
        for parent in doc['nodes']:
            if ni in parent.get('children',[]):parent['children'].append(newidx)
        for scene in doc['scenes']:
            if ni in scene['nodes']:scene['nodes'].append(newidx)
        idx=doc['accessors'][p['indices']];p['indices']=g.add(f[~chosen],'SCALAR',idx['componentType'])
        count+=len(spans)
    if not count:raise ValueError('Missing lip seam for '+role)
    return g.pack(),count

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('roles',nargs='*');parser.add_argument('--source',type=Path);args=parser.parse_args()
    for role in args.roles or list(TRACES)+['aming-service']:
        directory=ROOT/'assets/street'
        rel=Path(role+'.glb' if role=='aming-service' else role+'-styled-v3.glb')
        if not (directory/rel).exists():rel=Path('shopkeepers')/(role+'.glb')
        source=(args.source or directory)/rel
        blob,count=rig(rel,source.read_bytes(),role.split('-')[0])
        (directory/rel).write_bytes(blob)
        print(role,count,'lip edges',len(blob),flush=True)
