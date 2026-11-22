"""Read and extend uncompressed glTF buffers without re-exporting the skeleton or animation."""
import json
import struct
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DTYPES = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4', 5122:'<i2',5120:'i1'}
WIDTHS = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4}
class Glb:
    def __init__(self, data):
        n = struct.unpack_from('<I', data, 12)[0]
        self.doc = json.loads(data[20:20+n])
        self.bin = bytearray(data[28+n:])

    def read(self, index):
        a = self.doc['accessors'][index]
        view = self.doc['bufferViews'][a['bufferView']]
        dtype = np.dtype(DTYPES[a['componentType']])
        w = WIDTHS[a['type']]
        return np.ndarray((a['count'], w), dtype, buffer=self.bin,
            offset=view.get('byteOffset',0)+a.get('byteOffset',0),
            strides=(view.get('byteStride', w*dtype.itemsize),dtype.itemsize)).copy()

    def add(self, arr, kind, component, normalized=False):
        arr = np.ascontiguousarray(arr, dtype=DTYPES[component]).reshape(-1,WIDTHS[kind])
        self.bin.extend(bytes(-len(self.bin)%4))
        views = self.doc['bufferViews']
        view = {'buffer':0,'byteOffset':len(self.bin),'byteLength':arr.nbytes}
        views.append(view)
        self.bin.extend(arr.tobytes())
        a = {'bufferView':len(views)-1,'type':kind,'componentType':component,
             'count':len(arr),'min':arr.min(axis=0).tolist(),'max':arr.max(axis=0).tolist()}
        if normalized: a['normalized']=True
        self.doc['accessors'].append(a)
        return len(self.doc['accessors'])-1

    def vector(self, arr):
        # Most independent controls affect a small part of the facial patch.
        # A sparse VEC3 accessor decodes into the same float target in Blender and Three.
        arr=np.ascontiguousarray(arr,dtype='<f4')
        arr[abs(arr)<1e-7]=0
        key=(len(arr),arr.tobytes())
        if not hasattr(self,'vectors'):self.vectors={}
        if key in self.vectors:return self.vectors[key]
        ids=np.flatnonzero(np.any(arr!=0,axis=1))
        if len(ids)>.72*len(arr):
            index=self.add(arr,'VEC3',5126)
        else:
            a={'componentType':5126,'count':len(arr),'type':'VEC3','min':arr.min(0).tolist(),'max':arr.max(0).tolist()}
            if len(ids):
                def view(data):
                    self.bin.extend(bytes(-len(self.bin)%4))
                    views=self.doc['bufferViews']
                    views.append({'buffer':0,'byteOffset':len(self.bin),'byteLength':data.nbytes})
                    self.bin.extend(data.tobytes())
                    return len(views)-1
                component=5123 if len(arr)<=65536 else 5125
                a['sparse']={'count':len(ids),'indices':{'componentType':component,'bufferView':view(ids.astype(DTYPES[component]))},
                             'values':{'bufferView':view(arr[ids])}}
            self.doc['accessors'].append(a)
            index=len(self.doc['accessors'])-1
        self.vectors[key]=index
        return index

    def pack(self):
        self.doc['buffers'][0]['byteLength']=len(self.bin)
        blob = bytes(self.bin)+bytes(-len(self.bin)%4)
        header=json.dumps(self.doc,separators=(',',':')).encode()
        header+=b' '*(-len(header)%4)
        return struct.pack('<4sIII4s',b'glTF',2,28+len(header)+len(blob),len(header),b'JSON')+header+struct.pack('<I4s',len(blob),b'BIN\0')+blob
