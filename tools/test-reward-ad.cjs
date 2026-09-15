const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const cache=new Map();
function load(name){
  const file=path.resolve(__dirname,'../assets/scripts',name+'.ts');
  if(cache.has(file))return cache.get(file);
  const exports={};cache.set(file,exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(code,{exports,Date,Math,URL,URLSearchParams,TextEncoder,AbortController,setTimeout,clearTimeout,
    require:name=>load(path.relative(path.resolve(__dirname,'../assets/scripts'),path.resolve(path.dirname(file),name)))});
  return exports;
}
const {AD_REWARD_CONFIG:config}=load('RewardAdConfig');
const {RewardAdClient,getOrCreateRewardAdUserId,getRewardAdSceneId}=load('RewardAdClient');
const {RewardAdController}=load('ui/RewardAdController');

test('ad configuration uses supplied game ID and refuses missing scene IDs',()=>{
  assert.equal(config.gameId,'gm0c9bfa4495724696');assert.equal(config.baseUrl,'https://store.app.holatek.cn');
  assert.equal(getRewardAdSceneId('REVIVE'),'Revive');
  assert.equal(getRewardAdSceneId('MAIN_MENU'),'EnergyRecovery');
  assert.throws(()=>getRewardAdSceneId('SETTLEMENT_DOUBLE'),/sceneId/);
  assert.equal(getRewardAdSceneId('REVIVE',{...config,testSceneId:'test-scene'}),'test-scene');
  const saved={getItem:()=> 'existing-user'};assert.equal(getOrCreateRewardAdUserId(saved),'existing-user');
  const blocked={getItem(){throw Error();},setItem(){throw Error();}};
  const id=getOrCreateRewardAdUserId(blocked);assert.match(id,/^guest_\d+_\d{6}$/);
  assert.equal(getOrCreateRewardAdUserId(blocked),id);
});
test('URL and status use exact protocol fields, success codes and no-store',async()=>{
  const calls=[];let response={code:100,data:{adUrl:'https://feedback.holatek.cn/ad'}};
  const client=new RewardAdClient(null,{...config,testSceneId:'scene',testUserId:'tester'},async(url,options)=>{
    calls.push({url,options});return {ok:true,json:async()=>response};
  });
  await client.requestRewardAdUrl('REVIVE',{extra:{round:'one'}});
  assert.equal(calls[0].url,config.baseUrl+'/appstore/game-center/ad/url');
  assert.deepEqual(JSON.parse(calls[0].options.body),{userId:'tester',gameId:config.gameId,sceneId:'scene',adType:2,extra:'{"round":"one"}'});
  response={code:100,data:{completed:'1'}};
  assert.equal(await client.queryRewardAdCompleted('scene'),true);
  assert.equal(calls[1].options.cache,'no-store');assert.match(calls[1].url,/[?&]_ts=\d+/);
  response={code:100,data:{completed:0}};assert.equal(await client.queryRewardAdCompleted('scene'),false);
  response={code:300};await assert.rejects(()=>client.queryRewardAdCompleted('scene'));
});
function harness(client={}){
  let now=0,id=0;const pending=new Map(),awards=[],states=[];
  const controller=new RewardAdController({
    client:{requestRewardAdUrl:async()=>({adUrl:'https://example.test/ad',sceneId:'test'}),queryRewardAdCompleted:async()=>true,...client},
    now:()=>now,timers:{set(fn,ms){pending.set(++id,{fn,at:now+ms});return id;},clear(id){pending.delete(id);}},
    render:s=>states.push(s),grant:action=>awards.push(action),
  });
  async function advance(ms){const end=now+ms;while(true){const next=[...pending].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;pending.delete(next[0]);next[1].fn();await Promise.resolve();await Promise.resolve();}now=end;}
  return {controller,pending,awards,states,advance};
}
test('QR state precedes polling; completion grants once and cleans all timers',async()=>{
  let queries=0;const h=harness({queryRewardAdCompleted:async()=>{queries++;return true;}});
  await h.controller.openRewardAdDialog('MAIN_MENU','ITEM_REWARD');
  assert.equal(h.controller.rewardAdState.adUrl,'https://example.test/ad');
  await h.advance(14999);assert.equal(queries,0);await h.advance(1);
  assert.equal(queries,1);assert.deepEqual(h.awards,['ITEM_REWARD']);assert.equal(h.pending.size,0);
  await h.advance(20000);assert.equal(h.awards.length,1);
});
test('ad revival resumes automatically once, while cancellation before completion grants nothing',async()=>{
  const h=harness();await h.controller.openRewardAdDialog('REVIVE','REVIVE');await h.advance(15000);
  assert.equal(h.controller.rewardAdState.open,false);assert.deepEqual(h.awards,['REVIVE']);
  await h.advance(20000);assert.deepEqual(h.awards,['REVIVE']);assert.equal(h.pending.size,0);
  const cancelled=harness();await cancelled.controller.openRewardAdDialog('REVIVE','REVIVE');
  cancelled.controller.closeRewardAdDialog();await cancelled.advance(15000);assert.equal(cancelled.awards.length,0);
});
test('closing aborts requests and ignores a late completion',async()=>{
  let resolve,signal;const h=harness({queryRewardAdCompleted:(_,s)=>{signal=s;return new Promise(r=>resolve=r);}});
  await h.controller.openRewardAdDialog('MAIN_MENU','ITEM_REWARD');await h.advance(15000);
  h.controller.closeRewardAdDialog();assert.equal(signal.aborted,true);resolve(true);await Promise.resolve();await Promise.resolve();
  assert.equal(h.awards.length,0);assert.equal(h.pending.size,0);
});
test('errors back off to the cap and stop after four consecutive failures',async()=>{
  let queries=0;const h=harness({queryRewardAdCompleted:async()=>{queries++;throw Error('offline');}});
  await h.controller.openRewardAdDialog('MAIN_MENU','ITEM_REWARD');await h.advance(15000);assert.equal(queries,1);
  await h.advance(3999);assert.equal(queries,1);await h.advance(1);assert.equal(queries,2);
  await h.advance(8000);assert.equal(queries,3);await h.advance(8000);assert.equal(queries,4);
  assert.equal(h.pending.size,0);assert.equal(h.controller.rewardAdState.open,false);assert.equal(h.awards.length,0);
});
test('timeout aborts an in-flight query independently of its response',async()=>{
  let signal;const h=harness({queryRewardAdCompleted:(_,s)=>{signal=s;return new Promise(()=>{});}});
  await h.controller.openRewardAdDialog('MAIN_MENU','ITEM_REWARD');await h.advance(180000);
  assert.equal(signal.aborted,true);assert.equal(h.pending.size,0);assert.equal(h.controller.rewardAdState.open,false);
  assert.match(h.controller.rewardAdState.errorMessage,/超时/);assert.equal(h.awards.length,0);
});


test('bundled QR encoder matches the installed encoder without a server',()=>{
  const {encodeRewardQr}=load('RewardQrEncoder');
  const url='https://feedback.holatek.cn/data/jmwxapp/gameAd?gameId=gm0c9bfa4495724696&sceneId=EnergyRecovery&userId=guest_123_456789';
  const expected=require('qrcode').create(url,{errorCorrectionLevel:'M'}).modules;
  const actual=encodeRewardQr(url);
  assert.equal(actual.size,expected.size);assert.deepEqual(Array.from(actual.modules),Array.from(expected.data));
});
