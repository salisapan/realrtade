// One mail that asks for a new Word file on OneDrive. Handled only after
// the item id is read back. Undo deletes that new file.
const BODY = 'Please create a Word document called notes.docx with the pricing summary.';
const ID = 'AQMkLaneMsWord';

module.exports = { BODY, ID, FILE: 'notes.docx' };
