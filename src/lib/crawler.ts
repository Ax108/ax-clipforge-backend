const CRAWLER_RE =
  /facebookexternalhit|facebot|twitterbot|slackbot|discordbot|whatsapp|linkedinbot|googlebot|bingbot|preview/i;

export function isLinkPreviewCrawler(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  return CRAWLER_RE.test(userAgent);
}
