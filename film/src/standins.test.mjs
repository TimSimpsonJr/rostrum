import test from 'node:test';
import assert from 'node:assert/strict';
import { PEOPLE, compactName, emailOf, makeLedger, secretFor, seriesName } from './standins.ts';

/** true when a and b share any run of 4 or more characters */
const shares4 = (a, b) => { for (let i = 0; i + 4 <= a.length; i++) if (b.includes(a.slice(i, i + 4))) return true; return false; };

test('a series is numbered in order of first appearance, and the same original keeps its number', () => {
  const book = makeLedger();
  const ids = ['3fa85f64-5717-4562-b3fc-2c963f66afa6', '8nk50w16hy', '757316492905115-8'];
  assert.deepEqual(ids.map((id) => book.series('Transaction', id)), ['Transaction 1', 'Transaction 2', 'Transaction 3']);
  assert.equal(book.series('Transaction', ids[1]), 'Transaction 2'); // met again, on any screen
  assert.equal(book.series('Invoice', ids[0]), 'Invoice 1');         // each kind counts for itself
  assert.equal(makeLedger().series('Transaction', ids[2]), 'Transaction 1'); // a new recording starts over
});

test('the name of a series comes from its heading, without the words that only say it is an id', () => {
  assert.equal(seriesName('Transaction UUID'), 'Transaction');
  assert.equal(seriesName('Invoice Number'), 'Invoice');
  assert.equal(seriesName('Record ID'), 'Record');
  assert.equal(seriesName('Purchase Order No.'), 'Purchase order');
  assert.equal(seriesName('ID'), 'ID');   // nothing else to call it
  assert.equal(seriesName(''), 'Item');
});

test('a stand-alone secret shows its field name, compact, and a short fixed number', () => {
  assert.equal(secretFor('User API Key'), 'UserAPIKey-123456');
  assert.equal(secretFor('userApiKey'), 'UserAPIKey-123456');     // from an id, when the field has no label
  assert.equal(secretFor('Company API Key'), 'CompanyAPIKey-123456');
  assert.equal(compactName('account_number'), 'AccountNumber');
  assert.equal(compactName('ACH routing no.'), 'ACHRoutingNo');
  assert.equal(compactName(''), 'Value');
});

test('emails met in passing take the roster in turn, after the signed-in user, and stay put', () => {
  const book = makeLedger();
  assert.deepEqual(PEOPLE.map((p) => p.first), ['Jordan', 'Priya', 'Marcus']);
  assert.equal(emailOf(PEOPLE[0]), 'jordan.avery@example.com');
  assert.equal(book.email('a@site.test'), 'priya.raman@example.com');
  assert.equal(book.email('b@site.test'), 'marcus.bell@example.com');
  assert.equal(book.email('a@site.test'), 'priya.raman@example.com');
});

test('money: the symbol and format stay, the figure is a round one in order of appearance, zero stays zero', () => {
  const book = makeLedger();
  assert.equal(book.amount('$999,999.00'), '$100.00');
  assert.equal(book.amount('$636663.00'), '$200.00');
  assert.equal(book.amount('$50.00'), '$300.00');
  assert.equal(book.amount('$999,999.00'), '$100.00'); // the same sum again
  assert.equal(book.amount('$50'), '$400');             // no decimals in, none out (and a different string is a different sum)
  assert.equal(book.amount('€ 12,50'.replace(',', '.')), '€ 500.00'); // the symbol and its spacing stay
  for (const zero of ['$0.00', '$.00', '$0', '£0.0']) assert.equal(book.amount(zero), zero);
  const many = makeLedger();
  for (let i = 1; i < 10; i++) many.amount(`$${i}.25`);
  assert.equal(many.amount('$77.25'), '$1,000.00');     // thousands are grouped
});

test('a stand-in is never made from the original: no run of 4 characters in common, whatever the original', () => {
  const book = makeLedger();
  for (const original of ['sk_test_FIXTURE_ONLY_9870', '3fa85f64-5717-4562-b3fc-2c963f66afa6', '00987650', '(864) 555-0100', '*'.repeat(44), 'pk_live-Ab3dEf6hIj9kLmN0pQrS_tuv=']) {
    for (const out of [book.series('Transaction', original), secretFor('User API Key'), book.email(original)]) {
      assert.ok(!shares4(original, out), 'shares a run of 4 with its original');
    }
  }
  // and two different originals of one field get the same secret label: nothing of either leaks into it
  assert.equal(secretFor('User API Key'), secretFor('User API Key'));
});
