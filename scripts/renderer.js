let mediaFiles = []
let soundConfigs = []
let activeMedia = null // 當前正在編輯的原始檔案

let wavesurfer
let wsRegions
let currentRegion = null

// --- 1. 分頁切換邏輯 ---
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

// --- 2. 資源庫邏輯 ---
function importMediaFiles(event) {
  const files = Array.from(event.target.files)
  files.forEach(file => {
    mediaFiles.push({
      id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: file.name,
      path: file.path,
      url: URL.createObjectURL(file)
    })
  })
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

// --- 3. 編輯頁與 Wavesurfer 邏輯 ---
function openInEditor(mediaId) {
  activeMedia = mediaFiles.find(m => m.id === mediaId)
  if (!activeMedia) return

  document.getElementById('editor-source-title').textContent = activeMedia.name
  document.getElementById('sound-name-input').value = activeMedia.name.replace(/\.[^/.]+$/, "") // 預設拿檔名當音效名

  switchTab('editor')

  // 初始化或重新載入 Wavesurfer
  if (!wavesurfer) {
    initWavesurfer()
  }
  
  wavesurfer.load(activeMedia.url)
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

// 儲存為 JSON 音效設定檔
function saveSoundConfig() {
  if (!activeMedia || !currentRegion) return

  const soundName = document.getElementById('sound-name-input').value.trim() || '未命名音效'
  const shortcut = document.getElementById('sound-shortcut-input').value.trim()

  const newSound = {
    id: 'sound_' + Date.now(),
    name: soundName,
    mediaPath: activeMedia.path,
    mediaUrl: activeMedia.url,
    start: Number(currentRegion.start.toFixed(2)),
    end: Number(currentRegion.end.toFixed(2)),
    shortcut: shortcut
  }

  soundConfigs.push(newSound)
  renderSoundGrid()
  switchTab('sounds') // 自動跳轉到音效庫
}

// 試聽編輯區域
document.getElementById('btn-play-editor-region').addEventListener('click', () => {
  if (currentRegion) currentRegion.play()
})

// --- 4. 音效庫邏輯 (根據 JSON 設定檔播放) ---
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

// 播放 JSON 說明的段落
async function playConfiguredSound(sound) {
  const deviceId = document.getElementById('device-select').value
  const audio = new Audio(sound.mediaUrl)

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

// 初始化裝置
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