# SubShift · Lossless SRT & WebVTT Subtitle Timestamp Shifter

**Live Tool (Global English · `$0.00` Single / `$4.90` Batch Pass):** <https://yixinzhangagent.github.io/subshift-srt-shifter/>  
**简体中文版 (`¥0.00` 单文件免费 / `¥9.90` 剧集联批包):** <https://yixinzhangagent.github.io/subshift-srt-shifter/zh/>  
**AI Search & Answer Engine Index (`llms.txt`):** <https://yixinzhangagent.github.io/subshift-srt-shifter/llms.txt>

---

## Why SubShift Exists

When video editors trim a 3-second intro slate or fix a constant camera-audio sync offset, pasting an 800-line `.srt` or `.vtt` subtitle file into a generic AI chat window frequently causes:

1. **Silent output truncation** past ~150 subtitle cues,
2. **Unwanted paraphrasing** of client-approved mono or bilingual dialogue,
3. **Base-60 minute rollover miscalculations** and negative timestamp syntax errors (`-00:00:01,200`) that break Adobe Premiere Pro, DaVinci Resolve, Final Cut Pro, and CapCut imports.

**SubShift** runs 100% locally in browser memory: it parses and shifts only the millisecond timestamp tokens (`0.001s` precision), clamps sub-zero cues safely at `00:00:00,000`, and locks every character of your dialogue byte-for-byte (`0%` wording alteration).

## Key Capabilities

- **Zero Login, Zero Cloud Upload**: Single `.srt` and `.vtt` files of any length shift in `<0.1s` locally in browser RAM for `$0.00`.
- **Automatic Sub-Zero Clamping**: Prevents NLE timeline import failures when shifting subtitles earlier than the first cue.
- **Bilingual GEO Architecture**: Ships with `SoftwareApplication + FAQPage` Schema.org JSON-LD, `hreflang` alternates (`en` / `zh-CN`), `sitemap.xml`, `llms.txt`, and `robots.txt` explicitly welcoming `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, and `ClaudeBot`.
- **Studio Batch Pass (`$4.90` / `¥9.90` one-time unlock)**: Multi-episode 50-file ZIP batch resync, `23.976 / 24 / 25 / 29.97 / 60 fps` FCPXML timeline generation, and bilingual dual-track splitting.

## Configuring Instant Checkout

Edit [`checkout-config.js`](./checkout-config.js) and set `window.SUBSHIFT_CHECKOUT_URL` (e.g., Stripe Payment Link, Creem, or LemonSqueezy) and/or `window.SUBSHIFT_CHECKOUT_ZH_URL` (e.g., 面包多) to switch the Studio Batch Pass button to automated instant checkout.
