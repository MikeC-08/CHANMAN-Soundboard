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
  const langSelect = document.getElementById('lang-select')
  if (langSelect && typeof currentLang !== 'undefined') {
    langSelect.value = currentLang
  }
  if (typeof updateUIAllText === 'function') {
    updateUIAllText() // 觸發全頁翻譯替換
  }
  await loadMediaFiles()
  await loadSoundConfigs()
  await initDevices()
  setupDragAndDrop()

  // 點擊選單外部自動關閉下拉框
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('device-dropdown')
    if (dropdown && !dropdown.contains(e.target) && !e.target.closest('#device-dropdown-btn')) {
      dropdown.classList.add('hidden')
    }
  })
})

// 儲存媒體檔紀錄 (主動寫入 media.json)
async function saveMediaFiles() {
  try {
    if (window.ipcRenderer && ipcRenderer.invoke) {
      await ipcRenderer.invoke('save-media-files', mediaFiles)
    }
  } catch (err) {
    console.error('儲存媒體庫紀錄失敗:', err)
  }
}

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
// 2. 音訊裝置選取與記憶邏輯
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

// 頁面初始化時讀取歷史資料
async function loadMediaFiles() {
  mediaFiles = await ipcRenderer.invoke('load-media-files')
  await renderMediaList()
}

// ==========================================
// 3.1 模糊搜尋與動態過濾邏輯
// ==========================================

function fuzzyMatch(pattern, str) {
  if (!pattern) return 0; // 若無輸入搜尋字詞，預設全部通過
  
  const patternLower = pattern.toLowerCase();
  const strLower = str.toLowerCase();

  // 1. 優先處理「連續子字串匹配」（完全包含關鍵字）
  const directIndex = strLower.indexOf(patternLower);
  if (directIndex !== -1) {
    return directIndex; // 精確匹配優先度最高，依照出現位置給分
  }

  // 2. 次要處理「不連續字元匹配」（例如 bgm -> background_music）
  let pIdx = 0;
  let firstMatchIdx = -1;
  let lastMatchIdx = -1;

  for (let sIdx = 0; sIdx < strLower.length; sIdx++) {
    if (strLower[sIdx] === patternLower[pIdx]) {
      if (pIdx === 0) firstMatchIdx = sIdx;
      lastMatchIdx = sIdx;
      pIdx++;
      if (pIdx === patternLower.length) break;
    }
  }

  // 必須所有 pattern 字元都有順序地出現
  if (pIdx === patternLower.length) {
    // 跨度越短得分越高 (例如: 'bgm' 匹配 'bg_music' 距離比 'b_a_g_m' 短)
    const distanceBonus = lastMatchIdx - firstMatchIdx;
    return 1000 + distanceBonus; 
  }

  return null; // 未匹配成功
}

/**
 * 搜尋框輸入事件 handler
 */
async function filterMediaList() {
  const searchInput = document.getElementById('media-search');
  const query = searchInput ? searchInput.value.trim() : '';

  // 呼叫 renderMediaList 並帶入搜尋條件
  await renderMediaList(query);
}


let pendingDeleteMediaId = null

// 輔助函式：將秒數轉為 mm:ss 格式
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '--:--'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 輔助函式：非同步獲取音訊檔案長度
function getAudioDuration(filePath) {
  return new Promise((resolve) => {
    const formattedPath = filePath.startsWith('file://') ? filePath : `file://${filePath}`
    const tempAudio = new Audio(formattedPath)
    
    tempAudio.addEventListener('loadedmetadata', () => {
      resolve(tempAudio.duration)
    })
    
    tempAudio.addEventListener('error', () => {
      resolve(null)
    })
  })
}

// 清理檔名或優先使用 originalName 顯示
function getCleanFileName(media) {
  if (!media) return ''
  
  // 若為物件且有記錄原始名稱，優先採用
  if (typeof media === 'object' && media.originalName) {
    return media.originalName
  }

  const fileName = typeof media === 'object' ? media.name : media
  if (!fileName) return ''

  let cleanName = fileName
  const extMatch = cleanName.match(/\.[^/.]+$/)
  const ext = extMatch ? extMatch[0] : ''
  cleanName = cleanName.replace(/\.[^/.]+$/, '')

  cleanName = cleanName.replace(/[-_]\d{10,}$/g, '')
  cleanName = cleanName.replace(/[-_][a-zA-Z0-9]{8,}$/g, '')

  return (cleanName.trim() || fileName.replace(/\.[^/.]+$/, '')) + ext
}

// 渲染資源庫列表（防卡死核心修正：動態過濾已消失的實體檔案）
// 渲染資源庫列表（支援模糊搜尋過濾）
async function renderMediaList(searchQuery = '') {
  const container = document.getElementById('media-list');
  if (!container) return;
  container.innerHTML = '';

  if (!Array.isArray(mediaFiles) || mediaFiles.length === 0) {
    const emptyMsg = typeof t === 'function' ? t('media.empty') : '尚無媒體檔案';
    container.innerHTML = `<div class="text-xs text-slate-500 text-center py-8">${emptyMsg}</div>`;
    return;
  }

  // --- 步驟 1: 過濾出實體檔案存在的清單 ---
  const validMediaFiles = [];
  let hasMissing = false;

  for (const media of mediaFiles) {
    const exists = await ipcRenderer.invoke('check-file-exists', media.path);
    if (exists) {
      validMediaFiles.push(media);
    } else {
      hasMissing = true;
      console.warn(`媒體檔案已不存在，自動過濾: ${media.path}`);
    }
  }

  // 若發現有不存在的檔案，同步更新記憶體與 JSON
  if (hasMissing) {
    mediaFiles = validMediaFiles;
    await saveMediaFiles();
  }

  if (mediaFiles.length === 0) {
    const emptyMsg = typeof t === 'function' ? t('media.empty') : '尚無媒體檔案';
    container.innerHTML = `<div class="text-xs text-slate-500 text-center py-8">${emptyMsg}</div>`;
    return;
  }

  // --- 步驟 2: 執行模糊搜尋與排序 ---
  let displayList = mediaFiles;

  if (searchQuery) {
    const scoredList = [];
    
    for (const media of mediaFiles) {
      const displayName = getCleanFileName(media);
      const score = fuzzyMatch(searchQuery, displayName);

      if (score !== null) {
        scoredList.push({ media, score });
      }
    }

    // 依分數排序 (分數小者排前面)
    scoredList.sort((a, b) => a.score - b.score);
    displayList = scoredList.map(item => item.media);
  }

  // 搜尋結果為空時的提示
  if (displayList.length === 0) {
    const noResultMsg = typeof t === 'function' ? t('media.noResult') : '找不到符合的媒體檔案';
    container.innerHTML = `<div class="text-xs text-slate-500 text-center py-8">${noResultMsg}</div>`;
    return;
  }

  // --- 步驟 3: 渲染最終列表 ---
  for (const media of displayList) {
    const item = document.createElement('div');
    item.className = 'bg-slate-900 border border-slate-800 rounded-xl p-3 flex justify-between items-center hover:border-slate-700 transition';
    
    const displayName = getCleanFileName(media);

    let durationLoadingText = typeof t === 'function' ? t('media.durationLoading') : '載入中...';
    let durationLabel = typeof t === 'function' ? t('media.duration') : '長度';
    let btnEditText = typeof t === 'function' ? t('media.btnEdit') : '編輯';
    let btnDeleteText = typeof t === 'function' ? t('media.btnDelete') : '刪除';

    let durationText = typeof media.duration === 'number' ? formatDuration(media.duration) : durationLoadingText;

    item.innerHTML = `
      <div class="truncate pr-4">
        <div class="text-xs font-semibold text-slate-200 truncate" title="${displayName}">${displayName}</div>
        <div class="text-[10px] text-indigo-400 font-mono mt-0.5">
          ⏱️ ${durationLabel}: <span id="duration-${media.id}">${durationText}</span>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button onclick="openInEditor('${media.id}')" class="bg-indigo-600/20 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/30 text-xs px-3 py-1.5 rounded-lg transition">
          ${btnEditText}
        </button>
        <button onclick="confirmDeleteMedia(event, '${media.id}', '${displayName}')" class="bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/20 text-xs px-2.5 py-1.5 rounded-lg transition">
          🗑️ ${btnDeleteText}
        </button>
      </div>
    `;
    container.appendChild(item);

    if (typeof media.duration !== 'number') {
      getAudioDuration(media.path).then(dur => {
        if (dur) {
          media.duration = dur;
          const span = document.getElementById(`duration-${media.id}`);
          if (span) span.textContent = formatDuration(dur);
        }
      });
    }
  }
}

// 點擊按鈕匯入媒體檔案
async function importMediaFiles(event) {
  if (!event || !event.target || !event.target.files) return
  const files = Array.from(event.target.files)
  for (const file of files) {
    const filePath = webUtils.getPathForFile(file)
    const res = await ipcRenderer.invoke('import-media', filePath)
    if (res && res.success) {
      mediaFiles = res.list // 使用 IPC 回傳之最新列表
    } else if (res && res.error) {
      alert('匯入失敗: ' + res.error)
    }
  }
  await renderMediaList()
}

// 拖放檔案匯入
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
        const filePath = webUtils.getPathForFile(file)
        const res = await ipcRenderer.invoke('import-media', filePath)
        if (res && res.success) {
          mediaFiles = res.list // 使用 IPC 回傳之最新列表
        }
      }
    }
    await renderMediaList()
  })
}

// 觸發資源庫移除對話框
function confirmDeleteMedia(event, mediaId, mediaName) {
  event.stopPropagation()
  pendingDeleteMediaId = mediaId

  const modal = document.getElementById('delete-media-modal')
  const msgEl = document.getElementById('delete-media-modal-msg')
  const confirmBtn = document.getElementById('confirm-delete-media-btn')

  if (msgEl) {
    const deleteMsg = typeof t === 'function' 
      ? t('media.deleteConfirm', { name: mediaName }) 
      : `確定要刪除「${mediaName}」嗎？`
    msgEl.textContent = deleteMsg
  }

  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      await executeDeleteMedia()
    }
  }

  if (modal) {
    modal.classList.remove('hidden')
  }
}

// 關閉資源庫 Modal
function closeDeleteMediaModal() {
  const modal = document.getElementById('delete-media-modal')
  if (modal) {
    modal.classList.add('hidden')
  }
  pendingDeleteMediaId = null
}

// 執行移除動作
async function executeDeleteMedia() {
  if (!pendingDeleteMediaId) return

  const targetMedia = mediaFiles.find(m => m.id === pendingDeleteMediaId)

  if (targetMedia) {
    // 1. 移除實體檔案至回收桶
    if (targetMedia.path) {
      const res = await ipcRenderer.invoke('delete-physical-file', targetMedia.path)
      if (!res.success) {
        console.warn('檔案移至回收桶失敗（可能檔案已被手動刪除）:', res.error)
      }
    }

    // 2. 從記憶體中過濾並持久化至 JSON
    mediaFiles = mediaFiles.filter(m => m.id !== pendingDeleteMediaId)
    await saveMediaFiles()
  }

  closeDeleteMediaModal()
  await renderMediaList()
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

async function openInEditor(mediaId) {
  activeMedia = mediaFiles.find(m => m.id === mediaId)
  if (!activeMedia) return

  // --- [修正點 2] 開啟 Wavesurfer 前先確認實體檔案是否存在 ---
  const exists = await ipcRenderer.invoke('check-file-exists', activeMedia.path)
  if (!exists) {
    alert('該實體檔案已消失或無法讀取！')
    await renderMediaList() // 重新刷新並清除無效紀錄
    return
  }

  const titleEl = document.getElementById('editor-source-title')
  const nameInput = document.getElementById('sound-name-input')
  const volInput = document.getElementById('sound-volume-input')

  const displayName = getCleanFileName(activeMedia)

  if (titleEl) titleEl.textContent = displayName
  if (nameInput) nameInput.value = displayName.replace(/\.[^/.]+$/, "")
  
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

  wavesurfer.on('error', (err) => {
    console.error('Wavesurfer 載入錯誤:', err)
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

  if (!Array.isArray(soundConfigs) || soundConfigs.length === 0) {
    const emptyMsg = typeof t === 'function' ? t('sounds.empty') : '尚無設定的音效'
    grid.innerHTML = `<div class="col-span-full text-xs text-slate-500 text-center py-12">${emptyMsg}</div>`
    return
  }

  soundConfigs.forEach(sound => {
    const card = document.createElement('div')
    card.className = 'group relative bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-4 flex flex-col justify-between transition shadow-lg'
    
    let rangeLabel = typeof t === 'function' ? t('sounds.range') : '範圍'
    let volumeLabel = typeof t === 'function' ? t('sounds.volume') : '音量'
    let btnDeleteText = typeof t === 'function' ? t('sounds.btnDelete') : '刪除'

    card.innerHTML = `
    <div onclick="playConfiguredSound('${sound.id}')" class="cursor-pointer">
        <div class="flex justify-between items-start mb-2 gap-2">
        <h4 class="font-semibold text-sm text-slate-100 group-hover:text-indigo-400 transition line-clamp-2 break-words min-w-0">
            ${sound.name}
        </h4>
        ${sound.shortcut ? `<span class="shrink-0 text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-mono">${sound.shortcut}</span>` : ''}
        </div>
        <div class="text-[11px] text-slate-400 font-mono">
        ${rangeLabel}: ${sound.start}s - ${sound.end}s | ${volumeLabel}: ${Math.round((sound.volume || 0.5) * 100)}%
        </div>
    </div>

    <div class="flex justify-end pt-3 mt-2 border-t border-slate-800/50">
        <button onclick="confirmDeleteSound(event, '${sound.id}', '${sound.name}')" 
                class="text-xs text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 px-2 py-1 rounded transition">
        ${btnDeleteText}
        </button>
    </div>
    `;
    grid.appendChild(card)
  })
}

let pendingDeleteSoundId = null

function confirmDeleteSound(event, soundId, soundName) {
  event.stopPropagation()
  pendingDeleteSoundId = soundId

  const modal = document.getElementById('delete-modal')
  const msgEl = document.getElementById('delete-modal-msg')
  const confirmBtn = document.getElementById('confirm-delete-btn')

  if (msgEl) {
    const deleteMsg = typeof t === 'function' 
      ? t('sounds.deleteConfirm', { name: soundName }) 
      : `確定要刪除音效「${soundName}」嗎？`
    msgEl.textContent = deleteMsg
  }

  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      await executeDeleteSound()
    }
  }

  if (modal) {
    modal.classList.remove('hidden')
  }
}

function closeDeleteModal() {
  const modal = document.getElementById('delete-modal')
  if (modal) {
    modal.classList.add('hidden')
  }
  pendingDeleteSoundId = null
}

async function executeDeleteSound() {
  if (!pendingDeleteSoundId) return

  soundConfigs = soundConfigs.filter(s => s.id !== pendingDeleteSoundId)
  await ipcRenderer.invoke('save-sound-configs', soundConfigs)

  closeDeleteModal()
  renderSoundGrid()
}

// 核心：多裝置同步播放（防卡死修正：檢查實體檔案）
async function playConfiguredSound(soundId) {
  const sound = soundConfigs.find(s => s.id === soundId)
  if (!sound) {
    console.error('找不到對應的音效設定:', soundId)
    return
  }

  // --- [修正點 3] 播放前檢查實體檔案是否存在 ---
  const exists = await ipcRenderer.invoke('check-file-exists', sound.mediaPath)
  if (!exists) {
    alert(`無法播放：原始媒體檔案「${sound.name}」已不存在或被移除。`)
    return
  }

  const playingId = 'play_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4)
  const audioInstances = []

  let targetDevices = selectedDeviceIds.filter(id => id && typeof id === 'string')
  if (targetDevices.length === 0) {
    targetDevices = ['default']
  }

  let finishedCount = 0

  const handleAudioEnd = () => {
    finishedCount++
    if (finishedCount >= targetDevices.length) {
      stopSession(playingId)
    }
  }

  for (const deviceId of targetDevices) {
    const formattedPath = sound.mediaPath.startsWith('file://') 
      ? sound.mediaPath 
      : `file://${sound.mediaPath}`

    const audio = new Audio(formattedPath)
    audio.volume = typeof sound.volume === 'number' ? sound.volume : 0.5
    audio.currentTime = sound.start

    let hasEnded = false
    const triggerEndOnce = () => {
      if (!hasEnded) {
        hasEnded = true
        audio.pause()
        audio.removeEventListener('timeupdate', checkTime)
        audio.removeEventListener('ended', triggerEndOnce)
        handleAudioEnd()
      }
    }

    const checkTime = () => {
      if (audio.currentTime >= sound.end) {
        triggerEndOnce()
      }
    }

    audio.addEventListener('timeupdate', checkTime)
    audio.addEventListener('ended', triggerEndOnce)

    try {
      const playPromise = audio.play()
      if (playPromise !== undefined) {
        await playPromise
      }
    } catch (playError) {
      console.error(`[Audio Play Error] 裝置 ${deviceId} 播放失敗:`, playError)
      triggerEndOnce()
      continue
    }

    if (deviceId !== 'default' && 'setSinkId' in audio) {
      try {
        await audio.setSinkId(deviceId)
      } catch (sinkError) {
        console.warn(`[SinkId Warning] 切換裝置 ${deviceId} 失敗:`, sinkError)
      }
    }

    audioInstances.push(audio)
  }

  if (audioInstances.length > 0) {
    const session = { playingId, sound, audioInstances }
    activePlayingSessions.push(session)
    updateActivePlayingSidebar()
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
    const noPlayingText = typeof t === 'function' ? t('sidebar.noPlaying') : '目前沒有播放中的音效'
    container.innerHTML = `<div id="no-playing-tip" class="text-xs text-slate-500 text-center py-8">${noPlayingText}</div>`
    return
  }

  container.innerHTML = ''
  activePlayingSessions.forEach(session => {
    const item = document.createElement('div')
    item.className = 'bg-slate-900 border border-indigo-500/30 rounded-lg p-3 flex justify-between items-center shadow-md mb-2'
    
    let devicesCountText = typeof t === 'function' ? t('sidebar.devicesCount') : '裝置數'
    let stopText = typeof t === 'function' ? (t('sidebar.stop') || '停止') : '停止'

    item.innerHTML = `
      <div class="overflow-hidden pr-2">
        <div class="text-xs font-semibold text-slate-200 truncate">${session.sound.name}</div>
        <div class="text-[10px] text-indigo-400 font-mono">${devicesCountText}: ${session.audioInstances.length}</div>
      </div>
      <button onclick="stopSession('${session.playingId}')" 
              class="bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-xs px-2.5 py-1 rounded transition shrink-0">
        ■ ${stopText}
      </button>
    `
    container.appendChild(item)
  })
}