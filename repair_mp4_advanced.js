// 高级MP4文件修复脚本 - 处理严重损坏的文件
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

/**
 * 检查MP4文件是否可播放
 */
async function isPlayableMP4(filePath) {
  try {
    const { stdout } = await execAsync(`ffprobe -v error -show_format "${filePath}"`);
    return !stdout.includes('moov atom not found');
  } catch (error) {
    return false;
  }
}

/**
 * 尝试多种修复方法
 */
async function tryAdvancedRepair(filePath) {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const outputPath = path.join(dir, `${baseName}_repaired${ext}`);

  // 检查文件大小
  const stats = fs.statSync(filePath);
  console.log(`文件大小: ${stats.size} bytes`);
  
  if (stats.size < 1024) {
    return { success: false, message: '文件大小过小，可能没有有效数据' };
  }

  // 方法1: 尝试使用十六进制编辑器修复文件头
  console.log('\n=== 方法1: 修复文件头 ===');
  try {
    // 读取文件前几个字节检查文件头
    const buffer = fs.readFileSync(filePath, { encoding: null, flag: 'r' });
    
    // 检查是否是有效的MP4文件头
    if (buffer.length >= 8) {
      const header = buffer.slice(0, 8);
      console.log('文件头:', header.toString('hex'));
      
      // 如果是有效的MP4文件头，尝试修复
      if (header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70) {
        console.log('检测到有效的MP4文件头');
        
        // 尝试修复moov atom
        const repairCommand = `ffmpeg -err_detect ignore_err -fflags +discardcorrupt+igndts -analyzeduration 100M -probesize 100M -i "${filePath}" -c copy -movflags +faststart "${outputPath}" -y`;
        await execAsync(repairCommand);
        
        if (await isPlayableMP4(outputPath)) {
          return { success: true, message: '文件头修复成功', outputPath };
        }
      }
    }
  } catch (error) {
    console.log('方法1失败:', error.message);
  }

  // 方法2: 强制重建文件
  console.log('\n=== 方法2: 强制重建文件 ===');
  try {
    const rebuildCommand = `ffmpeg -err_detect ignore_err -fflags +discardcorrupt -max_muxing_queue_size 1024 -i "${filePath}" -c:v libx264 -preset fast -crf 23 -avoid_negative_ts make_zero -reset_timestamps 1 -movflags +faststart "${outputPath}" -y`;
    await execAsync(rebuildCommand);
    
    if (await isPlayableMP4(outputPath)) {
      return { success: true, message: '强制重建成功', outputPath };
    }
  } catch (error) {
    console.log('方法2失败:', error.message);
  }

  // 方法3: 尝试不同的输入格式
  console.log('\n=== 方法3: 尝试不同输入格式 ===');
  const formats = ['mjpeg', 'h264', 'rawvideo'];
  
  for (const format of formats) {
    try {
      console.log(`尝试格式: ${format}`);
      const formatCommand = `ffmpeg -f ${format} -i "${filePath}" -c:v libx264 -preset fast -crf 23 -movflags +faststart "${outputPath}" -y`;
      await execAsync(formatCommand);
      
      if (await isPlayableMP4(outputPath)) {
        return { success: true, message: `格式 ${format} 重建成功`, outputPath };
      }
    } catch (error) {
      console.log(`格式 ${format} 失败:`, error.message);
    }
  }

  // 方法4: 手动构建moov atom
  console.log('\n=== 方法4: 手动构建moov atom ===');
  try {
    // 使用MP4Box工具（如果可用）
    const mp4boxCommand = `MP4Box -add "${filePath}" "${outputPath}"`;
    await execAsync(mp4boxCommand);
    
    if (await isPlayableMP4(outputPath)) {
      return { success: true, message: 'MP4Box修复成功', outputPath };
    }
  } catch (error) {
    console.log('MP4Box不可用或失败:', error.message);
  }

  // 方法5: 最后尝试 - 使用二进制工具
  console.log('\n=== 方法5: 二进制修复 ===');
  try {
    // 使用专门的MP4修复工具
    const repairTools = [
      'mp4repair',
      'untrunc',
      'recover_mp4'
    ];
    
    for (const tool of repairTools) {
      try {
        console.log(`尝试工具: ${tool}`);
        // 检查工具是否可用
        await execAsync(`${tool} --version`);
        
        const toolCommand = `${tool} "${filePath}" "${outputPath}"`;
        await execAsync(toolCommand);
        
        if (await isPlayableMP4(outputPath)) {
          return { success: true, message: `${tool} 修复成功`, outputPath };
        }
      } catch (toolError) {
        console.log(`${tool} 不可用:`, toolError.message);
      }
    }
  } catch (error) {
    console.log('二进制工具修复失败:', error.message);
  }

  return { success: false, message: '所有修复方法均失败' };
}

/**
 * 批量修复文件
 */
async function repairAllFiles() {
  const recordingsPath = './backend/data/recordings';
  
  if (!fs.existsSync(recordingsPath)) {
    console.log('录制文件夹不存在');
    return;
  }

  const files = fs.readdirSync(recordingsPath)
    .filter(f => f.toLowerCase().endsWith('.mp4') && !f.includes('_repaired'));

  console.log(`发现 ${files.length} 个MP4文件`);

  for (const file of files) {
    const filePath = path.join(recordingsPath, file);
    
    console.log(`\n=== 处理文件: ${file} ===`);
    
    try {
      // 首先检查文件是否可播放
      const playable = await isPlayableMP4(filePath);
      
      if (playable) {
        console.log('✓ 文件正常，无需修复');
        continue;
      }
      
      console.log('✗ 文件损坏，开始修复...');
      
      // 尝试高级修复
      const result = await tryAdvancedRepair(filePath);
      
      if (result.success) {
        console.log(`✓ 修复成功: ${result.message}`);
        
        // 用修复文件替换原文件
        fs.unlinkSync(filePath);
        fs.renameSync(result.outputPath, filePath);
        console.log('✓ 文件已替换');
      } else {
        console.log(`✗ 修复失败: ${result.message}`);
        
        // 删除可能创建的修复文件
        if (result.outputPath && fs.existsSync(result.outputPath)) {
          fs.unlinkSync(result.outputPath);
        }
      }
    } catch (error) {
      console.log(`✗ 处理文件时出错: ${error.message}`);
    }
  }
}

// 运行修复
async function main() {
  console.log('开始高级MP4文件修复...\n');
  
  try {
    await repairAllFiles();
    console.log('\n修复过程完成！');
  } catch (error) {
    console.error('修复过程中出错:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { main };