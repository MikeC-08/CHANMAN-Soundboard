const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 950,
    height: 650,
    minWidth: 800,
    minHeight: 550,
    backgroundColor: '#0f172a', // 深藍色底色，避免白屏閃爍
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false // 方便開發小工具時直接在 renderer 使用 node 模組
    }
  })

  win.loadFile('index.html')
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})