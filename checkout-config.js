/*
 * SubShift Studio Batch Pass — Checkout Gateway Configuration
 * -----------------------------------------------------------
 * Paste your live one-time payment link below (Stripe Payment Link, Creem, LemonSqueezy, or 面包多)
 * to switch from Early-Access Order Request mode to instant automated license delivery:
 *   - Global USD ($4.90): window.SUBSHIFT_CHECKOUT_URL = "https://buy.stripe.com/...";
 *   - Domestic CNY (¥9.90): window.SUBSHIFT_CHECKOUT_ZH_URL = "https://mbd.pub/o/bread/...";
 * You can also test any checkout link dynamically via URL query: ?checkout=https://...
 */
window.SUBSHIFT_CHECKOUT_URL = window.SUBSHIFT_CHECKOUT_URL || "";
window.SUBSHIFT_CHECKOUT_ZH_URL = window.SUBSHIFT_CHECKOUT_ZH_URL || "";
window.SUBSHIFT_ORDER_FALLBACK_URL =
  "https://github.com/yixinzhangagent/subshift-srt-shifter/issues/new?title=SubShift+Studio+Batch+Pass+Order+($4.90+%2F+%C2%A59.90)&body=Hi%2C+I+would+like+to+unlock+the+SubShift+50-Episode+Batch+ZIP+%26+FCPXML+Studio+Pass.+%0A%0A-%20Edition%3A%20Global%20USD%20(%244.90)%20%2F%20CNY%20(%C2%A59.90)%0A-%20Target%20NLE%3A%20Premiere%20Pro%20%2F%20DaVinci%20Resolve%20%2F%20Final%20Cut%20Pro%20%2F%20CapCut";
