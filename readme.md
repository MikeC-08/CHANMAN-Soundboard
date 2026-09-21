# CHANMAN's Soundboard

**CHANMAN's Soundboard** is a desktop soundboard application built with Electron. Designed for streamers, podcasters, broadcasters, and sound enthusiasts, it supports multi-device synchronized audio output, visual audio trimming, hotkeys, and multi-language UI support.

## 🌟 Key Features

* **🎵 Media Library Management**

  * Drag & drop or batch import local audio files (supports `.mp3`, `.wav`, `.ogg`, `.m4a`, `.flac`, etc.).

  * Built-in **Fuzzy Match** search for fast audio searching.

  * Safe file deletion integrated with system recycle bin/trash.

* **✂️ Waveform Visual Editing**

  * Integrated WaveSurfer.js for visual segment selection (Start / End Time).

  * Customize sound **names**, **default volume levels**, and **dedicated shortcuts**.

* **📢 Multi-Device Synchronized Output**

  * Route audio simultaneously to multiple output devices (e.g., Headphones + Virtual Cable/OBS).

  * Remembers your selected audio output device configurations.

* **⌨️ Global Hotkeys & Sound Grid**

  * Global hotkeys trigger sounds anytime, even while gaming or working in other apps.

  * Real-time active playback sidebar with individual stop buttons or a global "Stop All" action.

* **🌐 Multi-language Support (i18n)**

  * Seamless toggle between Traditional Chinese and English.

## 🛠️ Tech Stack

* **Core Framework**: [Electron](https://www.electronjs.org/) (v44.4.1)

* **Frontend / UI**: HTML5, JavaScript (CommonJS), [Tailwind CSS](https://tailwindcss.com/)

* **Audio Processing**: [WaveSurfer.js](https://wavesurfer.js.org/) v7 (with Regions Plugin)

## 📦 Installation & Getting Started

### Prerequisites

Make sure you have installed:

* [Node.js](https://nodejs.org/) 

### 1. Clone & Install Dependencies

```
# Navigate to the project directory
cd chanman-soundboard

# Install dependencies
npm install
```

### 2. Run in Development Mode

```
npm start
```

### 3. Build Executable (Distribute)

Package the application into a portable Windows 64-bit executable using `electron-builder`:

```
npm run dist
```

The bundled executable will be generated inside the `dist/` directory.

## 📁 Directory Structure

```
chanman-soundboard/
├── index.html            # Main UI HTML layout
├── main.js               # Electron Main Process (IPC, storage, global shortcuts)
├── package.json          # Dependency and build configurations
└── scripts/
    ├── renderer.js       # Renderer Process (UI logic, WaveSurfer, audio playback)
    └── i18n.js           # Internationalization logic
```

## 📄 License

This project is licensed under the [Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/) License.

* **You are free to**: Share, copy, redistribute, and adapt the material.

* **Under the following terms**: You must give appropriate credit to the author (CHAN MAN KIT), and you **may not use the material for commercial purposes**.