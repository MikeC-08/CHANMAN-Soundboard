const translations = {
  'zh-TW': {
    // 導航與頂部
    'nav.media': '資源庫',
    'nav.editor': '編輯頁',
    'nav.sounds': '音效庫',
    'btn.stopAll': '■ 停止所有音效',
    'device.title': '輸出裝置',
    'device.subtitle': '選擇輸出聲音的裝置：',

    'sidebar.noPlaying': '目前沒有音效在播放',
    'sidebar.devicesCount': '輸出裝置數',
    'sidebar.stop': '停止',

    // 資源庫
    'media.empty': '尚未匯入任何媒體檔案',
    'media.btnEdit': '編輯音效',
    'media.btnImportFromLocal': '從本地匯入',
    'placeholder.searchAudio': '搜尋音效檔案',

    // 在 translations['zh-TW'] 加入：
    'media.duration': '時長',
    'media.durationLoading': '計算時長中...',
    'media.btnDelete': '移除',
    'media.deleteTitle': '移除媒體檔案',
    'media.deleteConfirm': '確定要移除「{name}」嗎？檔案將會移至資源回收桶。',
    

    // 編輯頁
    'editor.nameLabel': '音效名稱',
    'editor.shortcutLabel': '快捷鍵 (Shortcut)',
    'editor.volumeLabel': '預設音量',
    'editor.timeRange': '時間範圍:',
    'editor.btnSave': '儲存至音效庫',
    'editor.btnPlayRegion': '▶ 試聽選取段落',
    'editor.btnStopRegion': '■ 停止試聽',
    'editor.emptySelection': '未選擇檔案',
    'editor.editorTips':'在波形圖上拉選段落，設定起點與終點',

    // 音效庫 & 側邊欄
    'sounds.empty': '音效庫空空如也，請先從資源庫編輯並儲存音效',
    'sounds.range': '範圍',
    'sounds.volume': '音量',
    'sounds.btnDelete': '🗑️ 刪除',
    'sounds.deleteConfirm': '確定要刪除音效「{name}」嗎？',
    'sounds.deleteTitle': '刪除確認',
    'sidebar.playing': '正在播放中',
    'sidebar.stopAll': '全部停止',
    'sidebar.noPlaying': '目前沒有音效在播放',
    'btn.cancel': '取消',
    'btn.confirm': '確定刪除',

  },
  'en': {
    // Nav & Header
    'nav.media': 'Library',
    'nav.editor': 'Editor',
    'nav.sounds': 'Soundboard',
    'btn.stopAll': '■ Stop All',
    'device.title': 'Output Devices',
    'device.subtitle': 'Select Output Devices',
    'device.amount': 'No of Devices:',

    'sidebar.noPlaying': 'No audio playing',
    'sidebar.devicesCount': 'Outputs',
    'sidebar.stop': 'Stop',

    // Media Library
    'media.empty': 'No media files imported yet',
    'media.btnEdit': 'Edit Sound',
    'media.btnImportFromLocal': 'Import From Local',
    'placeholder.searchAudio': 'Search Audio',
    // 在 translations['en'] 加入：
    'media.duration': 'Duration',
    'media.durationLoading': 'Loading duration...',
    'media.btnDelete': 'Remove',
    'media.deleteTitle': 'Remove Media File',
    'media.deleteConfirm': 'Are you sure you want to remove "{name}"? The file will be moved to the Trash / Recycle Bin.',

    // Editor
    'editor.nameLabel': 'Sound Name',
    'editor.shortcutLabel': 'Shortcut',
    'editor.volumeLabel': 'Default Volume',
    'editor.timeRange': 'Time Range:',
    'editor.btnSave': 'Save to Soundboard',
    'editor.btnPlayRegion': '▶ Preview Selection',
    'editor.btnStopRegion': '■ Stop Preview',
    'editor.emptySelection': 'No file selected',
    'editor.editorTips':'Drag a selection on the waveform graph and set the start and end points.',

    // Soundboard & Sidebar
    'sounds.empty': 'Soundboard is empty. Edit and save sounds from Library first.',
    'sounds.range': 'Range',
    'sounds.volume': 'Vol',
    'sounds.btnDelete': '🗑️ Delete',
    'sounds.deleteConfirm': 'Are you sure you want to delete "{name}"?',
    'sounds.deleteTitle': 'Confirm Delete',
    'sidebar.playing': 'Now Playing',
    'sidebar.stopAll': 'Stop All',
    'sidebar.noPlaying': 'No audio playing',

    'btn.cancel': 'Cancel',
    'btn.confirm': 'Delete',
  }
}

// 取得目前語言，預設繁中
let currentLang = localStorage.getItem('app-lang') || 'zh-TW'

// 核心翻譯函式
function t(key, params = {}) {
  let text = (translations[currentLang] && translations[currentLang][key]) || key
  Object.keys(params).forEach(p => {
    text = text.replace(`{${p}}`, params[p])
  })
  return text
}

// 切換語言
function setLanguage(lang) {
  if (!translations[lang]) return
  currentLang = lang
  localStorage.setItem('app-lang', lang)
  updateUIAllText()
}

// 掃描頁面並替換包含 data-i18n 的元素
function updateUIAllText() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n')
    el.textContent = t(key)
  })
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  })
  // 更新動態產生的卡片內容
  if (typeof renderMediaList === 'function') renderMediaList()
  if (typeof renderSoundGrid === 'function') renderSoundGrid()
  if (typeof updateActivePlayingSidebar === 'function') updateActivePlayingSidebar()
}

// 頁面載入完成後自動初始化語言 selector 數值
document.addEventListener('DOMContentLoaded', () => {
  const langSelect = document.getElementById('lang-select')
  if (langSelect) {
    langSelect.value = currentLang
  }
  updateUIAllText()
})