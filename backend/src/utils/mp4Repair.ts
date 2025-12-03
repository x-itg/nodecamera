/**
 * MP4文件修复工具
 * 用于修复因进程异常终止导致的损坏MP4文件
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

/**
 * 检查MP4文件是否可播放
 */
export async function isPlayableMP4(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`ffprobe -v error -show_format "${filePath}"`);
    return !stdout.includes('moov atom not found');
  } catch (error) {
    return false;
  }
}

/**
 * 修复损坏的MP4文件
 */
export async function repairMP4File(filePath: string): Promise<{ success: boolean; message: string; outputPath?: string }> {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return { success: false, message: '文件不存在' };
    }

    // 检查文件是否可播放
    const playable = await isPlayableMP4(filePath);
    if (playable) {
      return { success: true, message: '文件已可播放，无需修复' };
    }

    // 创建修复后的文件路径
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const outputPath = path.join(dir, `${baseName}_repaired${ext}`);

    // 尝试多种修复方法
    const repairMethods = [
      // 方法1: 标准复制修复
      `ffmpeg -err_detect ignore_err -i "${filePath}" -c copy "${outputPath}" -y`,
      // 方法2: 强制忽略错误，尝试重新编码
      `ffmpeg -err_detect ignore_err -fflags +discardcorrupt -i "${filePath}" -c:v libx264 -preset fast -crf 23 -movflags +faststart "${outputPath}" -y`,
      // 方法3: 使用更激进的错误处理
      `ffmpeg -err_detect ignore_err -fflags +discardcorrupt -max_muxing_queue_size 1024 -i "${filePath}" -c:v libx264 -preset fast -crf 23 -avoid_negative_ts make_zero -reset_timestamps 1 "${outputPath}" -y`,
      // 方法4: 尝试提取原始数据并重新封装
      `ffmpeg -err_detect ignore_err -fflags +discardcorrupt+igndts -analyzeduration 100M -probesize 100M -i "${filePath}" -c:v copy -c:a copy -movflags +faststart "${outputPath}" -y`
    ];

    for (let i = 0; i < repairMethods.length; i++) {
      const command = repairMethods[i];
      console.log(`[MP4修复] 尝试方法 ${i + 1}: ${command}`);
      
      try {
        await execAsync(command);
        
        // 验证修复后的文件
        const repairedPlayable = await isPlayableMP4(outputPath);
        
        if (repairedPlayable) {
          console.log(`[MP4修复] 方法 ${i + 1} 修复成功: ${outputPath}`);
          return { success: true, message: `方法 ${i + 1} 修复成功`, outputPath };
        } else {
          // 删除修复失败的文件，准备尝试下一种方法
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
        }
      } catch (error: any) {
        console.log(`[MP4修复] 方法 ${i + 1} 失败: ${error.message}`);
        // 删除可能创建的部分文件
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        // 继续尝试下一种方法
      }
    }

    // 如果所有方法都失败，尝试最后一个方法：强制重建文件
    console.log('[MP4修复] 尝试强制重建方法...');
    
    try {
      // 检查文件大小，如果文件太小可能没有有效数据
      const stats = fs.statSync(filePath);
      if (stats.size < 1024) { // 小于1KB的文件可能没有有效数据
        return { success: false, message: '文件大小过小，可能没有有效数据' };
      }

      // 尝试使用不同的输入格式
      const rebuildCommand = `ffmpeg -f mjpeg -i "${filePath}" -c:v libx264 -preset fast -crf 23 -movflags +faststart "${outputPath}" -y`;
      await execAsync(rebuildCommand);
      
      const finalPlayable = await isPlayableMP4(outputPath);
      if (finalPlayable) {
        return { success: true, message: '强制重建成功', outputPath };
      }
    } catch (error: any) {
      console.log(`[MP4修复] 强制重建失败: ${error.message}`);
    }

    return { success: false, message: '所有修复方法均失败，文件可能已严重损坏' };
  } catch (error: any) {
    return { success: false, message: `修复过程出错: ${error.message}` };
  }
}

/**
 * 批量修复录制文件夹中的损坏MP4文件
 */
export async function repairAllRecordings(recordingsPath: string): Promise<{ 
  total: number; 
  repaired: number; 
  failed: number; 
  results: Array<{ file: string; success: boolean; message: string }> 
}> {
  try {
    if (!fs.existsSync(recordingsPath)) {
      return { total: 0, repaired: 0, failed: 0, results: [] };
    }

    const files = fs.readdirSync(recordingsPath)
      .filter(f => f.toLowerCase().endsWith('.mp4') && !f.includes('_repaired'));

    const results = [];
    let repaired = 0;
    let failed = 0;

    console.log(`[MP4修复] 发现 ${files.length} 个MP4文件`);

    for (const file of files) {
      const filePath = path.join(recordingsPath, file);
      
      try {
        const playable = await isPlayableMP4(filePath);
        
        if (playable) {
          results.push({ file, success: true, message: '文件正常，无需修复' });
        } else {
          console.log(`[MP4修复] 修复文件: ${file}`);
          const result = await repairMP4File(filePath);
          
          if (result.success) {
            repaired++;
            results.push({ file, success: true, message: '修复成功' });
          } else {
            failed++;
            results.push({ file, success: false, message: result.message });
          }
        }
      } catch (error: any) {
        failed++;
        results.push({ file, success: false, message: `检查失败: ${error.message}` });
      }
    }

    return {
      total: files.length,
      repaired,
      failed,
      results
    };
  } catch (error: any) {
    return {
      total: 0,
      repaired: 0,
      failed: 0,
      results: [{ file: 'all', success: false, message: `批量修复失败: ${error.message}` }]
    };
  }
}

/**
 * 清理修复过程中产生的临时文件
 */
export function cleanupRepairedFiles(recordingsPath: string, keepOriginal: boolean = false): void {
  try {
    if (!fs.existsSync(recordingsPath)) return;

    const files = fs.readdirSync(recordingsPath)
      .filter(f => f.toLowerCase().endsWith('.mp4'));

    for (const file of files) {
      if (file.includes('_repaired')) {
        const repairedPath = path.join(recordingsPath, file);
        const originalFile = file.replace('_repaired', '');
        const originalPath = path.join(recordingsPath, originalFile);

        if (keepOriginal) {
          // 保留原文件，删除修复文件
          fs.unlinkSync(repairedPath);
        } else {
          // 用修复文件替换原文件
          if (fs.existsSync(originalPath)) {
            fs.unlinkSync(originalPath);
          }
          fs.renameSync(repairedPath, originalPath);
        }
      }
    }
  } catch (error: any) {
    console.error('[MP4修复] 清理文件失败:', error.message);
  }
}