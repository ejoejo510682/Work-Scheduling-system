// 電商檔期每個月都是固定的規律（雙字日、18號、25號），不用存資料庫、每年都要重填，
// 直接照日期算就好，永遠不會過期
export function ecommerceCampaignLabel(dateStr: string): string | null {
  const [, m, d] = dateStr.split("-").map(Number);
  if (d === m) return `雙${m}檔期`;
  if (d === 18) return "18號檔期";
  if (d === 25) return "25號檔期";
  return null;
}
