const {createHash}=require('node:crypto');const {mkdtemp,writeFile,readFile,rm}=require('node:fs/promises');const {tmpdir}=require('node:os');const path=require('node:path');const {execFile}=require('node:child_process');const {promisify}=require('node:util');const {QuoteError}=require('./service');
const exec=promisify(execFile),SYNTHETIC_SHA='754b4da354d6852cc1eda4565514a9f6b57894f6f7f29246f5b0b59512811bb2';
class FixtureHybridCompositor{
 constructor({fixtureMode=false}={}){this.id='fixture.hybrid.h264.v1';this.fixtureMode=fixtureMode;}
 async compose({source,storyboard,profile}){
  if(!this.fixtureMode||!Buffer.isBuffer(source)||createHash('sha256').update(source).digest('hex')!==SYNTHETIC_SHA||profile.duration_seconds!==4||profile.aspect_ratio!=='16:9'||!['blue','green','red'].includes(storyboard?.overlay_color)||typeof storyboard.script!=='string'||storyboard.script.length>2000)throw new QuoteError('COMPOSITOR_FIXTURE_ONLY',503);
  const dir=await mkdtemp(path.join(tmpdir(),'bizgenie-synthetic-compose-'));
  try{const input=path.join(dir,'input.mp4'),output=path.join(dir,'output.mp4');await writeFile(input,source,{mode:0o600});
   await exec('/usr/bin/ffmpeg',['-nostdin','-v','error','-protocol_whitelist','file,pipe','-i',input,'-vf',`drawbox=x=0:y=0:w=iw:h=80:color=${storyboard.overlay_color}@0.8:t=fill`,'-t','4','-c:v','libx264','-threads','1','-an','-pix_fmt','yuv420p','-movflags','+faststart',output],{timeout:15000,maxBuffer:65536,env:{PATH:'/usr/bin:/bin',LANG:'C'}});
   const data=await readFile(output);if(data.length>8*1024*1024)throw new QuoteError('COMPOSITION_TOO_LARGE',503);return data;
  }finally{await rm(dir,{recursive:true,force:true});}
 }
}
module.exports={FixtureHybridCompositor};
