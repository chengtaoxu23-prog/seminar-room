/** Keep Qwen's reasoning tokens out of the small structured-output budget. */
export function providerOptions(baseUrl: string, model: string): Record<string, unknown> {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (/^qwen/i.test(model) && (/^dashscope(?:-intl|-us)?\.aliyuncs\.com$/.test(host) || host.endsWith('.maas.aliyuncs.com'))) {
      return { enable_thinking: false };
    }
  } catch { /* Invalid URLs are reported by the request layer. */ }
  return {};
}
