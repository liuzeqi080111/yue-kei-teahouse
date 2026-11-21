from pathlib import Path
import subprocess,wave,json
import imageio_ffmpeg
p=Path(__file__).resolve().parents[1];out=p/'output/service-review'
ff=imageio_ffmpeg.get_ffmpeg_exe()
def encode(clips,filters,outfile,audio=()):
 args=[ff,'-y','-loglevel','error']
 for fps,stem in clips:args+=['-framerate',str(fps),'-i',str(stem/'%04d.jpg')]
 args+=list(audio)+['-filter_complex',filters,'-map','[v]']
 if audio:args+=['-map','[a]','-c:a','aac','-t',str(85/24)]
 subprocess.run(args+['-c:v','libx264','-r','24','-pix_fmt','yuv420p','-crf','18','-movflags','+faststart',str(p/'assets'/outfile)],check=True)
encode([(24,out/'action'),(24,out/'detail')],'[0:v][1:v]hstack[v]','rehearsal-service.mp4')
wav=p/'assets/story-table-tea.wav'
with wave.open(str(wav)) as audio:rate=audio.getframerate()
encode([(24,out/'action'),(18,p/'output/ba-review/aming/face')],f'[1:v]fps=24,tpad=stop_mode=clone:stop_duration=1[face];[0:v][face]hstack=shortest=1[v];[2:a]asetrate={round(rate*.84)},aresample=24000,atempo={1/.84},adelay=167:all=1,apad[a]','rehearsal-aming.mp4',['-i',str(wav)])
