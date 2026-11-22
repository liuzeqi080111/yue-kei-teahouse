"""Retailor the scanned waist for the supper player, preserving the original rig."""
import numpy as np


def rebuild_waist(g, prim, positions, colors):
    attrs=prim['attributes']
    arrays={name:g.read(index) for name,index in attrs.items()}
    arrays['POSITION']=positions;arrays['COLOR_0']=colors
    faces=g.read(prim['indices']).reshape(-1,3)
    xyz=arrays['POSITION']
    new={name:[] for name in attrs}

    def read(name,i):
        return arrays[name][i] if i<len(xyz) else new[name][i-len(xyz)]

    def blend(a,b,t,position,color=None):
        """Keep the four strongest combined influences, including on cut seams."""
        weights={}
        for i,factor in [(a,1-t),(b,t)]:
            for joint,w in zip(read('JOINTS_0',i),read('WEIGHTS_0',i)):
                weights[joint]=weights.get(joint,0.)+factor*w
        ranked=sorted(weights.items(),key=lambda item:-item[1])[:4]
        joints=np.zeros(4,int);values=np.zeros(4)
        for j,(bone,w) in enumerate(ranked):joints[j]=bone;values[j]=w
        normal=read('NORMAL',a)*(1-t)+read('NORMAL',b)*t
        normal/=max(np.linalg.norm(normal),1.e-10)
        new['POSITION'].append(position)
        new['JOINTS_0'].append(joints);new['WEIGHTS_0'].append(values/values.sum())
        new['NORMAL'].append(normal)
        for name in ['COLOR_0','TEXCOORD_0']:
            value=read(name,a)*(1-t)+read(name,b)*t
            if name=='COLOR_0':value=np.rint(color if color is not None else value)
            new[name].append(value)
        return len(xyz)+len(new['POSITION'])-1

    # Here the jacket, pouch, strap and trousers all share one scanned surface.
    # Both tailoring cuts cross a single intact ring, outside the entire pouch.
    low,high=.4801,.6043
    ys=xyz[faces,1]
    kept=faces[(ys.max(1)<=low)|(ys.min(1)>=high)].tolist()
    rims=[]
    for height,upper in [(low,False),(high,True)]:
        cache={};segments=[]
        for face in faces[(ys.min(1)<height)&(ys.max(1)>height)]:
            polygon=[];edge=[]
            for a,b in zip(face,np.roll(face,-1)):
                inside=(xyz[a,1]>=height)==upper
                if inside:polygon.append(a)
                if inside==((xyz[b,1]>=height)==upper):continue
                key=tuple(sorted((a,b)))
                if key not in cache:
                    t=(height-float(xyz[a,1]))/(float(xyz[b,1])-float(xyz[a,1]))
                    p=xyz[a].astype(float)*(1-t)+xyz[b]*t;p[1]=height
                    cache[key]=blend(a,b,t,p)
                polygon.append(cache[key]);edge.append(cache[key])
            kept.extend((polygon[0],polygon[k],polygon[k+1]) for k in range(1,len(polygon)-1))
            segments.append(edge)
        # Close UV/normal split edges by their bind position, leaving donor seams intact.
        points={};adj={}
        for a,b in segments:
            i,j=[tuple(np.round(read('POSITION',k),7)) for k in (a,b)]
            if i==j:continue
            points[i]=a;points[j]=b
            adj.setdefault(i,set()).add(j);adj.setdefault(j,set()).add(i)
        if not all(len(v)==2 for v in adj.values()):raise ValueError('Open waist cutting line')
        # Start at the back seam on both rings.
        start=min(adj,key=lambda p:abs(p[0]+.008) if p[2]<-.05 else 1)
        ring=[start];prev=None;at=start
        while True:
            step=next(k for k in adj[at] if k!=prev)
            if step==start:break
            ring.append(step);prev,at=at,step
        if len(ring)!=len(adj):raise ValueError('Extra component on waist cutting line')
        # Counter-clockwise seen from above (outward-facing winding for the loft).
        cross=sum(a[0]*b[2]-a[2]*b[0] for a,b in zip(ring,ring[1:]+ring[:1]))
        if cross<0:ring=ring[:1]+ring[:0:-1]
        rims.append([points[k] for k in ring])

    lower,upper=rims
    def distances(ring):
        p=np.array([read('POSITION',i) for i in ring+[ring[0]]])
        cumulative=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))]
        return cumulative/cumulative[-1]
    upper_u,lower_u=distances(upper),distances(lower)
    # Uniform intermediate rings avoid sliver faces; both transition strips
    # still retain the original (irregularly spaced) seam vertices.
    us=np.arange(144)/144
    def sample(ring,params,u):
        i=np.searchsorted(params,u,side='right')-1
        a,b=ring[i],ring[(i+1)%len(ring)]
        t=(u-params[i])/(params[i+1]-params[i])
        if t==0:return a
        return blend(a,b,t,read('POSITION',a)*(1-t)+read('POSITION',b)*t)
    guides=[(sample(upper,upper_u,u),sample(lower,lower_u,u)) for u in us]
    rings=[]
    # Continue the open over-jacket, turn its hem, expose the tucked shirt and trousers.
    for row in range(7):
        ring=[]
        for a,b in guides:
            top=read('POSITION',a);bottom=read('POSITION',b)
            x,_,z=top
            # The middle of the open jacket exposes the shirt. Side panels hang lower.
            shirt=np.clip((.046-abs(x+.004))/.015,0,1)*np.clip((z-.015)/.02,0,1)
            hem=.505+.022*shirt-.006*np.clip((-z-.04)/.06,0,1)
            y,shape,cloth=[(.581,.02,1),(.552,.04,1),(hem+.007,.055,1),
                           (hem+.001,.08,1),(hem-.001,.24,.92),
                           (hem-.004,.94,.04),(.486,.986,0)][row]
            p=top*(1-shape)+bottom*shape;p[1]=y
            shade=read('COLOR_0',a)*cloth+read('COLOR_0',b)*(1-cloth)
            ring.append(blend(a,b,(high-y)/(high-low),p,shade))
        rings.append(ring)
    sewn=[]
    def strip(a,ua,b,ub):
        i=j=0
        while i<len(a) or j<len(b):
            pa=a[i%len(a)];pb=b[j%len(b)]
            an=ua[i+1] if i<len(a) else float('inf')
            bn=ub[j+1] if j<len(b) else float('inf')
            if an<=bn:
                sewn.append((pa,a[(i+1)%len(a)],pb));i+=1
            if bn<=an:
                sewn.append((a[i%len(a)],b[(j+1)%len(b)],pb));j+=1
    mids=np.r_[us,1.]
    strip(upper,upper_u,rings[0],mids)
    for a,b in zip(rings,rings[1:]):strip(a,mids,b,mids)
    strip(rings[-1],mids,lower,lower_u)
    triangles=np.array(kept+sewn)
    positions=np.vstack((xyz,new['POSITION']))
    sewn=np.array(sewn)
    coords=positions[sewn]
    normal=np.cross(coords[:,1]-coords[:,0],coords[:,2]-coords[:,0])
    sums=np.zeros_like(positions)
    for col in sewn.T:np.add.at(sums,col,normal)
    recalculated=np.concatenate(rings)
    normals=np.vstack((arrays['NORMAL'],new['NORMAL']))
    normals[recalculated]=sums[recalculated]/np.maximum(1.e-12,np.linalg.norm(sums[recalculated],axis=1,keepdims=True))
    used,remap=np.unique(triangles,return_inverse=True)
    for name,index in list(attrs.items()):
        data=normals if name=='NORMAL' else np.vstack((arrays[name],new[name]))
        acc=g.doc['accessors'][index]
        component=5121 if name=='COLOR_0' else acc['componentType']
        attrs[name]=g.add(data[used],acc['type'],component,acc.get('normalized',False))
    prim['indices']=g.add(remap.reshape(-1),'SCALAR',5125)
