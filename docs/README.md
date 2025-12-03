# nodecamera

## 概要

nodecamera 是一个为 Node.js 提供摄像头相关功能的项目，自动录制摄像头图像为MP4文件，可以设定单个文件大小和存储上限size

## 功能（根据代码确认）
- 列举本机摄像头设备
- 从摄像头获取视频帧（实时捕获）
- 支持同时预览和录制
- 提供简单的 Node.js API/CLI 示例

> 注：以上功能项请根据仓库代码实际导出的函数和命令行参数逐项确认、删减或补充。

## 安装

先安装ffmpeg

```powershell
git clone https://github.com/x-itg/nodecamera.git
cd nodecamera
npm run build:all
.\启动服务.ps
```


