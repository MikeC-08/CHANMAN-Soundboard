const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')

// 定義目錄與檔案路徑
const assetsDir = path.join(__dirname, 'assets')
const mediaDir = path.join(assetsDir, 'media')
const configsDir = path.join(assetsDir, 'configs')
const configFile = path.join(configsDir, 'sound_configs.json')
const mediaConfigFile = path.join(configsDir, 'media.json') // 統一媒體庫 JSON 路徑

// 自動初始化目錄與預設檔案
function initStorage() {
  [assetsDir, mediaDir, configsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  })
  if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, JSON.stringify([]), 'utf-8')
  }
  if (!fs.existsSync(mediaConfigFile)) {
    fs.writeFileSync(mediaConfigFile, JSON.stringify([]), 'utf-8')
  }
}

// 輔助函式：讀取 media.json
function readMediaConfig() {
  try {
    if (fs.existsSync(mediaConfigFile)) {
      const data = fs.readFileSync(mediaConfigFile, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    console.error('讀取 media.json 失敗:', err)
  }
  return []
}

// 輔助函式：寫入 media.json
function writeMediaConfig(data) {
  try {
    fs.writeFileSync(mediaConfigFile, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error('寫入 media.json 失敗:', err)
    return false
  }
}

function createWindow() {
  initStorage()

  const win = new BrowserWindow({
    width: 950,
    height: 650,
    minWidth: 800,
    minHeight: 550,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    autoHideMenuBar: true,
  })

  win.loadFile('index.html')
}

// ---------------- IPC Handlers ----------------

// 1. 匯入媒體檔 (複製檔案 + 自動寫入 media.json)
ipcMain.handle('import-media', async (event, filePath) => {
  try {
    const fileName = path.basename(filePath)
    const destPath = path.join(mediaDir, fileName)
    
    let finalPath = destPath
    if (fs.existsSync(destPath)) {
      const ext = path.extname(fileName)
      const name = path.basename(fileName, ext)
      finalPath = path.join(mediaDir, `${name}_${Date.now()}${ext}`)
    }

    // 複製實體檔案至 assets/media/
    fs.copyFileSync(filePath, finalPath)

    const newMedia = {
      id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: path.basename(finalPath), // 複製後的檔名 (包含時間戳記)
      originalName: fileName,          // 原始檔名 (供前端清晰顯示)
      path: finalPath
    }

    // 讀取舊清單、加入新檔案並寫入 JSON
    const list = readMediaConfig()
    // list.push(newMedia)
    list.unshift(newMedia)
    writeMediaConfig(list)

    return { success: true, data: newMedia, list }
  } catch (err) {
    console.error('匯入檔案失敗:', err)
    return { success: false, error: err.message }
  }
})

// 2. 讀取所有媒體檔紀錄
ipcMain.handle('load-media-files', async () => {
  return readMediaConfig()
})

// 3. 儲存媒體檔紀錄 (同步前端變更至 media.json)
ipcMain.handle('save-media-files', async (event, mediaFiles) => {
  return writeMediaConfig(mediaFiles)
})

// 4. 音效設定 JSON 讀寫
ipcMain.handle('load-sound-configs', async () => {
  try {
    const data = fs.readFileSync(configFile, 'utf-8')
    return JSON.parse(data)
  } catch (e) {
    return []
  }
})

ipcMain.handle('save-sound-configs', async (event, configs) => {
  try {
    fs.writeFileSync(configFile, JSON.stringify(configs, null, 2), 'utf-8')
    return true
  } catch (e) {
    return false
  }
})

// 5. 輸出裝置記憶讀寫
ipcMain.handle('load-selected-devices', () => {
  const configPath = path.join(app.getPath('userData'), 'selected-devices.json')
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch (e) { return ['default'] }
  }
  return ['default']
})

ipcMain.handle('save-selected-devices', (event, deviceIds) => {
  try {
    const configPath = path.join(app.getPath('userData'), 'selected-devices.json')
    fs.writeFileSync(configPath, JSON.stringify(deviceIds, null, 2))
    return true
  } catch (e) {
    return false
  }
})

// 6. 移至資源回收桶 (物理刪除)
ipcMain.handle('delete-physical-file', async (event, filePath) => {
  try {
    const cleanPath = filePath.replace(/^file:\/\//, '')
    if (fs.existsSync(cleanPath)) {
      await shell.trashItem(cleanPath)
    }
    return { success: true }
  } catch (err) {
    console.error('移至資源回收桶失敗:', err)
    return { success: false, error: err.message }
  }
})

// 7. 檢查實體檔案是否存在 (防卡住關鍵點)
ipcMain.handle('check-file-exists', (event, filePath) => {
  try {
    const cleanPath = filePath.replace(/^file:\/\//, '')
    return fs.existsSync(cleanPath)
  } catch (err) {
    return false
  }
})

// ---------------- App 生命週期 ----------------

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})