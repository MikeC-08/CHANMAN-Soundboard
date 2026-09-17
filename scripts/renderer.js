const { ipcRenderer, webUtils } = require('electron')

let mediaFiles = []
let soundConfigs = []
let activeMedia = null

let wavesurfer
let wsRegions
let currentRegion = null


// --- 初始化載入本地資料 ---
async function loadPersistedData() {
  mediaFiles = await ipcRenderer.invoke('load-media-files')
  soundConfigs = await ipcRenderer.invoke('load-sound-configs')
  
  renderMediaList()
  renderSoundGrid()
}

// --- 分頁切換 ---
function switchTab(tabName) {
  ['media', 'editor', 'sounds'].forEach(name => {
    const section = document.getElementById(`tab-${name}`)
    const btn = document.getElementById(`tab-btn-${name}`)
    
    if (name === tabName) {
      section.classList.remove('hidden')
      btn.classList.add('bg-indigo-600', 'text-white')
      btn.classList.remove('text-slate-400')
    } else {
      section.classList.add('hidden')
      btn.classList.remove('bg-indigo-600', 'text-white')
      btn.classList.add('text-slate-400')
    }
  })
}

// --- 資源庫：匯入與繪製 ---
const mediaTab = document.getElementById('tab-media')

// 防止瀏覽器預設開啟檔案的動作
mediaTab.addEventListener('dragover', (e) => {
  e.preventDefault()
  e.stopPropagation()
})

mediaTab.addEventListener('drop', async (e) => {
  e.preventDefault()
  e.stopPropagation()

  const files = Array.from(e.dataTransfer.files)
  for (const file of files) {
    if (file.type.startsWith('audio/')) {
      const path = webUtils.getPathForFile(file)
      const savedMedia = await ipcRenderer.invoke('import-media', path)
      mediaFiles.push(savedMedia)
    }
  }
  renderMediaList()
})

async function importMediaFiles(event) {
  const files = Array.from(event.target.files)
  for (const file of files) {
    // 使用 webUtils 取得真實絕對路徑
    const path = webUtils.getPathForFile(file)
    const savedMedia = await ipcRenderer.invoke('import-media', path)
    mediaFiles.push(savedMedia)
  }
  renderMediaList()
}

function renderMediaList(filterText = '') {
  const container = document.getElementById('media-list')
  container.innerHTML = ''

  const filtered = mediaFiles.filter(m => m.name.toLowerCase().includes(filterText.toLowerCase()))

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-600 text-center py-8">尚無檔案，請點擊右上角匯入</div>`
    return
  }

  filtered.forEach(media => {
    const item = document.createElement('div')
    item.className = 'flex justify-between items-center bg-slate-900 border border-slate-800 hover:border-indigo-500/50 p-3 rounded-lg transition'
    item.innerHTML = `
      <span class="text-xs font-medium text-slate-200 truncate max-w-[60%]">${media.name}</span>
      <button onclick="openInEditor('${media.id}')" class="bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white text-xs px-3 py-1 rounded transition">
        編輯音效
      </button>
    `
    container.appendChild(item)
  })
}

function filterMediaList() {
  const query = document.getElementById('media-search').value
  renderMediaList(query)
}
// --- 1. 更新音量顯示與 Wavesurfer 試聽音量 ---
function updateVolumeDisplay(val) {
  document.getElementById('volume-display').textContent = `${val}%`
  if (wavesurfer) {
    // Wavesurfer 的 setVolume 接收 0.0 到 1.0 的浮點數
    wavesurfer.setVolume(val / 100)
  }
}

// --- 編輯頁：Wavesurfer 載入 ---
function openInEditor(mediaId) {
  activeMedia = mediaFiles.find(m => m.id === mediaId)
  if (!activeMedia) return

  document.getElementById('editor-source-title').textContent = activeMedia.name
  document.getElementById('sound-name-input').value = activeMedia.name.replace(/\.[^/.]+$/, "")
  
  // 預設重置音量為 50%
  document.getElementById('sound-volume-input').value = 50
  updateVolumeDisplay(50)

  switchTab('editor')

  if (!wavesurfer) {
    initWavesurfer()
  }
  
  wavesurfer.load(`file://${activeMedia.path}`)
}

function initWavesurfer() {
  wsRegions = WaveSurfer.Regions.create()
  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    waveColor: '#475569',
    progressColor: '#6366f1',
    height: 90,
    plugins: [wsRegions]
  })

  wavesurfer.on('ready', () => {
    // 載入完成時同步音量
    const currentVol = document.getElementById('sound-volume-input').value
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
  if (!currentRegion) return
  const start = currentRegion.start.toFixed(2)
  const end = currentRegion.end.toFixed(2)
  document.getElementById('time-range-display').textContent = `${start}s - ${end}s`
}

// 儲存設定至 sound_configs.json
async function saveSoundConfig() {
  if (!activeMedia || !currentRegion) return

  const soundName = document.getElementById('sound-name-input').value.trim() || '未命名音效'
  const shortcut = document.getElementById('sound-shortcut-input').value.trim()
  const volumeVal = Number(document.getElementById('sound-volume-input').value) / 100 // 轉為 0.0 ~ 1.0

  const newSound = {
    id: 'sound_' + Date.now(),
    name: soundName,
    mediaPath: activeMedia.path,
    start: Number(currentRegion.start.toFixed(2)),
    end: Number(currentRegion.end.toFixed(2)),
    volume: volumeVal, // JSON 寫入音量欄位 (例如: 0.5)
    shortcut: shortcut
  }

  soundConfigs.push(newSound)

  await ipcRenderer.invoke('save-sound-configs', soundConfigs)

  renderSoundGrid()
  switchTab('sounds')
}

document.getElementById('btn-play-editor-region').addEventListener('click', () => {
  if (currentRegion) currentRegion.play()
})

// --- 音效庫：卡片渲染與播放 ---
function renderSoundGrid() {
  const grid = document.getElementById('sound-grid')
  grid.innerHTML = ''

  soundConfigs.forEach(sound => {
    const card = document.createElement('button')
    card.onclick = () => playConfiguredSound(sound)
    card.className = 'bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-4 flex flex-col justify-between h-28 text-left transition duration-150 active:scale-95 group relative'
    
    card.innerHTML = `
      <span class="font-medium text-slate-200 group-hover:text-indigo-300 truncate">${sound.name}</span>
      <div class="flex justify-between items-center w-full">
        ${sound.shortcut ? `<span class="text-[10px] bg-slate-900 text-slate-400 border border-slate-800 px-2 py-0.5 rounded font-mono">${sound.shortcut}</span>` : '<span></span>'}
        <span class="text-[10px] text-slate-500 font-mono">${sound.start}s-${sound.end}s</span>
      </div>
    `
    grid.appendChild(card)
  })
}

async function playConfiguredSound(sound) {
  const deviceId = document.getElementById('device-select').value
  const audio = new Audio(`file://${sound.mediaPath}`)

  // 套用 JSON 記錄的音量，若無紀錄則預設 0.5
  audio.volume = typeof sound.volume === 'number' ? sound.volume : 0.5

  if (deviceId && 'setSinkId' in audio) {
    await audio.setSinkId(deviceId).catch(console.error)
  }

  audio.currentTime = sound.start
  audio.play()

  const checkTime = () => {
    if (audio.currentTime >= sound.end) {
      audio.pause()
      audio.removeEventListener('timeupdate', checkTime)
    }
  }
  audio.addEventListener('timeupdate', checkTime)
}

// 初始化裝置與本地資料
async function initDevices() {
  const select = document.getElementById('device-select')
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {})
    const devices = await navigator.mediaDevices.enumerateDevices()
    const outputs = devices.filter(d => d.kind === 'audiooutput')

    select.innerHTML = ''
    outputs.forEach(device => {
      const option = document.createElement('option')
      option.value = device.deviceId
      option.textContent = device.label || `音訊裝置 ${device.deviceId.slice(0, 5)}`
      select.appendChild(option)
    })
  } catch (err) {
    console.error(err)
  }
}

initDevices()
loadPersistedData()