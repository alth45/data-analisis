const numberFmt = new Intl.NumberFormat('id-ID');

export function formatNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n ?? '');
  return numberFmt.format(n);
}

export function formatCell(raw, type) {
  if (raw === null || raw === undefined || raw === '') return '';
  if (type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, ''));
    if (!Number.isNaN(n)) return formatNumber(n);
  }
  return String(raw);
}

export function truncate(s, len = 40) {
  const str = String(s);
  return str.length > len ? str.slice(0, len) + '…' : str;
}