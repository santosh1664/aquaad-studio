// Run: node test/quote.test.mjs
import assert from 'node:assert/strict';
import { amountInWords, countPanels, customerAmounts, customerKey, formatNumber, groupByCustomer, invoice, invoiceSales, invoiceText, monthCsv, monthSummary, quote, upsertDoc, waNumber } from '../dist/admin/quote.js';

assert.equal(customerKey({ company: ' Acme ', name: 'Asha' }), 'acme');
assert.equal(customerKey({ company: '', name: 'Asha' }), 'asha');
const inv1 = { type: 'Invoice', number: 'INV-0001', company: 'Acme', name: 'Asha', isoDate: '2026-10-01', r: { total: 100 } };
const inv2 = { type: 'Invoice', number: 'INV-0002', company: 'ACME ', name: '', isoDate: '2026-11-01', r: { total: 50.5 } };
const qt1 = { type: 'Quote', number: 'Q-0001', company: 'Acme', name: '', isoDate: '2026-09-01', r: { total: 999 } };
const other = { type: 'Invoice', number: 'INV-0003', company: '', name: 'Zed', isoDate: '2026-11-02', r: { total: 7 } };
const grouped = groupByCustomer([inv1, other, inv2, qt1]);
assert.deepEqual(grouped.map((g) => g.name), ['Acme', 'Zed']); // same customer despite case and spaces
assert.deepEqual(grouped[0].docs.map((d) => d.number), ['INV-0002', 'INV-0001', 'Q-0001']); // newest first
assert.equal(grouped[0].invoiced, 150.5); // quotes are not money invoiced
assert.equal(groupByCustomer([{ ...other, name: '' }])[0].name, 'No customer name');
assert.equal(upsertDoc([inv1, qt1], { ...inv1, status: 'Paid' }).length, 2);
assert.equal(upsertDoc([inv1], { ...inv1, type: 'Quote' }).length, 2); // a quote never overwrites an invoice
assert.equal(upsertDoc([inv1], { ...inv1, number: 'inv-0001' }).length, 1);
const kept = customerAmounts(quote({ bottles: 10, panels: 1, panelRate: 2, setupFee: 0, discountPct: 0, gstPct: 18, bottleCost: 1, waterCost: 0, printCost: 0, deliveryCost: 0, expenses: [{ name: 'x', amount: 5 }] }));
assert.deepEqual(Object.keys(kept).sort(), ['adFee', 'discount', 'gst', 'perBottle', 'ratePerBottle', 'setupFee', 'taxable', 'total']); // no costs or profit

const sold = [{ number: 'INV-0001', date: '2026-11-05', name: 'Acme', amount: 5900, gst: 1062 }, { number: 'INV-0002', date: '2026-12-01', name: 'Next month', amount: 100, gst: 18 }];
const spent = [{ date: '2026-11-30', name: 'Rent', amount: 8000.5 }, { date: '2026-10-31', name: 'Last month', amount: 999 }];
assert.deepEqual(monthSummary(sold, spent, '2026-11'), { sales: 5900, gst: 1062, billed: 6962, expenses: 8000.5, profit: -2100.5 });
assert.deepEqual(monthSummary([], [], '2026-11'), { sales: 0, gst: 0, billed: 0, expenses: 0, profit: 0 });
const saleDocs = [
  { id: 'a', type: 'Invoice', status: 'Sent', number: 'INV-0001', isoDate: '2026-11-05', company: 'Acme', name: 'Asha', r: { taxable: 100, gst: 18 } },
  { id: 'b', type: 'Invoice', status: 'Paid', number: 'INV-0002', isoDate: '2026-11-06', company: '', name: 'Zed', r: { taxable: 50, gst: 9 } },
  { id: 'c', type: 'Invoice', status: 'Draft', number: 'INV-0003', isoDate: '2026-11-07', company: 'Acme', name: '', r: { taxable: 999, gst: 1 } },
  { id: 'd', type: 'Quote', status: 'Sent', number: 'Q-0001', isoDate: '2026-11-07', company: 'Acme', name: '', r: { taxable: 999, gst: 1 } },
];
assert.deepEqual(invoiceSales(saleDocs).map((s) => [s.number, s.name, s.amount, s.gst, s.date, s.auto]), [['INV-0001', 'Acme', 100, 18, '2026-11-05', true], ['INV-0002', 'Zed', 50, 9, '2026-11-06', true]]);
assert.equal(monthCsv(sold, spent, '2026-11'), 'Type,Date,Number,Description,Amount before GST,GST\nSale,2026-11-05,"INV-0001","Acme",5900,1062\nExpense,2026-11-30,"","Rent",8000.5,0');
assert.ok(monthCsv([], [{ date: '2026-11-01', name: '=SUM(A1) "x"', amount: 1 }], '2026-11').includes(`"'=SUM(A1) ""x"""`));

assert.equal(formatNumber('Invoice', 1), 'INV-0001');
assert.equal(formatNumber('Quote', 12), 'Q-0012');
assert.equal(formatNumber('Invoice', 12345), 'INV-12345');

assert.equal(countPanels(['bFrontUp']), 1);
assert.equal(countPanels(['bFront']), 2);
assert.equal(countPanels(['bFront', 'bFrontUp', 'bBackUp']), 3);
assert.equal(countPanels(['bFront', 'bRight', 'bLeft', 'bBackUp']), 7);

// Made-up numbers, only to check the arithmetic.
const q = quote({ bottles: 1000, panels: 2, panelRate: 3, setupFee: 500, discountPct: 10, gstPct: 18, bottleCost: 4, waterCost: 1, printCost: 1.5, deliveryCost: 0.5 });
assert.equal(q.adFee, 6000);
assert.equal(q.discount, 600);
assert.equal(q.taxable, 5900);
assert.equal(q.gst, 1062);
assert.equal(q.total, 6962);
assert.equal(q.perBottle, 6.96);
assert.equal(q.unitCost, 7);
assert.equal(q.breakEvenPanel, 1);
assert.equal(q.fullCost, 7000);
assert.equal(q.costShare, 2000);
assert.equal(q.profitIfFull, 3900);
assert.equal(q.profitIfAlone, -1100);

const job = { bottles: 1000, panels: 2, panelRate: 3, setupFee: 500, discountPct: 10, gstPct: 18, bottleCost: 4, waterCost: 1, printCost: 1.5, deliveryCost: 0.5 };
const withExp = quote({ ...job, expenses: [{ name: 'Commission', amount: 100 }, { name: 'Storage', amount: 0.5, perBottle: true }] });
assert.deepEqual(withExp.expenseLines, [{ name: 'Commission', total: 100 }, { name: 'Storage', total: 500 }]);
assert.equal(withExp.expensesTotal, 600);
assert.equal(withExp.total, 6962); // expenses never change the customer's bill
assert.equal(withExp.profitIfFull, 3300);
assert.equal(withExp.profitIfAlone, -1700);

const doc = { type: 'Invoice', number: 'F2D-1', date: '5 Nov 2026', due: '', name: 'Asha', company: 'Acme', phone: '', email: '', buyerGstin: '', buyerState: 'Karnataka', buyerAddress: '1 Test Road', description: 'Bottle front', sellerName: 'Free2Drink', gstin: '', sellerState: 'karnataka ', sac: '', sellerPhone: '', sellerEmail: '', sellerAddress: '', payment: 'UPI test@upi', terms: '', bottles: 1000, panels: 2, gstPct: 18, r: quote({ ...job, expenses: [{ name: 'Commission', amount: 777 }] }) };
const text = invoiceText(doc);
assert.match(text, /^Free2Drink Invoice/);
assert.match(text, /Invoice no\.: F2D-1/);
assert.match(text, /Bill to:\nAcme\nAsha\n1 Test Road/);
assert.match(text, /1\. Advertising on 500 ml bottles, 2 panels per bottle — Bottle front\n {3}1,000 × ₹6\.00 = ₹6,000\.00/);
assert.match(text, /2\. One-off setup fee\n {3}1 × ₹500\.00 = ₹500\.00/);
assert.match(text, /Subtotal: ₹6,500\.00\nDiscount: -₹600\.00\nTaxable amount: ₹5,900\.00/);
assert.match(text, /CGST \(9%\): ₹531\.00\nSGST \(9%\): ₹531\.00/); // same state, ignoring case and spaces
assert.match(text, /Total due: ₹6,962\.00/);
assert.match(text, /Campaign:\n1,000 bottles · 2 panels per bottle\nBottle front\n₹6\.96 per bottle/);
assert.match(text, /Please reference F2D-1 with your payment\. Thank you for advertising with Free2Drink\./);
assert.match(text, /Rupees Six Thousand Nine Hundred Sixty Two Only/);
assert.match(text, /Payment details:\nUPI test@upi/);
assert.doesNotMatch(text, /GSTIN|Due:|Quote:|Status:|Terms/); // blank fields are left out

assert.match(invoiceText({ ...doc, sellerState: 'Goa' }), /IGST \(18%\): ₹1,062\.00/);
assert.match(invoiceText({ ...doc, sellerState: '' }), /GST \(18%\): ₹1,062\.00/);
assert.doesNotMatch(invoiceText({ ...doc, gstPct: 0 }), /GST \(/);
const oddTax = invoice({ ...doc, r: { ...doc.r, gst: 100.01 } }).totals.filter(([l]) => /GST/.test(l)).map(([, v]) => v);
assert.deepEqual(oddTax, ['₹50.01', '₹50.00']); // the split always adds back to the total GST
const quoteDoc = invoice({ ...doc, type: 'Quote', due: '12 Nov 2026' });
assert.equal(quoteDoc.title, 'Quotation');
assert.equal(quoteDoc.numberLabel, 'Quotation no.');
assert.ok(quoteDoc.meta.some(([l]) => l === 'Valid until'));
assert.ok(quoteDoc.totals.some(([l]) => l === 'Total'));
assert.doesNotMatch(quoteDoc.footer, /reference/); // nothing to pay yet on a quote

assert.equal(amountInWords(0), 'Rupees Zero Only');
assert.equal(amountInWords(1234567.89), 'Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Paise Only');
assert.equal(amountInWords(120000000), 'Rupees Twelve Crore Only');
assert.equal(amountInWords(100000), 'Rupees One Lakh Only');
assert.equal(amountInWords(0.05), 'Rupees Zero and Five Paise Only');
assert.doesNotMatch(text, /profit|loss|cost|expense|commission|storage/i); // internal numbers never reach the customer
for (const internal of ['7,000.00', '2,000.00', '777.00', '3,123.00', '1,877.00']) assert.ok(!text.includes(internal), internal);

assert.equal(waNumber('98765 43210'), '919876543210');
assert.equal(waNumber('+91 98765-43210'), '919876543210');
assert.equal(waNumber(''), '');

assert.equal(quote({ bottles: 0, panels: 1, panelRate: 3, setupFee: 0, discountPct: 0, gstPct: 18, bottleCost: 0, waterCost: 0, printCost: 0, deliveryCost: 0 }).perBottle, 0);
console.log('quote ok');
