# Original instrumental loop: warm electric piano, bass and soft backbeat, 80 BPM.
# Newly composed notes; not a copy/arrangement of the selected commercial song.
import math,wave,struct
from pathlib import Path
sr=22050;beat=.75;bars=16;dur=bars*4*beat;out=[0.] * int(sr*dur)
def tone(t,n,length,amp,kind='keys'):
 f=440*2**((n-69)/12);start=int(t*sr);count=int(length*sr)
 for j in range(count):
  x=j/sr;env=min(1,x/.012)*min(1,(length-x)/.08)*math.exp(-x*(2 if kind=='keys' else 1.5))
  y=math.sin(2*math.pi*f*x)
  if kind=='keys':y+=.25*math.sin(2*math.pi*f*2*x)+.08*math.sin(2*math.pi*f*3*x)
  out[(start+j)%len(out)]+=y*env*amp
chords=[[60,64,67,71],[57,60,64,67],[53,57,60,64],[55,59,62,65]]
melodies=[[76,74,71,67,69,71],[72,71,69,64,67,69],[69,72,76,74,72,69],[71,69,67,62,65,67]]
for b in range(bars):
 t=b*4*beat;c=chords[b%4]
 for i,n in enumerate(c):tone(t+i*.04,n,2.9,.06)
 for k in [0,2]:tone(t+k*beat,c[0]-24,1.3,.11,'bass')
 for k,n in enumerate(melodies[b%4]):tone(t+(k*.5+.5)*beat,n+(0 if b<8 else -12),.65,.055)
 for k in range(8):
  st=int((t+k*.5*beat)*sr)
  for j in range(int(.035*sr)):
   x=j/sr;out[(st+j)%len(out)]+=.012*math.sin(j*j*1.71)*math.exp(-x*110)
 for k in [1,3]:tone(t+k*beat,38,.13,.045,'bass')
peak=max(map(abs,out));scale=.75/max(peak,.75)
with wave.open('assets/hongkong-evening.wav','wb') as w:
 w.setparams((1,2,sr,0,'NONE','not compressed'));w.writeframes(b''.join(struct.pack('<h',int(v*scale*32767)) for v in out))
