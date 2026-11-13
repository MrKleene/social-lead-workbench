'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

// 本机密钥保护：不使用 Electron safeStorage。
//
// safeStorage 在 macOS 上依赖钥匙串条目 "SocialLeadDesktop Safe Storage"。自签证书没有
// Team ID，条目的 partition_id 只能记录 cdhash；每次重新打包 cdhash 都会变，导致启动和
// 读写凭据时反复弹出系统授权框（换证书、改启动路径、删条目都只能绕过一次）。
//
// 这里改为从本机硬件标识派生密钥做 AES-256-GCM：密钥不落盘、懒加载，换机器解不开。
// 代价是密钥可由本机推导、不再要求用户授权，适用于单机自用场景；.sealed 文件不可跨机器
// 迁移（macOS 的 IOPlatformUUID 与 Windows 的 MachineGuid 不同）。
//
// 两个外部命令都用绝对路径：打包后从 Finder / 资源管理器启动时 PATH 可能被裁剪。

function machineSecret() {
  if (process.platform === 'darwin') {
    const ioreg = fs.existsSync('/usr/sbin/ioreg') ? '/usr/sbin/ioreg' : 'ioreg';
    const out = execFileSync(ioreg, ['-rd1', '-c', 'IOPlatformExpertDevice'], {
      encoding: 'utf8',
      maxBuffer: 1 << 20,
    });
    const found = /IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out);
    if (found) return found[1];
  } else if (process.platform === 'win32') {
    const reg = path.join(
      process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows',
      'System32',
      'reg.exe',
    );
    const out = execFileSync(reg, [
      'query',
      'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
      '/v',
      'MachineGuid',
    ], { encoding: 'utf8' });
    const found = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(out);
    if (found) return found[1];
  } else if (fs.existsSync('/etc/machine-id')) {
    return fs.readFileSync('/etc/machine-id', 'utf8').trim();
  }
  throw Error('LOCAL_MACHINE_ID_UNAVAILABLE');
}

/** 派生密钥只算一次，第一次加解密时才触发，启动路径上没有任何外部调用。 */
function createProtector({ fixture = false } = {}) {
  let masterKey = null;
  const localKey = () =>
    masterKey || (masterKey = crypto.scryptSync(machineSecret(), 'social-lead-workbench/local-v1', 32));
  return {
    available: () => !fixture,
    availableHint: () => !fixture,
    encrypt: (value) => {
      if (fixture) throw Error('FIXTURE_NO_OS_SECRETS');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', localKey(), iv);
      const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    decrypt: (sealed) => {
      if (fixture) throw Error('FIXTURE_NO_OS_SECRETS');
      if (!Buffer.isBuffer(sealed) || sealed.length < 28) throw Error('CREDENTIAL_DECRYPTION_FAILED');
      const iv = sealed.subarray(0, 12);
      const tag = sealed.subarray(12, 28);
      const body = sealed.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', localKey(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    },
  };
}

module.exports = { machineSecret, createProtector };
