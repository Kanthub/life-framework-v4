const domains=[
{name:'身心健康',sub:'稳定的能量\n是一切的基础',icon:'☼',desc:'保持身心的稳定与活力，成为长期行动的基础。',nodes:[['运动','强化体能'],['睡眠','恢复精力'],['饮食','滋养身体'],['情绪','稳定觉察'],['体检','长期监测'],['专注','减少耗散']],principles:['身体是1，其他都是0','长期主义优先短期快感','觉知先于改变'],practices:['每周至少3次有氧运动','23:30 前入睡','减少精制糖摄入','每天10分钟正念呼吸']},
{name:'学习成长',sub:'持续扩展认知边界',icon:'◉',desc:'保持好奇、深度思考，让知识转化为判断力。',nodes:[['阅读','输入'],['写作','输出'],['复盘','校准'],['课程','系统']],principles:['保持第一性思考','用输出检验理解','建立跨学科连接'],practices:['每日阅读30分钟','每周完成一篇复盘','每月学习一个新主题']},
{name:'工作创造',sub:'创造价值，服务他人',icon:'⊕',desc:'把能力变成作品，用创造回应真实世界。',nodes:[['产品','价值'],['表达','传播'],['协作','连接'],['交付','结果']],principles:['做真正解决问题的事','作品胜过观点','保持长期可信'],practices:['每日完成最重要任务','每周公开一个作品','持续记录用户反馈']},
{name:'关系家庭',sub:'深的连接，长的陪伴',icon:'✣',desc:'经营值得信赖的关系，在陪伴中共同成长。',nodes:[['家人','陪伴'],['朋友','真诚'],['伴侣','共同体'],['社群','互助']],principles:['真诚高于技巧','先理解，再表达','重要关系需要时间'],practices:['每周家庭共处时间','主动联系一位朋友','有冲突时当天沟通']},
{name:'财富管理',sub:'让资源为理想服务',icon:'⊛',desc:'建立稳健的资源系统，为自由与创造提供空间。',nodes:[['收入','创造'],['储蓄','安全'],['投资','增长'],['消费','选择']],principles:['先储蓄后消费','不懂的不投','用钱购买长期自由'],practices:['每月自动储蓄','每周复盘支出','季度检查资产配置']},
{name:'精神探索',sub:'看见更大的自己',icon:'✤',desc:'在喧嚣之外保留内在空间，持续探索生命意义。',nodes:[['独处','澄明'],['自然','连接'],['艺术','感受'],['哲思','追问']],principles:['承认未知','保持精神独立','体验先于命名'],practices:['每周一次长时间独处','每月走进自然','记录触动自己的瞬间']}
];
/* —— 领域数据可编辑化：统一条目结构 + 本地持久化 ——
   nodes:{t,s}  principles:{t,s}  practices:{t,cad,done}（兼容旧的字符串/数组写法） */
function normDomain(d){
  d.nodes=(d.nodes||[]).map(n=>Array.isArray(n)?{t:n[0]||'',s:n[1]||''}:Object.assign({t:(n&&n.t)||'',s:(n&&n.s)||''},n&&n.id?{id:n.id}:{},n&&typeof n.a==='number'?{a:n.a}:{},n&&typeof n.r==='number'?{r:n.r}:{},n&&n.o==='m'?{o:'m'}:{}));
  d.principles=(d.principles||[]).map((p,i)=>typeof p==='string'?{t:p,s:i?'选择更长期有益的生活方式。':'没有健康，一切归零。'}:{t:(p&&p.t)||'',s:(p&&p.s)||''});
  d.practices=(d.practices||[]).map((p,i)=>typeof p==='string'?{t:p,cad:i?'每日 · 长期':'每周 · 长期',done:i<2}:{t:(p&&p.t)||'',cad:(p&&p.cad)||'每周 · 长期',done:!!(p&&p.done)});
}
domains.forEach(normDomain);
const SEED=JSON.parse(JSON.stringify(domains));
const LS_KEY='lf4-domains';
function loadDomains(){try{const s=localStorage.getItem(LS_KEY);if(!s)return;const arr=JSON.parse(s);if(Array.isArray(arr)&&arr.length&&arr.every(d=>d&&d.name)){arr.forEach(normDomain);domains.length=0;domains.push(...arr);active=0}}catch(e){}}
function saveDomains(){try{localStorage.setItem(LS_KEY,JSON.stringify(domains))}catch(e){}}
const activities=[['♧','运动'],['♜','饮食'],['☾','睡眠'],['▤','学习'],['▣','工作'],['•••','其他']];
/* 时间线数据：第一个字段为距今天的天数偏移（0=今天 -1=昨天 -2=前天），日期由运行时实时计算 */
const events=[[0,'07:20','🏃','晨跑 5.2 公里','天气清爽，状态不错。'],[0,'12:30','♜','午餐　蔬菜鸡胸肉','清淡饮食，感觉轻松。'],[0,'22:10','▤','阅读《深度工作》','专注是一种能力，也是一种选择。'],[-1,'06:50','🏋','力量训练　40分钟','上肢 + 核心，完成度高。'],[-1,'23:00','☾','早睡','比昨天早了20分钟。'],[-2,'08:10','♜','早餐　燕麦 + 鸡蛋','能量充足。'],[-2,'20:30','♡','和家人通话','聊了近况，心里踏实。']];
const WEEK=['日','一','二','三','四','五','六'];
/* 视图状态：mode='month' 按月看（monthOffset 相对当前月）；mode='day' 按天看（dayOffset 相对今天，可为负） */
let view={mode:'month',monthOffset:0,dayOffset:0};
function todayShift(off){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()+off);return d}
function monthsFromNow(off){const d=todayShift(off),n=new Date();return(d.getFullYear()-n.getFullYear())*12+(d.getMonth()-n.getMonth())}
function dayLabel(off){return off===0?'今天':off===-1?'昨天':off===-2?'前天':''}
function shortDate(d){return (d.getMonth()+1)+'.'+String(d.getDate()).padStart(2,'0')}
const CN_DAY=['','初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
function lunarLabel(d){
  try{
    const y=new Intl.DateTimeFormat('zh-CN-u-ca-chinese',{year:'numeric'}).format(d).replace(/[0-9]/g,'');
    const m=new Intl.DateTimeFormat('zh-CN-u-ca-chinese',{month:'long'}).format(d);
    const day=new Intl.DateTimeFormat('zh-CN-u-ca-chinese',{day:'numeric'}).format(d).replace(/[^0-9]/g,'');
    return y+'　'+m+CN_DAY[+day];
  }catch(e){return ''}
}
function renderCalendar(){
  const d=new Date(),el=document.querySelector('.masthead .calendar');if(!el)return;
  el.innerHTML=`${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日　星期${WEEK[d.getDay()]}<br>${lunarLabel(d)}`;
}
/* 时刻递推：时间线的每个时刻都由当前时钟推导，不再写死。
   规则——已经到点的记录按原本的生活节奏显示真实时刻；最后一条若尚未到点，
   则收敛到此刻；还没到点的记录（含今天尚未开始的情况）自动不显示。
   这样任何时间打开页面，看到的都是一条截至此刻、单调递增的真实轨迹。 */
function evtTimes(){
  const ROUND=5,WINDOW=30;                      // 5 分钟取整；提前 30 分钟视为"已到点"
  const now=new Date();
  const nowMin=Math.round((now.getHours()*60+now.getMinutes())/ROUND)*ROUND;
  const toMin=s=>{const[a,b]=(s||'00:00').split(':').map(Number);return a*60+b};
  const toStr=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  const groups={};events.forEach((e,i)=>{(groups[e[0]]=groups[e[0]]||[]).push(i)});
  const out={};
  Object.keys(groups).map(Number).forEach(off=>{
    const idxs=groups[off],pat=idxs.map(i=>toMin(events[i][1]));
    if(off===0){
      const shown=idxs.map((i,j)=>({i,j})).filter(({j})=>pat[j]<=nowMin+WINDOW);
      if(!shown.length)return;                  // 今天还没有到点的记录
      const lastIdx=shown[shown.length-1].i;
      shown.forEach(({i,j})=>{out[i]=toStr(i===lastIdx?Math.min(pat[j],nowMin):pat[j])});
    }else{
      idxs.forEach((i,j)=>{out[i]=toStr(pat[j])});// 更早的日子保持原始节奏
    }
  });
  return out;
}
/* —— 可编辑的记录库：加载时把种子时刻表物化为具体记录（日期+时刻），此后所有编辑都作用于它 —— */
const EVT_ICONS=['run','food','book','run','sleep','food','heart'];
const ACT_ICONS=['run','food','sleep','book','brief','more'];
let records=[];
const isoDate=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const toHHMM=d=>String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
const parseIso=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
/* 时间线记录：只显示用户自己保存的记录，持久化在本地；不再自动生成示例数据 */
const REC_KEY='kongwo-records';
function materializeRecords(){
  try{const v=JSON.parse(localStorage.getItem(REC_KEY));records=Array.isArray(v)?v:[]}catch(e){records=[]}
}
function saveRecords(){try{localStorage.setItem(REC_KEY,JSON.stringify(records))}catch(e){}}
function sortRecords(){records.sort((a,b)=>(a.date+' '+a.time).localeCompare(b.date+' '+b.time))}
function renderMonth(){
  const b=document.querySelector('.month b');if(!b)return;
  if(view.mode==='month'){
    const now=new Date(),base=new Date(now.getFullYear(),now.getMonth()+view.monthOffset,1);
    b.textContent=base.getFullYear()+'年'+(base.getMonth()+1)+'月';
  }else{
    const d=todayShift(view.dayOffset);
    b.textContent=d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日　星期'+WEEK[d.getDay()];
  }
  const t=document.querySelector('.month-today');if(t)t.classList.toggle('on',view.mode==='month'&&view.monthOffset===0);
  const mp=document.querySelector('.month-prev'),mn=document.querySelector('.month-next'),
        dp=document.querySelector('.day-prev'),dn=document.querySelector('.day-next');
  if(mn)mn.disabled=view.mode==='month'&&view.monthOffset>=0;
  if(mp)mp.disabled=false;
  if(dn)dn.disabled=view.mode==='day'?view.dayOffset>=0:true;
  if(dp)dp.disabled=false;
}
let active=0,activity=0;
function renderDomains(){domainsEl.innerHTML=domains.map((d,i)=>`<button class="domain ${i===active?'on':''}" data-i="${i}"><span>${d.icon}</span><div><b>${d.name}</b><small>${d.sub.replace('\n','<br>')}</small></div><em>›</em></button>`).join('')+'<svg class="domain-mountain" viewBox="0 0 210 90"><path d="M0 75 25 55l12 8 28-42 20 32 12-13 24 30 16-11 28 17M0 79c50-13 88 7 130-1s59-4 80 0"/></svg><p class="coordinates" title="'+coordTitle()+'"><span>'+coordLine()+'</span><br>已立于此，心向远方。</p>';document.querySelectorAll('.domain').forEach(b=>b.onclick=()=>{active=+b.dataset.i;renderAll()})}
function renderAll(){let d=domains[active];renderDomains();domainTitle.firstChild.textContent=d.name+' ';domainDesc.textContent=d.desc;mapCenter.textContent=d.name;mapNodes.innerHTML=d.nodes.slice(0,6).map((n,i)=>`<button class="map-node n${i}"><b>${esc(n.t)}</b><small>${esc(n.s)}</small><span class="node-ops"><i data-edit="${i}" title="编辑节点">${svgIcon('pen')}</i><i data-del="${i}" title="删除节点">×</i></span></button>`).join('')+(d.nodes.length<6?`<button class="map-add n${d.nodes.length}" data-add title="添加节点"><b>＋</b><small>新增</small></button>`:'');principleList.innerHTML=d.principles.map((p,i)=>`<li><span>${i+1}</span><div><b>${esc(p.t)}</b>${p.s?`<small>${esc(p.s)}</small>`:''}</div><em class="li-more" title="编辑 / 删除">•••</em></li>`).join('');practiceList.innerHTML=d.practices.map((p,i)=>`<li><label><input type="checkbox" data-pi="${i}" ${p.done?'checked':''}><i></i></label><div><b>${esc(p.t)}</b><small>${esc(p.cad)}</small></div><em class="li-more" title="编辑 / 删除">•••</em></li>`).join('');let counts=document.querySelectorAll('.lists header h4 i');if(counts[0])counts[0].textContent=d.principles.length;if(counts[1])counts[1].textContent=d.practices.length;domainFilter.textContent=(typeof cnNum(domains.length)==='string'?cnNum(domains.length):domains.length)+'大领域'}
const cnNum=n=>'零一二三四五六七八九十'[n]||n;
function renderActivities(){activityPicks.innerHTML=activities.map((a,i)=>`<button class="${i===activity?'on':''}" data-i="${i}"><b>${a[0]}</b><span>${a[1]}</span></button>`).join('');document.querySelectorAll('.activity-picks button').forEach(b=>b.onclick=()=>{activity=+b.dataset.i;renderActivities()})}
function renderTimeline(){
  const[a,b]=view.mode==='month'
    ?(()=>{const now=new Date(),s=new Date(now.getFullYear(),now.getMonth()+view.monthOffset,1);return[s,new Date(s.getFullYear(),s.getMonth()+1,0)]})()
    :[todayShift(view.dayOffset),todayShift(view.dayOffset)];
  const rows=records.map((r,i)=>({r,i})).filter(({r})=>{const d=parseIso(r.date);return d>=a&&d<=b});
  rows.sort((x,y)=>y.r.date.localeCompare(x.r.date)||x.r.time.localeCompare(y.r.time));
  if(!rows.length){timelineList.innerHTML=`<p class="empty-state">${view.mode==='day'?'这一天还没有记录。':'本月暂无记录。'}</p>`;return}
  let lastKey=null,n=0;
  timelineList.innerHTML=rows.map(({r,i})=>{
    const d=parseIso(r.date),key=d.getTime(),show=key!==lastKey;lastKey=key;
    const off=Math.round((d-todayShift(0))/86400000);
    const lb=view.mode==='day'?(off===0?'今天':off===-1?'昨天':off===-2?'前天':''):dayLabel(off);
    const cls=show?(n++===0?'first':'group-start'):'';
    return `<article class="${cls}" data-rec="${i}"><time>${show?`${lb?`<b>${lb}</b>`:''}<small>${shortDate(d)}</small>`:''}</time><i></i><em class="evt-time">${r.time}</em><span class="evt-icon" data-icon="${r.iconKey}"></span><div><b>${esc(r.title)}</b><p>${esc(r.desc)}</p></div><button aria-label="更多操作">•••</button></article>`}).join('')
}
/* —— 记录编辑：••• 菜单 → 编辑 / 复制 / 删除，全部真实生效 —— */
function editRecord(i){
  const r=records[i];if(!r)return;
  showModal('编辑记录',
    `<label class="fld">日期<input class="modal-input" id="editDate" type="date" value="${r.date}"></label>
     <label class="fld">时间<input class="modal-input" id="editTime" type="time" value="${r.time}"></label>
     <label class="fld">内容<input class="modal-input" id="editTitle" value="${esc(r.title)}"></label>
     <label class="fld">备注<textarea class="modal-input" id="editDesc">${esc(r.desc)}</textarea></label>`,
    m=>{
      const d=m.querySelector('#editDate').value,t=m.querySelector('#editTime').value;
      if(d)r.date=d;if(t)r.time=t;
      r.title=m.querySelector('#editTitle').value.trim()||r.title;
      r.desc=m.querySelector('#editDesc').value.trim();
      sortRecords();saveRecords();refreshTimeline();toast('已保存修改');
    });
}
function delRecord(i){
  const r=records[i];if(!r)return;
  showModal('删除记录',`<p class="empty-state">确定删除「${esc(r.title)}」吗？</p>`,()=>{
    records.splice(i,1);saveRecords();refreshTimeline();toast('已删除');
  });
}
function fallbackCopy(t,done){const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done()}catch(e){toast('复制失败')}ta.remove()}
function copyRecord(i){
  const r=records[i];if(!r)return;
  const txt=`${r.time} ${r.title}${r.desc?'　'+r.desc:''}`;
  const done=()=>toast('已复制到剪贴板');
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(done,()=>fallbackCopy(txt,done));
  else fallbackCopy(txt,done);
}
document.querySelectorAll('.sidebar [data-jump]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.sidebar nav button').forEach(x=>x.classList.toggle('on',x===b));document.getElementById(b.dataset.jump)?.scrollIntoView({behavior:'smooth'})});
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.tab).scrollIntoView({behavior:'smooth'}));
saveRecord.onclick=()=>{
  const txt=(quickText.value||'').trim();
  if(!txt){toast('先写点内容，再点保存');quickText.focus();return}
  const now=new Date();
  records.push({date:isoDate(now),time:toHHMM(now),iconKey:ACT_ICONS[activity]||'more',title:txt,desc:''});
  sortRecords();saveRecords();quickText.value='';
  saved.textContent='✓ 已保存到时间线';setTimeout(()=>saved.textContent='',1800);
  view={mode:'month',monthOffset:0,dayOffset:0};renderMonth();refreshTimeline();
};
const domainsEl=document.getElementById('domains');loadDomains();renderAll();renderActivities();renderCalendar();materializeRecords();renderMonth();refreshTimeline();

/* Interaction and precision-icon layer */
function svgIcon(name){const d={"frame": "<circle cx=\"12\" cy=\"5.6\" r=\"2.7\"/><circle cx=\"5.4\" cy=\"16.6\" r=\"2.7\"/><circle cx=\"18.6\" cy=\"16.6\" r=\"2.7\"/><path d=\"M10.6 7.9 6.9 14.2M13.4 7.9l3.7 6.3M8.1 16.6h7.8\"/><path d=\"M3.2 11.2c-.9-1.1-.9-2.7.1-3.8M20.8 11.2c.9-1.1.9-2.7-.1-3.8M10.6 21.2l1.4 1 1.4-1\"/>", "pen": "<path d=\"M5.2 16.8 6.3 12.6 16.4 2.5l3.1 3.1L9.4 15.7l-4.2 1.1Z\"/><path d=\"m14.4 4.5 3.1 3.1M6.3 12.6l3.1 3.1\"/><path d=\"M4 21.3h16\"/>", "clock": "<circle cx=\"12\" cy=\"12\" r=\"9.6\"/><path d=\"M12 6.2V12l3.8 3.4\"/>", "compass": "<circle cx=\"12\" cy=\"12\" r=\"9.6\"/><path d=\"M16.8 7.2 13.3 13.3 7.2 16.8l3.5-6.1Z\"/><path d=\"m10.7 10.7 2.6 2.6\"/>", "plus": "<circle cx=\"12\" cy=\"12\" r=\"9.6\"/><path d=\"M2.4 12h19.2M12 2.4v19.2M3.8 7.2h16.4M3.8 16.8h16.4M7.6 3.5v17M16.4 3.5v17\"/>", "search": "<circle cx=\"10.4\" cy=\"10.4\" r=\"6.4\"/><path d=\"m15.2 15.2 5.4 5.4\"/>", "inbox": "<rect x=\"3.4\" y=\"5\" width=\"17.2\" height=\"14.4\" rx=\"2.2\"/><path d=\"M3.4 9.6h5.2l1.6 2.6h3.6l1.6-2.6h5.2\"/>", "settings": "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12.71 4.83 L14.79 2.81 L16.53 3.53 L16.57 6.43 L17.57 7.43 L20.47 7.47 L21.19 9.21 L19.17 11.29 L19.17 12.71 L21.19 14.79 L20.47 16.53 L17.57 16.57 L16.57 17.57 L16.53 20.47 L14.79 21.19 L12.71 19.17 L11.29 19.17 L9.21 21.19 L7.47 20.47 L7.43 17.57 L6.43 16.57 L3.53 16.53 L2.81 14.79 L4.83 12.71 L4.83 11.29 L2.81 9.21 L3.53 7.47 L6.43 7.43 L7.43 6.43 L7.47 3.53 L9.21 2.81 L11.29 4.83Z\"/>", "health": "<circle cx=\"12\" cy=\"12\" r=\"11\"/><circle cx=\"12\" cy=\"12\" r=\"2.1\"/><path d=\"M12 2.4v4.2M12 17.4v4.2M2.4 12h4.2M17.4 12h4.2\"/><path d=\"M13.5 10.5c1.4-2.7 3.2-4.1 4.9-4.9-.8 1.7-2.2 3.5-4.9 4.9ZM10.5 13.5c-1.4 2.7-3.2 4.1-4.9 4.9.8-1.7 2.2-3.5 4.9-4.9ZM10.5 10.5C7.8 9.1 6.4 7.3 5.6 5.6c1.7.8 3.5 2.2 4.9 4.9ZM13.5 13.5c2.7 1.4 4.1 3.2 4.9 4.9-1.7-.8-3.5-2.2-4.9-4.9Z\"/>", "learn": "<circle cx=\"12\" cy=\"12\" r=\"11\"/><path d=\"M12 1v22M12 12.6l-7.6 6.6M12 12.6l7.6 6.6\"/><path d=\"M12 3c1.3 2.4 1.3 4.8 0 7.2-1.3-2.4-1.3-4.8 0-7.2Z\"/><circle cx=\"12\" cy=\"12\" r=\"1.7\"/><path d=\"m10.4 19.6 1.6 2 1.6-2\"/>", "work": "<circle cx=\"12\" cy=\"12\" r=\"11\"/><path d=\"M12 1v22M1 12h22\"/><circle cx=\"12\" cy=\"12\" r=\"1.1\"/><path d=\"m5.6 5.6 1.9 1.9M5.6 5.6v2M18.4 5.6l-1.9 1.9M18.4 5.6v2M5.6 18.4l1.9-1.9M5.6 18.4v-2M18.4 18.4l-1.9-1.9M18.4 18.4v-2\"/>", "family": "<circle cx=\"12\" cy=\"12\" r=\"11\"/><path d=\"M12 12c.4-3.3 2-5.3 4.8-5.6.3 2.8-1.7 4.8-4.8 5.6Z\"/><path d=\"M12 12c3.3.4 5.3 2 5.6 4.8-2.8.3-4.8-1.7-5.6-4.8Z\"/><path d=\"M12 12c-.4 3.3-2 5.3-4.8 5.6-.3-2.8 1.7-4.8 4.8-5.6Z\"/><path d=\"M12 12c-3.3-.4-5.3-2-5.6-4.8 2.8-.3 4.8 1.7 5.6 4.8Z\"/>", "wealth": "<circle cx=\"12\" cy=\"12\" r=\"11\"/><circle cx=\"12\" cy=\"12\" r=\"5.4\"/><circle cx=\"12\" cy=\"12\" r=\"1.2\"/><path d=\"M12 6.6v10.8M6.6 12h10.8M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6\"/><path d=\"m15.8 8.2 3.9-3.9\"/>", "spirit": "<circle cx=\"12\" cy=\"6.4\" r=\"4.6\"/><circle cx=\"17.6\" cy=\"12\" r=\"4.6\"/><circle cx=\"12\" cy=\"17.6\" r=\"4.6\"/><circle cx=\"6.4\" cy=\"12\" r=\"4.6\"/><circle cx=\"12\" cy=\"12\" r=\"2.3\"/>", "run": "<circle cx=\"15.6\" cy=\"4.2\" r=\"1.9\"/><path d=\"M13.6 7.2 11 12.6M13.6 7.2 9.6 8.6 7.6 11.2M13.2 8.2l2.9 2.5 3-.2M11 12.6l3.5 2.6-1 5M11 12.6l-2.5 4-4 1\"/>", "food": "<path d=\"M5.6 3v5.2a2.4 2.4 0 0 0 4.8 0V3M8 3v18\"/><ellipse cx=\"16.6\" cy=\"6.8\" rx=\"2.7\" ry=\"3.9\"/><path d=\"M16.6 10.7V21\"/>", "book": "<path d=\"M2.8 5.6c3.1-1 6.1-.6 9.2 1.5 3.1-2.1 6.1-2.5 9.2-1.5v13.6c-3.1-1-6.1-.6-9.2 1.5-3.1-2.1-6.1-2.5-9.2-1.5Z\"/><path d=\"M12 7.1v13.6M5.4 9h3.8M5.4 11.6h3.8M5.4 14.2h3.8M14.8 9h3.8M14.8 11.6h3.8M14.8 14.2h3.8\"/>", "sleep": "<path d=\"M19.6 15.4A8.6 8.6 0 1 1 9.4 3.8a7 7 0 0 0 10.2 11.6Z\"/>", "heart": "<path d=\"M12 20.4s-8.2-5-8.2-11a4.3 4.3 0 0 1 8.2-2.1 4.3 4.3 0 0 1 8.2 2.1c0 6-8.2 11-8.2 11Z\"/><circle cx=\"9.5\" cy=\"10.6\" r=\"1.1\"/><circle cx=\"14.5\" cy=\"10.6\" r=\"1.1\"/><path d=\"M8.6 14.2c1.1-.9 2.2-.9 3.4 0 1.2-.9 2.3-.9 3.4 0\"/>", "brief": "<rect x=\"3.4\" y=\"7\" width=\"17.2\" height=\"12.4\" rx=\"1.4\"/><path d=\"M9 7V4.4h6V7M3.4 12.2h17.2M10.6 12.2v1.8h2.8v-1.8\"/>", "more": "<circle cx=\"5\" cy=\"12\" r=\"1\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/>"};return `<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">${d[name]||d.more}</svg>`}
function polishIcons(){['frame','pen','clock','compass','plus'].forEach((n,i)=>{let e=document.querySelectorAll('.sidebar nav button b')[i];if(e)e.innerHTML=svgIcon(n)});['search','inbox','settings'].forEach((n,i)=>{let e=document.querySelectorAll('.side-tools button')[i];if(e&&!e.querySelector('svg'))e.insertAdjacentHTML('afterbegin',svgIcon(n))});['health','learn','work','family','wealth','spirit'].forEach((n,i)=>{let e=document.querySelectorAll('.domain>span')[i];if(e)e.innerHTML=svgIcon(n)});document.querySelectorAll('.domain>span').forEach(e=>{if(!e.querySelector('svg'))e.innerHTML=svgIcon('spirit')});['run','food','sleep','book','brief','more'].forEach((n,i)=>{let e=document.querySelectorAll('.activity-picks button b')[i];if(e)e.innerHTML=svgIcon(n)});const evtColor={run:'warm',food:'cool',book:'cool',sleep:'deep',family:'warm',heart:'warm'};
/* 图标由记录自带的 iconKey（data-icon）决定：编辑/增删后依然一一对应 */
document.querySelectorAll('.evt-icon').forEach(e=>{const k=e.dataset.icon||'more';e.innerHTML=svgIcon(k);e.classList.add(evtColor[k]||'')});document.querySelectorAll('.timeline-list article>button').forEach(e=>{e.innerHTML=svgIcon('more');e.classList.add('event-more')})}
const _renderAll=renderAll;renderAll=function(){_renderAll();polishIcons();bindDynamicButtons()};const _renderActivities=renderActivities;renderActivities=function(){_renderActivities();polishIcons()};polishIcons();
function toast(text){let t=document.getElementById('toast')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'toast'}));t.textContent=text;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),1800)}
function showModal(title,html,ok){let m=document.getElementById('modal')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'modal'}));m.innerHTML=`<div class="modal-card"><header><b>${title}</b><button data-close>×</button></header><div class="modal-body">${html}</div><footer><button data-close>取消</button><button class="primary" data-ok>确认</button></footer></div>`;m.classList.add('open');m.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>m.classList.remove('open'));m.querySelector('[data-ok]').onclick=()=>{ok&&ok(m);m.classList.remove('open')}}
let _menuAnchor=null;
function closeMenu(){let m=document.querySelector('.pop-menu');if(m)m.remove();_menuAnchor=null;document.removeEventListener('click',menuOutside,true)}
function menuOutside(e){if(_menuAnchor&&!e.target.closest('.pop-menu')&&!_menuAnchor.contains(e.target))closeMenu()}
function menu(anchor,items,onPick,activeIndex){
  let old=document.querySelector('.pop-menu');
  if(old){let same=_menuAnchor===anchor;closeMenu();if(same)return}
  let z=curZoom(),r=anchor.getBoundingClientRect(),m=document.createElement('div');
  m.className='pop-menu';_menuAnchor=anchor;
  m.innerHTML=items.map((x,i)=>`<button${i===activeIndex?' class="on"':''}>${x}</button>`).join('');
  m.style.left=Math.min(r.left/z,innerWidth/z-150)+'px';
  document.body.appendChild(m);
  let top=r.bottom/z+5,mh=m.offsetHeight,vh=innerHeight/z;
  if(top+mh>vh-8)top=Math.max(8,r.top/z-mh-5);   // 底部放不下时翻到锚点上方
  m.style.top=top+'px';
  m.querySelectorAll('button').forEach((b,i)=>b.onclick=ev=>{ev.stopPropagation();closeMenu();onPick?onPick(i):toast(items[i]+'：已响应')});
  setTimeout(()=>document.addEventListener('click',menuOutside,true),0);
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
/* —— 原则 / 实践 / 节点：新增、编辑、删除（全部真实生效并持久化） —— */
function principleModal(i){
  const d=domains[active],p=d.principles[i]||{};
  showModal(i===undefined?'新增原则':'编辑原则',
    `<input class="modal-input" id="pTitle" placeholder="原则（一句话）" value="${esc(p.t||'')}">
     <textarea class="modal-input" id="pSub" placeholder="补充说明（可选）">${esc(p.s||'')}</textarea>`,
    m=>{const t=m.querySelector('#pTitle').value.trim();if(!t)return;
      const v={t,s:m.querySelector('#pSub').value.trim()};
      if(i===undefined)d.principles.push(v);else d.principles[i]=v;
      saveDomains();renderAll();toast(i===undefined?'原则已添加':'已保存修改')});
}
function practiceModal(i){
  const d=domains[active],p=d.practices[i]||{};
  const cad=(p.cad||'每日 · 长期').split(' · ')[0];
  showModal(i===undefined?'新增实践':'编辑实践',
    `<input class="modal-input" id="prTitle" placeholder="实践内容" value="${esc(p.t||'')}">
     <label class="fld">节奏<select class="modal-input" id="prCad">${['每日','每周','每月'].map(x=>`<option${x===cad?' selected':''}>${x}</option>`).join('')}</select></label>`,
    m=>{const t=m.querySelector('#prTitle').value.trim();if(!t)return;
      const v={t,cad:m.querySelector('#prCad').value+' · 长期',done:p.done||false};
      if(i===undefined)d.practices.push(v);else d.practices[i]=v;
      saveDomains();renderAll();toast(i===undefined?'实践已添加':'已保存修改')});
}
function nodeModal(i){
  const d=domains[active];
  if(i===undefined&&d.nodes.length>=6){toast('罗盘最多放 6 个节点，请先删除一个');return}
  const n=d.nodes[i]||{};
  showModal(i===undefined?'添加节点':'编辑节点',
    `<input class="modal-input" id="nTitle" placeholder="节点名称（如：运动）" value="${esc(n.t||'')}">
     <input class="modal-input" id="nSub" placeholder="一句备注（如：强化体能）" value="${esc(n.s||'')}">
     ${i===undefined?'':`<label class="modal-field">所属领域<select class="modal-input" id="nDomain">${domains.map((x,k)=>`<option value="${k}" ${k===active?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`}`,
    m=>{const t=m.querySelector('#nTitle').value.trim();if(!t)return;
      const v={t,s:m.querySelector('#nSub').value.trim()};
      if(i===undefined)d.nodes.push(v);else d.nodes[i]=Object.assign({},d.nodes[i],v);
      const to=m.querySelector('#nDomain')?+m.querySelector('#nDomain').value:active;
      if(i!==undefined&&to!==active){if(!moveNode(i,to))return;return}
      saveDomains();renderAll();toast(i===undefined?'节点已添加':'已保存修改')});
}
/* 把当前领域的第 i 个节点移到另一个领域：卡片按节点 id 存，跟着一起走 */
function moveNode(i,to){
  const from=domains[active],dest=domains[to];if(!dest||to===active)return false;
  if(dest.nodes.length>=6){toast('「'+dest.name+'」已有 6 个节点，请先腾出位置');return false}
  const n=from.nodes.splice(i,1)[0];delete n.a;delete n.r;delete n.o;dest.nodes.push(n);
  saveDomains();renderAll();toast('「'+n.t+'」已移到「'+dest.name+'」');return true;
}
function confirmDel(what,fn){showModal('删除'+what,`<p class="empty-state">确定删除这个${what}吗？删除后不可恢复。</p>`,()=>{fn();toast('已删除')})}
function bindDynamicButtons(){document.querySelectorAll('.lists header button').forEach((b,i)=>b.onclick=()=>i?practiceModal():principleModal());let more=document.querySelector('.domain-heading>button');if(more)more.onclick=e=>menu(e.currentTarget,['添加节点','编辑领域','复制领域','归档领域'],pick=>{if(pick===0)nodeModal()})}
bindDynamicButtons();
/* 事件委托：列表重绘后无需重绑 */
principleList.addEventListener('click',e=>{
  const em=e.target.closest('.li-more');if(!em)return;
  const i=[...principleList.querySelectorAll(':scope>li')].indexOf(em.closest('li'));
  menu(em,['编辑原则','删除原则'],pick=>pick===0?principleModal(i):confirmDel('原则',()=>{domains[active].principles.splice(i,1);saveDomains();renderAll()}));
});
practiceList.addEventListener('click',e=>{
  const em=e.target.closest('.li-more');if(!em)return;
  const i=[...practiceList.querySelectorAll(':scope>li')].indexOf(em.closest('li'));
  menu(em,['编辑实践','删除实践'],pick=>pick===0?practiceModal(i):confirmDel('实践',()=>{domains[active].practices.splice(i,1);saveDomains();renderAll()}));
});
practiceList.addEventListener('change',e=>{
  const cb=e.target.closest('input[type=checkbox]');if(!cb)return;
  domains[active].practices[+cb.dataset.pi].done=cb.checked;saveDomains();
});
mapNodes.addEventListener('click',e=>{
  const ed=e.target.closest('[data-edit]'),de=e.target.closest('[data-del]');
  if(ed){e.stopPropagation();return nodeModal(+ed.dataset.edit)}
  if(de){e.stopPropagation();const i=+de.dataset.del;return confirmDel('节点',()=>{domains[active].nodes.splice(i,1);saveDomains();renderAll()})}
  if(e.target.closest('[data-add]')){e.stopPropagation();return nodeModal()}
});
/* legacy ternary handler disabled
document.querySelectorAll('.side-tools button').forEach((b,i)=>b.onclick=()=>i===0?showModal('搜索人生系统','<input class="modal-input" placeholder="搜索领域、原则、实践或记录">',m=>toast('正在搜索：'+(m.querySelector('input').value||'全部')):i===1?showModal('收纳箱','<p class="empty-state">暂时没有待归档内容。</p>',()=>toast('收纳箱已确认')):showModal('设置','<label class="setting"><input type="checkbox" checked> 显示纸张纹理</label><label class="setting"><input type="checkbox" checked> 开启动效</label>',()=>toast('设置已保存')));
*/
let pa=document.querySelectorAll('.panel-actions button');pa[0].onclick=e=>menu(e.currentTarget,domains.map(d=>d.name),i=>{active=i;renderAll()},active);pa[1].onclick=()=>showModal('添加领域','<input class="modal-input" id="newDomain" placeholder="领域名称"><textarea class="modal-input" id="newDesc" placeholder="一句描述"></textarea>',m=>{let n=m.querySelector('#newDomain').value.trim();if(!n)return;domains.push({name:n,icon:'✦',sub:'新的生命领域',desc:m.querySelector('#newDesc').value||'等待你定义这个领域。',nodes:[['开始','第一步']],principles:[],practices:[]});active=domains.length-1;renderAll();toast('领域已添加')});pa[2].onclick=e=>menu(e.currentTarget,['导入框架','导出框架','重新排序','恢复示例数据'],pick=>{if(pick===3){domains.length=0;domains.push(...JSON.parse(JSON.stringify(SEED)));saveDomains();active=0;renderAll();toast('已恢复示例数据')}});
document.querySelectorAll('.side-tools button').forEach(function(b,i){b.onclick=function(){if(i===0)showModal('搜索人生系统','<input class="modal-input" placeholder="搜索领域、原则、实践或记录">',function(){toast('搜索已响应')});else if(i===1)showModal('收纳箱','<p class="empty-state">暂时没有待归档内容。</p>',function(){toast('收纳箱已确认')});else openSettings()}});
document.querySelectorAll('.meta-row span').forEach(s=>s.onclick=()=>{s.classList.toggle('selected');toast(s.textContent.trim()+'已切换')});document.querySelector('.quick .panel-title>button').onclick=()=>{document.querySelector('.quick').classList.toggle('expanded');toast('记录面板已切换')};document.querySelector('.timeline .panel-title>button').onclick=e=>menu(e.currentTarget,['按领域筛选','导出时间线','清空筛选']);document.querySelector('.month-today').onclick=()=>{view={mode:'month',monthOffset:0,dayOffset:0};renderMonth();refreshTimeline();toast('已回到今天')};
document.querySelector('.month-prev').onclick=()=>{const base=view.mode==='month'?view.monthOffset:monthsFromNow(view.dayOffset);view={mode:'month',monthOffset:base-1,dayOffset:0};renderMonth();refreshTimeline()};
document.querySelector('.month-next').onclick=()=>{const base=view.mode==='month'?view.monthOffset:monthsFromNow(view.dayOffset);view={mode:'month',monthOffset:Math.min(0,base+1),dayOffset:0};renderMonth();refreshTimeline()};
document.querySelector('.day-prev').onclick=()=>{view={mode:'day',monthOffset:0,dayOffset:(view.mode==='day'?view.dayOffset:0)-1};renderMonth();refreshTimeline()};
document.querySelector('.day-next').onclick=()=>{if(view.mode!=='day')return;view.dayOffset=Math.min(0,view.dayOffset+1);renderMonth();refreshTimeline()};document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));toast('已切换到'+b.textContent)});document.addEventListener('click',e=>{let n=e.target.closest('.map-node');if(n){quickText.value='完成「'+n.querySelector('b').textContent+'」相关行动';toast('已带入快速记录')}});

/* Zoom-to-fit：页面按 1440 设计画布布局，窗口更窄时整页等比缩小，
   保持设计稿比例且完整可见，不再横向溢出（等效于把浏览器缩放补到正好）。 */
const DESIGN_W=1440;
function curZoom(){return parseFloat(getComputedStyle(document.documentElement).zoom)||1}
function fitZoom(){let vw=document.documentElement.clientWidth,z=Math.min(1,vw/DESIGN_W);document.documentElement.style.zoom=z<0.998?z:''}
fitZoom();addEventListener('resize',fitZoom);

/* 时间线刷新：重绘后补回图标与「•••」菜单绑定（重绘会丢失一次性绑定的事件） */
function refreshTimeline(){
  renderTimeline();polishIcons();
  document.querySelectorAll('.event-more').forEach(b=>b.onclick=e=>{
    const art=b.closest('article');if(!art)return;
    menu(e.currentTarget,['编辑记录','复制内容','删除记录'],pick=>{
      const i=+art.dataset.rec;
      if(pick===0)editRecord(i);else if(pick===1)copyRecord(i);else delRecord(i);
    });
  });
}
/* 日期与时刻随时钟推进：每分钟、以及从后台切回前台时重新递推 */
setInterval(()=>{renderCalendar();renderMonth();refreshTimeline()},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){renderCalendar();renderMonth();refreshTimeline()}});


/* 坐标：优先用设备定位（浏览器会先询问授权），结果缓存在本地；拿不到时显示上次位置或默认值 */
const GEO_KEY='kongwo-geo';
var geo=(()=>{try{return JSON.parse(localStorage.getItem(GEO_KEY))||null}catch(e){return null}})();
function coordLine(){
  const g=geo||{lat:39.9,lon:116.4};
  const la=Math.abs(g.lat).toFixed(1),lo=Math.abs(g.lon).toFixed(1);
  return (g.lat>=0?'北纬 ':'南纬 ')+la+'°　'+(g.lon>=0?'东经 ':'西经 ')+lo+'°';
}
function coordTitle(){return geo?('设备定位 · '+new Date(geo.t).toLocaleString('zh-CN')+' · 点击重新定位'):'默认坐标 · 点击获取设备位置'}
function paintCoords(){const e=document.querySelector('.coordinates');if(!e)return;const sp=e.querySelector('span');if(sp)sp.textContent=coordLine();e.title=coordTitle()}
function locate(manual){
  if(!('geolocation' in navigator)){if(manual)toast('当前浏览器不支持定位');return}
  navigator.geolocation.getCurrentPosition(pos=>{
    geo={lat:pos.coords.latitude,lon:pos.coords.longitude,t:Date.now()};
    try{localStorage.setItem(GEO_KEY,JSON.stringify(geo))}catch(e){}
    paintCoords();if(manual)toast('已更新为当前位置');
  },err=>{if(manual)toast(err.code===1?'未获得定位授权，可在浏览器地址栏左侧开启':'暂时无法获取位置')},
  {enableHighAccuracy:true,timeout:15000,maximumAge:6*3600*1000});
}
paintCoords();locate(false);
document.addEventListener('click',e=>{if(e.target.closest('.coordinates')){toast('正在获取当前位置…');locate(true)}});


/* —— 纸面主题：设置里挑选，太阳按钮循环切换，选择保存在本地 —— */
const PAPER_KEY='kongwo-paper';
const PAPERS=[
  {id:'warm',name:'暖宣',note:'暖米色，纤维清晰',sw:'#e9e1d0'},
  {id:'plain',name:'素宣',note:'冷灰素净，贴近设计稿',sw:'#e6e2d4'},
  {id:'bamboo',name:'竹帘纸',note:'浅竹黄，细密帘纹',sw:'#e8dfc4',pat:'repeating-linear-gradient(0deg,rgba(110,92,52,.08) 0 1px,transparent 1px 2.5px),repeating-linear-gradient(90deg,rgba(110,92,52,.1) 0 1px,transparent 1px 18px)'},
  {id:'celadon',name:'青瓷笺',note:'淡青灰，与墨青同调',sw:'#dfe3da'},
  {id:'aged',name:'古卷',note:'旧纸焦黄，四角沉暗',sw:'#ddcfae',pat:'radial-gradient(circle at 15% 15%,rgba(150,104,40,.28),transparent 60%)'},
  {id:'landscape',name:'山水笺',note:'素宣底，远山淡水印',sw:'#e7e2d3',pat:'url(assets/visual/mountain-panorama.png) center 85%/220% auto no-repeat'}
];
function currentPaper(){return document.documentElement.dataset.paper||'warm'}
function setPaper(id,quiet){
  if(!PAPERS.some(p=>p.id===id))id='warm';
  document.documentElement.dataset.paper=id;
  try{localStorage.setItem(PAPER_KEY,id)}catch(e){}
  if(!quiet)toast('纸面：'+PAPERS.find(p=>p.id===id).name);
}
function openSettings(){
  const cur=currentPaper();
  const cards=PAPERS.map(p=>`<button type="button" role="radio" data-paper="${p.id}" aria-checked="${p.id===cur}"><i style="background:${p.pat?p.pat+',':''}url(assets/visual/xuan-paper.png) center/180px,${p.sw};background-blend-mode:multiply"></i>${p.name}<small>${p.note}</small></button>`).join('');
  showModal('设置',`<p class="setting-title">纸面</p><div class="paper-picker" role="radiogroup" aria-label="纸面">${cards}</div><label class="setting"><input type="checkbox" checked> 开启动效</label>`,()=>toast('设置已保存'));
  const box=document.querySelector('#modal .paper-picker');
  box.addEventListener('click',e=>{
    const b=e.target.closest('[data-paper]');if(!b)return;
    box.querySelectorAll('[data-paper]').forEach(x=>x.setAttribute('aria-checked',x===b));
    setPaper(b.dataset.paper);   // 点选即预览，关掉弹窗也保留
  });
}
(function initPaper(){
  setPaper(currentPaper(),true);
  const sun=document.querySelector('.masthead .sun');if(!sun)return;
  const next=()=>{const i=PAPERS.findIndex(p=>p.id===currentPaper());setPaper(PAPERS[(i+1)%PAPERS.length].id)};
  sun.addEventListener('click',next);
  sun.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();next()}});
})();
