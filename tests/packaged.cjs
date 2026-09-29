const { _electron: electron } = require('@playwright/test');
const path = require('node:path');
const assert = require('node:assert/strict');
(async()=>{
 const app=await electron.launch({executablePath:path.resolve('release/win-unpacked/Make My Lithophane.exe'),args:[],timeout:45000});
 try{
  const page=await app.firstWindow();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Preview ready'),null,{timeout:30000});
  assert.ok((await page.locator('#model-triangles').textContent())!=='—');
  await page.screenshot({path:'test-results/packaged-studio.png'});
  await page.locator('#color-studio-open').click();
  assert.ok(await page.locator('[data-mode="chromaphane"]').isDisabled());
  assert.match(await page.locator('[data-mode="chromaphane"]').textContent(),/Work in progress/);
  console.log('Packaged Windows EXE starts successfully, renders a model, and keeps filament painting disabled.');
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
