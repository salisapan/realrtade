// docwriter.js corpus — the hand-rolled STORED-ZIP + WordprocessingML writer
// behind Feature 4 Path B ("Do It: ... & Generate Next Step Document").
//
// This file had zero test coverage before this corpus. It caught a real bug
// on first use: suggestedFilename()'s sender-name sanitizer was ASCII-only
// (/[^a-z0-9]+/gi), so a Hebrew sender name — routine for this product's
// Hebrew-speaking users — collapsed to nothing, and two different
// Hebrew-named senders logged the same day produced the IDENTICAL filename.
// Fixed by switching to Unicode-aware character classes (\p{L}\p{N}, u flag).
// See suggestedFilename()'s own comment in src/docwriter.js for the full
// story; the case below is the permanent regression test for it.
//
// Also verifies the writer and docreader.js (the separate hand-rolled
// reader used by Feature 3's attachment hover card) actually agree with
// each other end to end: generate() a real .docx, feed its raw bytes
// straight into FlowDocReader.extractDocxText, and confirm the facts that
// went in come back out — including through escXml()'s escaping and
// docreader's entity-decode on the way back. Both modules are loaded into
// one sandbox so this round trip needs no serialization across contexts.
//
// Run: node test/docwriter-corpus.cjs

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { module: undefined, console, TextEncoder, TextDecoder, Blob, Response, DecompressionStream, ArrayBuffer, Uint8Array };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'docwriter.js'), 'utf8'), sandbox, { filename: 'docwriter.js' });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'docreader.js'), 'utf8'), sandbox, { filename: 'docreader.js' });
const FlowDocWriter = vm.runInContext('FlowDocWriter', sandbox);
const FlowDocReader = vm.runInContext('FlowDocReader', sandbox);

let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('PASS:', name); }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

async function run() {
  console.log('--- suggestedFilename: Hebrew sender name is preserved, not collapsed ---\n');
  {
    const name1 = FlowDocWriter.suggestedFilename('receipt', { senderName: 'דנה כהן' });
    check('Hebrew sender name survives into the filename', name1.includes('דנה') && name1.includes('כהן'), name1);
    check('filename still has the expected glance/kind/date skeleton',
      /^glance-receipt-.+-\d{4}-\d{2}-\d{2}\.docx$/.test(name1), name1);

    const name2 = FlowDocWriter.suggestedFilename('receipt', { senderName: 'רונית לוי' });
    check('two different Hebrew senders on the same day no longer collide on filename',
      name1 !== name2, { name1, name2 });
  }

  console.log('\n--- suggestedFilename: ASCII sender name still works (no regression) ---\n');
  {
    const name = FlowDocWriter.suggestedFilename('receipt', { senderName: 'Dana Cole' });
    check('ASCII name is dash-joined into the filename', name === 'glance-receipt-Dana-Cole-' + name.match(/(\d{4}-\d{2}-\d{2})/)[1] + '.docx', name);
  }

  console.log('\n--- suggestedFilename: no sender falls back to kind+date only ---\n');
  {
    const name = FlowDocWriter.suggestedFilename('receipt', {});
    check('no sender info produces no dangling separator', /^glance-receipt-\d{4}-\d{2}-\d{2}\.docx$/.test(name), name);
  }

  console.log('\n--- suggestedFilename: falls back to senderEmail when senderName is absent ---\n');
  {
    const name = FlowDocWriter.suggestedFilename('receipt', { senderEmail: 'dana@example.com' });
    check('senderEmail is used when senderName is missing', name.includes('dana') && name.includes('example') && name.includes('com'), name);
  }

  console.log('\n--- suggestedFilename: senderName is preferred over senderEmail when both are present ---\n');
  {
    const name = FlowDocWriter.suggestedFilename('receipt', { senderName: 'Dana Cole', senderEmail: 'someone-else@example.com' });
    check('senderName wins over senderEmail', name.includes('Dana-Cole') && !name.includes('someone-else'), name);
  }

  console.log('\n--- suggestedFilename: unknown kind still falls back to the "document" base ---\n');
  {
    const name = FlowDocWriter.suggestedFilename(undefined, {});
    check('missing kind falls back to "document" rather than throwing or leaving it blank',
      /^glance-document-\d{4}-\d{2}-\d{2}\.docx$/.test(name), name);
  }

  console.log('\n--- generate(): produces a real .docx that docreader.js can read straight back ---\n');
  {
    const ctx = {
      label: 'Approved refund',
      facts: { moneyText: '$1,204.50', dateText: 'March 3, 2026', quote: 'Please process this by Friday.' },
      senderName: 'Dana Cole',
      senderEmail: 'dana@example.com',
      subject: 'Re: Refund request',
      where: 'HubSpot'
    };
    const blob = FlowDocWriter.generate('receipt', ctx);
    check('generate() returns a Blob with the correct .docx content type',
      blob && blob.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', blob && blob.type);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = await FlowDocReader.extractDocxText(bytes);

    check('heading/title text round-trips', text.includes('Acknowledgment of Receipt'), text);
    check('the decision label round-trips', text.includes('Approved refund'), text);
    check('the money fact round-trips', text.includes('$1,204.50'), text);
    check('the date fact round-trips', text.includes('March 3, 2026'), text);
    check('the counterparty (sender name + email) round-trips', text.includes('Dana Cole') && text.includes('dana@example.com'), text);
    check('the subject/reference round-trips', text.includes('Re: Refund request'), text);
    check('the quoted line round-trips', text.includes('Please process this by Friday.'), text);
    check('the connector label round-trips into the footer line', text.includes('HubSpot'), text);
  }

  console.log('\n--- generate(): unknown kind falls back to the receipt template, not a crash ---\n');
  {
    const blob = FlowDocWriter.generate('not-a-real-kind', { label: 'X' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = await FlowDocReader.extractDocxText(bytes);
    check('an unrecognized kind renders using the receipt template', text.includes('Acknowledgment of Receipt'), text);
  }

  console.log('\n--- generate(): XML-special characters in facts survive escXml() + docreader round trip ---\n');
  {
    const ctx = {
      label: 'Danger <&> "quoted" \'text\'',
      facts: { quote: 'Terms: A & B <are> "final", per client\'s email.' },
      senderName: 'R&D <Team>'
    };
    const blob = FlowDocWriter.generate('receipt', ctx);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = await FlowDocReader.extractDocxText(bytes);
    check('ampersand survives escaping+decoding without corrupting neighboring text',
      text.includes('Danger <&> "quoted" \'text\''), text);
    check('angle brackets and quotes in a quoted fact survive round trip',
      text.includes('Terms: A & B <are> "final", per client\'s email.'), text);
    check('ampersand in a sender name survives round trip', text.includes('R&D <Team>'), text);
  }

  console.log('\nTOTAL FAILURES:', failures);
  process.exit(failures ? 1 : 0);
}

run();
