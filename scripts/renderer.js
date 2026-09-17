const { ipcRenderer, webUtils } = require('electron')

// 全域狀態管理
let mediaFiles = []
let soundConfigs = []
let activeMedia = null
let wavesurfer = null
let wsRegions = null
let currentRegion = null

// 播放與裝置管理
let activePlayingSessions = []
let selectedDeviceIds = ['default']
let currentPlayingAudio = null // 用於編輯頁單獨試聽

// ==========================================
// 1. 初始化與頁面分頁切換
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
  await loadMediaFiles()
  await loadSoundConfigs()
  await initDevices()
  setupDragAndDrop()

  // 點擊選單外部自動關閉下拉框
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('device-dropdown')
    const btn = document.getElementById('device-dropdown-btn')
    if (dropdown && !dropdown.contains(e.target) && !e.target.closest('#device-dropdown-btn')) {
      dropdown.classList.add('hidden')
    }
  })
})

function switchTab(tabName) {
  const tabs = ['media', 'editor', 'sounds']
  tabs.forEach(t => {
    const content = document.getElementById(`tab-${t}`)
    const btn = document.getElementById(`tab-btn-${t}`)
    if (content) content.classList.add('hidden')
    if (btn) {
      btn.classList.remove('bg-indigo-600', 'text-white')
      btn.classList.add('text-slate-400')
    }
  })

  const activeContent = document.getElementById(`tab-${tabName}`)
  const activeBtn = document.getElementById(`tab-btn-${tabName}`)
  if (activeContent) activeContent.classList.remove('hidden')
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-400')
    activeBtn.classList.add('bg-indigo-600', 'text-white')
  }

  if (tabName === 'sounds') {
    renderSoundGrid()
  }
}

// ==========================================
// 2. 音訊裝置選取與記憶邏輯 (修正版)
// ==========================================
async function initDevices() {
  try {
    const saved = await ipcRenderer.invoke('load-selected-devices')
    if (Array.isArray(saved) && saved.length > 0) {
      selectedDeviceIds = saved
    }
  } catch (err) {
    console.error('載入裝置記憶失敗:', err)
  }

  const container = document.getElementById('device-checkbox-list')
  if (!container) return
  container.innerHTML = ''

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const audioOutputs = devices.filter(d => d.kind === 'audiooutput')

    if (audioOutputs.length === 0) {
      container.innerHTML = '<div class="text-slate-500 text-xs p-2">未找到可用的輸出裝置</div>'
      selectedDeviceIds = ['default']
      updateDeviceCountDisplay()
      return
    }

    audioOutputs.forEach((device, index) => {
      const deviceId = device.deviceId || 'default'
      const label = device.label || `揚聲器/耳機 (${index + 1})`
      const isChecked = selectedDeviceIds.includes(deviceId)

      const labelEl = document.createElement('label')
      labelEl.className = 'flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer select-none text-xs py-1'
      
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.value = deviceId
      checkbox.checked = isChecked
      checkbox.className = 'device-checkbox rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer'
      
      // 使用 EventListener 監聽選取變化
      checkbox.addEventListener('change', onDeviceSelectionChange)

      const span = document.createElement('span')
      span.className = 'truncate'
      span.textContent = label

      labelEl.appendChild(checkbox)
      labelEl.appendChild(span)
      container.appendChild(labelEl)
    })

  } catch (e) {
    console.error('取得音訊裝置失敗:', e)
  }

  updateDeviceCountDisplay()
}

function toggleDeviceDropdown() {
  const dropdown = document.getElementById('device-dropdown')
  if (dropdown) {
    dropdown.classList.toggle('hidden')
  }
}

async function onDeviceSelectionChange() {
  const checkboxes = document.querySelectorAll('.device-checkbox:checked')
  selectedDeviceIds = Array.from(checkboxes).map(cb => cb.value)

  // 若完全沒有勾選，預設採用系統預設裝置
  if (selectedDeviceIds.length === 0) {
    selectedDeviceIds = ['default']
  }

  updateDeviceCountDisplay()
  await ipcRenderer.invoke('save-selected-devices', selectedDeviceIds)
}

function updateDeviceCountDisplay() {
  const countSpan = document.getElementById('selected-device-count')
  if (countSpan) {
    countSpan.textContent = selectedDeviceIds.length
  }
}

// ==========================================
// 3. 資源庫 (Media Library) 與 Drag & Drop
// ==========================================
async function loadMediaFiles() {
  mediaFiles = await ipcRenderer.invoke('load-media-files')
  renderMediaList()
}

function renderMediaList() {
  const container = document.getElementById('media-list')
  if (!container) return
  container.innerHTML = ''

  if (mediaFiles.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-500 text-center py-8">尚未匯入任何媒體檔案</div>'
    return
  }

  mediaFiles.forEach(media => {
    const item = document.createElement('div')
    item.className = 'bg-slate-900 border border-slate-800 rounded-xl p-3 flex justify-between items-center hover:border-slate-700 transition'
    item.innerHTML = `
      <div class="truncate pr-4">
        <div class="text-xs font-semibold text-slate-200 truncate">${media.name}</div>
        <div class="text-[10px] text-slate-500 truncate">${media.path}</div>
      </div>
      <button onclick="openInEditor('${media.id}')" class="bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/30 text-xs px-3 py-1.5 rounded-lg transition shrink-0">
        編輯音效
      </button>
    `
    container.appendChild(item)
  })
}

async function importMediaFiles(event) {
  if (!event || !event.target || !event.target.files) return
  const files = Array.from(event.target.files)
  for (const file of files) {
    const path = webUtils.getPathForFile(file)
    const savedMedia = await ipcRenderer.invoke('import-media', path)
    if (savedMedia) {
      mediaFiles.push(savedMedia)
    }
  }
  renderMediaList()
}

function setupDragAndDrop() {
  const mediaTab = document.getElementById('tab-media')
  if (!mediaTab) return

  mediaTab.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  mediaTab.addEventListener('drop', async (e) => {
    e.preventDefault()
    e.stopPropagation()

    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|m4a|flac)$/i)) {
        const path = webUtils.getPathForFile(file)
        const savedMedia = await ipcRenderer.invoke('import-media', path)
        if (savedMedia) {
          mediaFiles.push(savedMedia)
        }
      }
    }
    renderMediaList()
  })
}

// ==========================================
// 4. 編輯頁 (Editor & Wavesurfer)
// ==========================================
function updateVolumeDisplay(val) {
  const display = document.getElementById('volume-display')
  if (display) display.textContent = `${val}%`
  if (wavesurfer) {
    wavesurfer.setVolume(val / 100)
  }
}

function openInEditor(mediaId) {
  activeMedia = mediaFiles.find(m => m.id === mediaId)
  if (!activeMedia) return

  const titleEl = document.getElementById('editor-source-title')
  const nameInput = document.getElementById('sound-name-input')
  const volInput = document.getElementById('sound-volume-input')

  if (titleEl) titleEl.textContent = activeMedia.name
  if (nameInput) nameInput.value = activeMedia.name.replace(/\.[^/.]+$/, "")
  
  if (volInput) {
    volInput.value = 50
    updateVolumeDisplay(50)
  }

  switchTab('editor')

  if (!wavesurfer) {
    initWavesurfer()
  }
  
  wavesurfer.load(`file://${activeMedia.path}`)
}

function initWavesurfer() {
  if (typeof WaveSurfer === 'undefined') return

  wsRegions = WaveSurfer.Regions.create()
  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#475569',
    progressColor: '#6366f1',
    height: 90,
    plugins: [wsRegions]
  })

  wavesurfer.on('ready', () => {
    const volInput = document.getElementById('sound-volume-input')
    const currentVol = volInput ? volInput.value : 50
    wavesurfer.setVolume(currentVol / 100)

    wsRegions.clearRegions()
    currentRegion = wsRegions.addRegion({
      start: 0,
      end: Math.min(3, wavesurfer.getDuration()),
      color: 'rgba(99, 102, 241, 0.3)',
      drag: true,
      resize: true
    })
    updateTimeDisplay()
  })

  wsRegions.on('region-updated', (region) => {
    currentRegion = region
    updateTimeDisplay()
  })
}

function updateTimeDisplay() {
  const timeDisplay = document.getElementById('time-range-display')
  if (timeDisplay && currentRegion) {
    timeDisplay.textContent = `${currentRegion.start.toFixed(2)}s - ${currentRegion.end.toFixed(2)}s`
  }
}

function playEditorRegion() {
  if (!wavesurfer || !currentRegion) return

  stopAllAudio()

  wavesurfer.setTime(currentRegion.start)
  wavesurfer.play()

  const onAudioprocess = () => {
    if (wavesurfer.getCurrentTime() >= currentRegion.end) {
      wavesurfer.pause()
      wavesurfer.un('audioprocess', onAudioprocess)
    }
  }

  wavesurfer.un('audioprocess', onAudioprocess)
  wavesurfer.on('audioprocess', onAudioprocess)
}

async function saveSoundConfig() {
  if (!activeMedia || !currentRegion) return

  const soundName = document.getElementById('sound-name-input').value.trim() || '未命名音效'
  const shortcut = document.getElementById('sound-shortcut-input').value.trim()
  const volumeVal = Number(document.getElementById('sound-volume-input').value) / 100

  const newSound = {
    id: 'sound_' + Date.now(),
    name: soundName,
    mediaPath: activeMedia.path,
    start: Number(currentRegion.start.toFixed(2)),
    end: Number(currentRegion.end.toFixed(2)),
    volume: volumeVal,
    shortcut: shortcut
  }

  soundConfigs.push(newSound)
  await ipcRenderer.invoke('save-sound-configs', soundConfigs)

  renderSoundGrid()
  switchTab('sounds')
}

// ==========================================
// 5. 音效庫 (Sound Grid) 與多裝置播放
// ==========================================
async function loadSoundConfigs() {
  soundConfigs = await ipcRenderer.invoke('load-sound-configs')
  renderSoundGrid()
}

function renderSoundGrid() {
  const grid = document.getElementById('sound-grid')
  if (!grid) return
  grid.innerHTML = ''

  if (soundConfigs.length === 0) {
    grid.innerHTML = '<div class="col-span-full text-xs text-slate-500 text-center py-12">音效庫空空如也，請先從資源庫編輯並儲存音效</div>'
    return
  }

  soundConfigs.forEach(sound => {
    const card = document.createElement('div')
    card.className = 'group relative bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-4 flex flex-col justify-between transition shadow-lg'
    card.innerHTML = `
      <div onclick="playConfiguredSound('${sound.id}')" class="cursor-pointer">
        <div class="flex justify-between items-start mb-2">
          <h4 class="font-semibold text-sm text-slate-100 group-hover:text-indigo-400 transition truncate">${sound.name}</h4>
          ${sound.shortcut ? `<span class="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-mono">${sound.shortcut}</span>` : ''}
        </div>
        <div class="text-[11px] text-slate-400 font-mono">
          範圍: ${sound.start}s - ${sound.end}s | 音量: ${Math.round((sound.volume || 0.5) * 100)}%
        </div>
      </div>

      <div class="flex justify-end pt-3 mt-2 border-t border-slate-800/50">
        <button onclick="confirmDeleteSound(event, '${sound.id}', '${sound.name}')" 
                class="text-xs text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 px-2 py-1 rounded transition">
          🗑️ 刪除
        </button>
      </div>
    `
    grid.appendChild(card)
  })
}

async function confirmDeleteSound(event, soundId, soundName) {
  event.stopPropagation()
  const result = confirm(`確定要刪除音效「${soundName}」嗎？此操作無法復原。`)
  if (result) {
    soundConfigs = soundConfigs.filter(s => s.id !== soundId)
    await ipcRenderer.invoke('save-sound-configs', soundConfigs)
    renderSoundGrid()
  }
}

// 核心：多裝置同步播放 (修正版)
async function playConfiguredSound(soundId) {
  const sound = soundConfigs.find(s => s.id === soundId)
  if (!sound) {
    console.error('找不到對應的音效設定:', soundId)
    return
  }

  const playingId = 'play_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)
  const audioInstances = []

  // 確保 targetDevices 內容合法，避免傳入空陣列或無效值
  let targetDevices = selectedDeviceIds.filter(id => id && typeof id === 'string')
  if (targetDevices.length === 0) {
    targetDevices = ['default']
  }

  for (const deviceId of targetDevices) {
    // 建立 Audio 實體 (注意：Electron 中必須使用標準絕對路徑格式)
    const formattedPath = sound.mediaPath.startsWith('file://') 
      ? sound.mediaPath 
      : `file://${sound.mediaPath}`

    const audio = new Audio(formattedPath)
    audio.volume = typeof sound.volume === 'number' ? sound.volume : 0.5

    // 設定起始時間與結束監聽
    audio.currentTime = sound.start

    const checkTime = () => {
      if (audio.currentTime >= sound.end) {
        audio.pause()
        audio.removeEventListener('timeupdate', checkTime)
      }
    }
    audio.addEventListener('timeupdate', checkTime)

    // 先執行播放 (觸發 User Interaction 授權)
    try {
      const playPromise = audio.play()
      if (playPromise !== undefined) {
        await playPromise
      }
    } catch (playError) {
      console.error(`[Audio Play Error] 裝置 ${deviceId} 播放失敗:`, playError)
      continue // 如果這個裝置播放失敗，繼續嘗試其他裝置
    }

    // 播放啟動後，再切換輸出裝置 (若支援且不是 default)
    if (deviceId !== 'default' && 'setSinkId' in audio) {
      try {
        await audio.setSinkId(deviceId)
      } catch (sinkError) {
        console.warn(`[SinkId Warning] 切換裝置 ${deviceId} 失敗，保留預設輸出:`, sinkError)
      }
    }

    audioInstances.push(audio)
  }

  if (audioInstances.length > 0) {
    const session = { playingId, sound, audioInstances }
    activePlayingSessions.push(session)
    updateActivePlayingSidebar()
  } else {
    alert('無法播放音效，請按 F12 開啟 Console 檢查路徑或音訊裝置權限。')
  }
}

// ==========================================
// 6. 側邊欄狀態與全域停止功能
// ==========================================
function stopSession(playingId) {
  const index = activePlayingSessions.findIndex(s => s.playingId === playingId)
  if (index !== -1) {
    const session = activePlayingSessions[index]
    session.audioInstances.forEach(a => {
      a.pause()
      a.currentTime = 0
    })
    activePlayingSessions.splice(index, 1)
    updateActivePlayingSidebar()
  }
}

function stopAllAudio() {
  if (wavesurfer && wavesurfer.isPlaying()) {
    wavesurfer.pause()
  }

  if (currentPlayingAudio) {
    currentPlayingAudio.pause()
    currentPlayingAudio = null
  }

  activePlayingSessions.forEach(session => {
    session.audioInstances.forEach(a => {
      a.pause()
      a.currentTime = 0
    })
  })
  activePlayingSessions = []
  updateActivePlayingSidebar()
}

function updateActivePlayingSidebar() {
  const container = document.getElementById('active-playing-list')
  if (!container) return

  if (activePlayingSessions.length === 0) {
    container.innerHTML = '<div id="no-playing-tip" class="text-xs text-slate-500 text-center py-8">目前沒有音效在播放</div>'
    return
  }

  container.innerHTML = ''
  activePlayingSessions.forEach(session => {
    const item = document.createElement('div')
    item.className = 'bg-slate-900 border border-indigo-500/30 rounded-lg p-3 flex justify-between items-center shadow-md'
    item.innerHTML = `
      <div class="overflow-hidden pr-2">
        <div class="text-xs font-semibold text-slate-200 truncate">${session.sound.name}</div>
        <div class="text-[10px] text-indigo-400 font-mono">輸出裝置數: ${session.audioInstances.length}</div>
      </div>
      <button onclick="stopSession('${session.playingId}')" 
              class="bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-xs px-2.5 py-1 rounded transition shrink-0">
        ■ 停止
      </button>
    `
    container.appendChild(item)
  })
}