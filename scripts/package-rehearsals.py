from pathlib import Path
import ast, subprocess, wave, json, math, runpy
from PIL import Image, ImageDraw
import imageio_ffmpeg
root=Path(__file__).resolve().parents[1]
cast=next(ast.literal_eval(x.value) for x in ast.parse((root/'scripts/rehearse-cast.py').read_text(encoding='utf-8-sig')).body if isinstance(x,ast.Assign) and getattr(x.targets[0],'id','')=='CAST')
register={'friend':1,'regular':.93,'aming':.84,'ale':1.05,'lin':.86,'ling':.96,'vendor':.95,'southRice':.85,'fang':.92,'aqing':1.03,'buyer':1}
joints={'Head','LeftArm','RightArm','LeftForeArm','RightForeArm'}
poses={}
for actor in ['regular','aming','friend']:
 rotations=json.loads((root/'output/ba-review'/actor/'pose.json').read_text())
 poses[actor]=[[time,{k:q for k,q in rotation.items() if k in joints}] for time,rotation in rotations]
(root/'assets/story-poses.json').write_text(json.dumps(poses,separators=(',',':')),encoding='utf8')
grid=Image.new('RGB',(200*4,126*3),'#262321')
for i,(role,(_,_,name,_)) in enumerate(cast.items()):
 folder=root/'output'/'ba-review'/role
 frames=sorted((folder/'face').glob('*.jpg'));wav=root/'assets'/(name+'.wav')
 with wave.open(str(wav)) as audio: rate=audio.getframerate()
 size=len(frames)/18
 out=root/'assets'/('rehearsal-'+role+'.mp4')
 subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-loglevel','error','-framerate','18','-i',str(folder/'action'/'%04d.jpg'),'-framerate','18','-i',str(folder/'face'/'%04d.jpg'),'-i',str(wav),'-filter_complex',f'[0:v][1:v]hstack=inputs=2[v];[2:a]asetrate={round(rate*register[role])},aresample=24000,atempo={1/register[role]},adelay=167:all=1,apad[a]','-map','[v]','-map','[a]','-t',str(size),'-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-preset','veryfast','-c:a','aac','-movflags','+faststart',str(out)],check=True)
 for j,path in enumerate([frames[len(frames)//3],(folder/'action'/frames[len(frames)//3].name)]):
  frame=Image.open(path);frame.thumbnail((100,102));grid.paste(frame,(i%4*200+j*100,i//4*126))
 ImageDraw.Draw(grid).text((i%4*200+6,i//4*126+101),role,fill='white')
grid.save(root/'output/ba-review/cast-contact.jpg')

folder=root/'output/ba-review/handoff'
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-loglevel','error','-framerate','18','-i',str(folder/'action'/'%04d.jpg'),'-framerate','18','-i',str(folder/'face'/'%04d.jpg'),'-filter_complex','[0:v][1:v]hstack=inputs=2[v]','-map','[v]','-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-movflags','+faststart',str(root/'assets/rehearsal-handoff.mp4')],check=True)
runpy.run_path(str(root/'scripts/package-ming-service.py'))
