(async()=>{
  const p = app.plugins.plugins.cancip;
  const prof = (p.settings.apiProfiles||[]).find(x=>x.id==='profile-mu9bdkw6');
  if(!prof) return 'profile-not-found';
  const r = await requestUrl({
    url: prof.apiUrl + '/v1/chat/completions',
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+prof.apiKey},
    body: JSON.stringify({
      model:'deepseek-v4.1-flash', temperature:0.2, max_tokens:768,
      messages:[{role:'system',content:'你是 Obsidian 助手'},{role:'user',content:'我现在打开了什么'}]
    }),
    throw: false
  });
  let j; try { j = r.json; } catch(e) { return 'non-json:'+r.status+':'+r.text.slice(0,200); }
  const c = j.choices && j.choices[0];
  const m = c && c.message;
  const shape = {
    status: r.status,
    topKeys: Object.keys(j),
    msgKeys: m ? Object.keys(m) : null,
    contentType: typeof (m&&m.content),
    contentLen: m && typeof m.content==='string' ? m.content.length : -1,
    contentPreview: m && typeof m.content==='string' ? m.content.slice(0,200) : null,
    reasoningLen: m && typeof m.reasoning_content==='string' ? m.reasoning_content.length : -1,
    reasoningPreview: m && typeof m.reasoning_content==='string' ? m.reasoning_content.slice(0,150) : null
  };
  return JSON.stringify(shape);
})()
