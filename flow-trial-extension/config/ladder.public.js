// The switch for the deeper read (docs/ai-ladder.md): one masked sentence at a time to Glance's server when Glance's own code could not place it.
// Public: nothing here is a secret.
//
// enabled: the extension asks the server whether the deeper read is running, and offers the person the one-time choice. It is ON in this build.
//          That is not the whole switch: the server answers "not available" until the owner sets GLANCE_AI_LADDER on Netlify to the languages that passed the measurement (en, he, or en,he; docs/ai-ladder.md §7),
//          and the extension asks nothing and shows nothing until it does. Nothing is sent before the person says yes in the popup.
//          Setting this to false removes the whole thing from the extension; test/ai-ladder-copy-corpus.cjs fails if it is true and the privacy page does not say what it does.
export const LADDER = { enabled: true };
