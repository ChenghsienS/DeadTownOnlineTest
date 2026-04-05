(function(){
  const sameOriginWs = (location.host && !/github\.io$/i.test(location.hostname))
    ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
    : '';
  const ONLINE_DEFAULT_WS = localStorage.getItem('deadtown_online_server_url') || sameOriginWs;
  const ONLINE_T = {
    en: {
      onlineBtn: 'Online Co-op',
      onlineTitle: 'ONLINE CO-OP',
      onlineDesc: 'Authoritative co-op preview. Rooms, shared wave state, enemies, boss, airdrops, pickups, and damage are now synchronized through the server.',
      serverUrl: 'WebSocket Server URL',
      roomName: 'Room Name',
      createRoom: 'Create Room',
      connect: 'Connect',
      disconnect: 'Disconnect',
      refresh: 'Refresh',
      join: 'Join',
      leave: 'Leave Room',
      ready: 'Ready',
      unready: 'Unready',
      startMatch: 'Start Match',
      roomPlayers: 'Players',
      statusIdle: 'Status: idle',
      statusConnecting: 'Status: connecting...',
      statusConnected: 'Status: connected',
      statusError: 'Status: connection error',
      back: 'Back',
      host: 'Host',
      players: 'Players',
      peers: 'Peers',
      readyStatus: 'Ready',
      unreadyStatus: 'Not Ready',
      inGame: 'In Game',
      autoStarting: 'Auto start in',
      rooms: 'Public Rooms',
      noRooms: 'No public rooms yet.',
      onlinePreview: 'ONLINE SYNC',
      onlineNoLeaderboard: 'Online co-op matches do not submit leaderboard scores.',
      onlineRoomCreated: 'Room created.',
      onlineNeedName: 'Set your player name first.',
      onlineNeedServer: 'Enter the WebSocket server URL first.',
      onlineJoined: 'Joined room.',
      onlineDisconnected: 'Disconnected from online server.',
      onlineRoomNameFallback: 'DeadTown Room',
      onlineRoomOwner: 'Owner',
      onlineStateStarted: 'Started',
      onlineStateWaiting: 'Lobby',
      onlinePlayersLabel: 'Room Players',
      onlineConnectHelp: 'For local testing use ws://localhost:8080. For deployed HTTPS sites use wss://.',
      onlineServerPlaceholder: 'ws://localhost:8080',
      onlineStartInfo: 'Starting synchronized online match...',
      onlineMatchEnded: 'Match ended.',
    },
    zh: {
      onlineBtn: '在线合作',
      onlineTitle: '在线合作',
      onlineDesc: '这是带房间级共享战局的联机预览版。波次、僵尸、Boss、空投、掉落物和伤害现在都由服务器统一同步。',
      serverUrl: 'WebSocket 服务器地址',
      roomName: '房间名',
      createRoom: '创建房间',
      connect: '连接',
      disconnect: '断开',
      refresh: '刷新',
      join: '加入',
      leave: '离开房间',
      ready: '准备',
      unready: '取消准备',
      startMatch: '开始游戏',
      roomPlayers: '玩家',
      statusIdle: '状态：空闲',
      statusConnecting: '状态：连接中...',
      statusConnected: '状态：已连接',
      statusError: '状态：连接失败',
      back: '返回',
      host: '房主',
      players: '玩家',
      peers: '其他玩家',
      readyStatus: '已准备',
      unreadyStatus: '未准备',
      inGame: '进行中',
      autoStarting: '自动开始倒计时',
      rooms: '公共房间',
      noRooms: '还没有公共房间。',
      onlinePreview: '在线同步版',
      onlineNoLeaderboard: '在线合作模式不会上传排行榜成绩。',
      onlineRoomCreated: '房间已创建。',
      onlineNeedName: '请先设置玩家名字。',
      onlineNeedServer: '请先输入 WebSocket 服务器地址。',
      onlineJoined: '已加入房间。',
      onlineDisconnected: '已断开在线服务器。',
      onlineRoomNameFallback: 'DeadTown 房间',
      onlineRoomOwner: '房主',
      onlineStateStarted: '已开始',
      onlineStateWaiting: '大厅中',
      onlinePlayersLabel: '房间玩家',
      onlineConnectHelp: '本地测试用 ws://localhost:8080。部署到 HTTPS 网站时请使用 wss://。',
      onlineServerPlaceholder: 'ws://localhost:8080',
      onlineStartInfo: '正在进入联机同步对局...',
      onlineMatchEnded: '对局已结束。',
    }
  };

  const online = {
    state: 'idle',
    connected: false,
    connecting: false,
    started: false,
    ws: null,
    clientId: null,
    serverUrl: ONLINE_DEFAULT_WS,
    roomId: null,
    rooms: [],
    roomState: null,
    countdownEndsAt: null,
    peers: {},
    worldSeed: null,
    gameMode: 'single',
    sendTimer: 0,
    lastSnapshotAt: 0,
    pendingSnapshot: null,
    lastServerHp: null,
    spectating: false,
    spectateTargetId: null,
    selfAlive: true,
  };
  window.deadtownOnline = online;

  function ot(){ return ONLINE_T[lang] || ONLINE_T.en; }
  function onlineIsMode(){ return online.gameMode === 'online'; }
  function onlineStatusText(){
    const t = ot();
    if(online.state === 'connecting') return t.statusConnecting;
    if(online.state === 'connected') return t.statusConnected;
    if(online.state === 'error') return t.statusError;
    return t.statusIdle;
  }
  function onlinePersistUrl(v){ online.serverUrl = String(v || '').trim(); localStorage.setItem('deadtown_online_server_url', online.serverUrl); }
  function onlineSend(data){ if(online.ws && online.ws.readyState === 1) online.ws.send(JSON.stringify(data)); }
  function onlineSendAction(action){ if(online.connected && online.started) onlineSend({ type:'player_action', action }); }

  const __origLoadLeaderboard = loadLeaderboard;
  loadLeaderboard = async function(force=false){ if(onlineIsMode()) return; return __origLoadLeaderboard(force); };
  const __origSyncPlayerBest = syncPlayerBest;
  syncPlayerBest = async function(){ if(onlineIsMode()) return; return __origSyncPlayerBest(); };
  const __origSubmitLeaderboardScore = submitLeaderboardScore;
  submitLeaderboardScore = async function(score){ if(onlineIsMode()) return; return __origSubmitLeaderboardScore(score); };

  function makeSeededRng(seed){ let s=(seed>>>0)||123456789; return function(){ s=(1664525*s+1013904223)>>>0; return s/4294967296; }; }
  const __origGenerateWorld = generateWorld;
  generateWorld = function(){
    if(onlineIsMode() && Number.isInteger(online.worldSeed)){
      const seeded = makeSeededRng(online.worldSeed);
      const prevRand = Math.random;
      Math.random = seeded;
      try{ return __origGenerateWorld(); }
      finally{ Math.random = prevRand; }
    }
    return __origGenerateWorld();
  };

  function onlineResetState(keepConnection=false){
    online.roomId = null;
    online.roomState = null;
    online.peers = {};
    online.started = false;
    online.worldSeed = null;
    online.sendTimer = 0;
    online.lastSnapshotAt = 0;
    online.pendingSnapshot = null;
    online.lastServerHp = null;
    online.spectating = false;
    online.spectateTargetId = null;
    online.selfAlive = true;
    if(!keepConnection){
      online.connected = false;
      online.connecting = false;
      online.clientId = null;
      online.state = 'idle';
    }
  }

  function onlineDisconnect(silent=false){
    if(online.ws){
      try{ online.ws.onclose = null; online.ws.close(); }catch(err){}
      online.ws = null;
    }
    onlineResetState(true);
    online.connected = false;
    online.connecting = false;
    online.state = 'idle';
    if(!silent) pushOnlineNotice(ot().onlineDisconnected, 'warn');
  }

  function onlineConnect(){
    if(online.connected || online.connecting) return;
    if(!state.playerName){ pushOnlineNotice(ot().onlineNeedName, 'warn'); return; }
    if(!online.serverUrl){ pushOnlineNotice(ot().onlineNeedServer, 'warn'); return; }
    online.connecting = true;
    online.state = 'connecting';
    renderOnlineLobby();
    try{
      const ws = new WebSocket(online.serverUrl);
      online.ws = ws;
      ws.onopen = ()=>{
        online.connecting = false;
        online.connected = true;
        online.state = 'connected';
        onlineSend({ type:'hello', name:state.playerName, version:'dt-online-p0', lang });
        onlineSend({ type:'list_rooms' });
        renderOnlineLobby();
      };
      ws.onmessage = (ev)=>{
        let msg = null;
        try{ msg = JSON.parse(ev.data); }catch(err){ return; }
        handleOnlineMessage(msg);
      };
      ws.onerror = ()=>{ online.state = 'error'; renderOnlineLobby(); };
      ws.onclose = ()=>{
        const wasOnlineMatch = state.running && !state.gameOver && onlineIsMode();
        const wasInMenu = !state.running || state.gameOver || state.overlayScreen==='online-lobby' || state.overlayScreen==='online-room';
        onlineResetState(true);
        online.connected = false;
        online.connecting = false;
        online.state = 'idle';
        if(wasOnlineMatch){
          pushOnlineNotice(ot().onlineDisconnected, 'error');
          goToMainMenu();
          return;
        }
        if(wasInMenu && !state.running) renderOnlineLobby();
      };
    }catch(err){
      online.connecting = false;
      online.connected = false;
      online.state = 'error';
      renderOnlineLobby();
    }
  }

  function mapBuffAnnouncement(buff){
    if(buff === 'damage') return T[lang].serumDamage;
    if(buff === 'speed') return T[lang].serumSpeed;
    if(buff === 'health') return T[lang].serumHealth;
    return '';
  }


  function onlineAlivePeers(){
    return Object.values(online.peers).filter(p=>p && p.alive && (p.hp||0)>0);
  }

  function onlinePickSpectateTarget(){
    if(!online.spectating){ online.spectateTargetId = null; return; }
    const alivePeers = onlineAlivePeers();
    if(!alivePeers.length){ online.spectateTargetId = null; return; }
    if(online.spectateTargetId && online.peers[online.spectateTargetId]?.alive && (online.peers[online.spectateTargetId]?.hp||0)>0) return;
    online.spectateTargetId = alivePeers[0].id;
  }

  function onlineSpectateTarget(){
    if(!online.spectating) return null;
    onlinePickSpectateTarget();
    return online.spectateTargetId ? (online.peers[online.spectateTargetId] || null) : null;
  }

  function onlineSetSpectating(next){
    online.spectating = !!next;
    if(!online.spectating){
      online.spectateTargetId = null;
      online.selfAlive = true;
      updateCursorVisibility();
      return;
    }
    state.paused = false;
    mouseDown = false;
    onlinePickSpectateTarget();
    updateCursorVisibility();
  }

  function applySelfFromServer(self){
    if(!self) return;
    const prevHp = online.lastServerHp == null ? player.hp : online.lastServerHp;
    const wasAlive = online.selfAlive !== false;
    online.selfAlive = !!self.alive && (self.hp||0) > 0;
    const dx = self.x - player.x;
    const dy = self.y - player.y;
    if(Math.hypot(dx,dy) > 24 || !state.running){
      player.x = self.x;
      player.y = self.y;
    }else{
      player.x += dx * 0.55;
      player.y += dy * 0.55;
    }
    player.hp = self.hp;
    player.maxHp = self.maxHp;
    player.faceDir = self.faceDir || player.faceDir || 1;
    player.weapon = self.weapon || player.weapon;
    player.mag = self.mag ?? player.mag;
    player.magSize = self.magSize ?? player.magSize;
    player.grenades = self.grenades ?? player.grenades;
    player.molotovs = self.molotovs ?? player.molotovs;
    player.gatlingAmmo = self.gatlingAmmo ?? player.gatlingAmmo;
    player.rocketAmmo = self.rocketAmmo ?? player.rocketAmmo;
    player.flameAmmo = self.flameAmmo ?? player.flameAmmo;
    player.speedMul = self.speedMul ?? player.speedMul;
    player.damageMul = self.damageMul ?? player.damageMul;
    if(prevHp > self.hp){
      addDamageText(player.x+rand(-8,8), player.y-player.radius-10, prevHp-self.hp, '#ff6767');
      state.cameraShake = Math.max(state.cameraShake, 1.8);
      state.screenFlash = Math.max(state.screenFlash, 0.14);
      blood(player.x, player.y, 8, 'rgba(150,24,24,0.8)', 0.8);
    }
    if(self.buffAnnouncement && self.buffAnnouncementTimer > 0){
      state.buffAnnouncement = mapBuffAnnouncement(self.buffAnnouncement);
      state.buffAnnouncementTimer = self.buffAnnouncementTimer;
    }
    if(wasAlive && !online.selfAlive){
      pushOnlineNotice(lang==='zh' ? '你已倒下，正在观战队友。' : 'You are down. Spectating your teammate.', 'warn', 2600);
      onlineSetSpectating(true);
    } else if(!wasAlive && online.selfAlive){
      onlineSetSpectating(false);
    }
    online.lastServerHp = self.hp;
  }

  function onlineApplySnapshot(msg){
    online.lastSnapshotAt = performance.now();
    online.roomState = msg.room || online.roomState;
    online.roomId = online.roomState?.roomId || online.roomId;
    const selfId = msg.selfId || online.clientId;
    const nextPeers = {};
    let self = null;
    for(const p of (msg.players || [])){
      if(!p) continue;
      if(p.id === selfId){ self = p; continue; }
      nextPeers[p.id] = Object.assign({}, p, { lastSeen: performance.now() });
    }
    online.peers = nextPeers;
    onlinePickSpectateTarget();
    if(self) applySelfFromServer(self);
    const match = msg.match || {};
    state.wave = match.wave ?? state.wave;
    state.surviveTime = match.surviveTime ?? state.surviveTime;
    state.kills = self?.kills ?? state.kills;
    state.score = self?.score ?? state.score;
    state.bossAnnouncement = Math.max(state.bossAnnouncement, match.bossAnnouncement || 0);
    state.airdropAnnouncement = Math.max(state.airdropAnnouncement, match.airdropAnnouncement || 0);
    state.zombies = Array.isArray(match.zombies) ? match.zombies.map(z=>Object.assign({}, z)) : [];
    state.pickups = Array.isArray(match.pickups) ? match.pickups.map(p=>Object.assign({}, p)) : [];
    state.airdrops = Array.isArray(match.airdrops) ? match.airdrops.map(a=>Object.assign({}, a)) : [];
    state.fireZones = Array.isArray(match.fireZones) ? match.fireZones.map(z=>Object.assign({}, z)) : [];
    state.explosions = Array.isArray(match.effects) ? match.effects.map(e=>Object.assign({}, e)) : [];
    updateHUD();
  }

  function handleOnlineMessage(msg){
    if(msg.type === 'welcome'){ online.clientId = msg.clientId; return; }
    if(msg.type === 'room_list'){
      online.rooms = Array.isArray(msg.rooms) ? msg.rooms : [];
      if(state.overlayScreen === 'online-lobby') renderOnlineLobby();
      return;
    }
    if(msg.type === 'room_joined' || msg.type === 'room_update'){
      online.roomState = msg.room || null;
      online.roomId = online.roomState?.roomId || null;
      online.countdownEndsAt = online.roomState?.countdownEndsAt || null;
      if(state.overlayScreen === 'online-lobby' || state.overlayScreen === 'online-room') renderOnlineRoom();
      return;
    }
    if(msg.type === 'left_room'){
      online.roomId = null;
      online.roomState = null;
      online.peers = {};
      online.started = false;
      online.worldSeed = null;
      online.countdownEndsAt = null;
      renderOnlineLobby();
      return;
    }
    if(msg.type === 'match_started'){
      online.roomState = msg.room || online.roomState;
      online.roomId = online.roomState?.roomId || online.roomId;
      online.started = true;
      online.gameMode = 'online';
      onlineSetSpectating(false);
      online.worldSeed = Number.isInteger(msg.worldSeed) ? msg.worldSeed : 12345;
      pushOnlineNotice(ot().onlineStartInfo, 'info');
      resetGame();
      state.pellets = [];
      state.rockets = [];
      state.flameParticles = [];
      state.grenades = [];
      state.explosions = [];
      state.fireZones = [];
      return;
    }
    if(msg.type === 'room_closed'){
      online.roomId = null;
      online.roomState = null;
      online.peers = {};
      online.started = false;
      online.worldSeed = null;
      online.countdownEndsAt = null;
      online.gameMode = 'single';
      const rawMessage = String(msg.message || '');
      const hostNameMatch = rawMessage.match(/^(.*?)\s(?:disconnected\.|closed the room\.)/i);
      const hostName = hostNameMatch && hostNameMatch[1] ? hostNameMatch[1].trim() : '';
      const closeText = hostName
        ? (lang==='zh' ? `[房主] ${hostName} 已退出房间，房间已被关闭。` : `[Host] ${hostName} left the room. The room has been closed.`)
        : (lang==='zh' ? '[房主] 已退出房间，房间已被关闭。' : '[Host] left the room. The room has been closed.');
      pushOnlineNotice(closeText, 'warn', 4600);
      goToMainMenu();
      return;
    }
    if(msg.type === 'player_left'){
      if(msg.playerId) delete online.peers[msg.playerId];
      const playerLabel = msg.name || (lang==='zh' ? '玩家' : 'A player');
      const leaveText = online.started
        ? (lang==='zh' ? `${playerLabel} 已退出对局。` : `${playerLabel} left the match.`)
        : (lang==='zh' ? `${playerLabel} 已退出房间。` : `${playerLabel} left the room.`);
      pushOnlineNotice(leaveText, 'info');
      return;
    }
    if(msg.type === 'player_down'){
      if(msg.playerId && msg.playerId !== online.clientId){
        const playerLabel = msg.name || (lang==='zh' ? '队友' : 'A teammate');
        pushOnlineNotice(lang==='zh' ? `${playerLabel} 已倒下。` : `${playerLabel} is down.`, 'warn', 2200);
      }
      return;
    }
    if(msg.type === 'snapshot'){
      onlineApplySnapshot(msg);
      return;
    }
    if(msg.type === 'match_over'){
      pushOnlineNotice(msg.message || ot().onlineMatchEnded, 'warn');
      online.started = false;
      onlineSetSpectating(false);
      online.gameMode = 'single';
      goToMainMenu();
      return;
    }
    if(msg.type === 'error'){
      pushOnlineNotice(msg.message || 'Server error', 'error');
    }
  }

  function createOnlineRoom(){
    const fallbackName = lang==='zh' ? `${state.playerName}的房间` : `${state.playerName}'s Room`;
    const name = (($('onlineRoomNameInput')?.value)||'').trim().slice(0,24) || fallbackName;
    onlineSend({ type:'create_room', roomName:name });
  }
  function joinOnlineRoom(id){ onlineSend({ type:'join_room', roomId:id }); }
  function leaveOnlineRoom(){ onlineSend({ type:'leave_room' }); }
  function toggleOnlineReady(){ onlineSend({ type:'toggle_ready' }); }
  function startOnlineMatch(){ onlineSend({ type:'start_match' }); }
  function refreshOnlineRooms(){ onlineSend({ type:'list_rooms' }); }

  function renderOnlineLobby(){
    state.overlayScreen = 'online-lobby';
    const t = ot();
    $('overlayCard').className = 'card';
    const roomsMarkup = online.rooms.length ? online.rooms.map(room=>{
      const disabled = room.started || room.playerCount>=room.maxPlayers;
      const joinLabel = room.started ? t.inGame : (room.playerCount>=room.maxPlayers ? 'Full' : t.join);
      return `<div style="display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);margin-top:8px;"><div><div class="accent" style="font-size:16px;">${escapeHtml(room.roomName)}</div><div style="opacity:0.75;font-size:13px;">${t.onlineRoomOwner}: ${escapeHtml(room.hostName)} · ${t.players}: ${room.playerCount}/${room.maxPlayers} · ${room.started?t.onlineStateStarted:t.onlineStateWaiting}</div></div><div><button data-join-room="${escapeHtml(room.roomId)}" ${disabled?'disabled':''}>${joinLabel}</button></div></div>`;
    }).join('') : `<p style="opacity:0.72;">${t.noRooms}</p>`;
    $('overlayCard').innerHTML = `
      <h2>${t.onlineTitle}</h2>
      <p>${t.onlineDesc}</p>
      <p class="compactNote"><span class="accent">${t.onlineNoLeaderboard}</span></p>
      <div style="text-align:left;margin:14px 0;padding:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);">
        <label style="display:block;opacity:0.75;margin-bottom:6px;">${t.serverUrl}</label>
        <input id="onlineServerInput" value="${escapeHtml(online.serverUrl)}" placeholder="${escapeHtml(t.onlineServerPlaceholder)}" style="width:100%;padding:10px 12px;background:#141111;border:1px solid rgba(255,255,255,0.14);color:#f0e6d8;font:inherit;">
        <p style="opacity:0.6;font-size:12px;margin:8px 0 0;">${t.onlineConnectHelp}</p>
        <div class="controls" style="justify-content:center;flex-wrap:wrap;margin-top:12px;">
          <button id="onlineConnectBtn" ${online.connected||online.connecting?'disabled':''}>${t.connect}</button>
          <button id="onlineDisconnectBtn" ${!online.connected&&!online.connecting?'disabled':''}>${t.disconnect}</button>
          <button id="onlineRefreshBtn" ${!online.connected?'disabled':''}>${t.refresh}</button>
          <button id="onlineBackBtn">${t.back}</button>
        </div>
        <p style="opacity:0.78;margin:10px 0 0;">${onlineStatusText()}</p>
      </div>
      <div style="text-align:left;margin:14px 0;padding:12px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);">
        <label style="display:block;opacity:0.75;margin-bottom:6px;">${t.roomName}</label>
        <input id="onlineRoomNameInput" placeholder="${escapeHtml(t.onlineRoomNameFallback)}" style="width:100%;padding:10px 12px;background:#141111;border:1px solid rgba(255,255,255,0.14);color:#f0e6d8;font:inherit;">
        <div class="controls" style="justify-content:center;flex-wrap:wrap;margin-top:12px;">
          <button id="onlineCreateBtn" ${!online.connected?'disabled':''}>${t.createRoom}</button>
        </div>
      </div>
      <div style="text-align:left;">${roomsMarkup}</div>
    `;
    $('overlay').classList.remove('hidden');
    setTimeout(()=>{
      const input = $('onlineServerInput'); if(input) input.onchange = ()=>onlinePersistUrl(input.value);
      const c = $('onlineConnectBtn'); if(c) c.onclick = ()=>{ onlinePersistUrl(($('onlineServerInput')?.value)||''); onlineConnect(); };
      const d = $('onlineDisconnectBtn'); if(d) d.onclick = ()=>{ onlineDisconnect(true); renderOnlineLobby(); };
      const r = $('onlineRefreshBtn'); if(r) r.onclick = ()=>refreshOnlineRooms();
      const back = $('onlineBackBtn'); if(back) back.onclick = ()=>{ state.menuScreen='main'; online.gameMode='single'; applyLang(); };
      const create = $('onlineCreateBtn'); if(create) create.onclick = ()=>createOnlineRoom();
      document.querySelectorAll('[data-join-room]').forEach(btn=>btn.onclick = ()=>joinOnlineRoom(btn.getAttribute('data-join-room')));
    },0);
  }

  function renderOnlineRoom(){
    state.overlayScreen = 'online-room';
    const t = ot();
    const room = online.roomState;
    if(!room){ renderOnlineLobby(); return; }
    const me = (room.players||[]).find(p=>p.id===online.clientId) || null;
    const meReady = !!me?.ready;
    const isHost = online.clientId === room.hostId;
    const countdownLeft = room.countdownEndsAt ? Math.max(0, Math.ceil((room.countdownEndsAt - Date.now())/1000)) : 0;
    const playersMarkup = (room.players||[]).map(p=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 10px;border-top:1px solid rgba(255,255,255,0.08);"><span>${escapeHtml(p.name)} ${p.id===room.hostId?`<span class="accent">(${t.host})</span>`:''}</span><span style="opacity:0.72;">${room.started?t.inGame:(p.ready?t.readyStatus:t.unreadyStatus)}</span></div>`).join('');
    $('overlayCard').className='card';
    $('overlayCard').innerHTML = `
      <div class="accent" style="font-size:32px;font-weight:bold;line-height:1.15;margin-bottom:12px;">${escapeHtml(room.roomName)}</div>
      <p style="opacity:0.75;">${t.onlineRoomOwner}: <span class="accent">${escapeHtml(room.hostName)}</span></p>
      <p style="opacity:0.75;">${t.onlinePlayersLabel}: ${room.players.length}/${room.maxPlayers}</p>
      ${room.countdownEndsAt?`<p class="accent" style="font-size:20px;letter-spacing:1px;">${t.autoStarting} ${countdownLeft}</p>`:''}
      <div style="text-align:left;margin:14px 0;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);">${playersMarkup}</div>
      <div class="controls" style="justify-content:center;flex-wrap:wrap;">
        <button id="onlineLeaveBtn">${t.leave}</button>
        <button id="onlineReadyBtn" ${room.started?'disabled':''}>${meReady?t.unready:t.ready}</button>
        ${isHost?`<button id="onlineStartBtn" ${room.started||room.countdownEndsAt?'disabled':''}>${t.startMatch}</button>`:''}
      </div>
    `;
    $('overlay').classList.remove('hidden');
    setTimeout(()=>{
      const leave = $('onlineLeaveBtn'); if(leave) leave.onclick = ()=>leaveOnlineRoom();
      const ready = $('onlineReadyBtn'); if(ready) ready.onclick = ()=>toggleOnlineReady();
      const start = $('onlineStartBtn'); if(start) start.onclick = ()=>startOnlineMatch();
    },0);
  }

  window.joinOnlineRoom = joinOnlineRoom;

  setInterval(()=>{
    if(state.overlayScreen === 'online-room' && online.roomState && online.roomState.countdownEndsAt && !online.roomState.started){
      renderOnlineRoom();
    }
  }, 250);

  const __origRenderMainMenu = renderMainMenu;
  renderMainMenu = function(){
    __origRenderMainMenu();
    if(state.overlayScreen !== 'main') return;
    const t = ot();
    const parent = $('overlayCard');
    if(!parent) return;
    const target = parent.querySelector('.pcMenuRow.primary') || parent.querySelector('.menuActions');
    if(target && !parent.querySelector('#onlineCoopBtn')){
      const btn = document.createElement('button');
      btn.id = 'onlineCoopBtn';
      btn.textContent = t.onlineBtn;
      btn.onclick = ()=>{ online.gameMode='single'; renderOnlineLobby(); };
      const startBtn = target.querySelector('#startBtn');
      if(startBtn) startBtn.insertAdjacentElement('afterend', btn);
      else target.appendChild(btn);
    }
  };

  const __origStartGameFromMenu = startGameFromMenu;
  startGameFromMenu = function(){ online.gameMode='single'; return __origStartGameFromMenu(); };

  const __origGoToMainMenu = goToMainMenu;
  goToMainMenu = function(){
    online.started = false;
    online.worldSeed = null;
    online.peers = {};
    onlineSetSpectating(false);
    online.gameMode = 'single';
    return __origGoToMainMenu();
  };

  function updateOnlineVisualProjectiles(dt){
    for(let i=state.grenades.length-1;i>=0;i--){
      const g=state.grenades[i];
      g.timer-=dt;
      g.progress=clamp(1-g.timer/g.total,0,1);
      g.x=g.startX+(g.targetX-g.startX)*g.progress;
      g.y=g.startY+(g.targetY-g.startY)*g.progress;
      g.height=Math.sin(g.progress*Math.PI)*g.arc;
      g.drawX=g.x;
      g.drawY=g.y-g.height;
      if(g.timer<=0){
        g.x=g.targetX; g.y=g.targetY; g.drawX=g.targetX; g.drawY=g.targetY;
        state.explosions.push({x:g.x,y:g.y,radius:0,maxRadius:g.type==='molotov'?84:128,life:g.type==='molotov'?0.34:0.42,maxLife:g.type==='molotov'?0.34:0.42,ring:0,rocket:false,molotov:g.type==='molotov'});
        state.grenades.splice(i,1);
      }
    }
    for(let i=state.rockets.length-1;i>=0;i--){
      const r=state.rockets[i];
      const prevX=r.x,prevY=r.y;
      r.x+=r.vx*dt; r.y+=r.vy*dt; r.life-=dt;
      let done=dist(r.x,r.y,r.targetX,r.targetY)<14||r.life<=0||r.x<0||r.y<0||r.x>WORLD.w||r.y>WORLD.h;
      if(!done){
        for(const b of WORLD.buildings){
          for(const wr of getBuildingWallRects(b)){
            if(lineIntersectsRect(prevX,prevY,r.x,r.y,wr)){ done=true; break; }
          }
          if(done) break;
        }
      }
      if(done){
        state.explosions.push({x:clamp(r.x,10,WORLD.w-10),y:clamp(r.y,10,WORLD.h-10),radius:0,maxRadius:150,life:0.56,maxLife:0.56,ring:0,rocket:true});
        state.rockets.splice(i,1);
      }
    }
    for(let i=state.flameParticles.length-1;i>=0;i--){
      const f=state.flameParticles[i];
      const v=Math.hypot(f.vx,f.vy)||1;
      const sideX=-f.vy/v,sideY=f.vx/v;
      f.vx+=sideX*(f.swirl||0)*dt; f.vy+=sideY*(f.swirl||0)*dt;
      f.x+=f.vx*dt; f.y+=f.vy*dt;
      const flameDamping=Math.pow(FLAME_VELOCITY_DAMPING_PER_SECOND,dt);
      f.vx*=flameDamping; f.vy*=flameDamping; f.vy-=30*dt*(f.heat||1);
      f.life-=dt; f.size+=dt*8; f.swirl=(f.swirl||0)*Math.pow(0.7,dt*60);
      for(const b of WORLD.buildings){
        for(const wr of getBuildingWallRects(b)){
          if(circleRectCollision(f.x,f.y,f.size*0.35,wr)){ f.life=0; break; }
        }
        if(f.life<=0) break;
      }
      if(f.life<=0) state.flameParticles.splice(i,1);
    }
    for(let i=state.pellets.length-1;i>=0;i--){
      const p=state.pellets[i], prevX=p.x, prevY=p.y;
      p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt;
      let removed=false;
      for(const b of WORLD.buildings){
        for(const wr of getBuildingWallRects(b)){
          if(lineIntersectsRect(prevX,prevY,p.x,p.y,wr) || circleRectCollision(p.x,p.y,p.radius,wr)){
            state.pellets.splice(i,1); removed=true; break;
          }
        }
        if(removed) break;
      }
      if(removed) continue;
      if(p.life<=0||p.x<-20||p.x>WORLD.w+20||p.y<-20||p.y>WORLD.h+20) state.pellets.splice(i,1);
    }
    for(let i=state.particles.length-1;i>=0;i--){
      const p=state.particles[i];
      p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=p.drag||0.95; p.vy*=p.drag||0.95; if(p.floaty)p.vy-=18*dt; p.life-=dt;
      if(p.life<=0) state.particles.splice(i,1);
    }
    for(let i=state.damageTexts.length-1;i>=0;i--){
      const t=state.damageTexts[i]; t.y+=t.vy*dt; t.x+=(t.dx||0)*dt; t.life-=dt; if(t.life<=0) state.damageTexts.splice(i,1);
    }
  }

  function localReloadPredict(dt){
    player.shootCooldown=Math.max(0,player.shootCooldown-dt);
    player.reloadTimer=Math.max(0,player.reloadTimer-dt);
    player.dashCooldown=Math.max(0,player.dashCooldown-dt);
    player.dashTime=Math.max(0,player.dashTime-dt);
    player.rocketJumpTime=Math.max(0,player.rocketJumpTime-dt);
    player.knockbackTime=Math.max(0,player.knockbackTime-dt);
    player.hurtTimer=Math.max(0,player.hurtTimer-dt);
    if(player.wasReloading&&player.reloadTimer===0){
      player.wasReloading=false;
      if(player.weapon==='shotgun'){player.mag=player.magSize;}
      else if(player.weapon==='gatling'&&player.gatlingAmmo>0){const load=Math.min(player.magSize-player.mag,player.gatlingAmmo);player.mag+=load;player.gatlingAmmo-=load;}
      else if(player.weapon==='rocket'&&player.rocketAmmo>0){const load=Math.min(player.magSize-player.mag,player.rocketAmmo);player.mag+=load;player.rocketAmmo-=load;}
      else if(player.weapon==='flamethrower'&&player.flameAmmo>0){const load=Math.min(player.magSize-player.mag,player.flameAmmo);player.mag+=load;player.flameAmmo-=load;}
      else{player.weapon='shotgun';player.magSize=6;player.mag=6;}
    }
  }

  function onlineUpdate(dt){
    updateCursorVisibility();
    if(state.gameOver){
      state.deathAnim=Math.max(0,state.deathAnim-dt);
      if(state.deathAnim===0&&$('overlay').classList.contains('hidden'))showGameOverOverlay();
      return;
    }
    if(!state.running) return;
    if(state.paused) return;
    state.time += dt;
    state.buffAnnouncementTimer=Math.max(0,state.buffAnnouncementTimer-dt);
    state.cameraShake=Math.max(0,state.cameraShake-dt*18);
    state.screenFlash=Math.max(0,state.screenFlash-dt*1.2);
    state.bossAnnouncement=Math.max(0,state.bossAnnouncement-dt);
    state.airdropAnnouncement=Math.max(0,state.airdropAnnouncement-dt);
    localReloadPredict(dt);

    const spectating = online.spectating || !online.selfAlive;
    if(spectating){
      mouseDown = false;
      state.keys.delete('shift');
    }

    let mx=0,my=0;
    if(MOBILE_MODE){
      const mag=Math.hypot(touchState.move.dx,touchState.move.dy);
      const moveBase=$('moveBase'); const moveRadius=Math.max(28,(moveBase?.getBoundingClientRect().width||108)*0.5-4);
      if(touchState.move.active && mag>6){ mx=touchState.move.dx/moveRadius; my=touchState.move.dy/moveRadius; }
    }else{
      if(state.keys.has('w')||state.keys.has('arrowup'))my-=1;
      if(state.keys.has('s')||state.keys.has('arrowdown'))my+=1;
      if(state.keys.has('a')||state.keys.has('arrowleft'))mx-=1;
      if(state.keys.has('d')||state.keys.has('arrowright'))mx+=1;
      const len=Math.hypot(mx,my)||1; mx/=len; my/=len;
    }
    if(!spectating && !MOBILE_MODE && state.keys.has('shift') && player.dashCooldown<=0 && (mx||my)){
      player.dashCooldown=1.3; player.dashTime=0.18;
      const dashSpeed=460;
      player.dashVX=mx*dashSpeed; player.dashVY=my*dashSpeed;
      player.dashFacing=Math.atan2(my,mx);
      player.dashSpinDir=mx<0?-1:mx>0?1:(state.mouse.x<SW*0.5?-1:1);
      playDash();
    }
    if(MOBILE_MODE) syncAimCursor();
    const mobileAimActive = MOBILE_MODE && touchState.aim.active && Math.hypot(touchState.aim.dx,touchState.aim.dy)>12;
    if(MOBILE_MODE && !mobileAimActive){
      if(mx<-0.12) player.faceDir=-1;
      else if(mx>0.12) player.faceDir=1;
    }else{
      const camAim=camera();
      const aimWorldX=camAim.x+state.mouse.x;
      if(aimWorldX<player.x-2) player.faceDir=-1; else if(aimWorldX>player.x+2) player.faceDir=1;
    }
    if(spectating){ mx = 0; my = 0; }
    if(player.rocketJumpTime>0){
      moveWithWallCollision(player,player.rocketJumpVX*dt,player.rocketJumpVY*dt);
      const rocketJumpDamping=Math.pow(ROCKET_JUMP_DAMPING_PER_SECOND,dt);
      player.rocketJumpVX*=rocketJumpDamping; player.rocketJumpVY*=rocketJumpDamping;
    }else if(player.knockbackTime>0){
      moveWithWallCollision(player,player.knockbackVX*dt,player.knockbackVY*dt);
      const knockbackDamping=Math.pow(0.08,dt);
      player.knockbackVX*=knockbackDamping; player.knockbackVY*=knockbackDamping;
    }else if(player.dashTime>0){
      moveWithWallCollision(player,player.dashVX*dt,player.dashVY*dt);
    }else{
      moveWithWallCollision(player,mx*player.speed*(player.speedMul||1)*dt,my*player.speed*(player.speedMul||1)*dt);
    }

    if(!spectating && ((MOBILE_MODE&&touchState.shootHeld)||(!MOBILE_MODE&&mouseDown))){
      if(player.shootCooldown<=0&&player.reloadTimer<=0&&player.mag>0){
        const cam=camera(), worldMouseX=cam.x+state.mouse.x, worldMouseY=cam.y+state.mouse.y;
        const angle=Math.atan2(worldMouseY-player.y,worldMouseX-player.x);
        shoot();
        onlineSendAction({ kind:'fire', aimAngle:angle, targetX:worldMouseX, targetY:worldMouseY });
        if(player.mag===0&&player.reloadTimer<=0) startReload();
      }
    }

    updateOnlineVisualProjectiles(dt);
    updateBuildingRoofs();
    bindMenuButtons();
    updateHUD();

    online.sendTimer -= dt;
    if(online.sendTimer<=0){
      online.sendTimer = 0.05;
      if(!spectating){
        onlineSend({
          type:'player_state',
          state:{ x:player.x, y:player.y, faceDir:player.faceDir, moving:!!(mx||my||mouseDown||touchState.shootHeld), name:state.playerName }
        });
      }
    }
  }

  const __origUpdate = update;
  update = function(dt){
    if(online.connected && online.started && state.running && !state.loading && onlineIsMode()) return onlineUpdate(dt);
    return __origUpdate(dt);
  };

  const __origCamera = camera;
  camera = function(){
    if(online.connected && online.started && onlineIsMode() && online.spectating){
      const target = onlineSpectateTarget();
      if(target){
        const shakeX = state.cameraShake>0?rand(-state.cameraShake,state.cameraShake):0;
        const shakeY = state.cameraShake>0?rand(-state.cameraShake,state.cameraShake):0;
        return {x:clamp((target.x||0)-SW/2+shakeX,0,WORLD.w-SW),y:clamp((target.y||0)-SH/2+shakeY,0,WORLD.h-SH)};
      }
    }
    return __origCamera();
  };

  const __origDrawCrosshair = drawCrosshair;
  drawCrosshair = function(){
    if(online.connected && online.started && onlineIsMode() && online.spectating) return;
    return __origDrawCrosshair();
  };

  const __origThrowThrowable = throwThrowable;
  throwThrowable = function(kind='grenade'){
    if(!(online.connected && online.started && state.running && onlineIsMode())) return __origThrowThrowable(kind);
    if(online.spectating || !online.selfAlive) return;
    const isMolotov=kind==='molotov';
    if(isMolotov&&player.molotovs<=0)return;
    if(!isMolotov&&player.grenades<=0)return;
    const cam=camera(),worldMouseX=cam.x+state.mouse.x,worldMouseY=cam.y+state.mouse.y;
    let dx=worldMouseX-player.x,dy=worldMouseY-player.y;
    const maxDist=isMolotov?420:340;
    const d=Math.hypot(dx,dy)||1;
    if(d>maxDist){dx=dx/d*maxDist;dy=dy/d*maxDist;}
    const targetX=clamp(player.x+dx,10,WORLD.w-10),targetY=clamp(player.y+dy,10,WORLD.h-10);
    __origThrowThrowable(kind);
    onlineSendAction({ kind:'throw', throwable: kind, targetX, targetY });
  };

  const __origStartReload = startReload;
  startReload = function(){
    const before = player.reloadTimer;
    if(online.connected && online.started && state.running && onlineIsMode() && (online.spectating || !online.selfAlive)) return;
    __origStartReload();
    if(online.connected && online.started && state.running && onlineIsMode() && player.reloadTimer>0 && before===0){
      onlineSendAction({ kind:'reload' });
    }
  };

  const __origRender = render;
  render = function(){
    __origRender();
    if(!(online.connected && online.started && state.running && !state.gameOver)) return;
    const cam = camera();
    Object.values(online.peers).forEach(peer=>drawRemotePlayer(peer, cam));
    ctx.textAlign='left';
    ctx.font='bold 12px Courier New';
    ctx.fillStyle='rgba(0,0,0,0.55)';
    ctx.fillRect(12, SH-64, 220, 48);
    ctx.fillStyle='#9cc2ff';
    ctx.fillText(`${ot().onlinePreview}`, 20, SH-42);
    ctx.fillStyle='#f0e6d8';
    ctx.fillText(`${ot().peers}: ${Object.keys(online.peers).length}`, 20, SH-24);
    if(online.spectating){
      const target = onlineSpectateTarget();
      const label = target ? `${lang==='zh' ? '正在观战' : 'SPECTATING'}: ${target.name || 'Player'}` : (lang==='zh' ? '你已倒下，等待队友。' : 'You are down. Waiting on your teammate.');
      ctx.textAlign='center';
      ctx.font='bold 18px Courier New';
      ctx.fillStyle='rgba(0,0,0,0.55)';
      ctx.fillRect(Math.round(SW*0.5-180), 18, 360, 34);
      ctx.fillStyle='#f0d39c';
      ctx.fillText(label, Math.round(SW*0.5), 40);
    }
  };

  function drawRemotePlayer(peer, cam){
    const s = worldToScreen(peer.x||0, peer.y||0, cam), x=Math.round(s.x), y=Math.round(s.y);
    const facing = (peer.faceDir||1) < 0 ? -1 : 1;
    const dead = peer.alive === false || (peer.hp||0) <= 0;
    const body = dead ? '#6a6a6a' : '#6ca9ff';
    const shirt = dead ? '#3f3f3f' : '#2c5d8f';
    pxRect(x-6,y-8,12,10,'#bca18f');
    pxRect(x-7,y+2,14,10,shirt);
    pxRect(x-7,y+12,4,6,'#242424');
    pxRect(x+3,y+12,4,6,'#242424');
    ctx.globalAlpha = dead ? 0.65 : 1;
    ctx.fillStyle='rgba(0,0,0,0.28)';
    ctx.fillRect(x-10,y+18,20,4);
    drawRotatedGun(x+(facing>0?5:-5), y+5, facing>0?0:Math.PI, body, '#d6b07a', peer.weapon||'shotgun');
    ctx.font='12px Courier New';
    ctx.textAlign='center';
    ctx.fillStyle='rgba(0,0,0,0.65)';
    ctx.fillText(String(peer.name||'Player'), x+1, y-13+1);
    ctx.fillStyle='#9cc2ff';
    ctx.fillText(String(peer.name||'Player'), x, y-13);
    const barW=22, ratio=Math.max(0,Math.min(1,(peer.hp||0)/(peer.maxHp||100)));
    pxRect(x-barW/2,y-28,barW,4,'rgba(255,255,255,0.12)');
    pxRect(x-barW/2,y-28,barW*ratio,4,dead?'#7f6d6d':'#59c36a');
    ctx.globalAlpha = 1;
  }
})();
