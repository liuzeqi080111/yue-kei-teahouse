"""Repair inverted vertex normals; preserve geometry, colours and the animation rig."""
from pathlib import Path
import json
import struct
import numpy as np

root=Path(__file__).resolve().parents[1]
for filename in ('aming-styled-v3.glb','aming-service.glb'):
    path=root/'assets/street'/filename
    data=bytearray(path.read_bytes())
    length=struct.unpack_from('<I',data,12)[0]
    gltf=json.loads(data[20:20+length])
    def accessor(index):
        a=gltf['accessors'][index];view=gltf['bufferViews'][a['bufferView']]
        width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        dtype={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[a['componentType']]
        return np.frombuffer(data,dtype=dtype,count=a['count']*width,offset=28+length+view.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,width)
    normals_fixed=0
    for mesh in gltf['meshes']:
        if 'tripo_mesh' not in mesh.get('name',''):continue
        for primitive in mesh['primitives']:
            attrs=primitive['attributes']
            points=accessor(attrs['POSITION']);normals=accessor(attrs['NORMAL'])
            faces=accessor(primitive['indices']).reshape(-1,3)
            face_normals=np.cross(points[faces[:,1]]-points[faces[:,0]],points[faces[:,2]]-points[faces[:,0]])
            geometric=np.zeros_like(points)
            for corner in range(3):np.add.at(geometric,faces[:,corner],face_normals)
            geometric/=np.maximum(np.linalg.norm(geometric,axis=1,keepdims=True),1e-12)
            inverted=np.sum(geometric*normals,axis=1)<-.15
            normals[inverted]*=-1
            normals_fixed+=int(inverted.sum())
    path.write_bytes(data)
    print(filename,{'inverted_vertex_normals':normals_fixed})
