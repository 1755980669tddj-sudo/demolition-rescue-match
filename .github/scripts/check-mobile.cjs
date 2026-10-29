// 在真实公开HTTPS地址运行，使用全新浏览器上下文，无路由替换或登录。
const fs=require('fs'),assert=require('assert');
const {chromium}=require('/tmp/preview-browser/node_modules/playwright');
const file='preview-status.json',status=JSON.parse(fs.readFileSync(file,'utf8'));
(async()=>{
 let browser,p;const errors=[],consoleErrors=[],failedRequests=[];
 try{
  const result=status.results.find(r=>r.http_status===200&&r.hash_matches&&r.content_type.includes('html'));
  assert(result,'没有可用的公开HTML链接');
  assert(!/attachment/i.test(result.content_disposition||''),'试玩链接不能触发下载');
  browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(e.message));
  p.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text().slice(0,700));});
  p.on('requestfailed',r=>failedRequests.push({url:r.url().slice(0,150),error:r.failure()?.errorText}));
  const response=await p.goto(result.url,{waitUntil:'domcontentloaded',timeout:120000});assert.equal(response.status(),200);
  const frame=await p.locator('#rescue-game').elementHandle(),game=await frame.contentFrame();assert(game);
  await game.getByRole('button',{name:'开始救援，进入选关',exact:true}).tap();
  assert.equal(await game.locator('.level-card').count(),25);
  await game.getByRole('button',{name:'开始救援',exact:true}).tap();
  await game.getByRole('button',{name:'进入救援现场',exact:true}).tap();
  await game.waitForFunction(()=>rescueGame.scene.scenes[0].screen==='play');
  const close=await game.evaluate(()=>{const s=rescueGame.scene.scenes[0];if(!s.modal)return null;const z=s.closeBtn.zone.getBounds();return{x:z.centerX,y:z.centerY};});
  const canvas=await game.locator('canvas').boundingBox();
  if(close)await p.touchscreen.tap(canvas.x+close.x*canvas.width/450,canvas.y+close.y*canvas.height/800);
  const path=await game.evaluate(()=>{const s=rescueGame.scene.scenes[0];if(s.views.size!==144)throw new Error('棋盘不是144格');return s.prep.config.witness;});
  let swaps=0;
  for(const[a,b]of path){
   if(await game.evaluate(()=>rescueGame.scene.scenes[0].run.finished))break;
   for(const point of[a,b])await p.touchscreen.tap(canvas.x+(45+point.c*30+15)*canvas.width/450,canvas.y+(219+point.r*30+15)*canvas.height/800);
   swaps++;await game.waitForFunction(()=>{const s=rescueGame.scene.scenes[0];return !s.busy||s.run.finished;});
  }
  assert(await game.evaluate(()=>rescueGame.scene.scenes[0].run.model.won()),'真实触控通关失败');assert.deepEqual(errors,[]);
  status.mobile_test={passed:true,url:result.url,viewport:'390x844',real_touch_swaps:swaps,runtime_errors:errors};
 }catch(error){
  status.mobile_test={passed:false,error:String(error),runtime_errors:errors,console_errors:consoleErrors,failed_requests:failedRequests};
  if(p){try{status.mobile_test.document=await p.evaluate(()=>({url:location.href,title:document.title,loading:document.getElementById('loading')?.textContent,phaser:typeof Phaser,game:!!window.rescueGame,canvas:!!document.querySelector('canvas'),intro:!!document.querySelector('.intro-start'),text:document.body.innerText.slice(0,1000)}));await p.screenshot({path:'preview-debug.png'});}catch(e){status.mobile_test.debug_error=String(e);}}
  process.exitCode=1;
 }
 finally{if(browser)await browser.close();fs.writeFileSync(file,JSON.stringify(status,null,2)+'\n');console.log(JSON.stringify(status.mobile_test));}
})();
