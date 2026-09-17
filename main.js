const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

// 定義目錄路徑
const assetsDir = path.join(__dirname, 'assets')
const mediaDir = path.join(assetsDir, 'media')
const configsDir = path.join(assetsDir, 'configs')
const configFile = path.join(configsDir, 'sound_configs.json')

// 自動初始化目錄與預設檔案
function initStorage() {
  [assetsDir, mediaDir, configsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  })
  if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, JSON.stringify([]), 'utf-8')
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
    }
  })

  win.loadFile('index.html')
}

// --- IPC 檔案處理解理 ---

// 1. 複製使用者選擇的音檔至 assets/media/
ipcMain.handle('import-media', async (event, filePath) => {
  const fileName = path.basename(filePath)
  const destPath = path.join(mediaDir, fileName)
  
  // 避免同名檔案覆蓋，若重複則加上 timestamp
  let finalPath = destPath
  if (fs.existsSync(destPath)) {
    const ext = path.extname(fileName)
    const name = path.basename(fileName, ext)
    finalPath = path.join(mediaDir, `${name}_${Date.now()}${ext}`)
  }

  fs.copyFileSync(filePath, finalPath)
  return {
    id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    name: path.basename(finalPath),
    path: finalPath
  }
})

// 2. 載入本地已有的媒體檔案清單
ipcMain.handle('load-media-files', async () => {
  const files = fs.readdirSync(mediaDir)
  return files.map((file, index) => ({
    id: `media_${index}_${file}`,
    name: file,
    path: path.join(mediaDir, file)
  }))
})

// 3. 讀取音效設定 JSON
ipcMain.handle('load-sound-configs', async () => {
  const data = fs.readFileSync(configFile, 'utf-8')
  return JSON.parse(data)
})

// 4. 寫入音效設定 JSON
ipcMain.handle('save-sound-configs', async (event, configs) => {
  fs.writeFileSync(configFile, JSON.stringify(configs, null, 2), 'utf-8')
  return true
})


ipcMain.handle('load-selected-devices', () => {
  const configPath = path.join(app.getPath('userData'), 'selected-devices.json')
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } catch (e) { return [] }
  }
  return ['default']
})

ipcMain.handle('save-selected-devices', (event, deviceIds) => {
  const configPath = path.join(app.getPath('userData'), 'selected-devices.json')
  fs.writeFileSync(configPath, JSON.stringify(deviceIds, null, 2))
  return true
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})


