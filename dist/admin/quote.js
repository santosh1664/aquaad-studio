// Quote maths for the admin calculator. This file is public: never put rates here.
const WHOLE = {
  bFront: ['bFrontUp', 'bFrontLow'],
  bRight: ['bRightUp', 'bRightLow'],
  bLeft: ['bLeftUp', 'bLeftLow'],
};
export const PANELS_PER_BOTTLE = 7;
const paise = (n) => Math.round(n * 100) / 100;

export const inr = (n) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function words(n) {
  if (n >= 10000000) return `${words(Math.floor(n / 10000000))} Crore ${words(n % 10000000)}`.trim();
  if (n >= 100000) return `${words(Math.floor(n / 100000))} Lakh ${words(n % 100000)}`.trim();
  if (n >= 1000) return `${words(Math.floor(n / 1000))} Thousand ${words(n % 1000)}`.trim();
  if (n >= 100) return `${ONES[Math.floor(n / 100)]} Hundred ${words(n % 100)}`.trim();
  if (n >= 20) return `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`.trim();
  return ONES[n];
}

export function amountInWords(amount) {
  const totalPaise = Math.round(amount * 100);
  const rupees = Math.floor(totalPaise / 100);
  const p = totalPaise % 100;
  return `Rupees ${words(rupees) || 'Zero'}${p ? ` and ${words(p)} Paise` : ''} Only`;
}

// Same state: CGST + SGST. Different states: IGST. State unknown: plain GST.
function gstRows(gstPct, gst, sellerState, buyerState) {
  if (!gstPct) return [];
  const [from, to] = [sellerState, buyerState].map((s) => (s || '').trim().toLowerCase());
  if (!from || !to) return [[`GST (${gstPct}%)`, inr(gst)]];
  if (from !== to) return [[`IGST (${gstPct}%)`, inr(gst)]];
  const cgst = paise(gst / 2);
  return [[`CGST (${gstPct / 2}%)`, inr(cgst)], [`SGST (${gstPct / 2}%)`, inr(paise(gst - cgst))]];
}

// The customer's copy. Only customer-facing amounts are read from r: no costs, expenses or profit.
export function invoice(d) {
  const { r } = d;
  const isQuote = d.type === 'Quote';
  const panelText = `${d.panels} panel${d.panels > 1 ? 's' : ''} per bottle`;
  const meta = (label, value) => (value ? [[label, value]] : []);
  const sac = d.sac ? ` (SAC ${d.sac})` : '';
  const items = [{
    desc: `Advertising on 500 ml bottles, ${panelText}${d.description ? ` — ${d.description}` : ''}${sac}`,
    qty: d.bottles.toLocaleString('en-IN'), rate: inr(r.ratePerBottle), amount: inr(r.adFee),
  }];
  if (r.setupFee > 0) items.push({ desc: `One-off setup fee${sac}`, qty: '1', rate: inr(r.setupFee), amount: inr(r.setupFee) });
  const label = (name, value) => (value ? `${name}: ${value}` : '');
  const contact = [d.sellerEmail, d.sellerPhone].filter(Boolean).join(' · ');
  return {
    title: isQuote ? 'Quotation' : 'Invoice',
    numberLabel: isQuote ? 'Quotation no.' : 'Invoice no.',
    number: d.number,
    seller: { name: d.sellerName, lines: [d.sellerAddress, label('State', d.sellerState), label('GSTIN', d.gstin), contact].filter(Boolean) },
    buyer: { name: d.company || d.name, lines: [d.company && d.name, d.buyerAddress, label('GSTIN', d.buyerGstin), d.email, d.phone].filter(Boolean) },
    campaign: [`${d.bottles.toLocaleString('en-IN')} bottles · ${panelText}`, d.description, `${inr(r.perBottle)} per bottle, including GST`].filter(Boolean),
    meta: [
      ...meta('Issued', d.date),
      ...meta(isQuote ? 'Valid until' : 'Due', d.due),
      ...meta('Quote', d.ref),
      ...meta('Place of supply', d.buyerState),
      ...meta('Status', d.status),
    ],
    items,
    totals: [
      ['Subtotal', inr(paise(r.adFee + r.setupFee))],
      ...(r.discount > 0 ? [['Discount', inr(0 - r.discount)]] : []),
      ['Taxable amount', inr(r.taxable)],
      ...gstRows(d.gstPct, r.gst, d.sellerState, d.buyerState),
      [isQuote ? 'Total' : 'Total due', inr(r.total), 'tot'],
    ],
    words: amountInWords(r.total),
    payment: d.payment,
    terms: d.terms,
    footer: [
      !isQuote && d.number && `Please reference ${d.number} with your payment.`,
      contact && `Questions: ${contact}.`,
      `Thank you for advertising with ${d.sellerName || 'us'}.`,
    ].filter(Boolean).join(' '),
  };
}

export function invoiceText(d) {
  const v = invoice(d);
  const block = (heading, text) => (text ? ['', `${heading}:`, text] : []);
  return [
    `${v.seller.name} ${v.title}`,
    ...(v.number ? [`${v.numberLabel}: ${v.number}`] : []),
    ...v.meta.map(([label, value]) => `${label}: ${value}`),
    '', 'From:', v.seller.name, ...v.seller.lines,
    '', 'Bill to:', ...(v.buyer.name ? [v.buyer.name] : []), ...v.buyer.lines,
    '', 'Campaign:', ...v.campaign,
    '', ...v.items.map((i, n) => `${n + 1}. ${i.desc}\n   ${i.qty} × ${i.rate} = ${i.amount}`),
    '', ...v.totals.map(([label, value]) => `${label}: ${value}`),
    v.words,
    ...block('Payment details', v.payment),
    ...block('Terms', v.terms),
    '', v.footer,
  ].join('\n');
}

export const customerKey = (d) => (d.company || d.name || '').trim().toLowerCase();

// What a saved invoice keeps: customer-facing amounts only, so costs and profit are never stored with it.
export function customerAmounts({ adFee, discount, setupFee, taxable, gst, total, perBottle, ratePerBottle }) {
  return { adFee, discount, setupFee, taxable, gst, total, perBottle, ratePerBottle };
}

// Saving the same number again updates that document.
export const upsertDoc = (docs, doc) => [...docs.filter((d) => d.type !== doc.type || d.number.toLowerCase() !== doc.number.toLowerCase()), doc];

// Sent and paid invoices are sales. Worked out from the invoices, so the two can never disagree.
export const invoiceSales = (docs) => docs
  .filter((d) => d.type === 'Invoice' && d.status !== 'Draft')
  .map((d) => ({ id: d.id, auto: true, number: d.number, date: d.isoDate, name: d.company || d.name, amount: d.r.taxable, gst: d.r.gst }));

export function groupByCustomer(docs) {
  const groups = new Map();
  for (const d of docs) {
    const key = customerKey(d);
    if (!groups.has(key)) groups.set(key, { key, name: d.company || d.name || 'No customer name', docs: [], invoiced: 0 });
    const group = groups.get(key);
    group.docs.push(d);
    if (d.type === 'Invoice') group.invoiced = paise(group.invoiced + d.r.total);
  }
  for (const g of groups.values()) g.docs.sort((a, b) => b.isoDate.localeCompare(a.isoDate));
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Profit uses amounts before GST, because GST collected is owed to the government.
export function monthSummary(sales, expenses, month) {
  const sum = (list, key) => paise(list.filter((x) => x.date.startsWith(month)).reduce((total, x) => total + x[key], 0));
  const before = sum(sales, 'amount');
  const gst = sum(sales, 'gst');
  const spent = sum(expenses, 'amount');
  return { sales: before, gst, billed: paise(before + gst), expenses: spent, profit: paise(before - spent) };
}

export function monthCsv(sales, expenses, month) {
  // A leading apostrophe stops spreadsheets running typed text as a formula.
  const text = (v) => `"${String(v || '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
  const rows = (list, type) => list.filter((x) => x.date.startsWith(month)).map((x) => [type, x.date, text(x.number), text(x.name), x.amount, x.gst || 0].join(','));
  return ['Type,Date,Number,Description,Amount before GST,GST', ...rows(sales, 'Sale'), ...rows(expenses, 'Expense')].join('\n');
}

const SERIES = { Invoice: 'INV', Quote: 'Q' };
export const formatNumber = (type, n) => `${SERIES[type]}-${String(n).padStart(4, '0')}`;

// wa.me needs the country code; a bare 10-digit number is treated as Indian.
export function waNumber(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? '91' + digits : digits;
}

// A whole side is two panels, and overlapping picks only count once.
export function countPanels(ids) {
  return Math.min(new Set(ids.flatMap((id) => WHOLE[id] || [id])).size, PANELS_PER_BOTTLE);
}

export function quote({ bottles, panels, panelRate, setupFee, discountPct, gstPct, bottleCost, waterCost, printCost, deliveryCost, expenses = [] }) {
  // Extra expenses belong to this quote in full, so they are not split by panel share.
  const expenseLines = expenses.map((e) => ({ name: e.name, total: paise(e.amount * (e.perBottle ? bottles : 1)) }));
  const expensesTotal = paise(expenseLines.reduce((sum, e) => sum + e.total, 0));
  const adFee = paise(bottles * panels * panelRate);
  const discount = paise(adFee * discountPct / 100);
  const taxable = paise(adFee - discount + setupFee);
  const gst = paise(taxable * gstPct / 100);
  const total = paise(taxable + gst);
  const unitCost = bottleCost + waterCost + printCost + deliveryCost;
  const fullCost = paise(bottles * unitCost);
  const costShare = paise(fullCost * panels / PANELS_PER_BOTTLE);
  return {
    adFee, discount, setupFee, taxable, gst, total,
    ratePerBottle: paise(panels * panelRate),
    perBottle: bottles ? paise(total / bottles) : 0,
    unitCost,
    breakEvenPanel: paise(unitCost / PANELS_PER_BOTTLE),
    fullCost, costShare, expenseLines, expensesTotal,
    profitIfFull: paise(taxable - costShare - expensesTotal), // the other panels sell at this cost share
    profitIfAlone: paise(taxable - fullCost - expensesTotal), // this brand pays for the whole run
  };
}
