import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

// Which translucency the OS can back. Asked synchronously because the renderer
// needs it before its first paint, and answered by main because deciding it
// needs `os.release()` — a sandboxed preload may only require electron, events,
// timers and url, so importing node:os here throws before contextBridge runs
// and takes the ENTIRE bridge down with it (window.missherDesktop undefined =>
// "Desktop IPC bridge is unavailable"). No reply means no glass, which degrades
// to an ordinary opaque window rather than a page thinned over nothing.
const translucencySupport = ipcRenderer.sendSync('missher:translucency:support')
const hudWindowing = ipcRenderer.sendSync('missher:hud:windowing')
const hudNativeDrag = hudWindowing?.nativeDrag === true
const launchFlags = ipcRenderer.sendSync('missher:launch-flags')

contextBridge.exposeInMainWorld('missherDesktop', {
  glassSupported: translucencySupport?.glass === true,
  translucencySupported: translucencySupport?.translucency === true,
  // Launch-flag fact: the app was started with --local, so the renderer may
  // show the local-models surfaces. Static for the window's lifetime.
  localModelsEnabled: launchFlags?.localModels === true,
  // Launch-flag fact: the Nous free tier is on for this launch
  // (MISSHER_GUEST_ONBOARDING=1 or --guest-onboarding). Read-only; the same
  // decision is stamped onto every backend the app spawns.
  guestOnboardingEnabled: launchFlags?.guestOnboarding === true,
  // Launch-flag fact: skip the first-run film (MISSHER_SKIP_INTRO=1 or
  // --skip-intro). Rehearsal aid for the guided chat behind it.
  skipIntro: launchFlags?.skipIntro === true,
  getConnection: (profile, opts) => ipcRenderer.invoke('missher:connection', profile, opts),
  // Registry-scoped backend resolution: { connectionId, profile } → descriptor.
  getConnectionFor: payload => ipcRenderer.invoke('missher:connection:for', payload),
  getProfileRoutes: profiles => ipcRenderer.invoke('missher:plugin-profile-routes', profiles),
  revalidateConnection: () => ipcRenderer.invoke('missher:connection:revalidate'),
  touchBackend: profile => ipcRenderer.invoke('missher:backend:touch', profile),
  getPoolLimits: () => ipcRenderer.invoke('missher:pool-limits:get'),
  setPoolLimits: limits => ipcRenderer.invoke('missher:pool-limits:set', limits),
  getGatewayWsUrl: profile => ipcRenderer.invoke('missher:gateway:ws-url', profile),
  // Registry-scoped fresh WS URL: { connectionId, profile } → result shape of
  // getGatewayWsUrl, minted against that connection's backend.
  getGatewayWsUrlFor: payload => ipcRenderer.invoke('missher:gateway:ws-url-for', payload),
  // Union agent roster across every registered connection.
  getAgentRoster: () => ipcRenderer.invoke('missher:agents:roster'),
  openSessionWindow: (sessionId, opts) => ipcRenderer.invoke('missher:window:openSession', sessionId, opts),
  openSessionInTerminal: (sessionId, opts) => ipcRenderer.invoke('missher:window:openInTerminal', sessionId, opts),
  openWindow: () => ipcRenderer.invoke('missher:window:openInstance'),
  openBrowserWindow: tabId => ipcRenderer.invoke('missher:window:openBrowser', tabId),
  onBrowserPopoutClosed: callback => {
    const listener = (_event, tabId) => callback(tabId)
    ipcRenderer.on('missher:browser-popout:closed', listener)

    return () => ipcRenderer.removeListener('missher:browser-popout:closed', listener)
  },
  claimAmbientCue: key => ipcRenderer.invoke('missher:ambient:claim', key),
  wakeIndicator: {
    getState: () => ipcRenderer.invoke('missher:wake-indicator:get'),
    setState: state => ipcRenderer.send('missher:wake-indicator:set', state),
    onState: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('missher:wake-indicator:state', listener)

      return () => ipcRenderer.removeListener('missher:wake-indicator:state', listener)
    }
  },
  chatOnboarding: {
    grow: request => ipcRenderer.send('missher:chat-onboarding:grow', request),
    soloBoot: () => ipcRenderer.send('missher:chat-onboarding:solo-boot')
  },
  introReveal: {
    open: (payload?: { hideMain?: boolean }) => ipcRenderer.invoke('missher:intro-reveal:open', payload),
    close: (payload?: { showMain?: boolean }) => ipcRenderer.invoke('missher:intro-reveal:close', payload),
    skip: () => ipcRenderer.send('missher:intro-reveal:skip'),
    ready: () => ipcRenderer.send('missher:intro-reveal:ready'),
    onSkip: callback => {
      const listener = () => callback()

      ipcRenderer.on('missher:intro-reveal:skip', listener)

      return () => ipcRenderer.removeListener('missher:intro-reveal:skip', listener)
    },
    onClosed: callback => {
      const listener = () => callback()

      ipcRenderer.on('missher:intro-reveal:closed', listener)

      return () => ipcRenderer.removeListener('missher:intro-reveal:closed', listener)
    }
  },
  petOverlay: {
    // Main renderer → main process: window lifecycle + drag. `request` is
    // `{ bounds, screen }`; resolves with the screen bounds it actually used.
    open: request => ipcRenderer.invoke('missher:pet-overlay:open', request),
    close: () => ipcRenderer.invoke('missher:pet-overlay:close'),
    setBounds: bounds => ipcRenderer.send('missher:pet-overlay:set-bounds', bounds),
    setIgnoreMouse: ignore => ipcRenderer.send('missher:pet-overlay:ignore-mouse', ignore),
    // Flip the overlay focusable (and focus it) while the composer needs keys.
    setFocusable: focusable => ipcRenderer.send('missher:pet-overlay:set-focusable', focusable),
    // Main renderer → overlay (forwarded by main): push the latest pet state.
    pushState: payload => ipcRenderer.send('missher:pet-overlay:state', payload),
    // Overlay → main renderer (forwarded by main): pop back in / composer submit.
    control: payload => ipcRenderer.send('missher:pet-overlay:control', payload),
    // Overlay subscribes to state pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('missher:pet-overlay:state', listener)

      return () => ipcRenderer.removeListener('missher:pet-overlay:state', listener)
    },
    // Main renderer subscribes to overlay control messages.
    onControl: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('missher:pet-overlay:control', listener)

      return () => ipcRenderer.removeListener('missher:pet-overlay:control', listener)
    }
  },
  // HUD mode: the chrome-free floating chat. A full app renderer (own gateway)
  // sized as a floating bar, so it mounts the real composer. Main owns the
  // window; `onChanged` keeps every window's toggle truthful.
  hud: {
    nativeDrag: hudNativeDrag,
    windowing: {
      clientPlacement: hudWindowing?.clientPlacement !== false,
      controlDrag: hudWindowing?.controlDrag === true,
      nativeDrag: hudNativeDrag,
      solid: hudWindowing?.solid === true,
      workspaceTransfer: hudWindowing?.workspaceTransfer === true
    },
    open: request => ipcRenderer.invoke('missher:hud:open', request),
    close: () => ipcRenderer.invoke('missher:hud:close'),
    setIgnoreMouse: ignore => ipcRenderer.send('missher:hud:ignore-mouse', ignore),
    beginMove: () => ipcRenderer.send('missher:hud:begin-move'),
    endMove: () => ipcRenderer.send('missher:hud:end-move'),
    moveBy: delta => ipcRenderer.send('missher:hud:move-by', delta),
    setWorkspaceTransfer: transferring => ipcRenderer.send('missher:hud:workspace-transfer', transferring),
    setBounds: bounds => ipcRenderer.send('missher:hud:set-bounds', bounds),
    resetLayout: () => ipcRenderer.invoke('missher:hud:reset-layout'),
    // Whether the band covers the window below the bar. Main pairs it with the
    // user's translucency setting to decide the native frost (macOS vibrancy /
    // Windows 11 DWM backdrop) — see hudFrostFor.
    setFrost: showing => ipcRenderer.invoke('missher:hud:frost', showing),
    // The HUD tells main which session it is on; main hands that back to the
    // app window when the HUD closes, so the app can re-home onto it.
    setSession: sessionId => ipcRenderer.send('missher:hud:session', sessionId),
    onGoto: callback => {
      const listener = (_event, sessionId) => callback(sessionId)
      ipcRenderer.on('missher:hud:goto', listener)

      return () => ipcRenderer.removeListener('missher:hud:goto', listener)
    },
    onChanged: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('missher:hud:changed', listener)

      return () => ipcRenderer.removeListener('missher:hud:changed', listener)
    },
    // Linux only, and silent elsewhere: where the cursor is, in page
    // coordinates, or null when it has left the window. Stands in for the
    // mousemove that `setIgnoreMouseEvents(true, { forward: true })` delivers on
    // macOS and Windows but not here.
    onCursor: callback => {
      const listener = (_event, point) => callback(point)
      ipcRenderer.on('missher:hud:cursor', listener)

      return () => ipcRenderer.removeListener('missher:hud:cursor', listener)
    },
    // Main's game-overlay watch: whether a fullscreen app (a game) is under
    // the HUD, so the renderer can step back to the low-opacity overlay
    // treatment while one owns the screen.
    onGameOverlay: callback => {
      const listener = (_event, state) => callback(state)
      ipcRenderer.on('missher:hud:game-overlay', listener)

      return () => ipcRenderer.removeListener('missher:hud:game-overlay', listener)
    }
  },
  // Quick Entry: the global-hotkey mini composer window. Main owns the OS
  // shortcut + the persisted preference; the quick window only captures text
  // and hands it back, and the primary renderer submits it through the normal
  // prompt path.
  quickEntry: {
    getSettings: () => ipcRenderer.invoke('missher:quick-entry:settings:get'),
    setSettings: patch => ipcRenderer.invoke('missher:quick-entry:settings:set', patch),
    submit: payload => ipcRenderer.send('missher:quick-entry:submit', payload),
    dismiss: () => ipcRenderer.send('missher:quick-entry:dismiss'),
    // Primary renderer → main → quick window: gateway connection state + the
    // recent-session options the target picker offers. Main caches the latest
    // payload so a freshly spawned quick window starts from truth.
    pushState: payload => ipcRenderer.send('missher:quick-entry:state', payload),
    // Quick window subscribes to those pushes.
    onState: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('missher:quick-entry:state', listener)

      return () => ipcRenderer.removeListener('missher:quick-entry:state', listener)
    },
    // Main → primary renderer: a submit captured by the quick window.
    onSubmit: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('missher:quick-entry:submit', listener)

      return () => ipcRenderer.removeListener('missher:quick-entry:submit', listener)
    },
    // Main → quick window: you were just summoned (reset draft + refocus).
    onShown: callback => {
      const listener = () => callback()
      ipcRenderer.on('missher:quick-entry:shown', listener)

      return () => ipcRenderer.removeListener('missher:quick-entry:shown', listener)
    }
  },
  getBootProgress: () => ipcRenderer.invoke('missher:boot-progress:get'),
  getConnectionConfig: profile => ipcRenderer.invoke('missher:connection-config:get', profile),
  saveConnectionConfig: payload => ipcRenderer.invoke('missher:connection-config:save', payload),
  applyConnectionConfig: payload => ipcRenderer.invoke('missher:connection-config:apply', payload),
  testConnectionConfig: payload => ipcRenderer.invoke('missher:connection-config:test', payload),
  // Opt-in OS-keychain encryption for stored gateway secrets (default off —
  // see secret-storage-policy.ts). get never touches the OS keychain.
  getSecretStorageEncryption: () => ipcRenderer.invoke('missher:secret-storage:get'),
  setSecretStorageEncryption: (on: boolean) => ipcRenderer.invoke('missher:secret-storage:set', on),
  // v2 multi-connection registry: named agent sources (local / remote / cloud / ssh).
  connections: {
    list: () => ipcRenderer.invoke('missher:connections:list'),
    save: payload => ipcRenderer.invoke('missher:connections:save', payload),
    remove: id => ipcRenderer.invoke('missher:connections:remove', id),
    setPrimary: id => ipcRenderer.invoke('missher:connections:set-primary', id),
    setLaunchMode: mode => ipcRenderer.invoke('missher:connections:set-launch-mode', mode),
    setLastUsed: id => ipcRenderer.invoke('missher:connections:set-last-used', id),
    test: id => ipcRenderer.invoke('missher:connections:test', id),
    updateManaged: id => ipcRenderer.invoke('missher:connections:update-managed', id),
    // Fan out `missher update` to every eligible registered connection.
    // Optional excludeIds skips rows the caller updates through another path.
    updateAll: options => ipcRenderer.invoke('missher:connections:update-all', options),
    // Registry lifecycle push (main → renderer): a connection was removed or
    // materially edited, so secondaries scoped to it must be disposed (and,
    // for edits, re-dialed at the new target).
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('missher:connections:changed', listener)

      return () => ipcRenderer.removeListener('missher:connections:changed', listener)
    }
  },
  sshConfigHosts: () => ipcRenderer.invoke('missher:ssh-config:hosts'),
  sshResolveHost: host => ipcRenderer.invoke('missher:ssh-config:resolve', host),
  probeConnectionConfig: remoteUrl => ipcRenderer.invoke('missher:connection-config:probe', remoteUrl),
  oauthLoginConnectionConfig: remoteUrl => ipcRenderer.invoke('missher:connection-config:oauth-login', remoteUrl),
  oauthLogoutConnectionConfig: remoteUrl => ipcRenderer.invoke('missher:connection-config:oauth-logout', remoteUrl),
  // Missher Cloud: one portal login powers discovery + silent per-agent sign-in
  // (cloud-auto-discovery Phase 3).
  cloud: {
    status: () => ipcRenderer.invoke('missher:cloud:status'),
    login: () => ipcRenderer.invoke('missher:cloud:login'),
    logout: () => ipcRenderer.invoke('missher:cloud:logout'),
    discover: org => ipcRenderer.invoke('missher:cloud:discover', org),
    agentSignIn: dashboardUrl => ipcRenderer.invoke('missher:cloud:agent-sign-in', dashboardUrl)
  },
  profile: {
    get: () => ipcRenderer.invoke('missher:profile:get'),
    remember: name => ipcRenderer.invoke('missher:profile:remember', name),
    set: name => ipcRenderer.invoke('missher:profile:set', name)
  },
  api: request => ipcRenderer.invoke('missher:api', request),
  notify: payload => ipcRenderer.invoke('missher:notify', payload),
  requestMicrophoneAccess: () => ipcRenderer.invoke('missher:requestMicrophoneAccess'),
  readWindowBelow: () => ipcRenderer.invoke('missher:window:readBelow'),
  readFileDataUrl: filePath => ipcRenderer.invoke('missher:readFileDataUrl', filePath),
  readFileDataUrlForAttach: filePath => ipcRenderer.invoke('missher:readFileDataUrlForAttach', filePath),
  dataUrlReadMax: {
    get: () => ipcRenderer.invoke('missher:data-url-read-max:get'),
    set: maxMb => ipcRenderer.invoke('missher:data-url-read-max:set', maxMb)
  },
  readFileText: filePath => ipcRenderer.invoke('missher:readFileText', filePath),
  readPluginSource: (filePath: string) => ipcRenderer.invoke('missher:readPluginSource', filePath),
  selectPaths: options => ipcRenderer.invoke('missher:selectPaths', options),
  selectSavePath: options => ipcRenderer.invoke('missher:selectSavePath', options),
  writeClipboard: text => ipcRenderer.invoke('missher:writeClipboard', text),
  readClipboard: () => ipcRenderer.invoke('missher:readClipboard'),
  saveGatewayFile: payload => ipcRenderer.invoke('missher:saveGatewayFile', payload),
  saveImageFromUrl: url => ipcRenderer.invoke('missher:saveImageFromUrl', url),
  contextMenuEdit: command => ipcRenderer.invoke('missher:context-menu:edit', command),
  contextMenuCopyImage: () => ipcRenderer.invoke('missher:context-menu:copy-image'),
  contextMenuSpellcheck: action => ipcRenderer.invoke('missher:context-menu:spellcheck', action),
  contextMenuGuestAddWord: payload => ipcRenderer.invoke('missher:context-menu:guest-add-word', payload),
  onContextMenuSpellcheck: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('missher:context-menu-spellcheck', listener)

    return () => ipcRenderer.removeListener('missher:context-menu-spellcheck', listener)
  },
  saveImageBuffer: (data, ext, name) => ipcRenderer.invoke('missher:saveImageBuffer', { data, ext, name }),
  capturePreview: payload => ipcRenderer.invoke('missher:capturePreview', payload),
  savePastedText: text => ipcRenderer.invoke('missher:savePastedText', { text }),
  saveClipboardImage: () => ipcRenderer.invoke('missher:saveClipboardImage'),
  getPathForFile: file => {
    try {
      return webUtils.getPathForFile(file) || ''
    } catch {
      return ''
    }
  },
  normalizePreviewTarget: (target, baseDir) => ipcRenderer.invoke('missher:normalizePreviewTarget', target, baseDir),
  watchPreviewFile: url => ipcRenderer.invoke('missher:watchPreviewFile', url),
  watchDirectory: dir => ipcRenderer.invoke('missher:watchDirectory', dir),
  stopPreviewFileWatch: id => ipcRenderer.invoke('missher:stopPreviewFileWatch', id),
  setActiveWork: payload => ipcRenderer.send('missher:active-work', payload),
  setTitleBarTheme: payload => ipcRenderer.send('missher:titlebar-theme', payload),
  setNativeTheme: mode => ipcRenderer.send('missher:native-theme', mode),
  setTranslucency: payload => ipcRenderer.send('missher:translucency', payload),
  setKeepAwake: on => ipcRenderer.send('missher:keep-awake', on),
  setDisableF12: blocked => ipcRenderer.send('missher:devtools:disable-f12', blocked),
  setPreviewShortcutActive: active => ipcRenderer.send('missher:previewShortcutActive', Boolean(active)),
  openExternal: url => ipcRenderer.invoke('missher:openExternal', url),
  mcpOauth: {
    // One-shot loopback listener for MCP OAuth against remote backends: bind
    // on this machine, hand redirectUri to mcp.servers.oauth.start, then wait
    // for the provider redirect and relay code/state via oauth.callback.
    listen: () => ipcRenderer.invoke('missher:mcp-oauth:listen'),
    wait: (id, timeoutMs) => ipcRenderer.invoke('missher:mcp-oauth:wait', id, timeoutMs),
    cancel: id => ipcRenderer.invoke('missher:mcp-oauth:cancel', id)
  },
  openPreviewInBrowser: url => ipcRenderer.invoke('missher:openPreviewInBrowser', url),
  reachPreviewUrl: url => ipcRenderer.invoke('missher:preview:reach', url),
  setActiveConnectionRoute: route => ipcRenderer.send('missher:connection:active-route', route),
  fetchLinkTitle: url => ipcRenderer.invoke('missher:fetchLinkTitle', url),
  resolveFavicon: url => ipcRenderer.invoke('missher:resolveFavicon', url),
  sanitizeWorkspaceCwd: cwd => ipcRenderer.invoke('missher:workspace:sanitize', cwd),
  settings: {
    getDefaultProjectDir: () => ipcRenderer.invoke('missher:setting:defaultProjectDir:get'),
    setDefaultProjectDir: dir => ipcRenderer.invoke('missher:setting:defaultProjectDir:set', dir),
    pickDefaultProjectDir: () => ipcRenderer.invoke('missher:setting:defaultProjectDir:pick')
  },
  zoom: {
    // Current zoom of this window, as { level, percent }.
    get: () => ipcRenderer.invoke('missher:zoom:get'),
    // Synchronous zoom factor (1 = 100%). Coordinate math needs it in the
    // same tick as the event it converts, so no IPC round-trip here.
    factor: () => webFrame.getZoomFactor(),
    setPercent: percent => ipcRenderer.send('missher:zoom:set-percent', percent),
    // Fires on every zoom change, including the Ctrl/Cmd +/-/0 shortcuts,
    // so the settings UI can stay in sync with the keyboard.
    onChanged: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('missher:zoom:changed', listener)

      return () => ipcRenderer.removeListener('missher:zoom:changed', listener)
    }
  },
  revealLogs: () => ipcRenderer.invoke('missher:logs:reveal'),
  getRecentLogs: () => ipcRenderer.invoke('missher:logs:recent'),
  // Fire-and-forget: persists a renderer error-boundary catch (with component
  // stack) to desktop.log so crashes survive the window (#79428).
  reportRendererError: report => ipcRenderer.send('missher:logs:renderer-error', report),
  readDir: dirPath => ipcRenderer.invoke('missher:fs:readDir', dirPath),
  gitRoot: startPath => ipcRenderer.invoke('missher:fs:gitRoot', startPath),
  revealPath: targetPath => ipcRenderer.invoke('missher:fs:reveal', targetPath),
  openDir: dirPath => ipcRenderer.invoke('missher:fs:openDir', dirPath),
  desktopPluginsRoot: () => ipcRenderer.invoke('missher:fs:desktopPluginsRoot'),
  reconcileDesktopPlugins: () => ipcRenderer.invoke('missher:fs:reconcileDesktopPlugins'),
  logsRoot: () => ipcRenderer.invoke('missher:fs:logsRoot'),
  renamePath: (targetPath, newName) => ipcRenderer.invoke('missher:fs:rename', targetPath, newName),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('missher:fs:writeText', filePath, content),
  trashPath: targetPath => ipcRenderer.invoke('missher:fs:trash', targetPath),
  git: {
    worktreeList: repoPath => ipcRenderer.invoke('missher:git:worktreeList', repoPath),
    worktreeAdd: (repoPath, options) => ipcRenderer.invoke('missher:git:worktreeAdd', repoPath, options),
    worktreeRemove: (repoPath, worktreePath, options) =>
      ipcRenderer.invoke('missher:git:worktreeRemove', repoPath, worktreePath, options),
    branchSwitch: (repoPath, branch) => ipcRenderer.invoke('missher:git:branchSwitch', repoPath, branch),
    branchList: repoPath => ipcRenderer.invoke('missher:git:branchList', repoPath),
    baseBranchList: repoPath => ipcRenderer.invoke('missher:git:baseBranchList', repoPath),
    repoStatus: repoPath => ipcRenderer.invoke('missher:git:repoStatus', repoPath),
    fileDiff: (repoPath, filePath) => ipcRenderer.invoke('missher:git:fileDiff', repoPath, filePath),
    scanRepos: (roots, options) => ipcRenderer.invoke('missher:git:scanRepos', roots, options),
    review: {
      list: (repoPath, scope, baseRef) => ipcRenderer.invoke('missher:git:review:list', repoPath, scope, baseRef),
      diff: (repoPath, filePath, scope, baseRef, staged) =>
        ipcRenderer.invoke('missher:git:review:diff', repoPath, filePath, scope, baseRef, staged),
      stage: (repoPath, filePath) => ipcRenderer.invoke('missher:git:review:stage', repoPath, filePath),
      unstage: (repoPath, filePath) => ipcRenderer.invoke('missher:git:review:unstage', repoPath, filePath),
      revert: (repoPath, filePath) => ipcRenderer.invoke('missher:git:review:revert', repoPath, filePath),
      revParse: (repoPath, ref) => ipcRenderer.invoke('missher:git:review:revParse', repoPath, ref),
      commit: (repoPath, message, push) => ipcRenderer.invoke('missher:git:review:commit', repoPath, message, push),
      commitContext: repoPath => ipcRenderer.invoke('missher:git:review:commitContext', repoPath),
      push: repoPath => ipcRenderer.invoke('missher:git:review:push', repoPath),
      shipInfo: repoPath => ipcRenderer.invoke('missher:git:review:shipInfo', repoPath),
      prList: (repoPath, branches, numbers) =>
        ipcRenderer.invoke('missher:git:review:prList', repoPath, branches, numbers),
      fetchPrComment: (repoPath, url) => ipcRenderer.invoke('missher:git:review:fetchPrComment', repoPath, url),
      createPr: repoPath => ipcRenderer.invoke('missher:git:review:createPr', repoPath)
    }
  },
  terminal: {
    attach: id => ipcRenderer.invoke('missher:terminal:attach', id),
    cwd: id => ipcRenderer.invoke('missher:terminal:cwd', id),
    dispose: id => ipcRenderer.invoke('missher:terminal:dispose', id),
    resize: (id, size) => ipcRenderer.invoke('missher:terminal:resize', id, size),
    start: options => ipcRenderer.invoke('missher:terminal:start', options),
    write: (id, data) => ipcRenderer.invoke('missher:terminal:write', id, data),
    onData: (id, callback) => {
      const channel = `missher:terminal:${id}:data`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    },
    onExit: (id, callback) => {
      const channel = `missher:terminal:${id}:exit`
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on(channel, listener)

      return () => ipcRenderer.removeListener(channel, listener)
    }
  },
  onClosePreviewRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('missher:close-preview-requested', listener)

    return () => ipcRenderer.removeListener('missher:close-preview-requested', listener)
  },
  onPreviewNav: callback => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('missher:preview-nav', listener)

    return () => ipcRenderer.removeListener('missher:preview-nav', listener)
  },
  onOpenFolderRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('missher:open-folder-requested', listener)

    return () => ipcRenderer.removeListener('missher:open-folder-requested', listener)
  },
  onOpenUpdatesRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('missher:open-updates', listener)

    return () => ipcRenderer.removeListener('missher:open-updates', listener)
  },
  onDeepLink: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('missher:deep-link', listener)

    return () => ipcRenderer.removeListener('missher:deep-link', listener)
  },
  signalDeepLinkReady: () => ipcRenderer.invoke('missher:deep-link-ready'),
  probePluginRepo: payload => ipcRenderer.invoke('missher:plugin:probe', payload),
  installDesktopPlugin: payload => ipcRenderer.invoke('missher:plugin:installDesktop', payload),
  onWindowStateChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('missher:window-state-changed', listener)

    return () => ipcRenderer.removeListener('missher:window-state-changed', listener)
  },
  onFocusSession: callback => {
    const listener = (_event, sessionId) => callback(sessionId)
    ipcRenderer.on('missher:focus-session', listener)

    return () => ipcRenderer.removeListener('missher:focus-session', listener)
  },
  onNotificationAction: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('missher:notification-action', listener)

    return () => ipcRenderer.removeListener('missher:notification-action', listener)
  },
  onNotificationActivate: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('missher:notification-activate', listener)

    return () => ipcRenderer.removeListener('missher:notification-activate', listener)
  },
  onPreviewFileChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('missher:preview-file-changed', listener)

    return () => ipcRenderer.removeListener('missher:preview-file-changed', listener)
  },
  onBackendExit: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('missher:backend-exit', listener)

    return () => ipcRenderer.removeListener('missher:backend-exit', listener)
  },
  // Soft gateway-mode apply finished tearing down the primary backend. Renderer
  // should wipe session lists + re-dial without a window reload.
  onConnectionApplied: callback => {
    const listener = () => callback()
    ipcRenderer.on('missher:connection:applied', listener)

    return () => ipcRenderer.removeListener('missher:connection:applied', listener)
  },
  onPowerResume: callback => {
    const listener = () => callback()
    ipcRenderer.on('missher:power-resume', listener)

    return () => ipcRenderer.removeListener('missher:power-resume', listener)
  },
  // AC ↔ battery transitions; renderers slow their backstop polls on battery.
  getOnBattery: () => ipcRenderer.invoke('missher:power-battery:get'),
  onBatteryChanged: callback => {
    const listener = (_event, onBattery) => callback(Boolean(onBattery))
    ipcRenderer.on('missher:power-battery', listener)

    return () => ipcRenderer.removeListener('missher:power-battery', listener)
  },
  onBootProgress: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('missher:boot-progress', listener)

    return () => ipcRenderer.removeListener('missher:boot-progress', listener)
  },
  // First-launch bootstrap progress -- emitted by the install.ps1 stage
  // runner in main.ts (apps/desktop/electron/bootstrap-runner.ts).
  // Renderer's install overlay subscribes to live events and queries the
  // current snapshot via getBootstrapState() to recover after a devtools
  // reload mid-bootstrap.
  getBootstrapState: () => ipcRenderer.invoke('missher:bootstrap:get'),
  continueBootstrapLocal: () => ipcRenderer.invoke('missher:bootstrap:continue-local'),
  recycleBackend: profile => ipcRenderer.invoke('missher:backend:recycle', profile),
  resetBootstrap: () => ipcRenderer.invoke('missher:bootstrap:reset'),
  repairBootstrap: () => ipcRenderer.invoke('missher:bootstrap:repair'),
  cancelBootstrap: () => ipcRenderer.invoke('missher:bootstrap:cancel'),
  onBootstrapEvent: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('missher:bootstrap:event', listener)

    return () => ipcRenderer.removeListener('missher:bootstrap:event', listener)
  },
  getVersion: () => ipcRenderer.invoke('missher:version'),
  relaunchApp: () => ipcRenderer.invoke('missher:app:relaunch'),
  getMachineProfile: () => ipcRenderer.invoke('missher:machine:profile'),
  getRemoteDisplayReason: () => ipcRenderer.invoke('missher:get-remote-display-reason'),
  uninstall: {
    summary: () => ipcRenderer.invoke('missher:uninstall:summary'),
    run: mode => ipcRenderer.invoke('missher:uninstall:run', { mode })
  },
  updates: {
    check: opts => ipcRenderer.invoke('missher:updates:check', opts),
    apply: opts => ipcRenderer.invoke('missher:updates:apply', opts),
    getBranch: () => ipcRenderer.invoke('missher:updates:branch:get'),
    setBranch: name => ipcRenderer.invoke('missher:updates:branch:set', name),
    onProgress: callback => {
      const listener = (_event, payload) => callback(payload)
      ipcRenderer.on('missher:updates:progress', listener)

      return () => ipcRenderer.removeListener('missher:updates:progress', listener)
    }
  },
  themes: {
    fetchMarketplace: id => ipcRenderer.invoke('missher:vscode-theme:fetch', id),
    searchMarketplace: query => ipcRenderer.invoke('missher:vscode-theme:search', query)
  },
  // Find-in-page (Ctrl/Cmd+F): delegates to Electron's
  // webContents.findInPage on the IPC sender's window so a Cmd+F pressed
  // in a secondary session window searches THAT window, not the primary.
  // `onFoundInPage` returns the unsubscribe fn; the renderer wires it via
  // `initFindInPageListener` in store/find-in-page.ts and tears it down
  // when the FindBar unmounts.
  findInPage: (query, options) => ipcRenderer.invoke('missher:find-in-page', query, options),
  stopFindInPage: () => ipcRenderer.invoke('missher:stop-find-in-page'),
  onFoundInPage: callback => {
    const listener = (_event, result) => callback(result)
    ipcRenderer.on('missher:found-in-page', listener)

    return () => ipcRenderer.removeListener('missher:found-in-page', listener)
  },
  // Main-process `before-input-event` forwards Ctrl/Cmd+F here so renderer
  // can open the FindBar even when the GTK compositor has already grabbed
  // the chord at the windowing layer (#81727).
  onOpenFindBarRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('missher:open-find-bar', listener)

    return () => ipcRenderer.removeListener('missher:open-find-bar', listener)
  }
})
