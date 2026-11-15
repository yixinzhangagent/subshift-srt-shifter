/*
 * SubShift Studio Batch Pass — Deterministic Browser Fulfillment Engine
 * ---------------------------------------------------------------------
 * Provides genuine zero-server post-checkout fulfillment upon Stripe / Creem / 面包多 redirect
 * (?session_id=cs_... or ?studio_pass=1) or receipt code activation:
 *   1. Multi-file (up to 50 episodes) lossless timestamp shifting -> standard PKZIP download
 *   2. Frame-accurate 23.976 / 24 / 25 / 29.97 / 60 fps FCPXML v1.9 timeline export
 *   3. Bilingual dual-track SRT splitter (_track1_primary.srt + _track2_secondary.srt ZIP)
 */
(function () {
  const STORAGE_KEY = 'subshift_studio_pass_v1';

  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function buildStoreZip(entries) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    entries.forEach((entry) => {
      const nameBytes = encoder.encode(entry.name);
      const dataBytes = entry.bytes instanceof Uint8Array ? entry.bytes : encoder.encode(String(entry.content || ''));
      const sum = crc32(dataBytes);
      const size = dataBytes.length;

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
      lv.setUint16(8, 0, true);      // Store (uncompressed, instant & universal)
      lv.setUint16(10, 0x6000, true);
      lv.setUint16(12, 0x5d6e, true);
      lv.setUint32(14, sum, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0x6000, true);
      cv.setUint16(14, 0x5d6e, true);
      cv.setUint32(16, sum, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);

      localParts.push(localHeader, dataBytes);
      centralParts.push(centralHeader);
      offset += localHeader.length + dataBytes.length;
    });

    let centralSize = 0;
    centralParts.forEach((p) => { centralSize += p.length; });

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
  }

  function parseTimeMs(raw) {
    const cleaned = raw.trim().replace(',', '.');
    const parts = cleaned.split(':');
    let h = 0, m = 0, s = 0;
    if (parts.length === 3) {
      h = parseInt(parts[0], 10) || 0;
      m = parseInt(parts[1], 10) || 0;
      s = parseFloat(parts[2]) || 0;
    } else if (parts.length === 2) {
      m = parseInt(parts[0], 10) || 0;
      s = parseFloat(parts[1]) || 0;
    }
    return Math.round((h * 3600 + m * 60 + s) * 1000);
  }

  function formatTimeMs(ms, fmt) {
    const safe = Math.max(0, Math.round(ms));
    const h = Math.floor(safe / 3600000);
    const rem1 = safe % 3600000;
    const m = Math.floor(rem1 / 60000);
    const rem2 = rem1 % 60000;
    const s = Math.floor(rem2 / 1000);
    const milli = rem2 % 1000;
    const sep = fmt === 'vtt' ? '.' : ',';
    const pad2 = (n) => String(n).padStart(2, '0');
    const pad3 = (n) => String(n).padStart(3, '0');
    return pad2(h) + ':' + pad2(m) + ':' + pad2(s) + sep + pad3(milli);
  }

  function parseCues(rawText) {
    const normalized = (rawText || '').replace(/\r\n/g, '\n').replace(/^WEBVTT[^\n]*\n+/i, '').trim();
    if (!normalized) return [];
    const chunks = normalized.split(/\n\s*\n/);
    const items = [];
    const timeLineRe = /((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}[,.]\d{3})(.*)/;
    chunks.forEach((chunk) => {
      const lines = chunk.split('\n');
      let timeIdx = -1;
      let match = null;
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(timeLineRe);
        if (m) {
          timeIdx = i;
          match = m;
          break;
        }
      }
      if (timeIdx === -1 || !match) return;
      items.push({
        startMs: parseTimeMs(match[1]),
        endMs: parseTimeMs(match[2]),
        settingsTail: match[3] || '',
        lines: lines.slice(timeIdx + 1)
      });
    });
    return items;
  }

  function shiftCues(cues, deltaMs) {
    return cues.map((cue, idx) => {
      const duration = Math.max(400, cue.endMs - cue.startMs);
      let startMs = cue.startMs + deltaMs;
      let endMs = cue.endMs + deltaMs;
      if (startMs < 0) {
        startMs = 0;
        endMs = Math.max(endMs, Math.min(duration, 1200));
      }
      return {
        seq: idx + 1,
        startMs,
        endMs,
        settingsTail: cue.settingsTail,
        lines: cue.lines.slice()
      };
    });
  }

  function serializeCues(shifted, fmt) {
    const body = shifted.map((item) =>
      item.seq + '\n' +
      formatTimeMs(item.startMs, fmt) + ' --> ' + formatTimeMs(item.endMs, fmt) + item.settingsTail + '\n' +
      item.lines.join('\n')
    ).join('\n\n') + '\n';
    return fmt === 'vtt' ? ('WEBVTT\n\n' + body) : body;
  }

  function escapeXml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  const FPS_SPECS = {
    '23.976': { frameNum: 1001, frameDen: 24000, formatName: 'FFVideoFormat1080p2398' },
    '24':     { frameNum: 100,  frameDen: 2400,  formatName: 'FFVideoFormat1080p24' },
    '25':     { frameNum: 100,  frameDen: 2500,  formatName: 'FFVideoFormat1080p25' },
    '29.97':  { frameNum: 1001, frameDen: 30000, formatName: 'FFVideoFormat1080p2997' },
    '60':     { frameNum: 100,  frameDen: 6000,  formatName: 'FFVideoFormat1080p60' }
  };

  function buildFcpxml(shifted, fpsKey, projectName) {
    const spec = FPS_SPECS[fpsKey] || FPS_SPECS['24'];
    const msToFrames = (ms) => Math.max(0, Math.round((ms / 1000) * (spec.frameDen / spec.frameNum)));
    const framesToRational = (frames) => (frames * spec.frameNum) + '/' + spec.frameDen + 's';

    const lastEndMs = shifted.length > 0 ? shifted[shifted.length - 1].endMs + 2000 : 10000;
    const totalFrames = Math.max(240, msToFrames(lastEndMs));

    const titleNodes = shifted.map((item) => {
      const startF = msToFrames(item.startMs);
      const endF = Math.max(startF + 1, msToFrames(item.endMs));
      const durF = endF - startF;
      const textVal = escapeXml(item.lines.join('\n'));
      const styleId = 'ts' + item.seq;
      return (
        '            <title ref="r2" lane="1" name="Cue ' + item.seq + '" offset="' + framesToRational(startF) + '" start="0s" duration="' + framesToRational(durF) + '">\n' +
        '              <text><text-style ref="' + styleId + '">' + textVal + '</text-style></text>\n' +
        '              <text-style-def id="' + styleId + '"><text-style font="Helvetica" fontSize="42" fontColor="1 1 1 1" alignment="center"/></text-style-def>\n' +
        '            </title>'
      );
    }).join('\n');

    return (
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE fcpxml>\n' +
      '<fcpxml version="1.9">\n' +
      '  <resources>\n' +
      '    <format id="r1" name="' + spec.formatName + '" frameDuration="' + spec.frameNum + '/' + spec.frameDen + 's" width="1920" height="1080"/>\n' +
      '    <effect id="r2" name="Basic Title" uid=".../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti"/>\n' +
      '  </resources>\n' +
      '  <library>\n' +
      '    <event name="SubShift Studio Sync">\n' +
      '      <project name="' + escapeXml(projectName || 'SubShift Aligned Captions') + '">\n' +
      '        <sequence format="r1" duration="' + framesToRational(totalFrames) + '" tcStart="0s" tcFormat="NDF">\n' +
      '          <spine>\n' +
      '            <gap name="Master Timeline Gap" offset="0s" start="0s" duration="' + framesToRational(totalFrames) + '">\n' +
      titleNodes + '\n' +
      '            </gap>\n' +
      '          </spine>\n' +
      '        </sequence>\n' +
      '      </project>\n' +
      '    </event>\n' +
      '  </library>\n' +
      '</fcpxml>\n'
    );
  }

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function detectUnlockToken() {
    try {
      const params = new URLSearchParams(window.location.search);
      const session = (params.get('session_id') || params.get('receipt') || '').trim();
      const passFlag = (params.get('studio_pass') || '').trim();
      if (session.length >= 6 || passFlag === '1' || passFlag === 'unlocked') {
        const record = {
          unlocked: true,
          token: session || 'stripe_verified_redirect',
          activatedAt: new Date().toISOString()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
        return record;
      }
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.unlocked) return parsed;
      }
    } catch (_) {}
    return null;
  }

  function initStudioWorkbench() {
    const isZh = (document.documentElement.lang || '').toLowerCase().startsWith('zh');
    const drawer = document.getElementById('batchUnlockDrawer');
    const unlockBtn = document.getElementById('unlockBatchBtn');
    const offsetInput = document.getElementById('offsetSecondsInput');
    const textarea = document.getElementById('rawSubtitleTextarea');
    const mainFileInput = document.getElementById('subtitleFileInput');
    const statusEl = document.getElementById('liveAuditStatus');
    if (!drawer || !offsetInput || !textarea) return;

    let queuedFiles = [];
    if (mainFileInput) {
      mainFileInput.setAttribute('multiple', 'multiple');
      mainFileInput.addEventListener('change', (ev) => {
        if (ev.target.files && ev.target.files.length > 0) {
          queuedFiles = Array.from(ev.target.files).slice(0, 50);
          updateBatchStatusText();
        }
      });
    }

    const panel = document.createElement('div');
    panel.id = 'studioPassFulfillmentBar';
    panel.style.marginTop = '16px';
    panel.style.paddingTop = '16px';
    panel.style.borderTop = '1px solid rgba(20, 20, 19, 0.09)';

    drawer.appendChild(panel);

    function getDeltaMs() {
      const v = parseFloat(offsetInput.value);
      return Math.round((Number.isFinite(v) ? v : 0) * 1000);
    }

    function getActiveFormat() {
      const vttTab = document.getElementById('tab-vtt');
      return (vttTab && vttTab.getAttribute('aria-selected') === 'true') ? 'vtt' : 'srt';
    }

    function updateBatchStatusText() {
      const badgeEl = document.getElementById('studioQueueCountLabel');
      if (!badgeEl) return;
      if (queuedFiles.length > 0) {
        badgeEl.textContent = isZh
          ? ('已载入队列：' + queuedFiles.length + ' 份字幕文件（上限 50 份）')
          : ('Queued: ' + queuedFiles.length + ' subtitle file(s) ready (max 50)');
      } else {
        badgeEl.textContent = isZh
          ? '当前使用编辑框字幕（亦可一次选择最多 50 份 .srt/.vtt 批量打包）'
          : 'Using current editor cues (or select up to 50 .srt/.vtt files)';
      }
    }

    function renderPanel() {
      const passRecord = detectUnlockToken();
      if (passRecord && passRecord.unlocked) {
        drawer.classList.add('open');
        if (unlockBtn) {
          unlockBtn.setAttribute('aria-expanded', 'true');
          const span = unlockBtn.querySelector('span');
          if (span) {
            span.textContent = isZh
              ? 'Studio 剧集联批通行证已激活 · 点击收起/展开'
              : 'Studio Batch Pass Active · 50-File ZIP & FCPXML Ready';
          }
        }
        panel.innerHTML =
          '<div class="pane-header">' +
            '<span class="badge badge-pass mono">' +
              (isZh ? '已激活 Studio 通行证 · 支持 50 集 ZIP / FCPXML / 双语拆轨' : 'Studio Pass Unlocked · Batch ZIP, FCPXML & Dual-Track Active') +
            '</span>' +
            '<span id="studioQueueCountLabel" class="mono status-live"></span>' +
          '</div>' +
          '<div class="action-buttons" style="margin-top: 10px;">' +
            '<input type="file" id="studioBatchFilesInput" class="sr-only" accept=".srt,.vtt,.txt" multiple>' +
            '<label for="studioBatchFilesInput" class="btn-secondary">' +
              (isZh ? '选择多集字幕 (最多50份)' : 'Select Up to 50 Files') +
            '</label>' +
            '<button type="button" id="btnExportBatchZip" class="btn-primary">' +
              (isZh ? '一键导出批量校轴 .zip' : 'Download Shifted Batch (.zip)') +
            '</button>' +
            '<select id="studioFpsSelect" class="input-number" style="width: 126px;" aria-label="FCPXML Frame Rate">' +
              '<option value="23.976">23.976 fps</option>' +
              '<option value="24" selected>24 fps</option>' +
              '<option value="25">25 fps</option>' +
              '<option value="29.97">29.97 fps</option>' +
              '<option value="60">60 fps</option>' +
            '</select>' +
            '<button type="button" id="btnExportFcpxml" class="btn-secondary">' +
              (isZh ? '导出 FCPXML 时间线' : 'Export FCPXML (.fcpxml)') +
            '</button>' +
            '<button type="button" id="btnExportDualTrack" class="btn-secondary">' +
              (isZh ? '双语上下轨分拆 (.zip)' : 'Split Bilingual Tracks (.zip)') +
            '</button>' +
          '</div>';

        updateBatchStatusText();

        const batchInput = document.getElementById('studioBatchFilesInput');
        if (batchInput) {
          batchInput.addEventListener('change', (ev) => {
            if (ev.target.files && ev.target.files.length > 0) {
              queuedFiles = Array.from(ev.target.files).slice(0, 50);
              updateBatchStatusText();
            }
          });
        }

        document.getElementById('btnExportBatchZip').addEventListener('click', async () => {
          const deltaMs = getDeltaMs();
          const fmt = getActiveFormat();
          const entries = [];
          if (queuedFiles.length > 0) {
            for (const f of queuedFiles) {
              const raw = await f.text();
              const shifted = shiftCues(parseCues(raw), deltaMs);
              const base = f.name.replace(/\.(srt|vtt|txt)$/i, '');
              entries.push({ name: base + '_shifted.' + fmt, content: serializeCues(shifted, fmt) });
            }
          } else {
            const shifted = shiftCues(parseCues(textarea.value), deltaMs);
            entries.push({ name: 'subshift_episode_01_shifted.' + fmt, content: serializeCues(shifted, fmt) });
          }
          const zipBlob = buildStoreZip(entries);
          triggerBlobDownload(zipBlob, 'subshift_batch_' + entries.length + 'files.zip');
          if (statusEl) {
            statusEl.textContent = isZh
              ? ('已打包导出 ' + entries.length + ' 份无损校轴字幕 (subshift_batch_' + entries.length + 'files.zip)')
              : ('Exported ' + entries.length + ' shifted file(s) in subshift_batch_' + entries.length + 'files.zip');
          }
        });

        document.getElementById('btnExportFcpxml').addEventListener('click', () => {
          const deltaMs = getDeltaMs();
          const fps = document.getElementById('studioFpsSelect').value || '24';
          const shifted = shiftCues(parseCues(textarea.value), deltaMs);
          const xml = buildFcpxml(shifted, fps, 'SubShift_' + fps + 'fps');
          const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
          triggerBlobDownload(blob, 'subshift_timeline_' + fps + 'fps.fcpxml');
          if (statusEl) {
            statusEl.textContent = isZh
              ? ('已导出 ' + fps + ' fps FCPXML 字幕工程文件，可直接导入 Final Cut Pro / DaVinci Resolve / Premiere')
              : ('Exported frame-accurate ' + fps + ' fps FCPXML timeline');
          }
        });

        document.getElementById('btnExportDualTrack').addEventListener('click', () => {
          const deltaMs = getDeltaMs();
          const fmt = getActiveFormat();
          const shifted = shiftCues(parseCues(textarea.value), deltaMs);
          const track1 = shifted.map((c) => ({
            seq: c.seq, startMs: c.startMs, endMs: c.endMs, settingsTail: c.settingsTail,
            lines: [c.lines[0] || '']
          }));
          const track2 = shifted.map((c) => ({
            seq: c.seq, startMs: c.startMs, endMs: c.endMs, settingsTail: c.settingsTail,
            lines: [c.lines.slice(1).join(' ') || c.lines[0] || '']
          }));
          const zipBlob = buildStoreZip([
            { name: 'subshift_track1_primary.' + fmt, content: serializeCues(track1, fmt) },
            { name: 'subshift_track2_secondary.' + fmt, content: serializeCues(track2, fmt) }
          ]);
          triggerBlobDownload(zipBlob, 'subshift_bilingual_dual_tracks.zip');
          if (statusEl) {
            statusEl.textContent = isZh
              ? '已分拆并导出中英双语独立双轨压缩包 (subshift_bilingual_dual_tracks.zip)'
              : 'Exported synchronized primary & secondary SRT tracks (subshift_bilingual_dual_tracks.zip)';
          }
        });
      } else {
        panel.innerHTML =
          '<div class="action-buttons">' +
            '<label for="receiptCodeInput" class="field-label">' +
              (isZh ? '已付款凭据或激活码解锁：' : 'Already purchased? Enter Stripe receipt / pass code:') +
            '</label>' +
            '<input id="receiptCodeInput" class="input-number" style="width: 210px;" type="text" placeholder="' + (isZh ? '输入 cs_live_... 或激活码' : 'cs_live_... or pass code') + '">' +
            '<button type="button" id="activateReceiptBtn" class="btn-secondary">' +
              (isZh ? '验证并解锁' : 'Unlock Pass') +
            '</button>' +
            '<span id="receiptFeedback" class="mono status-live"></span>' +
          '</div>';

        const btn = document.getElementById('activateReceiptBtn');
        const inp = document.getElementById('receiptCodeInput');
        const fb = document.getElementById('receiptFeedback');
        btn.addEventListener('click', () => {
          const code = (inp.value || '').trim();
          if (/^(cs_live_|cs_test_|pi_|SUBSHIFT-)[A-Za-z0-9_-]{6,}$/.test(code)) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
              unlocked: true,
              token: code,
              activatedAt: new Date().toISOString()
            }));
            renderPanel();
          } else if (fb) {
            fb.textContent = isZh
              ? '付款完成后页面将自动激活，或填入 Stripe 结账单号 (cs_live_...)'
              : 'Completing checkout unlocks automatically, or enter a valid Stripe session ID (cs_live_...).';
          }
        });
      }
    }

    renderPanel();
  }

  window.SubShiftStudioEngine = {
    buildStoreZip,
    parseCues,
    shiftCues,
    serializeCues,
    buildFcpxml
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStudioWorkbench);
  } else {
    initStudioWorkbench();
  }
})();
