// Service worker. Owns everything a content script must not do itself: holding
// credentials, talking to third-party APIs, and performing the one write per
// click that this product exists for.
//
// Six connectors are wired up here, but only two are meant to be on the
// onboarding path for the MVP: Google Tasks (the default — sign in with the
// Google account already open, zero setup) and Notion (a fallback for anyone
// who'd rather have a database row than a task). HubSpot, Salesforce, Slack,
// and Monday.com are kept working but no longer promoted — they solve a
// team's CRM-hygiene problem, which is a real but different product from
// "don't let this personal commitment slip." Re-promote them once Google
// Tasks + Notion have proven the core loop, not before.
//
//   Google authenticates first via chrome.identity.getAuthToken — Chrome's
//   own Google account chooser, driven by the Chrome-extension OAuth client
//   in manifest.json. When that fails because browser sign-in is off (or
//   the identity API is otherwise unavailable, and the user did not cancel),
//   the same grant is obtained with chrome.identity.launchWebAuthFlow and
//   the Web application client in config/oauth.public.js (WEB_OAUTH_CLIENT_ID).
//   That consent window opens only after an explicit Connect click. Do It,
//   a 401 retry, and Gmail auto-connect stay silent and, if they cannot
//   mint a token, report not-connected instead of popping a window.
//   A change in the required scopes is the one exception: the cached token
//   still carries the old grant, so Glance drops it and asks once, including
//   the web-auth fallback. A later silent call does not ask again.
//   No server-side exchange and no Client Secret either way.
//
//   Notion authenticates with an internal integration token the user creates
//   themselves, so there is no app registration, no review queue and no
//   server-side secret anywhere in the path.
//
//   HubSpot, Salesforce, Slack and Monday.com all use OAuth, which requires a
//   registered app whose Client Secret must never ship inside an extension.
//   Each secret lives only as a Netlify environment variable read by that
//   connector's own exchange (and, where the platform issues one, refresh)
//   function. The public Client IDs are read from config/oauth.public.js —
//   the same way a GA4 measurement ID is public — and stay placeholder
//   strings until the owner pastes real ones. See docs/SETUP.md.
//
// Every write path is deliberately additive and conservative: it only ever
// writes to something that already exists — an existing matching Contact, a
// channel or board the user names — never creating or editing a Contact,
// Deal, or item beyond the one new record. Each returns enough information
// to undo it. Nothing here ever edits or deletes something the user already
// had.

import { OAUTH_PUBLIC, publicClientId, WEB_OAUTH_CLIENT_ID } from '../config/oauth.public.js';
import { GOOGLE_EVER_CONNECTED_STORAGE_KEY, GOOGLE_GRANTED_SCOPES_KEY, GOOGLE_RECONNECT_STORAGE_KEY, GOOGLE_WEB_AUTH_STORAGE_KEY, googleConnectionState, googleConnectErrorMessage, googleEverConnectedPatch, googleImplicitAuthUrl, googleOAuthScopesFrom, googleRedirectUriForExtension, googleScopeAction, parseGoogleImplicitRedirect, scopeVersion, shouldFallbackFromGetAuthToken, webTokenUsable } from './google-web-auth.js';
import { HYBRID } from '../config/hybrid.public.js';
import './hybrid-sw.js';        // classic script: sets globalThis.FlowHybridSW
import '../core/draft-reply.js';  // classic: sets globalThis.FlowDraftReply
import '../core/outlook-config.js';  // classic: sets globalThis.FlowOutlookConfig
import '../core/outlook-auth.js';    // classic: sets globalThis.FlowOutlookAuth
import '../core/outlook-calendar.js'; // classic: sets globalThis.FlowOutlookCalendar
import '../core/teams-meeting.js'; // classic: sets globalThis.FlowTeamsMeeting (switch TEAMS_MEETING, off)
import '../core/day-words.js'; // classic: sets globalThis.FlowDayWords (extract.js makes the day forms people write explicit with it)
import '../core/extract.js'; // classic: sets globalThis.FlowExtract (the repeat's clock is read with it)
import '../core/recurring-reminder.js'; // classic: sets globalThis.FlowRecurringReminder (recognition only here)
import '../core/todo-recurrence.js'; // classic: sets globalThis.FlowTodoRecurrence (switch RECURRING_TODO, off)
import '../core/proof-of-close.js'; // classic: sets globalThis.FlowProofOfClose
// Loaded after proof-of-close.js on purpose: the module reads FlowProofOfClose when it loads.
import '../core/planner-task.js'; // classic: sets globalThis.FlowPlannerTask (switch PLANNER_TASK, off)
import '../core/commitment-title.js'; // classic: sets globalThis.FlowCommitmentTitle
import '../core/build-stamp.js'; // classic: sets globalThis.FlowBuild — same constant the page loads
import '../core/onedrive-file.js'; // classic: sets globalThis.FlowOnedriveFile
import '../core/outlook-word.js'; // classic: sets globalThis.FlowOutlookWord (an empty .docx for a new file)
import '../core/outlook-excel.js'; // classic: sets globalThis.FlowOutlookExcel (an empty .xlsx for a new file)
import '../core/onedrive-new-file.js'; // classic: sets globalThis.FlowOnedriveNewFile (switch ONEDRIVE_NEW_FILE, off)
import '../core/sharepoint-new-file.js'; // classic: sets globalThis.FlowSharepointNewFile (switch SHAREPOINT_NEW_FILE, off)
import '../core/sharepoint-save-file.js'; // classic: sets globalThis.FlowSharepointSaveFile (switch SHAREPOINT_SAVE_FILE, off)
import '../core/event-call-link.js'; // classic: sets globalThis.FlowEventCallLink (the event picker the Outlook twin uses)
import '../core/outlook-event-call-link.js'; // classic: sets globalThis.FlowOutlookEventCallLink (switch OUTLOOK_EVENT_CALL_LINK, off)
import '../core/suggest-save.js'; // classic: sets globalThis.FlowSuggestSave
import './native-edit.js'; // classic: sets globalThis.FlowNativeEdit
import './lane-chat-worker.js'; // answers flow:chat-evidence from the calendars already connected
import '../lane-chat/meta-consent.js'; // one Meta consent; signup sends flow:open-meta-chats
// The worker cannot call import(). These are the helpers imported at the top of this file.
globalThis.__glanceGoogleAuth = {
  GOOGLE_WEB_AUTH_STORAGE_KEY: GOOGLE_WEB_AUTH_STORAGE_KEY,
  webTokenUsable: webTokenUsable
};
import '../core/lane-ms-host.js'; // lane-ms: one hook, loads the Microsoft Graph lane
import { LADDER } from '../config/ladder.public.js';
import { CONNECTORS } from '../config/connectors.public.js';
import '../core/notion-close.js'; // classic: sets globalThis.FlowNotionClose
import '../core/asana-close.js'; // classic: sets globalThis.FlowAsanaClose
import '../core/jira-close.js'; // classic: sets globalThis.FlowJiraClose
import '../core/linear-close.js'; // classic: sets globalThis.FlowLinearClose
import '../core/docusign-close.js'; // classic: sets globalThis.FlowDocusignClose
import '../core/dropbox-close.js'; // classic: sets globalThis.FlowDropboxClose
import '../core/teams-answer-close.js'; // classic: sets globalThis.FlowTeamsAnswerClose
import '../core/connector-outcome.js'; // classic: sets globalThis.FlowConnectorOutcome
import { CARRY } from '../config/carry.public.js';
import './google-lane-host.js';
import './gmail-reinject.js';

const HUBSPOT_CLIENT_ID = publicClientId(OAUTH_PUBLIC.hubspotClientId);

const HUBSPOT_AUTH_BASE = 'https://app.hubspot.com/oauth/authorize';
const HUBSPOT_SCOPES = 'crm.objects.contacts.read crm.objects.contacts.write';
const HUBSPOT_API = 'https://api.hubapi.com';
const EXCHANGE_URL = 'https://theflow-ai.com/.netlify/functions/hubspot-oauth-exchange';
const REFRESH_URL = 'https://theflow-ai.com/.netlify/functions/hubspot-oauth-refresh';

const SALESFORCE_CLIENT_ID = publicClientId(OAUTH_PUBLIC.salesforceClientId);
// login.salesforce.com is the standard entry point and redirects sandbox/My
// Domain orgs correctly on its own; instance_url (returned by the token
// exchange) is what every API call after that actually uses.
const SALESFORCE_AUTH_BASE = 'https://login.salesforce.com/services/oauth2/authorize';
const SALESFORCE_SCOPES = 'api refresh_token';
const SALESFORCE_API_VERSION = 'v59.0';
const SF_EXCHANGE_URL = 'https://theflow-ai.com/.netlify/functions/salesforce-oauth-exchange';
const SF_REFRESH_URL = 'https://theflow-ai.com/.netlify/functions/salesforce-oauth-refresh';

const SLACK_CLIENT_ID = publicClientId(OAUTH_PUBLIC.slackClientId);
const SLACK_AUTH_BASE = 'https://slack.com/oauth/v2/authorize';
// chat:write.public lets the bot post to public channels without an explicit
// /invite first — the closest a bot token gets to Notion's zero-friction feel.
const SLACK_SCOPES = 'chat:write,chat:write.public';
const SLACK_API = 'https://slack.com/api';
const SLACK_EXCHANGE_URL = 'https://theflow-ai.com/.netlify/functions/slack-oauth-exchange';

const MONDAY_CLIENT_ID = publicClientId(OAUTH_PUBLIC.mondayClientId);
const MONDAY_AUTH_BASE = 'https://auth.monday.com/oauth2/authorize';
const MONDAY_API = 'https://api.monday.com/v2';
const MONDAY_EXCHANGE_URL = 'https://theflow-ai.com/.netlify/functions/monday-oauth-exchange';
const MONDAY_REFRESH_URL = 'https://theflow-ai.com/.netlify/functions/monday-oauth-refresh';

// HubSpot's documented default association type ID for "note to contact". If it
// ever changes, note creation fails loudly with a 4xx rather than silently
// writing to the wrong place.
const NOTE_TO_CONTACT_ASSOCIATION_TYPE_ID = 202;

// TODO(owner): create an OAuth Client ID in Google Cloud Console (APIs &
// Services > Credentials > Create Credentials > OAuth client ID > Chrome
// Extension, using this extension's ID — computable from the "key" field
// above) and paste it into manifest.json's oauth2.client_id, replacing this
// same placeholder string. Until then Google Tasks reports itself
// unconfigured, same policy as the four OAuth connectors above.
const GOOGLE_TASKS_CLIENT_ID_PLACEHOLDER = 'YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
const GLANCE_TASK_LIST_TITLE = 'Glance';
// Calendar and Gmail share the exact same OAuth grant as Tasks — one
// chrome.identity token, requested with every scope in
// manifest.json's oauth2.scopes at once — so there is one "connect Google"
// step for the whole execution layer.
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
// The Picker API key itself (a second, separate Google Cloud credential
// from the OAuth Client ID above) lives only in picker/picker.js — that
// page is what calls setDeveloperKey(), and there's nothing for this file
// to do with the key itself, only with the OAuth-authed file access above.

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// Every write lands in a shared Notion database or a shared CRM contact —
// somewhere a teammate who never installed Flow will see it. One quiet,
// factual line crediting the tool (not a banner, not a plug) is the entire
// distribution channel this trial has: read organically by exactly the
// person it would actually help, at the moment they're already looking at
// proof it works.
// One url per shared destination rather than one shared ATTRIBUTION_URL —
// this file's own comment above already calls this line "this trial's
// entire distribution channel," and a single generic ?ref=note code meant
// every one of those five channels was pooled into one number with no way
// to tell a HubSpot teammate's click from a Slack teammate's. The url
// itself still resolves to the exact same page either way; only the query
// string differs, so nothing about what a reader sees or where they land
// changes — this is purely which of several already-built exposure
// surfaces is worth building on next becoming answerable instead of guessed.
function attributionUrl(surface) {
  return 'https://theflow-ai.com/trial.html?ref=' + surface;
}
const ATTRIBUTION_TEXT = 'Logged by Glance — theflow-ai.com/trial';

// Docks the setup/Open/Activity UI to the side of the browser window instead
// of the small popover a plain default_popup gives — the toolbar icon click
// now opens the same popup/popup.html content as a persistent side panel
// (stays open across clicks elsewhere, same shape as Claude's own Cowork
// panel) rather than a dropdown that vanishes on blur. manifest.json no
// longer declares action.default_popup at all — once this behavior is set,
// a default_popup would just be silently unreachable dead weight, so it was
// removed rather than left stale next to this. This runs unconditionally at
// service-worker startup, not gated behind onInstalled, so it re-applies
// every time the service worker wakes up, the same pattern Chrome's own
// samples use.
//
// Guarded, not a bare top-level call: chrome.sidePanel itself (not just
// setPanelBehavior's promise) can be undefined — an older Chrome build, or
// any timing edge case in how the new sidePanel permission gets applied.
// Accessing .setPanelBehavior on undefined throws SYNCHRONOUSLY, and a
// synchronous throw at the top level of this file stops every line below it
// from ever running — every chrome.runtime.onMessage handler this file
// registers (flow:execute-action, flow:classify-remote, flow:undo-action,
// all of it) would silently never exist. A cosmetic side-panel upgrade must
// never be able to take the whole write/execution engine down with it.
try {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
  }
} catch (error) {
  console.error('[Glance] chrome.sidePanel.setPanelBehavior unavailable — side panel will not open on click, but the rest of the extension is unaffected', error);
}


/* ------------------------------------------------------- stay on this (any page) */
// A right-click on a selection, on ANY page, offers "Glance: stay on this". Nothing is read from the page but the selection the
// person chose and the page's address; both are kept only until the popup asks its one question (core/capture.js, 24 hours).
function ensureCaptureMenu() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: 'flow-stay-on', title: 'Glance: stay on this', contexts: ['selection'] }, () => void chrome.runtime.lastError);
    });
  } catch (e) { /* the menu is optional */ }
}
function addressWithoutQuery(raw) {
  try { const u = new URL(String(raw || '')); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.origin + u.pathname : ''; } catch (e) { return ''; }
}
try {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'flow-stay-on') return;
    const text = String(info.selectionText || '').slice(0, 600);
    if (!text.trim()) return;
    await chrome.storage.local.set({ captureNow: { text, pageUrl: addressWithoutQuery(info.pageUrl), at: Date.now() } });
    try { if (tab && tab.id != null && chrome.sidePanel && chrome.sidePanel.open) await chrome.sidePanel.open({ tabId: tab.id }); } catch (e) { /* the popup shows it the next time it opens */ }
  });
} catch (e) { console.error('[Glance] right-click menu unavailable', e); }
chrome.runtime.onInstalled.addListener(() => { ensureCaptureMenu(); });
async function migrateGoogleEverConnected() {
  try {
    const bag = await chrome.storage.local.get([
      GOOGLE_EVER_CONNECTED_STORAGE_KEY,
      'googleTasksAuth',
      GOOGLE_WEB_AUTH_STORAGE_KEY,
      'glanceLaneUndo'
    ]);
    const patch = googleEverConnectedPatch(bag);
    if (patch) await chrome.storage.local.set(patch);
  } catch (e) { /* storage can close during a restart */ }
}
function refreshStoredGoogleNames() {
  refreshGoogleSession().then((session) => {
    if (session && session.token) return rememberGoogleProfile(session.token);
  }).catch(() => {});
}
// One silent pass per service-worker start. onInstalled (unpacked reload is
// reason "update"), onStartup, and a timer all call this. The first one
// runs. A new worker starts the flag over.
let googleAuthBooted = false;
function bootGoogleAuth() {
  if (googleAuthBooted) return;
  googleAuthBooted = true;
  refreshStoredGoogleNames();
}
chrome.runtime.onInstalled.addListener((details) => {
  const reason = details && details.reason;
  if (reason !== 'install' && reason !== 'update') return;
  migrateGoogleEverConnected();
  injectOpenGmailTabs();
  bootGoogleAuth();
});
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(() => {
  migrateGoogleEverConnected();
  injectOpenGmailTabs();
  bootGoogleAuth();
});
if (typeof setTimeout === 'function') setTimeout(bootGoogleAuth, 0);

/* ---------------------------------------------------- other apps (opt-in) */
// Glance starts in Gmail. Another app is added only when the person turns it on in the popup, which asks the browser for that one
// site's permission (an OPTIONAL host permission: the install itself asks for nothing new) and then registers the content scripts for
// it here. Turning it off removes both the scripts and the permission. See docs/multi-platform.md.
// WhatsApp Web is not its own row. It turns on with the one Meta consent.
const SURFACES = {
  slack: { label: 'Slack', origins: ['https://app.slack.com/*'], extra: ['src/slack-parse.js', 'src/content-slack.js'] },
  telegram: { label: 'Telegram Web', origins: ['https://web.telegram.org/*'], extra: ['src/telegram-parse.js', 'src/content-telegram.js'] },
  // Outlook on the web: same chip + engine as Gmail; Graph write adapter only.
  outlook: {
    label: 'Outlook on the web',
    origins: ['https://outlook.live.com/*', 'https://outlook.office.com/*', 'https://outlook.office365.com/*'],
    extra: ['core/owa-parse.js', 'core/draft-reply.js', 'core/graph-mail.js', 'core/outlook-config.js', 'core/outlook-auth.js',
      'core/outlook-calendar.js', 'core/outlook-sync.js', 'src/outlook.js', 'src/chip-host.js', 'src/content-outlook.js'],
    css: ['design/step-states-v1/scoped.css', 'src/chip.css']
  }
};
// The Gmail-only pieces (chip, sidebar, brief, weekly) are not needed in another app: the follow-up engine and its card are.
const GMAIL_ONLY_SCRIPTS = ['core/draft-reply.js', 'core/google-config.js', 'core/google-compose.js', 'src/google-compose-page.js', 'src/content-gmail.js', 'src/sidebar.js', 'src/brief.js', 'src/weekly.js'];

function surfaceScripts(id) {
  const base = (chrome.runtime.getManifest().content_scripts[0].js || []).filter((f) => GMAIL_ONLY_SCRIPTS.indexOf(f) < 0);
  return base.concat(SURFACES[id].extra);
}

// Registered content scripts survive a browser restart (persistAcrossSessions) but an update can leave the previous
// version's list behind, and Chrome injects them only into pages loaded AFTER registration. So: one registration at a
// time per site, replaced only when the file list differs, and then the open tabs of that site get the scripts too.
const surfaceBusy = {};
function registerSurface(id) {
  if (surfaceBusy[id]) return surfaceBusy[id];
  surfaceBusy[id] = registerSurfaceNow(id).finally(() => { delete surfaceBusy[id]; });
  return surfaceBusy[id];
}

async function registerSurfaceNow(id) {
  const def = SURFACES[id];
  if (!def || !chrome.scripting || !chrome.scripting.registerContentScripts) return { ok: false, reason: 'unsupported' };
  const granted = await chrome.permissions.contains({ origins: def.origins });
  if (!granted) return { ok: false, reason: 'no-permission' };
  const css = (def.css && def.css.length) ? def.css : ['src/follow.css'];
  const script = { id: 'flow-' + id, matches: def.origins, js: surfaceScripts(id), css: css, runAt: 'document_idle', persistAcrossSessions: true };
  const stamp = (typeof FlowBuild !== 'undefined' && FlowBuild.STAMP) || chrome.runtime.getManifest().version || '';
  let remembered = {};
  try { remembered = (await chrome.storage.local.get({ glanceSurfaceStamp: {} })).glanceSurfaceStamp || {}; } catch (e) { remembered = {}; }
  let current = null;
  try { current = ((await chrome.scripting.getRegisteredContentScripts({ ids: [script.id] })) || [])[0] || null; } catch (e) { current = null; }
  const listSame = current && JSON.stringify(current.js || []) === JSON.stringify(script.js) && JSON.stringify(current.css || []) === JSON.stringify(script.css)
    && JSON.stringify((current.matches || []).slice().sort()) === JSON.stringify(script.matches.slice().sort());
  // The file list can stay the same across a package. The previous registration
  // would keep injecting the old greeting path. A new stamp registers again.
  const same = listSame && remembered[id] === stamp;
  if (!same) {
    if (current) { try { await chrome.scripting.unregisterContentScripts({ ids: [script.id] }); } catch (e) { /* not registered */ } }
    await chrome.scripting.registerContentScripts([script]);
    remembered[id] = stamp;
    try { await chrome.storage.local.set({ glanceSurfaceStamp: remembered }); } catch (e) { /* the page still got this registration */ }
    console.info('Glance: ' + id + ' surface registered', stamp, script.js.length + ' files');
  }
  const injected = await injectSurfaceIntoOpenTabs(id, script, stamp);
  return { ok: true, registered: !same, injected };
}

// What to do with an Outlook tab after the service worker returns.
// A live script is asked to look again. An empty page is injected.
// A dead script is left in place: reloading the tab would wipe a message
// the person is still writing. The page paints the refresh line itself.
// If that line is missing, the icon badge is the fallback. A window that
// is not a normal browser window is left alone.
function recoverOutlookTab(probe) {
  const windowType = probe && probe.windowType;
  // "missing" is a failed window lookup, not a popup. Only a known
  // non-browser window is left alone.
  if (windowType && windowType !== 'normal' && windowType !== 'missing') return 'skip';
  // A fresh injection has its own chrome.runtime.id. That is not the page
  // script. Only a ping the existing script answers means it is still live.
  if (probe && probe.pingOk) return 'rescan';
  if (probe && probe.hasPage && probe.refreshShown) return 'leave';
  if (probe && probe.hasPage) return 'ask';
  return 'inject';
}

async function noteOutlookNeedsRefresh(tabId) {
  try {
    const cur = await chrome.storage.local.get({ glanceOutlookRefresh: {} });
    const map = Object.assign({}, (cur && cur.glanceOutlookRefresh) || {});
    map[String(tabId)] = true;
    await chrome.storage.local.set({ glanceOutlookRefresh: map });
  } catch (e) { /* the icon badge still marks the tab */ }
  try {
    if (chrome.action && typeof chrome.action.setBadgeText === 'function') {
      chrome.action.setBadgeText({ text: '!', tabId: tabId });
      if (typeof chrome.action.setBadgeBackgroundColor === 'function') {
        chrome.action.setBadgeBackgroundColor({ color: '#123ccb', tabId: tabId });
      }
    }
  } catch (e) { /* the popup still reads the stored flag */ }
  console.warn('Glance: outlook tab ' + tabId + ' needs a manual refresh');
}

async function clearOutlookNeedsRefresh(tabId) {
  try {
    const cur = await chrome.storage.local.get({ glanceOutlookRefresh: {} });
    const map = Object.assign({}, (cur && cur.glanceOutlookRefresh) || {});
    delete map[String(tabId)];
    await chrome.storage.local.set({ glanceOutlookRefresh: map });
  } catch (e) { /* the flag expires when the page is fresh */ }
  try {
    if (chrome.action && typeof chrome.action.setBadgeText === 'function') {
      chrome.action.setBadgeText({ text: '', tabId: tabId });
    }
  } catch (e) { /* the number badge can return */ }
}

function gmailSurfaceScript() {
  let blocks = [];
  try { blocks = chrome.runtime.getManifest().content_scripts || []; } catch (e) { blocks = []; }
  const block = blocks.find((s) => (s.matches || []).some((m) => String(m).indexOf('mail.google.com') >= 0));
  if (!block || !block.js || !block.js.length) return null;
  return { matches: block.matches, js: block.js, css: block.css || [] };
}

// Already-open Gmail tabs on install, update, and browser start. No reload.
async function injectOpenGmailTabs() {
  const script = gmailSurfaceScript();
  if (!script) return 0;
  const stamp = (typeof FlowBuild !== 'undefined' && FlowBuild.STAMP) || '';
  return injectSurfaceIntoOpenTabs('gmail', script, stamp, { reload: false });
}

// Pages that were already open when the scripts were (re)registered: inject once, unless a live copy is already there.
async function injectSurfaceIntoOpenTabs(id, script, stamp, opts) {
  const gmail = id === 'gmail' || (script && Array.isArray(script.matches) && script.matches.some((m) => String(m).indexOf('mail.google.com') >= 0));
  if (gmail) {
    const fn = globalThis.reinjectGmailTabs;
    if (typeof fn === 'function') return fn();
    return 0;
  }
  if (!chrome.tabs || !chrome.tabs.query || !chrome.scripting.executeScript) return 0;
  const want = stamp || ((typeof FlowBuild !== 'undefined' && FlowBuild.STAMP) || '');
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: script.matches }); } catch (e) { return 0; }
  let n = 0;
  for (const tab of tabs || []) {
    if (!tab || typeof tab.id !== 'number') continue;
    if (id === 'outlook') {
      let windowType = 'normal';
      try {
        if (chrome.windows && chrome.windows.get && tab.windowId != null) {
          const win = await chrome.windows.get(tab.windowId);
          windowType = (win && win.type) || 'normal';
        }
      } catch (e) { windowType = 'missing'; }
      let pingOk = false;
      try {
        const pong = await chrome.tabs.sendMessage(tab.id, { type: 'flow:outlook-ping' });
        pingOk = Boolean(pong && pong.ok);
      } catch (e) { pingOk = false; }
      if (windowType && windowType !== 'normal' && windowType !== 'missing') continue;
      if (pingOk) {
        try { await chrome.tabs.sendMessage(tab.id, { type: 'flow:outlook-rescan' }); } catch (e) { /* the ping just answered */ }
        await clearOutlookNeedsRefresh(tab.id);
        continue;
      }
      let seen = { globals: false, refreshShown: false };
      try {
        const probe = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // DOM only. This function runs in a new isolated world, so
            // chrome.runtime.id here is the new extension, not the page script.
            let line = null;
            let marked = false;
            try {
              line = document.querySelector('[data-glance-refresh]');
              const root = document.documentElement;
              marked = Boolean(root && root.getAttribute('data-glance-outlook')) ||
                Boolean(document.querySelector('.flow-chip-host, .flow-why-not'));
            } catch (e) { line = null; marked = false; }
            return { globals: marked || Boolean(line), refreshShown: Boolean(line) };
          }
        });
        seen = (probe && probe[0] && probe[0].result) || seen;
      } catch (e) { seen = { globals: false, refreshShown: false }; }
      const action = recoverOutlookTab({
        windowType: windowType,
        pingOk: false,
        hasPage: Boolean(seen.globals),
        refreshShown: Boolean(seen.refreshShown)
      });
      if (action === 'rescan') {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => { try { if (globalThis.__glanceOutlookPage) globalThis.__glanceOutlookPage.rescan(); } catch (e) { /* orphaned copy */ } }
          });
        } catch (e) { /* the next open looks again */ }
        await clearOutlookNeedsRefresh(tab.id);
        continue;
      }
      if (action === 'leave') {
        await clearOutlookNeedsRefresh(tab.id);
        continue;
      }
      if (action === 'ask') {
        await noteOutlookNeedsRefresh(tab.id);
        continue;
      }
      try {
        if (script.css && script.css.length) await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: script.css });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: script.js });
        n++;
      } catch (e) {
        // A second inject cannot redeclare the dead script. Leave the tab.
        await noteOutlookNeedsRefresh(tab.id);
      }
      continue;
    }
    try {
      const probe = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
        let alive = false;
        try { alive = Boolean(chrome.runtime && chrome.runtime.id); } catch (e) { alive = false; }
        const pageStamp = (typeof FlowBuild !== 'undefined' && FlowBuild.STAMP) || '';
        return { globals: typeof FlowChipHost !== 'undefined' || typeof FlowStorage !== 'undefined', alive, stamp: pageStamp };
      } });
      const seen = (probe && probe[0] && probe[0].result) || {};
      if (seen.globals && want && seen.stamp && seen.stamp !== want && chrome.tabs.reload) {
        // The open page is an older package. Rescan would keep its greeting path.
        console.warn('Glance: reloading an open ' + id + ' tab still on ' + seen.stamp);
        try { await chrome.tabs.reload(tab.id); } catch (e) { /* the next navigation picks up the new scripts */ }
        continue;
      }
      if (seen.globals && !seen.alive) {
        // A copy from before an update, cut off from the extension: its declarations block a second copy. Only a reload
        // of that tab clears it.
        console.warn('Glance: an open ' + id + ' tab runs an old copy; reload that tab once');
        if (chrome.tabs.reload) { try { await chrome.tabs.reload(tab.id); } catch (e) { /* left for the person */ } }
        continue;
      }
      if (seen.globals) {
        // A copy from this package is there: ask it to look again rather than declaring everything twice.
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { try { if (globalThis.__glanceOutlookPage) globalThis.__glanceOutlookPage.rescan(); } catch (e) { /* orphaned copy */ } } });
        continue;
      }
      if (script.css && script.css.length) await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: script.css });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: script.js });
      n++;
    } catch (e) {
      console.warn('Glance: could not inject ' + id + ' into an open tab', e && e.message ? e.message : e);
    }
  }
  if (n) console.info('Glance: ' + id + ' injected into ' + n + ' open tab(s)');
  return n;
}

async function readSurfaces() {
  const st = await chrome.storage.local.get({ surfaces: {} });
  return st.surfaces || {};
}

async function enableSurface(id) {
  if (!SURFACES[id]) return { ok: false, reason: 'unknown' };
  const r = await registerSurface(id);
  if (!r.ok) return r;
  const all = await readSurfaces();
  all[id] = { enabled: true, at: Date.now() };
  await chrome.storage.local.set({ surfaces: all });
  return { ok: true };
}

async function disableSurface(id) {
  if (!SURFACES[id]) return { ok: false, reason: 'unknown' };
  try { await chrome.scripting.unregisterContentScripts({ ids: ['flow-' + id] }); } catch (e) { /* already gone */ }
  try { await chrome.permissions.remove({ origins: SURFACES[id].origins }); } catch (e) { /* the browser may refuse; the scripts are gone either way */ }
  const all = await readSurfaces();
  all[id] = { enabled: false, at: Date.now() };
  await chrome.storage.local.set({ surfaces: all });
  const h = (await chrome.storage.local.get({ surfaceHealth: {} })).surfaceHealth || {};
  delete h[id];
  await chrome.storage.local.set({ surfaceHealth: h });
  return { ok: true };
}

// Registered scripts do not survive an extension update, and a person can revoke a permission in the browser's own settings.
async function restoreSurfaces() {
  try {
    const all = await readSurfaces();
    for (const id of Object.keys(all)) {
      if (!all[id] || !all[id].enabled || !SURFACES[id]) continue;
      const r = await registerSurface(id);
      if (!r.ok && r.reason === 'no-permission') { all[id] = { enabled: false, at: Date.now(), revoked: true }; await chrome.storage.local.set({ surfaces: all }); }
    }
  } catch (e) { console.error('[Glance] could not restore the apps that were turned on', e); }
}
// Builds from before the one Meta consent registered WhatsApp Web as
// flow-whatsapp when that row was on. That registration can still be in
// the browser after an update, and it would run beside glance-lane-whatsapp.
// One wake-up removes it, only for a profile whose old WhatsApp row was on.
// A missing id is the usual case and is remembered so later wakes do not
// ask again. A profile that never turned that row on is left alone.
const LEGACY_WHATSAPP_SCRIPT = 'flow-whatsapp';
const LEGACY_WHATSAPP_FLAG = 'glanceLegacyWhatsAppCleared';

function legacyWhatsAppAlreadyGone(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  return msg.indexOf('not found') >= 0 || msg.indexOf('does not exist') >= 0 || msg.indexOf('nonexistent') >= 0;
}

async function dropLegacyWhatsApp() {
  if (!chrome.scripting || !chrome.scripting.unregisterContentScripts || !chrome.storage || !chrome.storage.local) return;
  let bag = {};
  try { bag = await chrome.storage.local.get({ [LEGACY_WHATSAPP_FLAG]: false, surfaces: {} }); } catch (e) { return; }
  if (bag[LEGACY_WHATSAPP_FLAG]) return;
  const surfaces = bag.surfaces || {};
  if (!surfaces.whatsapp || !surfaces.whatsapp.enabled) return;
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [LEGACY_WHATSAPP_SCRIPT] });
  } catch (e) {
    if (!legacyWhatsAppAlreadyGone(e)) return;
  }
  try { await chrome.storage.local.set({ [LEGACY_WHATSAPP_FLAG]: true }); } catch (e) { /* the next wake tries again */ }
}

// Chat drafts are registered from the options page. An update keeps the old
// list, and Chrome does not inject into a tab that is already open. When the
// person already allowed the host, register again and inject into that tab.
const LANE_CHAT = [
  {
    id: 'glance-lane-whatsapp',
    origins: ['https://web.whatsapp.com/*'],
    js: ['core/fact-reply.js', 'core/close-chains.js', 'src/chat-draft.js', 'src/chat-compose.js', 'src/chat-lane.js', 'src/whatsapp-parse.js', 'src/content-whatsapp.js', 'src/content-whatsapp-draft.js']
  },
  {
    id: 'glance-lane-messenger',
    origins: [
      'https://www.messenger.com/*',
      'https://messenger.com/*',
      'https://www.facebook.com/messages',
      'https://www.facebook.com/messages/*',
      'https://facebook.com/messages',
      'https://facebook.com/messages/*',
      'https://business.facebook.com/latest/inbox',
      'https://business.facebook.com/latest/inbox/*',
      'https://www.business.facebook.com/latest/inbox',
      'https://www.business.facebook.com/latest/inbox/*'
    ],
    js: ['core/fact-reply.js', 'core/close-chains.js', 'src/chat-draft.js', 'src/chat-compose.js', 'src/chat-lane.js', 'src/lane-draft-store.js', 'src/group-word.js', 'src/messenger-parse.js', 'src/content-messenger.js']
  },
  {
    id: 'glance-lane-instagram',
    origins: [
      'https://www.instagram.com/direct',
      'https://www.instagram.com/direct/*',
      'https://instagram.com/direct',
      'https://instagram.com/direct/*'
    ],
    js: ['core/fact-reply.js', 'core/close-chains.js', 'src/chat-draft.js', 'src/chat-compose.js', 'src/chat-lane.js', 'src/group-word.js', 'src/instagram-parse.js', 'src/content-instagram.js']
  }
];

// The chat task card needs the one shared judge, the step kit and the canonical card, which the lean chat lists do
// not carry. Each chat registration loads the same base the Outlook surface does (minus the Gmail-only pieces and the
// Gmail follow-up scripts), the lane's own files, then the card, so the card file always loads after chat-lane.js.
const CHAT_CARD_SKIP = ['src/follow.js', 'src/chip-peek.js'];
function laneChatScripts(lane) {
  const base = (chrome.runtime.getManifest().content_scripts[0].js || []).filter((f) => GMAIL_ONLY_SCRIPTS.indexOf(f) < 0 && CHAT_CARD_SKIP.indexOf(f) < 0);
  const out = [];
  for (const f of base.concat(lane.js, ['core/day-words.js', 'core/meeting-confirm.js', 'core/teams-meeting.js', 'core/chat-reminder.js', 'core/chat-deadline-ask.js', 'core/chat-callback-ask.js', 'core/chat-payment-ask.js', 'core/chat-appointment-notice.js', 'core/chat-pickup-notice.js', 'core/chat-travel-notice.js', 'core/chat-delivery-window.js', 'core/chat-payment-claim.js', 'core/chat-sent-claim.js', 'core/chat-chase.js', 'core/chat-invitation-notice.js', 'core/chat-self-note.js', 'src/chip-host.js', 'src/chat-task-card.js'])) if (out.indexOf(f) < 0) out.push(f);
  return out;
}
const LANE_CHAT_CSS = ['design/step-states-v1/scoped.css', 'src/chip.css'];
globalThis.__glanceLaneChatScripts = laneChatScripts;
globalThis.__glanceLaneChatDefs = LANE_CHAT;

async function clearLaneChats() {
  if (!chrome.scripting || !chrome.scripting.unregisterContentScripts) return;
  for (const lane of LANE_CHAT) {
    try { await chrome.scripting.unregisterContentScripts({ ids: [lane.id] }); } catch (e) { /* not registered */ }
  }
}

async function restoreLaneChats() {
  if (!chrome.permissions || !chrome.scripting || !chrome.scripting.registerContentScripts) return;
  const metaOrigins = (typeof FlowMetaConsent !== 'undefined' && Array.isArray(FlowMetaConsent.ORIGINS)) ? FlowMetaConsent.ORIGINS.slice() : [];
  let on = false;
  let known = false;
  try {
    on = metaOrigins.length > 0 && await chrome.permissions.contains({ origins: metaOrigins });
    known = true;
  } catch (e) { on = false; known = false; }
  if (!on) {
    if (known) await clearLaneChats();
    if (chrome.tabs && chrome.tabs.query) {
      const messenger = LANE_CHAT.find((lane) => lane.id === 'glance-lane-messenger');
      const urls = messenger ? messenger.origins.filter((origin) => origin.indexOf('business.facebook.com') >= 0) : [];
      let open = [];
      try { open = urls.length ? await chrome.tabs.query({ url: urls }) : []; } catch (e) { open = []; }
      if (open.length) console.info('[Glance] whyNotShown: messenger-not-granted');
    }
    return;
  }
  for (const lane of LANE_CHAT) {
    try { await chrome.scripting.unregisterContentScripts({ ids: [lane.id] }); } catch (e) { /* not registered yet */ }
    try {
      await chrome.scripting.registerContentScripts([{
        id: lane.id,
        matches: lane.origins,
        js: laneChatScripts(lane),
        css: LANE_CHAT_CSS,
        runAt: 'document_idle',
        persistAcrossSessions: true
      }]);
    } catch (e) {
      console.info('[Glance] whyNotShown: lane-not-registered');
      continue;
    }
    if (!chrome.tabs || !chrome.tabs.query || !chrome.scripting.executeScript) continue;
    let tabs = [];
    try { tabs = await chrome.tabs.query({ url: lane.origins }); } catch (e) { tabs = []; }
    for (const tab of tabs || []) {
      if (!tab || typeof tab.id !== 'number') continue;
      let alive = false;
      try {
        const reply = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => Boolean(window.__glanceLaneChat)
        });
        alive = Array.isArray(reply) && reply.some((row) => row && row.result === true);
      } catch (e) { alive = false; }
      if (alive) continue;
      try {
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: LANE_CHAT_CSS });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: laneChatScripts(lane) });
      }
      catch (e) { console.info('[Glance] whyNotShown: lane-not-injected'); }
    }
  }
}

dropLegacyWhatsApp();
restoreSurfaces();
restoreLaneChats();
chrome.runtime.onInstalled.addListener(() => { dropLegacyWhatsApp(); restoreSurfaces(); restoreLaneChats(); });
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(() => { dropLegacyWhatsApp(); restoreSurfaces(); restoreLaneChats(); });
try {
  if (chrome.permissions && chrome.permissions.onAdded && chrome.permissions.onAdded.addListener) {
    chrome.permissions.onAdded.addListener(() => { restoreLaneChats(); });
  }
  if (chrome.permissions && chrome.permissions.onRemoved && chrome.permissions.onRemoved.addListener) {
    chrome.permissions.onRemoved.addListener(() => { restoreLaneChats(); });
  }
} catch (e) { /* the next wake reads the grant again */ }

async function surfaceStatus() {
  const surfaces = await readSurfaces();
  const health = (await chrome.storage.local.get({ surfaceHealth: {} })).surfaceHealth || {};
  const out = {};
  for (const id of Object.keys(SURFACES)) {
    out[id] = { label: SURFACES[id].label, enabled: Boolean(surfaces[id] && surfaces[id].enabled), revoked: Boolean(surfaces[id] && surfaces[id].revoked), health: health[id] || null, origins: SURFACES[id].origins };
  }
  return { ok: true, surfaces: out };
}

async function noteSurfaceHealth(id, ok, reason) {
  if (!SURFACES[id]) return { ok: false };
  const h = (await chrome.storage.local.get({ surfaceHealth: {} })).surfaceHealth || {};
  h[id] = { ok: Boolean(ok), reason: ok ? null : String(reason || 'unknown').slice(0, 60), at: Date.now() };
  await chrome.storage.local.set({ surfaceHealth: h });
  return { ok: true };
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
  }
  // A fresh install (or an update inheriting a stale badge from a killed
  // service worker) should never show a leftover number before anything has
  // actually been computed — see updateBadge's own comment for why this file
  // never computes the count itself.
  updateBadge(0);
});

/* -------------------------------------------------------- persistent badge */
// The Subtle Persistent Indicator: a small number on the extension icon,
// never a notification, never a popup of its own. Deliberately NOT computed
// here — background.js has never loaded storage.js (see getInstallId's own
// comment below), and re-deriving "how many processes are still open" a
// second way in this file is exactly how two definitions of "pending"
// quietly drift apart, the same failure storage.js's own writeCountsFrom/
// closeCountsFrom comments warn about. Instead, any surface that already
// has FlowStorage loaded — the Gmail content script today, the popup's Open
// tab, a future Calendar or Drive content script — recomputes
// FlowStorage.getPending().length itself and posts it here. This file's only
// job is turning that one number into a badge.
function updateBadge(count) {
  const n = count > 0 ? count : 0;
  chrome.action.setBadgeText({ text: n ? String(Math.min(n, 99)) : '' });
  if (n) chrome.action.setBadgeBackgroundColor({ color: '#123ccb' });
}

// One optional morning OS notification. The text and the count are a
// snapshot the Gmail tab already published (glanceStillOpenDigest). This
// file does not re-rank mail. At most one ping per local day, and none
// when Gmail itself is the active tab — the Brief already opened there.
// Clicking it asks that tab to open the same list. Dismissing it records
// a single "annoying" flag the content script folds into Still Open metrics.
const STILL_OPEN_NOTIFY_ID = 'glance-still-open';
const STILL_OPEN_DIGEST_MAX_AGE = 36 * 60 * 60 * 1000;

function scheduleStillOpenMorning() {
  if (!chrome.alarms || !chrome.alarms.create) return;
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  try {
    const created = chrome.alarms.create('glance-still-open-morning', { when: next.getTime() });
    if (created && created.catch) created.catch((e) => console.error('[Glance] could not schedule the morning list', e));
  } catch (e) {
    console.error('[Glance] could not schedule the morning list', e);
  }
}

function stillOpenNotificationClick() {
  chrome.storage.local.set({ glanceStillOpenOpenBrief: true });
  const openInbox = () => {
    if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url: 'https://mail.google.com/mail/u/0/#inbox' });
  };
  if (!chrome.tabs || !chrome.tabs.query) { openInbox(); return; }
  chrome.tabs.query({ url: 'https://mail.google.com/*' }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) { openInbox(); return; }
    chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId != null && chrome.windows && chrome.windows.update) {
      chrome.windows.update(tab.windowId, { focused: true });
    }
    if (chrome.tabs.sendMessage) {
      chrome.tabs.sendMessage(tab.id, { type: 'flow:still-open-show' }, () => {
        if (chrome.runtime.lastError) { /* the storage flag opens the list on the next load */ }
      });
    }
  });
}

async function maybeNotifyStillOpen() {
  if (!chrome.notifications || !chrome.notifications.create || !chrome.storage || !chrome.tabs) return;
  const data = await chrome.storage.local.get(['glanceStillOpenDigest', 'glanceStillOpenNotifiedDate']);
  const digest = data.glanceStillOpenDigest;
  if (!digest || !digest.count || !digest.text) return;
  if (Date.now() - (digest.updatedAt || 0) > STILL_OPEN_DIGEST_MAX_AGE) return;
  const today = new Date().toDateString();
  if (data.glanceStillOpenNotifiedDate === today) return;
  const active = await chrome.tabs.query({ active: true, url: 'https://mail.google.com/*' });
  if (active && active.length) return;
  await chrome.storage.local.set({ glanceStillOpenNotifiedDate: today });
  chrome.notifications.create(STILL_OPEN_NOTIFY_ID, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'Glance',
    message: String(digest.text)
  });
}

try {
  scheduleStillOpenMorning();
  if (chrome.alarms && chrome.alarms.onAlarm) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (!alarm || alarm.name !== 'glance-still-open-morning') return;
      scheduleStillOpenMorning();
      maybeNotifyStillOpen().catch((e) => console.error('[Glance] morning notification failed', e));
    });
  }
  if (chrome.notifications && chrome.notifications.onClicked) {
    chrome.notifications.onClicked.addListener((id) => {
      if (id !== STILL_OPEN_NOTIFY_ID) return;
      stillOpenNotificationClick();
    });
  }
  if (chrome.notifications && chrome.notifications.onClosed) {
    chrome.notifications.onClosed.addListener((id, byUser) => {
      if (id !== STILL_OPEN_NOTIFY_ID || !byUser) return;
      chrome.storage.local.set({ glanceStillOpenNotifyDismissed: Date.now() });
    });
  }
} catch (e) {
  console.error('[Glance] morning Still Open notification is unavailable', e);
}

/* ------------------------------------------------------------------ shared */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// judgment.js's evaluate()/factsOnly() both compute a human-readable
// f.dateText onto the facts object they return (via a private humanDate()
// helper) — but intent.js's `facts` is extract.js's raw output re-exposed
// as-is, which never carries that field. Rather than require every future
// caller to remember to pre-populate dateText, factLines() falls back to
// computing the same "Mon D" / "Mon D, YYYY" shape itself. This duplicates
// intent.js's own humanDateFallback() — same justification intent.js gives
// for duplicating judgment.js's private humanDate(): kept in sync by being
// this small.
function humanDateFallback(date) {
  if (!date || !date.iso) return date ? date.raw : null;
  const parts = date.iso.split('-');
  const dt = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  return months[dt.getMonth()] + ' ' + dt.getDate() + (sameYear ? '' : ' ' + dt.getFullYear());
}

// Longest a quoted sentence gets before the record itself becomes harder to
// scan than the email it's standing in for — same spirit as the 200-char
// title caps elsewhere in this file, just roomier since this is a notes
// field, not a title.
const QUOTE_MAX_CHARS = 400;

// The lines a human would want to see on the record six months from now.
// Amount/Date/From/Subject/link answer "what kind of thing is this and
// where did it come from" — none of them are the actual substance of what
// was decided. That's entities.what/requestWhat (intent.js's classify()
// output) — the literal sentence Do It was proposed for. Notion's write
// path already includes this as its own "Quote" field (see
// product-architecture.md's worked examples); Google Tasks never did,
// because buildActionPayload() in content-gmail.js never forwarded
// `entities` to this write path at all — only `facts`. A task with a
// title and a date but no quote answers "when" and "how much" while
// leaving out "what was actually said," which is the one thing that makes
// the record readable without reopening Gmail.
function factLines(p) {
  const f = p.facts || {};
  const out = [];
  if (f.moneyText) out.push(['Amount', f.moneyText]);
  const dateText = f.dateText || humanDateFallback(f.date);
  if (dateText) out.push(['Date', dateText + (f.date && f.date.iso && f.date.iso !== dateText ? ' (' + f.date.iso + ')' : '')]);
  if (p.senderName || p.senderEmail) out.push(['From', [p.senderName, p.senderEmail && '<' + p.senderEmail + '>'].filter(Boolean).join(' ')]);
  if (p.subject) out.push(['Subject', p.subject]);
  const e = p.entities || {};
  const quote = e.what || e.requestWhat;
  if (quote) {
    const trimmed = quote.length > QUOTE_MAX_CHARS ? quote.slice(0, QUOTE_MAX_CHARS - 1) + '…' : quote;
    out.push(['Quote', '"' + trimmed + '"']);
  }
  return out;
}

// chrome.identity.launchWebAuthFlow already limits the callback to this
// extension's own redirect URL, but that alone doesn't tie a specific
// callback to the specific request that opened it. A stale authorization
// code sitting in browser history, or a redirect crafted by anything other
// than the provider's real consent screen, would otherwise be indistinguishable
// from a legitimate one. The unpredictable value below has to round-trip
// unchanged for the callback to be trusted — the standard OAuth defense for
// exactly this gap (RFC 6749 §10.12), and previously missing on all four of
// these connectors.
function randomOAuthState() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Runs one OAuth authorization-code handshake and returns the verified code.
// Centralized so the state round-trip is identical across all four OAuth
// connectors instead of being copy-pasted (and easy to silently omit) four
// separate times.
async function runOAuthFlow(authUrlBase, providerName) {
  const state = randomOAuthState();
  const resultUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrlBase + '&state=' + encodeURIComponent(state),
    interactive: true
  });
  const params = new URL(resultUrl).searchParams;
  if (params.get('state') !== state) {
    throw new Error(providerName + ' authorization could not be verified. Please try connecting again.');
  }
  const code = params.get('code');
  if (!code) throw new Error(providerName + ' did not return an authorization code.');
  return code;
}

/* ----------------------------------------------------------------- HubSpot */

async function getHubspotAuth() {
  const { hubspotAuth } = await chrome.storage.local.get('hubspotAuth');
  return hubspotAuth || null;
}

async function saveHubspotAuth(tokenResponse, extra) {
  const prev = (await getHubspotAuth()) || {};
  await chrome.storage.local.set({
    hubspotAuth: Object.assign({}, prev, {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at: Date.now() + tokenResponse.expires_in * 1000 - 60000 // 60s safety margin
    }, extra || {})
  });
}

// The portal id turns a bare contact id into a link somebody can actually click.
async function hubspotPortalId(token) {
  try {
    const res = await fetch(HUBSPOT_API + '/oauth/v1/access-tokens/' + encodeURIComponent(token));
    if (!res.ok) return null;
    const data = await res.json();
    return data.hub_id || null;
  } catch (e) {
    return null;
  }
}

async function connectHubspot() {
  if (!HUBSPOT_CLIENT_ID) {
    throw new Error('HubSpot isn’t configured on this build yet — it needs a Client ID set by whoever built this extension.');
  }
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    HUBSPOT_AUTH_BASE +
    '?client_id=' + encodeURIComponent(HUBSPOT_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&scope=' + encodeURIComponent(HUBSPOT_SCOPES);

  const code = await runOAuthFlow(authUrl, 'HubSpot');

  const res = await fetch(EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'HubSpot connection failed.');
  const portalId = await hubspotPortalId(data.access_token);
  await saveHubspotAuth(data, { portalId });
  return true;
}

async function hubspotToken() {
  const auth = await getHubspotAuth();
  if (!auth) return null;
  if (Date.now() < auth.expires_at) return auth.access_token;

  const res = await fetch(REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: auth.refresh_token })
  });
  const data = await res.json();
  if (!res.ok) return null; // refresh failed — caller treats this as "not connected"
  await saveHubspotAuth(data);
  return data.access_token;
}

async function hubspotFindContactByEmail(token, email) {
  const res = await fetch(
    HUBSPOT_API + '/crm/v3/objects/contacts/' + encodeURIComponent(email) + '?idProperty=email',
    { headers: { Authorization: 'Bearer ' + token } }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('HubSpot contact lookup failed: ' + res.status);
  return res.json();
}

function hubspotNoteBody(p) {
  const rows = factLines(p).map((r) => '<li><b>' + esc(r[0]) + ':</b> ' + esc(r[1]) + '</li>').join('');
  return [
    '<p><b>' + esc(p.label) + '</b></p>',
    rows ? '<ul>' + rows + '</ul>' : '',
    p.facts && p.facts.quote ? '<blockquote>' + esc(p.facts.quote) + '</blockquote>' : '',
    p.threadUrl ? '<p><a href="' + esc(p.threadUrl) + '">Open the original email in Gmail</a></p>' : '',
    '<p><i>Logged by <a href="' + attributionUrl('hubspot') + '">Glance</a> — one click, from the message itself.</i></p>'
  ].filter(Boolean).join('');
}

// Deliberately conservative: it only ever logs a Note on an EXISTING matching
// Contact. It never creates a Contact, never edits a deal, never sends anything.
async function hubspotWrite(p) {
  const token = await hubspotToken();
  if (!token) return { ok: false, reason: 'not-connected' };
  if (!p.senderEmail) return { ok: false, reason: 'no-matching-contact' };

  const contact = await hubspotFindContactByEmail(token, p.senderEmail);
  if (!contact) return { ok: false, reason: 'no-matching-contact', senderEmail: p.senderEmail };

  const res = await fetch(HUBSPOT_API + '/crm/v3/objects/notes', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { hs_note_body: hubspotNoteBody(p), hs_timestamp: Date.now() },
      associations: [{
        to: { id: contact.id },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: NOTE_TO_CONTACT_ASSOCIATION_TYPE_ID }]
      }]
    })
  });
  if (!res.ok) throw new Error('HubSpot note creation failed: ' + res.status);
  const note = await res.json();

  const auth = await getHubspotAuth();
  const url = auth && auth.portalId
    ? 'https://app.hubspot.com/contacts/' + auth.portalId + '/contact/' + contact.id
    : null;

  return { ok: true, where: 'HubSpot', target: 'the contact record', ref: { noteId: note.id }, url };
}

async function hubspotUndo(ref) {
  const token = await hubspotToken();
  if (!token || !ref || !ref.noteId) return { ok: false };
  const res = await fetch(HUBSPOT_API + '/crm/v3/objects/notes/' + encodeURIComponent(ref.noteId), {
    method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
  });
  return { ok: res.ok || res.status === 404 };
}

/* -------------------------------------------------------------- Salesforce */

async function getSalesforceAuth() {
  const { salesforceAuth } = await chrome.storage.local.get('salesforceAuth');
  return salesforceAuth || null;
}

async function saveSalesforceAuth(tokenResponse, extra) {
  const prev = (await getSalesforceAuth()) || {};
  await chrome.storage.local.set({
    salesforceAuth: Object.assign({}, prev, {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token || prev.refresh_token,
      instance_url: tokenResponse.instance_url || prev.instance_url
      // Salesforce doesn't return expires_in — access tokens are valid until
      // revoked or the org's session-timeout policy ends them. Refresh
      // reactively on a 401 instead of tracking an expiry we're never told.
    }, extra || {})
  });
}

async function connectSalesforce() {
  if (!SALESFORCE_CLIENT_ID) {
    throw new Error('Salesforce isn’t configured on this build yet — it needs a Consumer Key set by whoever built this extension.');
  }
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    SALESFORCE_AUTH_BASE +
    '?response_type=code&client_id=' + encodeURIComponent(SALESFORCE_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&scope=' + encodeURIComponent(SALESFORCE_SCOPES);

  const code = await runOAuthFlow(authUrl, 'Salesforce');

  const res = await fetch(SF_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Salesforce connection failed.');
  await saveSalesforceAuth(data);
  return true;
}

async function salesforceRefresh() {
  const auth = await getSalesforceAuth();
  if (!auth || !auth.refresh_token) return null;
  const res = await fetch(SF_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: auth.refresh_token })
  });
  const data = await res.json();
  if (!res.ok) return null; // refresh failed — caller treats this as "not connected"
  await saveSalesforceAuth(data);
  return getSalesforceAuth();
}

// SOQL's escape character is backslash, so a literal backslash must be
// escaped to \\ BEFORE a literal quote is escaped to \' — escaping in the
// other order (the previous code only escaped quotes, which is order-of-one)
// lets an address containing a backslash immediately before a quote produce
// an unescaped quote that closes the string literal early. senderEmail comes
// straight off Gmail's DOM (content-gmail.js reads the `email` attribute
// Gmail itself sets), so it isn't something this file should treat as
// pre-sanitized. Escaping backslash first, as done here, closes that gap
// without rejecting the (rare but legal) apostrophe in an address's local
// part, e.g. o'brien@example.com.
function soqlEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function salesforceFindContactByEmail(auth, email) {
  const soql = "SELECT Id FROM Contact WHERE Email = '" + soqlEscape(email) + "' LIMIT 1";
  const res = await fetch(
    auth.instance_url + '/services/data/' + SALESFORCE_API_VERSION + '/query?q=' + encodeURIComponent(soql),
    { headers: { Authorization: 'Bearer ' + auth.access_token } }
  );
  if (res.status === 401) return 'expired';
  if (!res.ok) throw new Error('Salesforce contact lookup failed: ' + res.status);
  const data = await res.json();
  return (data.records && data.records[0]) || null;
}

function salesforceTaskDescription(p) {
  const lines = factLines(p).map((r) => r[0] + ': ' + r[1]);
  if (p.facts && p.facts.quote) lines.push('"' + p.facts.quote + '"');
  if (p.threadUrl) lines.push('Original email: ' + p.threadUrl);
  lines.push(ATTRIBUTION_TEXT + ' — ' + attributionUrl('salesforce'));
  return lines.join('\n');
}

// Deliberately conservative, same shape as HubSpot: only ever logs a Task on
// an EXISTING matching Contact. Never creates a Contact, never edits a deal.
async function salesforceWrite(p) {
  let auth = await getSalesforceAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };
  if (!p.senderEmail) return { ok: false, reason: 'no-matching-contact' };

  let contact = await salesforceFindContactByEmail(auth, p.senderEmail);
  if (contact === 'expired') {
    auth = await salesforceRefresh();
    if (!auth) return { ok: false, reason: 'not-connected' };
    contact = await salesforceFindContactByEmail(auth, p.senderEmail);
  }
  if (!contact) return { ok: false, reason: 'no-matching-contact', senderEmail: p.senderEmail };

  const res = await fetch(auth.instance_url + '/services/data/' + SALESFORCE_API_VERSION + '/sobjects/Task/', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      WhoId: contact.Id,
      Subject: p.label,
      Description: salesforceTaskDescription(p),
      Status: 'Completed',
      ActivityDate: new Date().toISOString().slice(0, 10)
    })
  });
  if (!res.ok) throw new Error('Salesforce task creation failed: ' + res.status);
  const task = await res.json();

  return {
    ok: true,
    where: 'Salesforce',
    target: 'the contact record',
    ref: { taskId: task.id },
    url: auth.instance_url + '/lightning/r/Contact/' + contact.Id + '/view'
  };
}

async function salesforceUndo(ref) {
  const auth = await getSalesforceAuth();
  if (!auth || !ref || !ref.taskId) return { ok: false };
  const res = await fetch(
    auth.instance_url + '/services/data/' + SALESFORCE_API_VERSION + '/sobjects/Task/' + encodeURIComponent(ref.taskId),
    { method: 'DELETE', headers: { Authorization: 'Bearer ' + auth.access_token } }
  );
  return { ok: res.ok || res.status === 404 };
}

/* ------------------------------------------------------------------- Slack */

async function getSlackAuth() {
  const { slackAuth } = await chrome.storage.local.get('slackAuth');
  return slackAuth || null;
}

async function connectSlack(channel) {
  if (!SLACK_CLIENT_ID) {
    throw new Error('Slack isn’t configured on this build yet — it needs a Client ID set by whoever built this extension.');
  }
  const channelId = String(channel || '').trim();
  if (!channelId) {
    throw new Error('Paste the channel ID Glance should post to — open the channel in Slack, "View channel details", it’s at the bottom.');
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    SLACK_AUTH_BASE +
    '?client_id=' + encodeURIComponent(SLACK_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&scope=' + encodeURIComponent(SLACK_SCOPES);

  const code = await runOAuthFlow(authUrl, 'Slack');

  const res = await fetch(SLACK_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri })
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error((data && data.error) || 'Slack connection failed.');

  await chrome.storage.local.set({
    slackAuth: { access_token: data.access_token, teamName: data.team && data.team.name, channelId }
  });
  return { title: (data.team && data.team.name ? data.team.name + ' ' : '') + '#' + channelId };
}

function slackMessageText(p) {
  const lines = factLines(p).map((r) => '*' + r[0] + ':* ' + r[1]);
  const parts = ['*' + p.label + '*'].concat(lines);
  if (p.facts && p.facts.quote) parts.push('> ' + p.facts.quote);
  if (p.threadUrl) parts.push('<' + p.threadUrl + '|Open the original email in Gmail>');
  parts.push('_<' + attributionUrl('slack') + '|Logged by Glance> — one click, from the message itself._');
  return parts.join('\n');
}

async function slackWrite(p) {
  const auth = await getSlackAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };

  const res = await fetch(SLACK_API + '/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: auth.channelId, text: slackMessageText(p), unfurl_links: false })
  });
  const data = await res.json();
  if (!data.ok) {
    if (data.error === 'invalid_auth' || data.error === 'token_revoked') return { ok: false, reason: 'not-connected' };
    throw new Error('Slack post failed: ' + data.error);
  }
  return { ok: true, where: 'Slack', target: '#' + auth.channelId, ref: { channel: data.channel, ts: data.ts }, url: null };
}

async function slackUndo(ref) {
  const auth = await getSlackAuth();
  if (!auth || !ref || !ref.ts) return { ok: false };
  const res = await fetch(SLACK_API + '/chat.delete', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: ref.channel, ts: ref.ts })
  });
  const data = await res.json();
  return { ok: Boolean(data.ok) };
}

/* --------------------------------------------------------------- Monday.com */

async function getMondayAuth() {
  const { mondayAuth } = await chrome.storage.local.get('mondayAuth');
  return mondayAuth || null;
}

async function saveMondayAuth(tokenResponse, extra) {
  const prev = (await getMondayAuth()) || {};
  await chrome.storage.local.set({
    mondayAuth: Object.assign({}, prev, {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token || prev.refresh_token
    }, extra || {})
  });
}

async function connectMonday(boardId) {
  if (!MONDAY_CLIENT_ID) {
    throw new Error('Monday.com isn’t configured on this build yet — it needs a Client ID set by whoever built this extension.');
  }
  const board = String(boardId || '').trim();
  if (!board) {
    throw new Error('Paste the board ID Glance should write to — open the board in Monday.com, it’s the number in the URL after /boards/.');
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl =
    MONDAY_AUTH_BASE +
    '?client_id=' + encodeURIComponent(MONDAY_CLIENT_ID) +
    '&redirect_uri=' + encodeURIComponent(redirectUri);
  // Monday.com's OAuth scopes are configured on the app itself in the developer
  // console rather than requested via URL parameter (unlike HubSpot/Salesforce/
  // Slack above) — deliberately not adding a &scope= here, since guessing at
  // one would misrepresent what this connector actually requests.

  const code = await runOAuthFlow(authUrl, 'Monday.com');

  const res = await fetch(MONDAY_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirect_uri: redirectUri })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Monday.com connection failed.');
  await saveMondayAuth(data, { boardId: board });
  return true;
}

// Monday's API v2 takes the token directly as the Authorization header value
// (no "Bearer " prefix) for both personal tokens and OAuth access tokens —
// a genuine quirk of their API, not a typo.
async function mondayGraphQL(token, query, variables) {
  const res = await fetch(MONDAY_API, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const data = await res.json();
  if (data.errors) throw new Error((data.errors[0] && data.errors[0].message) || 'Monday.com API error');
  return data.data;
}

function mondayUpdateBody(p) {
  const lines = factLines(p).map((r) => r[0] + ': ' + r[1]);
  if (p.facts && p.facts.quote) lines.push('"' + p.facts.quote + '"');
  if (p.threadUrl) lines.push('Original email: ' + p.threadUrl);
  lines.push(ATTRIBUTION_TEXT + ' — ' + attributionUrl('monday'));
  return lines.join('\n');
}

// Deliberately simple, for the same reason Notion writes unmatched facts to
// the page body instead of guessing at columns: one new item named after the
// decision, with the facts attached as an Update (Monday's version of a
// comment/note) rather than matched into board-specific column schema.
async function mondayWrite(p) {
  const auth = await getMondayAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };

  let item;
  try {
    const created = await mondayGraphQL(
      auth.access_token,
      'mutation($board: ID!, $name: String!) { create_item(board_id: $board, item_name: $name) { id } }',
      { board: auth.boardId, name: p.label }
    );
    item = created.create_item;
  } catch (err) {
    if (/invalid|unauthoriz/i.test(String(err.message))) return { ok: false, reason: 'not-connected' };
    throw err;
  }

  await mondayGraphQL(
    auth.access_token,
    'mutation($item: ID!, $body: String!) { create_update(item_id: $item, body: $body) { id } }',
    { item: item.id, body: mondayUpdateBody(p) }
  );

  return { ok: true, where: 'Monday.com', target: 'the board', ref: { itemId: item.id }, url: 'https://view.monday.com/' + item.id };
}

async function mondayUndo(ref) {
  const auth = await getMondayAuth();
  if (!auth || !ref || !ref.itemId) return { ok: false };
  try {
    await mondayGraphQL(auth.access_token, 'mutation($item: ID!) { delete_item(item_id: $item) { id } }', { item: ref.itemId });
    return { ok: true };
  } catch (err) {
    return { ok: false };
  }
}

/* ------------------------------------------------------------ Google Tasks */
//
// The MVP write path: no token to paste. chrome.identity.getAuthToken is
// primary — Chrome's own Google account chooser against the Chrome-extension
// client in manifest.json's oauth2 key. When that call fails because browser
// sign-in is off, or Chrome's identity API is unavailable and the user did
// not cancel, launchWebAuthFlow runs the implicit grant against
// WEB_OAUTH_CLIENT_ID (one Web client, both extension IDs). No client secret
// and no token endpoint: Google web clients need a secret to redeem an
// authorization code, and this service worker does not have one.

const GOOGLE_WEB_CLIENT_ID = publicClientId(WEB_OAUTH_CLIENT_ID);
let googleWebAuthInteractiveFlight = null;
// Bumped on Disconnect so a consent window that is already open cannot
// save googleWebAuth after the user has cleared it. The write chain keeps
// that save and the clear from interleaving.
let googleWebAuthEpoch = 0;
let googleWebAuthWriteChain = Promise.resolve();

function enqueueGoogleWebAuthWrite(task) {
  const run = googleWebAuthWriteChain.then(task, task);
  googleWebAuthWriteChain = run.then(() => {}, () => {});
  return run;
}

function invalidateGoogleWebAuthFlight() {
  googleWebAuthEpoch += 1;
  googleWebAuthInteractiveFlight = null;
}

// A Gmail content-script flow:connect is ensureGoogleAutoConnect and must
// not open a window. The side panel and the popup have no tab. The popup
// opened as a normal tab does have one, and it is still our page, so Connect
// may open a window. A web page, or a sender from another extension, may not.
function googleConnectWantsInteractive(sender) {
  if (!sender || !sender.tab) return true;
  const runtimeId = chrome.runtime && chrome.runtime.id;
  const url = typeof sender.url === 'string' ? sender.url : '';
  if (!runtimeId || sender.id !== runtimeId) return false;
  return url.indexOf('chrome-extension://' + runtimeId + '/') === 0;
}

function googleTasksConfigured() {
  const oauth2 = chrome.runtime.getManifest().oauth2;
  return Boolean(oauth2 && oauth2.client_id && oauth2.client_id !== GOOGLE_TASKS_CLIENT_ID_PLACEHOLDER);
}

// Callback-based even inside an MV3 service worker — there is no Promise
// form of this specific identity method.
//
// Headless regression only. The suite sets globalThis.__glanceE2e.googleAuthToken
// inside this worker because chrome.identity cannot be replaced there.
// Production never sets __glanceE2e, so the Chrome call below is unchanged.
function glanceE2eGoogleAuth(interactive) {
  const e2e = globalThis.__glanceE2e;
  if (!e2e || typeof e2e.googleAuthToken !== 'function') return null;
  return e2e.googleAuthToken(Boolean(interactive));
}

// Headless regression only. A local mock server sets httpOrigin. Production
// never sets __glanceE2e, so the URL below is unchanged.
function glanceE2eRewrite(url) {
  const e2e = globalThis.__glanceE2e;
  const origin = e2e && typeof e2e.httpOrigin === 'string' ? e2e.httpOrigin : '';
  if (!origin || !url) return url;
  try {
    const u = new URL(url);
    const base = new URL(origin);
    return base.origin + u.pathname + u.search;
  } catch (e) {
    return url;
  }
}

function getGoogleAuthToken(interactive) {
  const hooked = glanceE2eGoogleAuth(interactive);
  if (hooked && typeof hooked.then === 'function') return hooked;
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: Boolean(interactive) }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error((chrome.runtime.lastError && chrome.runtime.lastError.message) || 'Google sign-in was closed or denied.'));
        return;
      }
      resolve(token);
    });
  });
}

function removeCachedGoogleAuthToken(token) {
  const e2e = globalThis.__glanceE2e;
  if (e2e && e2e.installed === true) {
    e2e.authCalls = e2e.authCalls || [];
    e2e.authCalls.push({ removeCached: true, at: Date.now() });
    return Promise.resolve();
  }
  return new Promise((resolve) => chrome.identity.removeCachedAuthToken({ token }, resolve));
}

// Headless regression only. chrome.identity.launchWebAuthFlow cannot be
// replaced inside the service worker, the same reason getAuthToken goes
// through glanceE2eGoogleAuth. Production never sets __glanceE2e.
function glanceE2eWebAuthFlow(details) {
  const e2e = globalThis.__glanceE2e;
  if (!e2e || typeof e2e.launchWebAuthFlow !== 'function') return null;
  return e2e.launchWebAuthFlow(details);
}

function launchGoogleWebAuthFlow(details) {
  const hooked = glanceE2eWebAuthFlow(details);
  if (hooked && typeof hooked.then === 'function') return hooked;
  return new Promise((resolve, reject) => {
    try {
      chrome.identity.launchWebAuthFlow(details, (responseUrl) => {
        const err = chrome.runtime.lastError;
        if (err || !responseUrl) {
          reject(new Error((err && err.message) || 'Google sign-in was closed or denied.'));
          return;
        }
        resolve(responseUrl);
      });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function googleManifestScopes() {
  const oauth2 = chrome.runtime.getManifest().oauth2;
  return googleOAuthScopesFrom(oauth2 && oauth2.scopes);
}

async function readGoogleWebAuth() {
  const stored = await chrome.storage.local.get(GOOGLE_WEB_AUTH_STORAGE_KEY);
  return stored[GOOGLE_WEB_AUTH_STORAGE_KEY] || null;
}

async function clearGoogleWebAuth() {
  await chrome.storage.local.remove(GOOGLE_WEB_AUTH_STORAGE_KEY);
}

function googleWebRedirectUri() {
  const identity = chrome.identity;
  if (identity && typeof identity.getRedirectURL === 'function') {
    try {
      const url = identity.getRedirectURL();
      if (url) return url;
    } catch (e) { /* fall through to the hand-built chromiumapp origin */ }
  }
  return googleRedirectUriForExtension(chrome.runtime && chrome.runtime.id);
}

async function commitGoogleWebAuth(record, epoch) {
  return enqueueGoogleWebAuthWrite(async () => {
    if (epoch !== googleWebAuthEpoch) return false;
    await chrome.storage.local.set({ [GOOGLE_WEB_AUTH_STORAGE_KEY]: record });
    if (epoch !== googleWebAuthEpoch) {
      const stored = await readGoogleWebAuth();
      if (stored && stored.accessToken === record.accessToken) await clearGoogleWebAuth();
      return false;
    }
    return true;
  });
}

async function runGoogleWebAuth(interactive) {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error('Glance’s backup Google sign-in isn’t configured on this build yet.');
  }
  const epoch = googleWebAuthEpoch;
  const redirectUri = googleWebRedirectUri();
  if (!redirectUri) throw new Error('Glance could not determine this extension’s redirect address.');
  const state = randomOAuthState();
  const hint = await googleLoginHint();
  const url = googleImplicitAuthUrl({
    clientId: GOOGLE_WEB_CLIENT_ID,
    redirectUri,
    scopes: googleManifestScopes(),
    state,
    prompt: interactive ? 'select_account' : 'none',
    loginHint: hint
  });
  const resultUrl = await launchGoogleWebAuthFlow({ url, interactive: Boolean(interactive) });
  if (epoch !== googleWebAuthEpoch) throw new Error('Google sign-in was closed or denied.');
  const parsed = parseGoogleImplicitRedirect(resultUrl, state);
  const record = { accessToken: parsed.accessToken, source: 'web', obtainedAt: Date.now() };
  if (parsed.expiresIn) record.expiresAt = Date.now() + parsed.expiresIn * 1000;
  const keptHint = parsed.email || hint;
  if (keptHint) record.loginHint = keptHint;
  const committed = await commitGoogleWebAuth(record, epoch);
  if (!committed) throw new Error('Google sign-in was closed or denied.');
  return record;
}

// Stored web-flow token when it is still inside its expiry. A lapsed token
// tries a silent prompt=none grant. The interactive window runs only when
// the caller passed interactive — an explicit Connect. A silent caller
// with nothing to reuse fails instead of opening that window.
async function getGoogleWebAccessToken(interactive) {
  const existing = await readGoogleWebAuth();
  if (webTokenUsable(existing)) return { token: existing.accessToken, source: 'web' };
  const hadToken = Boolean(existing && existing.accessToken);
  if (hadToken) await clearGoogleWebAuth();
  if (hadToken) {
    try {
      const silent = await runGoogleWebAuth(false);
      return { token: silent.accessToken, source: 'web' };
    } catch (silentErr) {
      if (!interactive) throw silentErr;
    }
  }
  if (!interactive) throw new Error('Google sign-in needs you to connect again.');
  if (!googleWebAuthInteractiveFlight) {
    let flight;
    flight = runGoogleWebAuth(true).finally(() => {
      if (googleWebAuthInteractiveFlight === flight) googleWebAuthInteractiveFlight = null;
    });
    googleWebAuthInteractiveFlight = flight;
  }
  const saved = await googleWebAuthInteractiveFlight;
  return { token: saved.accessToken, source: 'web' };
}

// getAuthToken first. The web flow runs only after a non-cancel failure.
// openid and userinfo.profile sit on that same consent (Instinct R1). There
// is no second prompt. given_name, family_name, and name from userinfo are
// written onto glanceOwnNames. A refusal leaves the name list as it is.
let googleNamesFilled = false;
let googleProfileFlight = null;
let googleScopeUpgradeFlight = null;
function namesFromGoogleUserinfo(info) {
  const out = [];
  function add(raw) {
    const name = String(raw || '').trim();
    if (!name || name.toLowerCase() === 'me') return;
    if (out.some((n) => n.toLowerCase() === name.toLowerCase())) return;
    out.push(name);
  }
  const src = info || {};
  const given = String(src.given_name || src.givenName || '').trim();
  const family = String(src.family_name || src.familyName || src.surname || '').trim();
  add(src.name || src.displayName);
  add(given);
  add(family);
  if (given && family) add(given + ' ' + family);
  return out;
}
function sameTextList(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (String(a[i]) !== String(b[i])) return false;
  }
  return true;
}
function sameGoogleProfile(a, b) {
  const left = a || {};
  const right = b || {};
  return (left.displayName || null) === (right.displayName || null)
    && (left.givenName || null) === (right.givenName || null)
    && (left.surname || null) === (right.surname || null)
    && (left.email || null) === (right.email || null);
}
function rememberGoogleProfile(token) {
  if (!token || googleNamesFilled) return Promise.resolve();
  if (googleProfileFlight) return googleProfileFlight;
  googleProfileFlight = (async () => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: 'Bearer ' + token }
      });
      if (!res.ok) return;
      const info = await res.json();
      const names = namesFromGoogleUserinfo(info);
      if (!names.length) return;
      const profile = {
        displayName: info.name || null,
        givenName: info.given_name || null,
        surname: info.family_name || null
      };
      const userEmail = String((info && info.email) || '').trim();
      if (userEmail.indexOf('@') > 0) profile.email = userEmail;
      const bag = await chrome.storage.local.get({ glanceOwnNames: [], googleProfile: null });
      const prev = Array.isArray(bag.glanceOwnNames) ? bag.glanceOwnNames : [];
      const merged = prev.slice();
      names.forEach((name) => {
        if (!merged.some((n) => String(n).toLowerCase() === name.toLowerCase())) merged.push(name);
      });
      const patch = {};
      if (!sameTextList(prev, merged)) patch.glanceOwnNames = merged;
      if (!sameGoogleProfile(bag.googleProfile, profile)) patch.googleProfile = profile;
      if (Object.keys(patch).length) await chrome.storage.local.set(patch);
      googleNamesFilled = true;
    } catch (e) { /* userinfo refused; the greeting stays on the names already stored */ }
    finally { googleProfileFlight = null; }
  })();
  return googleProfileFlight;
}

async function readGoogleGrantedScopes() {
  const bag = await chrome.storage.local.get(GOOGLE_GRANTED_SCOPES_KEY);
  return bag[GOOGLE_GRANTED_SCOPES_KEY] || null;
}

async function writeGoogleGrantedScopes(status, source) {
  await chrome.storage.local.set({
    [GOOGLE_GRANTED_SCOPES_KEY]: {
      version: scopeVersion(googleManifestScopes()),
      status: status,
      source: source || null,
      at: Date.now()
    }
  });
}

// One shared ask. Drops the cached Chrome token and the stored web token,
// then getAuthToken({ interactive: true }) once. A non-cancel failure uses
// the web-auth window once. A cancel is remembered so a silent caller does
// not ask again.
async function upgradeGoogleScopesOnce() {
  if (!googleScopeUpgradeFlight) {
    let flight;
    flight = (async () => {
      await clearCachedChromeGoogleTokens();
      await clearGoogleWebAuth();
      try {
        const token = await getGoogleAuthToken(true);
        await writeGoogleGrantedScopes('granted', 'chrome');
        // The chooser token lives in Chrome's cache, which this function
        // just cleared. A later silent getAuthToken does not see it, and
        // the stored web token was deleted above. Keep this token and
        // clear Reconnect now, before the task-list call.
        await recordGoogleConsent(token, 'chrome');
        const kept = await rememberUpgradedGoogleToken(token, 'chrome');
        if (!kept) throw new Error('Google sign-in was closed or denied.');
        return { token: token, source: 'chrome' };
      } catch (err) {
        const message = err && err.message;
        if (!shouldFallbackFromGetAuthToken(message, { interactive: true })) {
          await writeGoogleGrantedScopes('asked', 'chrome');
          throw err;
        }
        try {
          const saved = await runGoogleWebAuth(true);
          await recordGoogleConsent(saved.accessToken, 'web');
          await writeGoogleGrantedScopes('granted', 'web');
          await clearGoogleReconnect();
          return { token: saved.accessToken, source: 'web' };
        } catch (webErr) {
          await writeGoogleGrantedScopes('asked', 'web');
          throw webErr;
        }
      }
    })().finally(() => {
      if (googleScopeUpgradeFlight === flight) googleScopeUpgradeFlight = null;
    });
    googleScopeUpgradeFlight = flight;
  }
  return googleScopeUpgradeFlight;
}

// The account the person consented to in Glance. A silent Chrome token of a
// different account is never stored over it and never used for a write.
async function chromeTokenIsConsented(token) {
  const lane = globalThis.FlowGoogleLaneAccount;
  if (!lane || !token) return true;
  const connected = await lane.read();
  if (!connected) return true;
  const email = await lane.accountOf(token);
  return !email || email === connected;
}

async function recordGoogleConsent(token, source) {
  const lane = globalThis.FlowGoogleLaneAccount;
  if (!lane || !token) return;
  try { await lane.record(token, source); } catch (e) { /* the first verified write records the account */ }
}

async function getGoogleAccessToken(interactive) {
  const wantUi = Boolean(interactive);
  const granted = await readGoogleGrantedScopes();
  if (googleScopeAction(granted, googleManifestScopes(), wantUi ? 'interactive' : 'silent') === 'upgrade') {
    return upgradeGoogleScopesOnce();
  }
  try {
    const token = await getGoogleAuthToken(wantUi);
    if (wantUi) await recordGoogleConsent(token, 'chrome');
    else if (!(await chromeTokenIsConsented(token))) throw new Error('Chrome is signed in as another Google account.');
    // Chrome's identity cache dies with the service worker. The panel
    // reads googleWebAuth from chrome.storage.local.
    await persistGoogleAccessToken(token, 'chrome');
    return { token, source: 'chrome' };
  } catch (err) {
    const message = err && err.message;
    if (!shouldFallbackFromGetAuthToken(message, { interactive: wantUi })) throw err;
    try {
      const web = await getGoogleWebAccessToken(wantUi);
      if (wantUi) await recordGoogleConsent(web.token, 'web');
      return web;
    } catch (fallbackErr) {
      if (wantUi) throw new Error(googleConnectErrorMessage(message, fallbackErr && fallbackErr.message));
      throw fallbackErr;
    }
  }
}

// Evicts Chrome's getAuthToken cache only. Does not open the web flow —
// Disconnect must not pop a consent window when browser sign-in is off.
async function clearCachedChromeGoogleTokens() {
  try {
    const token = await getGoogleAuthToken(false);
    if (token) await removeCachedGoogleAuthToken(token);
  } catch (e) {
    // Browser sign-in off, or no cached token. The web-flow token is cleared
    // by the caller along with googleTasksAuth.
  }
  const identity = chrome.identity;
  if (identity && typeof identity.clearAllCachedAuthTokens === 'function') {
    try {
      await new Promise((resolve) => identity.clearAllCachedAuthTokens(resolve));
    } catch (e) { /* already empty, or the API rejected the call */ }
  }
}

async function disconnectConnector(connectorId) {
  const STORAGE_KEYS = {
    hubspot: 'hubspotAuth', notion: 'notionAuth', salesforce: 'salesforceAuth', slack: 'slackAuth', monday: 'mondayAuth', asana: 'asanaAuth', jira: 'jiraAuth', linear: 'linearAuth', docusign: 'docusignAuth', dropbox: 'dropboxAuth',
    googleTasks: 'googleTasksAuth'
  };
  const key = STORAGE_KEYS[connectorId] || null;
  if (!key) return { ok: false };
  // Google also evicts Chrome's cached getAuthToken AND the stored web-flow
  // token. Otherwise "Disconnect" then "Connect" silently reuses the same
  // grant instead of letting the user pick a different Google account.
  if (connectorId === 'googleTasks') {
    // Invalidate before the clear. A consent window that resolves after
    // this point sees a new epoch and must not write googleWebAuth back.
    invalidateGoogleWebAuthFlight();
    await clearCachedChromeGoogleTokens();
    await enqueueGoogleWebAuthWrite(() => chrome.storage.local.remove([
      key,
      GOOGLE_WEB_AUTH_STORAGE_KEY,
      GOOGLE_RECONNECT_STORAGE_KEY,
      GOOGLE_EVER_CONNECTED_STORAGE_KEY,
      GOOGLE_GRANTED_SCOPES_KEY,
      'googleProfile',
      'googleConnectedAccount',
      'glanceOwnNames'
    ]));
    googleNamesFilled = false;
    return { ok: true };
  }
  if (connectorId === 'dropbox') await dropboxRevokeBestEffort();
  // Notion also forgets the one-page-per-loop ledger (it holds clipped titles) with the token.
  await chrome.storage.local.remove(connectorId === 'notion' ? [key, 'notionLedger'] : connectorId === 'asana' ? [key, 'asanaLedger'] : connectorId === 'jira' ? [key, 'jiraLedger'] : connectorId === 'linear' ? [key, 'linearLedger'] : connectorId === 'docusign' ? [key, 'docusignLedger'] : connectorId === 'dropbox' ? [key, 'dropboxLedger'] : key);
  return { ok: true };
}

// Writers already treat 401/403 as not-connected. A silent grant that cannot
// be minted mid–Do It uses that same status so the chip asks for Connect
// instead of opening a consent window or throwing a raw auth error.
function googleAuthUnavailableResponse() {
  return {
    ok: false,
    status: 401,
    json: async () => ({}),
    text: async () => '',
    arrayBuffer: async () => new ArrayBuffer(0)
  };
}

// Base-URL-parameterized so Calendar, Gmail, and Drive reuse the same
// token-fetch-and-401-retry logic. The bearer is a getAuthToken result when
// Chrome can mint one, and the stored web-flow token otherwise. Both the
// first fetch and the 401 retry are silent — interactive:true is reserved
// for an explicit Connect click.
async function markGoogleReconnect(reason) {
  await chrome.storage.local.set({
    [GOOGLE_RECONNECT_STORAGE_KEY]: { needed: true, reason: String(reason || 'auth') }
  });
}

async function clearGoogleReconnect() {
  await chrome.storage.local.remove(GOOGLE_RECONNECT_STORAGE_KEY);
}

// chrome.storage.local, never session storage and never a module variable.
// A new service worker still sees this record. A Chrome getAuthToken
// callback has no expires_in. The access token is the same one-hour
// implicit window, so the next start can tell age from expiry.
const CHROME_TOKEN_MS = 60 * 60 * 1000;
async function persistGoogleAccessToken(token, source, extra) {
  const accessToken = String(token || '').trim();
  if (!accessToken) return false;
  const more = extra || {};
  const record = {
    accessToken: accessToken,
    source: source || null,
    obtainedAt: Date.now()
  };
  if (more.expiresAt) record.expiresAt = more.expiresAt;
  else if ((source || '') === 'chrome') record.expiresAt = Date.now() + CHROME_TOKEN_MS;
  const existing = await readGoogleWebAuth();
  const hint = more.loginHint || (existing && existing.loginHint) || '';
  if (hint) record.loginHint = hint;
  return commitGoogleWebAuth(record, googleWebAuthEpoch);
}

// The account chooser returns a token and does not write googleWebAuth.
// Persist it on the same key the silent path already reads, and drop the
// Reconnect flag in that same step. The panel reads this record.
async function rememberUpgradedGoogleToken(token, source) {
  const committed = await persistGoogleAccessToken(token, source);
  if (!committed) return false;
  await clearGoogleReconnect();
  return true;
}

function googleHadAccount(bag) {
  const b = bag || {};
  const ever = b[GOOGLE_EVER_CONNECTED_STORAGE_KEY];
  if (ever === true || (ever && ever.connected)) return true;
  if (b.googleTasksAuth) return true;
  const web = b[GOOGLE_WEB_AUTH_STORAGE_KEY];
  return Boolean(web && (web.accessToken || web.refreshToken));
}

// A stored implicit token with no expiresAt is not a session. Reading it
// is not a refresh. prompt=none has to run.
function storedImplicitNeedsRefresh(record, now) {
  if (!record || typeof record.accessToken !== 'string' || !record.accessToken) return true;
  if (record.expiresAt == null || record.expiresAt === '') return true;
  return !webTokenUsable(record, now);
}

function tokenAgeMs(record, now) {
  if (!record) return null;
  if (typeof record.obtainedAt === 'number' && Number.isFinite(record.obtainedAt)) return now - record.obtainedAt;
  if (typeof record.expiresAt === 'number' && Number.isFinite(Number(record.expiresAt))) {
    return now - (Number(record.expiresAt) - CHROME_TOKEN_MS);
  }
  return null;
}

function glanceAuthSafe(message) {
  return String(message || '').replace(/ya29\.[A-Za-z0-9._\-]+/g, '[token]').slice(0, 300);
}

const glanceAuthLines = [];
async function glanceAuthLog(fields) {
  const row = fields || {};
  const out = {
    call: row.call || '',
    result: row.result || '',
    message: glanceAuthSafe(row.message),
    expiresAt: row.expiresAt == null ? null : row.expiresAt,
    ageMs: row.ageMs == null ? null : row.ageMs,
    state: row.state || '',
    source: row.source || '',
    interactive: row.interactive === undefined ? null : Boolean(row.interactive),
    prompt: row.prompt || '',
    extensionId: row.extensionId || '',
    idFromKey: row.idFromKey || '',
    keyPinned: row.keyPinned === undefined ? null : Boolean(row.keyPinned),
    clientId: row.clientId || '',
    extensionIdMatchesKey: row.extensionIdMatchesKey === undefined ? null : Boolean(row.extensionIdMatchesKey)
  };
  const line = '[glance-auth] ' + JSON.stringify(out);
  console.info(line);
  glanceAuthLines.push(line);
  if (glanceAuthLines.length > 12) glanceAuthLines.shift();
  try { await chrome.storage.local.set({ glanceAuthLog: glanceAuthLines.slice() }); }
  catch (e) { /* the console line is the log */ }
}

async function extensionIdFromManifestKey() {
  let key = '';
  try { key = String((chrome.runtime.getManifest() || {}).key || ''); } catch (e) { key = ''; }
  if (!key || !crypto || !crypto.subtle || typeof atob !== 'function') return '';
  try {
    const bin = atob(key);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    let hex = '';
    for (let i = 0; i < digest.length; i++) hex += digest[i].toString(16).padStart(2, '0');
    let id = '';
    for (let i = 0; i < 32; i++) id += String.fromCharCode('a'.charCodeAt(0) + parseInt(hex[i], 16));
    return id;
  } catch (e) {
    return '';
  }
}

async function googleAuthIdentity() {
  const manifest = chrome.runtime.getManifest() || {};
  const oauth2 = manifest.oauth2 || {};
  const extensionId = chrome.runtime && chrome.runtime.id || '';
  const idFromKey = await extensionIdFromManifestKey();
  return {
    extensionId: extensionId,
    idFromKey: idFromKey,
    keyPinned: Boolean(manifest.key),
    clientId: oauth2.client_id || '',
    extensionIdMatchesKey: Boolean(idFromKey) && idFromKey === extensionId
  };
}

async function googleLoginHint() {
  try {
    const bag = await chrome.storage.local.get(GOOGLE_RECONNECT_STORAGE_KEY);
    const flag = bag && bag[GOOGLE_RECONNECT_STORAGE_KEY];
    const wanted = flag && (flag.reason === 'wrong-account' || flag.reason === 'account-unverified') && typeof flag.account === 'string' ? flag.account.trim() : '';
    if (wanted.indexOf('@') > 0) return wanted;
  } catch (e) { /* the stored hint below still applies */ }
  const stored = await readGoogleWebAuth();
  const hint = stored && typeof stored.loginHint === 'string' ? stored.loginHint.trim() : '';
  return hint.indexOf('@') > 0 ? hint : '';
}

// Service-worker start. Two silent calls, never a consent window, and the
// stored token is not deleted first. getAuthToken({interactive:false}) uses
// the manifest Chrome-extension client. An implicit launchWebAuthFlow token
// expires in about an hour and has no refresh token. When that expiry is
// missing or past, the second call is launchWebAuthFlow with prompt=none,
// the same scopes, and login_hint when one is known. That call uses the
// Google session cookie. Reconnect is set only when both silent calls fail
// on an account that had already connected.
async function refreshGoogleSession() {
  const now = Date.now();
  const before = await chrome.storage.local.get([
    GOOGLE_WEB_AUTH_STORAGE_KEY,
    GOOGLE_EVER_CONNECTED_STORAGE_KEY,
    'googleTasksAuth'
  ]);
  const hadAccount = googleHadAccount(before);
  const stored = before[GOOGLE_WEB_AUTH_STORAGE_KEY] || null;
  const who = await googleAuthIdentity();
  const ageMs = tokenAgeMs(stored, now);
  await glanceAuthLog(Object.assign({
    call: 'startup',
    result: storedImplicitNeedsRefresh(stored, now) ? 'expired-or-missing' : 'usable',
    message: hadAccount ? 'had account' : 'never connected',
    expiresAt: stored && stored.expiresAt != null ? stored.expiresAt : null,
    ageMs: ageMs,
    state: ''
  }, who));
  let chromeToken = '';
  let chromeError = '';
  try { chromeToken = await getGoogleAuthToken(false); }
  catch (e) { chromeError = (e && e.message) || String(e); }
  if (chromeToken && !(await chromeTokenIsConsented(chromeToken))) {
    chromeToken = '';
    chromeError = 'Chrome is signed in as another Google account.';
  }
  await glanceAuthLog(Object.assign({
    call: 'getAuthToken',
    interactive: false,
    result: chromeToken ? 'ok' : 'error',
    message: chromeToken ? '' : (chromeError || 'no token'),
    expiresAt: stored && stored.expiresAt != null ? stored.expiresAt : null,
    ageMs: ageMs
  }, who));
  if (chromeToken && hadAccount) {
    const expiresAt = now + CHROME_TOKEN_MS;
    await persistGoogleAccessToken(chromeToken, 'chrome', { expiresAt: expiresAt });
    await clearGoogleReconnect();
    await glanceAuthLog(Object.assign({
      call: 'final',
      result: 'ok',
      message: 'silent getAuthToken',
      expiresAt: expiresAt,
      ageMs: 0,
      state: 'connected',
      source: 'chrome'
    }, who));
    return { ok: true, source: 'chrome', token: chromeToken };
  }
  if (chromeToken && !hadAccount) {
    await glanceAuthLog(Object.assign({
      call: 'final',
      result: 'ok',
      message: 'silent getAuthToken ignored until this account has connected',
      state: 'connect',
      source: 'chrome'
    }, who));
    return { ok: true, source: 'chrome', token: chromeToken };
  }
  const needsWeb = hadAccount && storedImplicitNeedsRefresh(stored, now);
  if (!needsWeb && webTokenUsable(stored, now)) {
    if (hadAccount) await clearGoogleReconnect();
    await glanceAuthLog(Object.assign({
      call: 'launchWebAuthFlow',
      interactive: false,
      prompt: 'none',
      result: 'skipped',
      message: 'stored token still inside expiresAt',
      expiresAt: stored.expiresAt,
      ageMs: ageMs
    }, who));
    await glanceAuthLog(Object.assign({
      call: 'final',
      result: 'ok',
      message: 'stored token still inside expiresAt; reading storage is not a refresh',
      expiresAt: stored.expiresAt,
      ageMs: ageMs,
      state: 'stored',
      source: 'stored'
    }, who));
    return { ok: true, source: 'stored', token: stored.accessToken };
  }
  if (needsWeb) {
    let webError = '';
    try {
      const saved = await runGoogleWebAuth(false);
      const fresh = await readGoogleWebAuth();
      if (hadAccount) await clearGoogleReconnect();
      await glanceAuthLog(Object.assign({
        call: 'launchWebAuthFlow',
        interactive: false,
        prompt: 'none',
        result: 'ok',
        message: '',
        expiresAt: fresh && fresh.expiresAt != null ? fresh.expiresAt : null,
        ageMs: 0
      }, who));
      await glanceAuthLog(Object.assign({
        call: 'final',
        result: 'ok',
        message: 'silent launchWebAuthFlow prompt=none',
        expiresAt: fresh && fresh.expiresAt != null ? fresh.expiresAt : null,
        ageMs: 0,
        state: 'connected',
        source: 'web'
      }, who));
      return { ok: true, source: 'web', token: saved.accessToken };
    } catch (e) {
      webError = (e && e.message) || String(e);
      await glanceAuthLog(Object.assign({
        call: 'launchWebAuthFlow',
        interactive: false,
        prompt: 'none',
        result: 'error',
        message: webError,
        expiresAt: stored && stored.expiresAt != null ? stored.expiresAt : null,
        ageMs: ageMs
      }, who));
    }
  } else {
    await glanceAuthLog(Object.assign({
      call: 'launchWebAuthFlow',
      interactive: false,
      prompt: 'none',
      result: 'skipped',
      message: hadAccount ? 'no stored token to refresh' : 'never connected',
      expiresAt: null,
      ageMs: null
    }, who));
  }
  if (hadAccount) await markGoogleReconnect('not signed in');
  await glanceAuthLog(Object.assign({
    call: 'final',
    result: 'error',
    message: hadAccount ? 'both silent calls failed' : 'never connected',
    expiresAt: stored && stored.expiresAt != null ? stored.expiresAt : null,
    ageMs: ageMs,
    state: hadAccount ? 'reconnect' : 'connect',
    source: ''
  }, who));
  return { ok: false, source: null, token: '' };
}

// Google ends a grant with invalid_grant, or says it was revoked. Nothing
// else a refresh can say (no window, no session, offline) ends it.
function googleRefreshRevoked(err) {
  return /invalid_grant|revoked/i.test(String((err && err.message) || err || ''));
}

// One silent refresh after a 401, then the caller retries once. Web tokens
// use prompt=none. Chrome tokens use getAuthToken({ interactive: false }).
// Neither opens a consent window. The stored token is kept when the refresh
// fails: a 401 can be a single bad answer. Consent is dropped only when the
// refresh itself says the grant is gone. A null result means: retry once
// with the token already in hand.
async function refreshLaneCredential(cred) {
  const revoked = async () => {
    if (cred && cred.source === 'web') await clearGoogleWebAuth();
    await markGoogleReconnect('revoked');
    return { revoked: true, token: '', source: cred && cred.source };
  };
  if (cred && cred.source === 'web') {
    try {
      const saved = await runGoogleWebAuth(false);
      return { token: saved.accessToken, source: 'web' };
    } catch (e) {
      if (googleRefreshRevoked(e)) return revoked();
    }
  } else if (cred && cred.token) {
    await removeCachedGoogleAuthToken(cred.token);
  }
  try {
    const token = await getGoogleAuthToken(false);
    return { token: token, source: 'chrome' };
  } catch (e) {
    if (googleRefreshRevoked(e)) return revoked();
    return null;
  }
}

// The lane host calls these. refreshSilent is getGoogleWebAccessToken(false):
// expiry and prompt=none live in that function, not a second copy.
globalThis.FlowGoogleAccess = {
  refreshSilent() {
    return getGoogleWebAccessToken(false);
  },
  refreshSession() {
    return refreshGoogleSession();
  },
  retry(cred) {
    return refreshLaneCredential(cred);
  }
};

async function rememberGoogleAuthResult(res) {
  if (!res) return res;
  if (res.status === 401) await markGoogleReconnect('401');
  else if (res.status === 403) await markGoogleReconnect('missing scope');
  // A later 2xx leaves googleReconnect set. clearGoogleReconnect runs only
  // after Connect stores a new token.
  return res;
}

// options.soft marks a best-effort read (a thread lookup, a probe). Its 401
// or 403 is that call's own answer: the token is kept, Reconnect is not
// flagged, and nothing is refreshed. Only a write path can end the grant.
async function googleConsentRevokedBlocksWrite() {
  try {
    const bag = await chrome.storage.local.get([
      GOOGLE_RECONNECT_STORAGE_KEY,
      GOOGLE_EVER_CONNECTED_STORAGE_KEY,
      'googleTasksAuth',
      GOOGLE_WEB_AUTH_STORAGE_KEY
    ]);
    const flag = bag && bag[GOOGLE_RECONNECT_STORAGE_KEY];
    if (!flag || !flag.needed || !googleHadAccount(bag)) return false;
    const r = String(flag.reason || '');
    return r === 'revoked' || r === '401' || r === 'not signed in' || r === 'missing scope';
  } catch (e) {
    return false;
  }
}

async function googleAuthedFetch(baseUrl, path, rawOptions) {
  const soft = !!(rawOptions && rawOptions.soft === true);
  const options = rawOptions ? Object.assign({}, rawOptions) : rawOptions;
  if (options) delete options.soft;
  const method = String((options && options.method) || 'GET').toUpperCase();
  const isWrite = method !== 'GET' && method !== 'HEAD';
  if (!soft && isWrite && await googleConsentRevokedBlocksWrite()) return googleAuthUnavailableResponse();
  let cred;
  try {
    cred = await getGoogleAccessToken(false);
  } catch (e) {
    await markGoogleReconnect('not signed in');
    return googleAuthUnavailableResponse();
  }
  const doFetch = (t) => fetch(glanceE2eRewrite(baseUrl + path), Object.assign({}, options, {
    headers: Object.assign({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, (options && options.headers) || {})
  }));
  const res = await doFetch(cred.token);
  if (soft) return res;
  if (res.status !== 401) return rememberGoogleAuthResult(res);
  // A cached token can go stale without Chrome knowing yet. One silent
  // refresh and one retry, then fail loudly. The refresh stays silent:
  // prompt=none may run for a web token; a consent window may not. The token
  // is dropped only when the refresh says the grant was revoked.
  const next = await refreshLaneCredential(cred);
  if (next && next.revoked) return rememberGoogleAuthResult(res);
  let retryToken = cred.token;
  if (next && next.token && (next.source !== 'chrome' || await chromeTokenIsConsented(next.token))) retryToken = next.token;
  return rememberGoogleAuthResult(await doFetch(retryToken));
}

function googleTasksAuthedFetch(path, options) {
  return googleAuthedFetch(GOOGLE_TASKS_API, path, options);
}

// A task made from a chat names the chat (Open in WhatsApp), never "Open in Gmail". Only the three known labels count.
function chatThreadLabel(p, fallback) {
  const l = p && p.threadLabel;
  return (l === 'Open in WhatsApp' || l === 'Open in Messenger' || l === 'Open in Instagram') ? l : fallback;
}

const CHAT_CARD_ASSETS = ['design/step-states-v1/do-it.png', 'design/step-states-v1/do-it-dark.png', 'design/step-states-v1/living/key-idle-512.png', 'design/step-states-v1/living/key-done-512.png'];
const chatAssetCache = {};
async function chatAssetData(file) {
  if (CHAT_CARD_ASSETS.indexOf(file) < 0) return { ok: false, reason: 'not-allowed' };
  if (chatAssetCache[file]) return { ok: true, url: chatAssetCache[file] };
  try {
    const bytes = new Uint8Array(await (await fetch(chrome.runtime.getURL(file))).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    chatAssetCache[file] = 'data:image/png;base64,' + btoa(bin);
    return { ok: true, url: chatAssetCache[file] };
  } catch (e) { return { ok: false, reason: 'read-failed' }; }
}

// A proposed meeting becomes a hold on the person's own calendar: Google Calendar through the lane when the account is on
// record with the Calendar scope, else Outlook Calendar when its token can write. Nothing is invited.
async function chatCalendarTarget() {
  let account = '';
  try { account = globalThis.FlowGoogleLaneAccount ? await globalThis.FlowGoogleLaneAccount.read() : ''; } catch (e) { account = ''; }
  if (account && await getGoogleTasksAuth()) {
    try {
      const bag = await chrome.storage.local.get('googleGrantedScopes');
      const list = (bag.googleGrantedScopes && bag.googleGrantedScopes.version) || [];
      const C = globalThis.FlowGoogleConfig;
      if (!C || C.hasScope(list, C.SCOPE_CALENDAR) !== false) return { ok: true, connectorId: 'googleHold' };
    } catch (e) { /* fall through to Outlook */ }
  }
  try {
    const session = await outlookSession({});
    const Cal = globalThis.FlowOutlookCalendar;
    if (session && session.ok && session.token && Cal && Cal.hasWriteScope(Cal.scopesFromToken ? Cal.scopesFromToken(session.token) : session.token.grantedScopes)) {
      return { ok: true, connectorId: 'outlookCalendar' };
    }
  } catch (e) { /* not connected */ }
  return { ok: false, reason: 'not-connected' };
}

async function chatTaskTarget(msg) {
  if (!(await glanceSwitchOn(msg && msg.own === true ? 'CHAT_PROMISE_CARD' : 'CHAT_TASK_CARD'))) return { ok: false, reason: 'switch-off' };
  if (msg && msg.kind === 'calendar') return chatCalendarTarget();
  // Google writes through the lane, which needs the connected account on record (a chat page has no mailbox to name it).
  let account = '';
  try { account = globalThis.FlowGoogleLaneAccount ? await globalThis.FlowGoogleLaneAccount.read() : ''; } catch (e) { account = ''; }
  if (account && await getGoogleTasksAuth()) return { ok: true, connectorId: 'googleTask' };
  try {
    const session = await outlookSession({});
    if (session && session.ok && session.token && outlookHasTasksScope(session.token) !== false) return { ok: true, connectorId: 'outlookTask' };
  } catch (e) { /* not connected */ }
  return { ok: false, reason: 'not-connected' };
}

async function getGoogleTasksAuth() {
  const { googleTasksAuth } = await chrome.storage.local.get('googleTasksAuth');
  return googleTasksAuth || null;
}

// Calendar and Gmail Draft have no connect-time bookkeeping of their own —
// they piggyback on whatever Google Tasks' own connect step already
// recorded, since a single chrome.identity grant covers all three scopes.
// "Is Google connected" and "is Google Tasks connected" are the same
// question in this MVP (Google Tasks is the one onboarding step that asks
// for the grant at all — see popup.js's connector filter), so this
// deliberately reads the same storage record rather than inventing a
// second, parallel "connected" flag that could drift out of sync with it.
async function googleConnected() {
  return Boolean(await getGoogleTasksAuth());
}

// Every write lands in the list titled Glance. It is looked up by title,
// so a reinstall finds the same list, and made only when the account has
// none, once. The lane host owns that one lookup-then-create, so there is a
// single place a task list can be created and its title is a constant.
async function findGlanceTaskList() {
  const lane = globalThis.FlowGoogleLaneAccount;
  const id = lane && typeof lane.ensureGlanceList === 'function' ? await lane.ensureGlanceList() : '';
  if (!id) throw new Error('Could not find or make the ' + GLANCE_TASK_LIST_TITLE + ' list in Google Tasks.');
  return id;
}

async function connectGoogleTasks(interactive, preset) {
  if (!googleTasksConfigured()) {
    throw new Error('Google isn’t configured on this build yet — manifest.json’s oauth2.client_id still needs a real Google OAuth Client ID (see the README’s “Set up Google” section).');
  }
  // interactive is false for ensureGoogleAutoConnect (the Gmail content
  // script). The popup Connect click passes true. That is the one moment
  // Chrome may show the account chooser or, if browser sign-in is off, the
  // web-flow consent window. Later API calls stay silent.
  const cred = preset || await getGoogleAccessToken(interactive !== false);
  await rememberGoogleProfile(cred && cred.token);
  await clearGoogleReconnect();
  const taskListId = await findGlanceTaskList();
  await chrome.storage.local.set({
    googleTasksAuth: { taskListId },
    [GOOGLE_EVER_CONNECTED_STORAGE_KEY]: { connected: true }
  });
  return true;
}

// The Reconnect button on a card that refused to write because the account
// could not be verified. It asks Google for the account of the Gmail tab
// (login_hint) through the web flow, drops the stored token of the other
// account first so it cannot be reused, and reports whose sign-in came back.
async function reconnectGoogleForAccount(account) {
  const hint = String(account || '').trim();
  const wanted = hint.indexOf('@') > 0 ? hint : '';
  if (!wanted) {
    await connectGoogleTasks(true);
    return { ok: true, account: await globalThis.FlowGoogleLaneAccount.read() };
  }
  await chrome.storage.local.set({ [GOOGLE_RECONNECT_STORAGE_KEY]: { needed: true, reason: 'account-unverified', account: wanted } });
  invalidateGoogleWebAuthFlight();
  await clearGoogleWebAuth();
  const web = await getGoogleWebAccessToken(true);
  await recordGoogleConsent(web.token, 'web');
  const lane = globalThis.FlowGoogleLaneAccount;
  const got = lane ? await lane.accountOf(web.token) : '';
  if (!got || got.toLowerCase() !== wanted.toLowerCase()) {
    return { ok: false, reason: got ? 'wrong-account' : 'account-unverified', account: got || '', wanted: wanted };
  }
  await connectGoogleTasks(true, web);
  return { ok: true, account: got };
}

function googleTaskTitle(p) {
  const Title = globalThis.FlowCommitmentTitle;
  const span = Title && typeof Title.fromPayload === 'function' ? Title.fromPayload(p) : '';
  if (span) return String(span).slice(0, 255);
  return String((p && p.label) || '').replace(/\s+/g, ' ').trim().slice(0, 255);
}

// A date the close is willing to write. Anything else — a month that
// doesn't exist, a bare phrase — stays off the task. A wrong due date is
// a worse failure than no due date.
function isoDateOrNull(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parts = value.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return value;
}

function plannedAmount(p) {
  const raw = p.params && p.params.amount;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

// The calendar day of the write, in local time — the same comparison
// intent.js uses for "this date is already behind today". p.now is only
// how tests pin that day; a real Do It uses the clock at write time.
function localTodayIso(now) {
  const parsed = now ? new Date(now) : new Date();
  const n = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const pad = (v) => String(v).padStart(2, '0');
  return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
}

function dueForTask(value, now) {
  const iso = isoDateOrNull(value);
  if (!iso) return null;
  if (iso < localTodayIso(now)) return null;
  return iso;
}

// The task step's params are the close. facts are the fallback for a
// caller that still only has the extracted record. When both name a date
// that is still ahead (or today), the plan wins — that is the date the
// chip showed. A day already behind today is not a due date from either
// source. A wrong due date is a worse failure than no due date.
function taskClosePayload(p) {
  const params = p.params || {};
  const plannedDue = dueForTask(params.dateIso, p.now);
  const factsDue = dueForTask(p.facts && p.facts.date && p.facts.date.iso, p.now);
  const dueIso = plannedDue || factsDue;
  const fromPlan = plannedAmount(p);
  const amount = fromPlan || ((p.facts && p.facts.moneyText) || null);
  const entities = Object.assign({}, p.entities);
  const plannedWhat = typeof params.what === 'string' ? params.what.trim() : '';
  if (!entities.what && !entities.requestWhat && plannedWhat) entities.what = plannedWhat;
  const facts = Object.assign({}, p.facts);
  if (fromPlan) facts.moneyText = fromPlan;
  // Notes follow the due that will actually be written. A past day that
  // was only mentioned (an old invoice date on a current ask) is not a
  // Date line, and a dateText left over from that day must not survive
  // once the due itself was refused.
  if (dueIso) {
    facts.date = { iso: dueIso };
    delete facts.dateText;
  } else {
    delete facts.date;
    delete facts.dateText;
  }
  return { dueIso, amount: amount || null, forNotes: Object.assign({}, p, { facts, entities }) };
}

function taskWrittenLine(dueIso, amount) {
  const parts = ['Google Task'];
  if (amount) parts.push(amount);
  if (dueIso) {
    const human = humanDateFallback({ iso: dueIso });
    parts.push('due ' + (human || dueIso));
  }
  return parts.join(' · ');
}

function draftWrittenLine(params) {
  const what = params && typeof params.what === 'string' ? params.what.replace(/\s+/g, ' ').trim() : '';
  if (!what) return 'Gmail draft';
  const short = what.length > 80 ? what.slice(0, 79) + '…' : what;
  return 'Gmail draft · ' + short;
}

async function googleTasksWrite(p) {
  const auth = await getGoogleTasksAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };

  const taskParams = p.params || {};
  const taskFileTerm = taskParams.fileTerm ? String(taskParams.fileTerm).trim() : '';
  let taskFile = null;
  if (taskFileTerm) {
    const found = await driveFindOneByName(taskFileTerm);
    if (!found || found.match !== 'one' || !found.file || !found.file.url) {
      return { ok: false, reason: 'unclear', error: 'No single file to note on the task.' };
    }
    taskFile = found.file;
  }

  const close = taskClosePayload(p);
  const notesLines = factLines(close.forNotes);
  if (taskFile) notesLines.push(['File', taskFile.name + '\n' + taskFile.url]);
  if (p.threadUrl) notesLines.push([chatThreadLabel(p, 'Open in Gmail'), p.threadUrl]);
  const notes = notesLines.map(([k, v]) => k + ': ' + v).join('\n');

  const body = { title: googleTaskTitle(p).slice(0, 1024), notes: notes.slice(0, 8192) };
  // Tasks requires a full RFC3339 timestamp on `due` but only displays the
  // date. Midnight UTC keeps that date from shifting a day in either direction.
  const due = close.dueIso ? close.dueIso + 'T00:00:00.000Z' : null;
  if (due) body.due = due;

  const post = (listId) => googleTasksAuthedFetch('/lists/' + encodeURIComponent(listId) + '/tasks', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  let taskListId = auth.taskListId;
  let res = await post(taskListId);

  // The Glance list is the one piece of state this connector keeps a stored
  // id for, and it lives in an app Glance does not own. Deleting a list is
  // ordinary tidying in Google Tasks, and it left the stored id pointing at
  // nothing: every Do It from then on failed with "Google Tasks write failed
  // (404)" — permanently, and with a message naming neither the cause nor
  // the remedy. The only way out was Disconnect/Connect in the popup, which
  // nothing told the user to do.
  //
  // findGlanceTaskList already knows how to recover; it was simply
  // only ever called at connect time. Calling it here on a 404 gives the
  // write path the same "re-resolve once, then fail loudly" shape
  // googleAuthedFetch already uses for a stale token one layer down. The new
  // id is persisted so the next write doesn't pay for the round trip again.
  if (res.status === 404) {
    try {
      const freshListId = await findGlanceTaskList();
      if (freshListId && freshListId !== taskListId) {
        taskListId = freshListId;
        await chrome.storage.local.set({ googleTasksAuth: Object.assign({}, auth, { taskListId }) });
        res = await post(taskListId);
      }
    } catch (e) {
      // Recovery failed — fall through and report the ORIGINAL 404 below
      // rather than a second, more confusing error about list creation.
    }
  }

  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()).error || {}).message || ''; } catch (e) { /* body already consumed or not JSON */ }
    throw new Error('Google Tasks write failed (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  let task = null;
  try { task = await res.json(); } catch (e) { task = null; }
  const taskUrl = 'https://tasks.google.com/embed/list/' + encodeURIComponent(taskListId) + '?pli=1';
  const written = taskWrittenLine(close.dueIso, close.amount);
  const base = {
    where: 'Google Tasks',
    target: GLANCE_TASK_LIST_TITLE + ' list',
    written: written,
    url: taskUrl
  };
  // Creating the task is not the close. Handled waits for a GET of that id.
  const Proof = globalThis.FlowProofOfClose;
  const pending = (Proof && Proof.REASON_PENDING) || 'proof_pending';
  const failed = (Proof && Proof.REASON_FAILED) || 'verify_failed';
  if (!task || typeof task.id !== 'string' || !task.id) {
    return Object.assign({ ok: false, reason: pending, ref: null, proof: null }, base);
  }
  const ref = { taskListId: taskListId, taskId: task.id, externalId: task.id };
  const fetched = await googleTasksFetchBack(taskListId, task.id, body.title);
  if (!fetched.ok) {
    return Object.assign({ ok: false, reason: failed, ref: ref, proof: null }, base);
  }
  const proof = Proof && Proof.buildProof({
    system: Proof.SYSTEM_GOOGLE_TASKS,
    externalId: task.id,
    url: taskUrl,
    fetchedBack: true,
    verifiedAt: new Date().toISOString()
  });
  if (!proof) {
    return Object.assign({ ok: false, reason: pending, ref: ref, proof: null }, base);
  }
  return Object.assign({ ok: true, ref: ref, proof: proof }, base);
}

// Read the task that was just created. fetchedBack is true only when this
// GET returns that same id and the task is not deleted. A miss stays
// verify_failed — the loop is not Handled.
async function googleTasksFetchBack(taskListId, taskId, sentTitle) {
  let res;
  try {
    res = await googleTasksAuthedFetch(
      '/lists/' + encodeURIComponent(taskListId) + '/tasks/' + encodeURIComponent(taskId),
      { method: 'GET' }
    );
  } catch (e) {
    return { ok: false };
  }
  if (!res || !res.ok) return { ok: false };
  let body = null;
  try { body = await res.json(); } catch (e) { return { ok: false }; }
  if (!body || body.id !== taskId || body.deleted) return { ok: false };
  if (sentTitle != null && String(body.title || '') !== String(sentTitle)) return { ok: false };
  return { ok: true, task: body };
}

async function googleTasksUndo(ref) {
  const auth = await getGoogleTasksAuth();
  if (!ref) return { ok: false };
  // externalId is the id the proof fetched back. Older rows only have taskId.
  const taskId = ref.externalId || ref.taskId;
  if (!taskId) return { ok: false };
  const listId = ref.taskListId || (auth && auth.taskListId);
  if (!listId) return { ok: false };
  const res = await googleTasksAuthedFetch(
    '/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(taskId),
    { method: 'DELETE' }
  );
  return { ok: res.ok || res.status === 404 };
}


/* ------------------------------------------------------------- waiting on */
//
// "Waiting on" — things the account asked someone else for. core/follow-up.js
// decides what is worth tracking and when to chase; these are the three
// writes it needs, all to the user's own Google account through the grant
// they already gave: a Task due on the chase day, completing that Task when a
// reply settles it, and an editable Gmail draft nudge (never sent).

async function followTaskCreate(p) {
  const auth = await getGoogleTasksAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };
  const title = String((p && p.title) || '').trim();
  if (!title) return { ok: false, reason: 'invalid', error: 'Nothing to track.' };
  const lines = [];
  if (p.what) lines.push('Asked: ' + String(p.what).slice(0, 300));
  if (p.counterpart) lines.push('Waiting on: ' + String(p.counterpart).slice(0, 200));
  if (p.threadUrl) lines.push('Open in Gmail: ' + p.threadUrl);
  const body = { title: title.slice(0, 1024), notes: lines.join('\n').slice(0, 8192) };
  // Same midnight-UTC convention as googleTasksWrite: the date shown must not
  // shift a day in either direction.
  if (p.dueIso && /^\d{4}-\d{2}-\d{2}$/.test(p.dueIso)) body.due = p.dueIso + 'T00:00:00.000Z';

  const post = (listId) => googleTasksAuthedFetch('/lists/' + encodeURIComponent(listId) + '/tasks', { method: 'POST', body: JSON.stringify(body) });
  let taskListId = auth.taskListId;
  let res = await post(taskListId);
  if (res.status === 404) {
    try {
      const fresh = await findGlanceTaskList();
      if (fresh && fresh !== taskListId) {
        taskListId = fresh;
        await chrome.storage.local.set({ googleTasksAuth: Object.assign({}, auth, { taskListId }) });
        res = await post(taskListId);
      }
    } catch (e) { /* report the original failure below */ }
  }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
  if (!res.ok) throw new Error('Google Tasks write failed (' + res.status + ')');
  const task = await res.json();
  return {
    ok: true,
    where: 'Google Tasks',
    ref: { taskListId, taskId: task.id },
    url: 'https://tasks.google.com/embed/list/' + encodeURIComponent(taskListId) + '?pli=1'
  };
}

// A reply arrived, so the reminder is no longer needed. Completing (not
// deleting) keeps the record in Tasks. A task the person already deleted or
// completed is fine: nothing left to do is success.
async function followTaskComplete(ref) {
  if (!ref || !ref.taskId) return { ok: false, reason: 'invalid' };
  const auth = await getGoogleTasksAuth();
  const listId = ref.taskListId || (auth && auth.taskListId);
  if (!listId) return { ok: false, reason: 'not-connected' };
  const res = await googleTasksAuthedFetch(
    '/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(ref.taskId),
    { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }
  );
  return { ok: res.ok || res.status === 404 };
}

// Did the person tick a reminder done in Google Tasks (on their phone, say)? One read per reminder, status only.
// 'completed' = they closed it themselves; 'open' = still open; 'gone' = deleted (the loop is NOT closed by a deletion).
async function followTaskStatuses(refs) {
  const list = (Array.isArray(refs) ? refs : []).filter((r) => r && r.taskId).slice(0, 10);
  if (!list.length) return { ok: true, statuses: [] };
  const auth = await getGoogleTasksAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };
  const out = [];
  for (const ref of list) {
    const listId = ref.taskListId || auth.taskListId;
    if (!listId) continue;
    const res = await googleTasksAuthedFetch('/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(ref.taskId) + '?fields=status,deleted', { method: 'GET' });
    if (res.status === 404) { out.push({ taskId: ref.taskId, status: 'gone' }); continue; }
    if (!res.ok) continue;
    const t = await res.json();
    out.push({ taskId: ref.taskId, status: t.deleted ? 'gone' : t.status === 'completed' ? 'completed' : 'open' });
  }
  return { ok: true, statuses: out };
}

// The chase day moved (they promised a date, or you chased and it slid out).
// Same midnight-UTC convention as the create. A Task that was deleted is
// reported as 'gone' so the caller can create a fresh one instead of silently
// leaving the loop without a reminder.
async function followTaskPatch(ref, fields) {
  if (!ref || !ref.taskId) return { ok: false, reason: 'invalid' };
  const auth = await getGoogleTasksAuth();
  const listId = ref.taskListId || (auth && auth.taskListId);
  if (!listId) return { ok: false, reason: 'not-connected' };
  const res = await googleTasksAuthedFetch(
    '/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(ref.taskId),
    { method: 'PATCH', body: JSON.stringify(fields) }
  );
  if (res.status === 404) return { ok: false, reason: 'gone' };
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
  return { ok: res.ok };
}

function followDue(dueIso) {
  return dueIso && /^\d{4}-\d{2}-\d{2}$/.test(dueIso) ? dueIso + 'T00:00:00.000Z' : null;
}

async function followTaskSchedule(ref, dueIso, title) {
  const due = followDue(dueIso);
  if (!due) return { ok: false, reason: 'invalid' };
  const fields = { due };
  // The title follows the state of the loop ("Chase reply" -> "Answer Dana").
  if (typeof title === 'string' && title.trim()) fields.title = title.trim().slice(0, 200);
  return followTaskPatch(ref, fields);
}

// Back from the closed list: the Task is open again, on the new chase day.
async function followTaskReopen(ref, dueIso) {
  const fields = { status: 'needsAction', completed: null };
  const due = followDue(dueIso);
  if (due) fields.due = due;
  return followTaskPatch(ref, fields);
}

async function findThreadIdTo(recipientEmail, subject) {
  if (!recipientEmail) return null;
  try {
    const q = 'to:' + recipientEmail + (subject ? ' subject:"' + String(subject).replace(/^re:\s*/i, '').replace(/"/g, '') + '"' : '');
    const res = await googleAuthedFetch(GOOGLE_GMAIL_API, '/users/me/threads?maxResults=1&q=' + encodeURIComponent(q), { soft: true });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.threads && data.threads[0] && data.threads[0].id) || null;
  } catch (e) {
    return null;
  }
}

async function followDraftCreate(p) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  const to = String((p && p.to) || '').trim();
  const text = String((p && p.body) || '').trim();
  if (!to || !text) return { ok: false, reason: 'invalid', error: 'No one to write to.' };
  const base = String(p.subject || '').trim();
  const subject = base ? (/^re:/i.test(base) ? base : 'Re: ' + base) : 'Following up';
  // A file prepared for this draft (docs/file-backed-closure-plan.md): either the one
  // file already in the thread (bytes read by the content script) or the one Drive file
  // core/file-path.js picked. If it cannot be read nothing is written: the body says
  // a file is attached, so there is never a substitute file and never a draft that
  // claims one it does not have. The caller then offers the plain draft instead.
  let attachment = null;
  if (p.attachment && p.attachment.base64) {
    const approxBytes = Math.floor((p.attachment.base64.length * 3) / 4);
    if (approxBytes <= GMAIL_ATTACHMENT_MAX_BYTES) attachment = { filename: p.attachment.filename, mimeType: p.attachment.mimeType, base64: p.attachment.base64 };
  } else if (p.driveFileId) {
    attachment = await fetchDriveFileAsAttachment(p.driveFileId);
  }
  if ((p.attachment || p.driveFileId) && !attachment) return { ok: false, reason: 'attach', error: 'Could not attach that file.' };
  const threadId = await findThreadIdTo(to, base);
  const raw = base64UrlEncode(buildMimeMessage({ to: toHeaderValue(to, p.toName), subject, body: text, attachment }));
  const message = { raw };
  if (threadId) message.threadId = threadId;
  const res = await googleAuthedFetch(GOOGLE_GMAIL_API, '/users/me/drafts', { method: 'POST', body: JSON.stringify({ message }) });
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
  if (!res.ok) throw new Error('Gmail draft creation failed (' + res.status + ')');
  const draft = await res.json();
  return { ok: true, where: 'Gmail', target: 'a draft follow-up', ref: { draftId: draft.id }, url: 'https://mail.google.com/mail/u/0/#drafts', attached: attachment ? attachment.filename : null };
}

/* --------------------------------------------------------------- Calendar */
//
// The top of the execution priority the spec calls for: a SCHEDULED_EVENT
// classification (intent.js) already required a meeting noun + a resolved
// date + a resolved time together before it was ever offered as an action
// (see actions.js) — there is nothing further to validate here beyond the
// fields actually being present.

function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (e) {
    return 'UTC';
  }
}

// glanceTimeZone wins, then the host zone. A meeting hold does not
// silently write UTC when the person is in another zone.
async function outlookGlanceZone(explicit) {
  const given = String(explicit || '').trim();
  if (given) return given.slice(0, 80);
  try {
    const bag = await chrome.storage.local.get('glanceTimeZone');
    const raw = bag && bag.glanceTimeZone;
    if (typeof raw === 'string' && raw.trim()) return raw.trim().slice(0, 80);
    if (raw && typeof raw.timeZone === 'string' && raw.timeZone.trim()) return raw.timeZone.trim().slice(0, 80);
  } catch (e) { /* storage is optional */ }
  return localTimeZone();
}

// No duration is ever stated in an email the way a date or time is, so
// there is nothing to extract — 30 minutes is a plain, documented default
// rather than a guess dressed up as a fact, and the event's own real time
// (not its length) is what actually matters for "don't miss this".
const CALENDAR_DEFAULT_DURATION_MIN = 30;
// A hold is 30 minutes unless the card names a length (a delivery window): a whole number of minutes from 5 to 720.
function calendarDurationOf(v) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d{1,3}$/.test(v.trim()) ? parseInt(v, 10) : NaN);
  return Number.isInteger(n) && n >= 5 && n <= 720 ? n : CALENDAR_DEFAULT_DURATION_MIN;
}

function calendarDateTime(dateIso, hour, minute, addMinutes) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d, hour, minute + (addMinutes || 0));
  const pad = (n) => String(n).padStart(2, '0');
  return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) +
    'T' + pad(dt.getHours()) + ':' + pad(dt.getMinutes()) + ':00';
}

// Google Calendar's all-day event shape needs the day AFTER the event as
// its own end.date — {date} is exclusive, unlike {dateTime}'s inclusive
// start/end pair, so a single-day all-day event is start=today, end=tomorrow.
function nextDateIso(dateIso) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
}

// A date the close is willing to write. A month that doesn't exist, or a
// bare phrase, must not become an event on the wrong day.
function calendarIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parts = value.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return value;
}

function calendarClockPart(value, max) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max) return value;
  if (typeof value === 'string' && /^\d{1,2}$/.test(value)) {
    const n = Number(value);
    if (n >= 0 && n <= max) return n;
  }
  return null;
}

// Both fields absent → all-day is allowed (the schedule process). One
// field present, or either field out of range → not a time we may write.
function calendarClock(hour, minute) {
  const hourAbsent = hour == null || hour === '';
  const minuteAbsent = minute == null || minute === '';
  if (hourAbsent && minuteAbsent) return { absent: true };
  const h = calendarClockPart(hour, 23);
  const m = calendarClockPart(minute, 59);
  if (h == null || m == null) return { invalid: true };
  return { hour: h, minute: m };
}

function calendarWhenLabel(dateIso, clock) {
  const human = humanDateFallback({ iso: dateIso }) || dateIso;
  if (!clock || clock.absent) return human;
  const pad = (n) => String(n).padStart(2, '0');
  return human + ' ' + pad(clock.hour) + ':' + pad(clock.minute);
}

function slotStamp(dateIso, hour, minute, addMinutes) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d, hour, minute + (addMinutes || 0), 0);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  const wall = calendarDateTime(iso, dt.getHours(), dt.getMinutes());
  const off = -dt.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return wall + sign + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60);
}

function eventsStartingAt(items, dateIso, hour, minute) {
  const prefix = dateIso + 'T' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  return (items || []).filter((ev) => {
    if (!ev || ev.status === 'cancelled' || typeof ev.id !== 'string' || !ev.id) return false;
    const start = ev.start && ev.start.dateTime;
    return typeof start === 'string' && start.indexOf(prefix) === 0;
  });
}

// Update or delete one event that already starts at the named clock.
// Zero matches, or more than one, is not a write: the receipt must not
// claim a calendar change that did not happen. A new event is never inserted
// on this path.
async function googleCalendarChange(p, op) {
  const params = p.params || {};
  const targetDate = calendarIsoDate(params.dateIso);
  const targetClock = calendarClock(params.hour, params.minute);
  if (!targetDate || !targetClock || targetClock.absent || targetClock.invalid) {
    return { ok: false, reason: 'invalid', error: 'Missing a real time for this change.' };
  }
  const lookupDate = op === 'update' ? calendarIsoDate(params.fromDateIso) : targetDate;
  const lookupClock = op === 'update' ? calendarClock(params.fromHour, params.fromMinute) : targetClock;
  if (!lookupDate || !lookupClock || lookupClock.absent || lookupClock.invalid) {
    return { ok: false, reason: 'invalid', error: 'Missing the time to change.' };
  }
  const query = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '5',
    timeZone: localTimeZone(),
    timeMin: slotStamp(lookupDate, lookupClock.hour, lookupClock.minute, 0),
    timeMax: slotStamp(lookupDate, lookupClock.hour, lookupClock.minute, 1)
  });
  const listed = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events?' + query.toString(), { method: 'GET' });
  if (listed.status === 401 || listed.status === 403) return { ok: false, reason: 'not-connected' };
  if (!listed.ok) return { ok: false, reason: 'not-found' };
  const matches = eventsStartingAt((await listed.json()).items, lookupDate, lookupClock.hour, lookupClock.minute);
  if (matches.length !== 1) return { ok: false, reason: 'not-found' };
  const ev = matches[0];
  const summary = String(ev.summary || params.title || 'Hold').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Hold';
  if (op === 'delete') {
    const restore = { summary: ev.summary || summary, start: ev.start, end: ev.end };
    if (ev.description) restore.description = ev.description;
    if (ev.location) restore.location = ev.location;
    const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events/' + encodeURIComponent(ev.id), { method: 'DELETE' });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
    if (!res.ok && res.status !== 404 && res.status !== 410) return { ok: false, reason: 'not-found' };
    return {
      ok: true,
      where: 'Google Calendar',
      target: 'your calendar',
      written: 'Calendar · ' + summary + ' · off ' + calendarWhenLabel(lookupDate, lookupClock),
      ref: { eventId: ev.id, restore: restore }
    };
  }
  const timeZone = localTimeZone();
  const next = {
    start: { dateTime: calendarDateTime(targetDate, targetClock.hour, targetClock.minute), timeZone: timeZone },
    end: { dateTime: calendarDateTime(targetDate, targetClock.hour, targetClock.minute, CALENDAR_DEFAULT_DURATION_MIN), timeZone: timeZone }
  };
  const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events/' + encodeURIComponent(ev.id), {
    method: 'PATCH',
    body: JSON.stringify(next)
  });
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
  if (!res.ok) return { ok: false, reason: 'not-found' };
  return {
    ok: true,
    where: 'Google Calendar',
    target: 'your calendar',
    written: 'Calendar · ' + summary + ' · ' + calendarWhenLabel(targetDate, targetClock),
    ref: { eventId: ev.id, previousStart: ev.start, previousEnd: ev.end },
    url: (ev.htmlLink || null)
  };
}

async function googleCalendarWrite(p) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  const params = p.params || {};
  if (params.calendarOp === 'delete' || params.calendarOp === 'update') {
    return googleCalendarChange(p, params.calendarOp);
  }
  const dateIso = calendarIsoDate(params.dateIso);
  if (!dateIso) {
    return { ok: false, reason: 'invalid', error: 'Missing a real date for this event.' };
  }
  const clock = calendarClock(params.hour, params.minute);
  if (clock.invalid || (params.requireTime && clock.absent)) {
    return { ok: false, reason: 'invalid', error: 'Missing a real time for this event.' };
  }
  // A meeting the email names a day for but never a clock time — "let's
  // meet Tuesday" — is real, unambiguous evidence a person would act on
  // immediately. That path creates a genuine all-day Calendar entry
  // (Google's own {date} shape, no {dateTime}/{timeZone}) rather than
  // guessing a time that was never stated. A calendar hold sets
  // requireTime and never takes this branch.

  const paramsFile = params.fileTerm ? String(params.fileTerm).trim() : '';
  const shareUrl = googleShareUrl(params.shareUrl);
  if (params.shareLink && !shareUrl && !paramsFile) {
    return { ok: false, reason: 'unclear', error: 'No file link for this event.' };
  }
  let linkedFile = null;
  if (paramsFile) {
    const found = await driveFindOneByName(paramsFile);
    if (!found || found.match !== 'one' || !found.file || !found.file.url) {
      return { ok: false, reason: 'unclear', error: 'No single file to put on the event.' };
    }
    linkedFile = found.file;
  }

  const timeZone = localTimeZone();
  const descriptionLines = [];
  // The sentence Do It actually closed, so the event View opens is the
  // same fact the chip proposed — not only a title and an attribution line.
  const quote = params.quote ? String(params.quote).replace(/[\r\n]+/g, ' ').trim() : '';
  if (quote) descriptionLines.push(quote.slice(0, QUOTE_MAX_CHARS));
  if (linkedFile) descriptionLines.push('File: ' + linkedFile.name + '\n' + linkedFile.url);
  if (shareUrl) descriptionLines.push(shareUrl);
  if (p.threadUrl) descriptionLines.push('Open in Gmail: ' + p.threadUrl);
  descriptionLines.push(ATTRIBUTION_TEXT + ' — ' + attributionUrl('calendar'));

  const summary = String(params.title || 'Hold').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Hold';
  const body = {
    summary: summary,
    description: descriptionLines.join('\n')
  };
  if (!clock.absent) {
    body.start = { dateTime: calendarDateTime(dateIso, clock.hour, clock.minute), timeZone };
    body.end = { dateTime: calendarDateTime(dateIso, clock.hour, clock.minute, calendarDurationOf(params.durationMinutes)), timeZone };
  } else {
    body.start = { date: dateIso };
    body.end = { date: nextDateIso(dateIso) };
  }
  const whenLabel = calendarWhenLabel(dateIso, clock);

  const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'not-connected' };
  if (!res.ok) {
    let detail = '';
    try { detail = ((await res.json()).error || {}).message || ''; } catch (e) { /* body already consumed or not JSON */ }
    throw new Error('Calendar event creation failed (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  const event = await res.json();
  // A 200 with no id is not an event we can undo, so it is not a success
  // the receipt may name.
  if (!event || typeof event.id !== 'string' || !event.id) {
    return { ok: false, reason: 'error', error: 'Calendar did not confirm the event.' };
  }
  return {
    ok: true,
    where: 'Google Calendar',
    target: 'your calendar',
    // Built from the summary and the start that were posted, so the
    // receipt cannot name a title or a time the event does not have.
    written: 'Calendar · ' + summary + ' · ' + whenLabel,
    ref: { eventId: event.id },
    // htmlLink is a real field the Calendar API documents and always
    // returns on a created event — unlike the Gmail draft link below, this
    // one is safe to hand straight to the user.
    url: event.htmlLink || null
  };
}

async function googleCalendarUndo(ref) {
  if (!ref) return { ok: false };
  if (ref.restore && ref.restore.start) {
    const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events', {
      method: 'POST',
      body: JSON.stringify(ref.restore)
    });
    if (res.ok) return { ok: true };
    return { ok: false };
  }
  if (ref.previousStart && ref.eventId) {
    const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events/' + encodeURIComponent(ref.eventId), {
      method: 'PATCH',
      body: JSON.stringify({ start: ref.previousStart, end: ref.previousEnd })
    });
    if (res.ok) return { ok: true };
    return { ok: false };
  }
  if (!ref.eventId) return { ok: false };
  const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events/' + encodeURIComponent(ref.eventId), {
    method: 'DELETE'
  });
  // 410 Gone is Calendar's own "already deleted" — as final as a 404 anywhere else.
  // Anything else (403, 500, a still-present event) is not undone. The
  // receipt must not say it was.
  if (res.ok || res.status === 404 || res.status === 410) return { ok: true };
  return { ok: false };
}

/* ------------------------------------------------------------- Gmail Draft */
//
// Second in the execution priority: a real draft sitting in Gmail, not a
// task that says "reply to this." Deliberately a lightweight, editable
// skeleton — not an AI-generated reply. That's a different feature
// (glance-assist's Draft-It, see the header comment further down this
// file) with a different backend dependency; this path never calls out to
// anything, so it works the moment Google is connected, same as Calendar
// and Tasks.
//
// No "Logged by Glance" footer here, unlike every other write path in this
// file. Every other connector writes to something only the user's own team
// sees (a CRM note, a Slack channel, a Notion page) — a fair, quiet place
// for one attribution line. A Gmail draft is addressed to the sender and
// will very likely be sent to them close to as-is; putting vendor
// attribution into outbound correspondence with someone else's actual
// client is a different thing entirely, and not a call this file gets to
// make on the user's behalf.

function base64UrlEncode(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// RFC 2045 caps an encoded body line at 76 characters. Most servers tolerate
// longer lines, but there's no reason to rely on that tolerance when the fix
// is one regex.
function chunk76(b64) {
  return (b64.match(/.{1,76}/g) || []).join('\r\n');
}

// Every value that ends up inside a MIME header or the multipart framing
// below is DOM-derived (Gmail's own subject/sender text) — none of it is
// something this file should trust to be a single line. A raw CR or LF
// spliced into a header value is a classic header-injection vector (the
// email equivalent of HTTP header injection): "Subject: X\r\nBcc:
// attacker@evil.com" would silently add a real header to an outbound
// draft. Folding any embedded CR/LF to a space closes that off at the one
// place every header value passes through, rather than trusting each call
// site to remember to sanitize its own input.
function sanitizeMimeText(s) {
  return String(s == null ? '' : s).replace(/[\r\n]+/g, ' ');
}

// RFC 2047 encoded-word — only applied when the value actually contains
// something outside ASCII (a Hebrew subject line, a display name with
// diacritics). A raw UTF-8 byte in a header is invalid and Gmail's API
// rejects the whole message rather than mangling it.
function mimeHeader(name, value) {
  const safe = sanitizeMimeText(value);
  if (/^[\x00-\x7F]*$/.test(safe)) return name + ': ' + safe;
  return name + ': =?UTF-8?B?' + btoa(unescape(encodeURIComponent(safe))) + '?=';
}

function toHeaderValue(email, name) {
  const trimmed = (name || '').trim().replace(/"/g, '');
  if (!trimmed) return email;
  if (/^[\x00-\x7F]*$/.test(trimmed)) return '"' + trimmed + '" <' + email + '>';
  return '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(trimmed))) + '?= <' + email + '>';
}

function draftSubject(p) {
  const base = (p.subject || '').trim();
  const params = p.params || {};
  if (!base) return 'Re: ' + String(params.what || 'your message').slice(0, 100);
  return /^re:/i.test(base) ? base : 'Re: ' + base;
}

function draftGreeting(senderName, senderEmail) {
  return globalThis.FlowDraftReply.draftGreeting(senderName, senderEmail);
}

function draftBodyText(p, attachment, attachmentSource, shareUrl) {
  return globalThis.FlowDraftReply.draftBodyText(p, attachment, attachmentSource, shareUrl);
}

function buildMimeMessage(opts) {
  const headers = [
    mimeHeader('To', opts.to),
    mimeHeader('Subject', opts.subject),
    'MIME-Version: 1.0'
  ];

  if (!opts.attachment) {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    headers.push('Content-Transfer-Encoding: base64');
    return headers.join('\r\n') + '\r\n\r\n' + chunk76(btoa(unescape(encodeURIComponent(opts.body))));
  }

  const boundary = 'flow_' + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  headers.push('Content-Type: multipart/mixed; boundary="' + boundary + '"');
  const parts = [
    '--' + boundary,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    chunk76(btoa(unescape(encodeURIComponent(opts.body)))),
    '--' + boundary,
    'Content-Type: ' + sanitizeMimeText(opts.attachment.mimeType || 'application/octet-stream'),
    'Content-Disposition: attachment; filename="' + sanitizeMimeText(String(opts.attachment.filename || 'attachment').replace(/"/g, '')) + '"',
    'Content-Transfer-Encoding: base64',
    '',
    chunk76(opts.attachment.base64),
    '--' + boundary + '--'
  ];
  return headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n');
}

// Best-effort: finds the Gmail thread this reply belongs to so the draft
// appears inline in the conversation instead of floating on its own.
// Never blocks the write on failing — a standalone draft the user still has
// to attach to the right thread manually is a worse outcome than not
// offering a draft at all, but a strictly better one than failing the
// whole action because a search query came back empty.
async function findThreadId(senderEmail, subject) {
  if (!senderEmail) return null;
  try {
    const q = 'from:' + senderEmail + (subject ? ' subject:"' + subject.replace(/"/g, '') + '"' : '');
    const res = await googleAuthedFetch(GOOGLE_GMAIL_API, '/users/me/threads?maxResults=1&q=' + encodeURIComponent(q), { soft: true });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.threads && data.threads[0] && data.threads[0].id) || null;
  } catch (e) {
    return null;
  }
}

// Raw byte estimate from the base64 length (4/3 inflation) rather than
// trusting a size the content script reported — comfortably under both
// Gmail's own 25MB compose limit and chrome.runtime.sendMessage's own
// ceiling once base64-encoded.
const GMAIL_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
// Graph fileAttachment (Mail.ReadWrite) accepts contentBytes under 3 MB.
const OUTLOOK_ATTACH_MAX_BYTES = 3 * 1024 * 1024;

// Same chunked btoa as content-gmail.js's own arrayBufferToBase64 — kept as
// a separate copy rather than a shared import because this file (a service
// worker) and that one (a content script) have never shared code, each
// reading and base64-encoding bytes from a different source (Gmail's
// cookie-authed attachment URLs there, the Drive API's own OAuth-authed
// bytes here).
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Docs, Sheets, and Slides are not byte files. alt=media 404s on them;
// export is the read that produces something a Gmail draft can hold.
const DRIVE_EXPORT = {
  'application/vnd.google-apps.document': { mime: 'application/pdf', ext: '.pdf' },
  'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
  'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: '.pdf' }
};

function driveExportPlan(mimeType) {
  return DRIVE_EXPORT[mimeType] || null;
}

function withExportExtension(name, ext) {
  const base = String(name || 'file').replace(/\.[A-Za-z0-9]{1,8}$/, '');
  if (!ext) return base;
  return base + (ext.charAt(0) === '.' ? ext : '.' + ext);
}

// One page is a hundred files. Four pages is the cap: enough to rank a
// real Drive, not a five-file sample, and not an unbounded crawl.
const DRIVE_SEARCH_PAGE_SIZE = 100;
const DRIVE_SEARCH_MAX_FILES = 400;

// A Drive files.list failure, as a silence the file chain can show.
// 403 with an insufficient-scope body is drive-not-granted (the cached
// chrome.identity token predates drive.readonly, or the grant never
// included it). Any other failure is drive-search-failed. The list itself
// stays null either way: a partial page is not "no file".
function driveSearchFailure(status, body) {
  const err = body && body.error;
  const reasons = [];
  if (err && Array.isArray(err.errors)) err.errors.forEach((e) => { if (e && e.reason) reasons.push(String(e.reason)); });
  if (err && Array.isArray(err.details)) err.details.forEach((d) => { if (d && d.reason) reasons.push(String(d.reason)); });
  const message = err && err.message ? String(err.message) : '';
  const scopeMiss = status === 403 && (
    reasons.indexOf('insufficientPermissions') !== -1
    || reasons.indexOf('ACCESS_TOKEN_SCOPE_INSUFFICIENT') !== -1
    || /insufficient authentication scopes/i.test(message)
    || /insufficient permission/i.test(message)
  );
  if (scopeMiss) return { reason: 'drive-not-granted', error: message || reasons.join(',') || 'insufficientPermissions' };
  return { reason: 'drive-search-failed', error: message || ('http-' + (status || 0)) };
}

async function readDriveFailure(res) {
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  const classified = driveSearchFailure(res && res.status, body);
  return { status: (res && res.status) || 0, reason: classified.reason, error: classified.error };
}

// Scopes on the token Chrome actually handed us. Only the hand-armed Outlook
// file trace asks. The access token is not returned and not logged.
async function googleTokenScopes() {
  try {
    const cred = await getGoogleAccessToken(false);
    const token = cred && cred.token;
    const res = await fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' + encodeURIComponent(token));
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    const scopes = String((data && data.scope) || '').split(/\s+/).filter(Boolean);
    return { ok: true, status: res.status, scopes };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

// q is an already-escaped Drive query (file attach, or a fact lookup built
// here from structured label/kind/name — never a raw q from the page). A
// failed page returns null rather than a short list — ranking a partial
// page is how a second, unseen file becomes "the only match".
// detail, when passed, receives status/reason/error of the failure.
// One 403 for a missing Drive scope drops the cached Chrome token and asks
// once more, silently. A grant that already includes drive.readonly can be
// reused. This retry does not open a consent window. A second 403 stops.
async function searchDriveFiles(q, detail) {
  if (!q) {
    if (detail) { detail.status = 0; detail.reason = 'drive-search-failed'; detail.error = 'empty-query'; }
    return null;
  }
  const files = [];
  let pageToken = '';
  let scopeRetried = false;
  while (files.length < DRIVE_SEARCH_MAX_FILES) {
    let path = '/files?q=' + encodeURIComponent(q)
      + '&pageSize=' + DRIVE_SEARCH_PAGE_SIZE
      + '&corpora=user&fields=' + encodeURIComponent('nextPageToken,files(id,name,mimeType,size,modifiedTime)');
    if (pageToken) path += '&pageToken=' + encodeURIComponent(pageToken);
    const res = await googleAuthedFetch(GOOGLE_DRIVE_API, path);
    if (!res.ok) {
      const fail = await readDriveFailure(res);
      if (fail.reason === 'drive-not-granted' && !scopeRetried) {
        scopeRetried = true;
        try {
          const stale = await getGoogleAuthToken(false);
          if (stale) await removeCachedGoogleAuthToken(stale);
        } catch (e) { /* the silent retry below asks again; it does not open a window */ }
        continue;
      }
      if (detail) { detail.status = fail.status; detail.reason = fail.reason; detail.error = fail.error; }
      return null;
    }
    const data = await res.json();
    const batch = data.files || [];
    for (let i = 0; i < batch.length && files.length < DRIVE_SEARCH_MAX_FILES; i++) files.push(batch[i]);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return files;
}

// flow:search-drive. files is the list only when ok. reason is drive-not-granted
// or drive-search-failed. trace adds the scopes on the token, nothing else.
async function searchDriveMessage(msg) {
  const trace = Boolean(msg && msg.trace);
  if (!(await googleConnected())) {
    const scopes = trace ? await googleTokenScopes() : null;
    return { ok: false, reason: 'drive-not-granted', status: 0, error: 'not-connected', files: [], fileCount: 0, scopes };
  }
  const detail = {};
  let files = null;
  try { files = await searchDriveFiles(msg && msg.query, detail); }
  catch (e) {
    const scopes = trace ? await googleTokenScopes() : null;
    return { ok: false, reason: 'drive-search-failed', status: 0, error: String(e && e.message || e), files: [], fileCount: 0, scopes };
  }
  const scopes = trace ? await googleTokenScopes() : null;
  if (!files) {
    return {
      ok: false,
      reason: detail.reason || 'drive-search-failed',
      status: detail.status || 0,
      error: detail.error || null,
      files: [],
      fileCount: 0,
      scopes
    };
  }
  return { ok: true, status: 200, files, fileCount: files.length, scopes };
}

// Drive files are fetched here, not by content-gmail.js, because reading a
// Drive file needs the same OAuth bearer token every other Google write in
// this file already holds — there is no reason to round-trip a base64
// payload through chrome.runtime.sendMessage between the content script and
// this worker when the worker can just call the Drive API directly.
// Metadata first (cheap) so an oversized file never has its bytes
// downloaded at all, not just rejected after the fact.
async function fetchDriveFileAsAttachment(driveFileId) {
  try {
    const metaRes = await googleAuthedFetch(GOOGLE_DRIVE_API, '/files/' + encodeURIComponent(driveFileId) + '?fields=name,mimeType,size');
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    if (meta.size && Number(meta.size) > GMAIL_ATTACHMENT_MAX_BYTES) return null;

    const exported = driveExportPlan(meta.mimeType);
    // A Docs/Sheets/Slides file has no bytes at alt=media. Export it.
    // Anything else in the google-apps family (a folder, a form) is not
    // an attachment, and inventing an empty file for it is not a close.
    if (!exported && String(meta.mimeType || '').indexOf('application/vnd.google-apps.') === 0) return null;
    const contentPath = exported
      ? '/files/' + encodeURIComponent(driveFileId) + '/export?mimeType=' + encodeURIComponent(exported.mime)
      : '/files/' + encodeURIComponent(driveFileId) + '?alt=media';
    const contentRes = await googleAuthedFetch(GOOGLE_DRIVE_API, contentPath);
    if (!contentRes.ok) return null;
    const buf = await contentRes.arrayBuffer();
    // Declared size can be absent or wrong; the actual byte count is the
    // real guard — same policy as content-gmail.js's own attachment fetch.
    if (buf.byteLength > GMAIL_ATTACHMENT_MAX_BYTES || buf.byteLength === 0) return null;

    return {
      filename: exported ? withExportExtension(meta.name, exported.ext) : (meta.name || 'attachment'),
      mimeType: exported ? exported.mime : (meta.mimeType || 'application/octet-stream'),
      base64: arrayBufferToBase64(buf)
    };
  } catch (e) {
    return null;
  }
}

// Reply-with-facts reads a Sheet or Doc through the Drive export endpoint.
// drive.readonly already covers that. No spreadsheets scope, no picker,
// and this function does not decide the match — it only returns the few
// candidate texts. Listing goes through searchDriveFiles. More than three
// files, a failed page, or a file too large to prove it holds a single
// cell is truncated so the caller stays silent.
const FACT_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const FACT_DOC_MIME = 'application/vnd.google-apps.document';
const FACT_EXPORT_MAX = 200000;
const FACT_FILE_CAP = 3;

function driveQuote(value) {
  return String(value || '').replace(/[\r\n\u0000]/g, ' ').replace(/\\/g, '\\\\').replace(/'/g, "\\'").trim().slice(0, 80);
}

async function factSources(ask) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  const factLabel = driveQuote(ask && ask.factLabel);
  const sourceName = driveQuote(ask && ask.sourceName);
  const kind = ask && (ask.sourceKind === 'sheet' || ask.sourceKind === 'doc') ? ask.sourceKind : null;
  if (factLabel.length < 2 || !kind) return { ok: true, sources: [], truncated: false };
  const mime = kind === 'doc'
    ? "mimeType = '" + FACT_DOC_MIME + "'"
    : "mimeType = '" + FACT_SHEET_MIME + "'";
  const needle = sourceName || factLabel;
  const field = sourceName ? 'name' : 'fullText';
  const q = 'trashed = false and ' + mime + ' and ' + field + " contains '" + needle + "'";
  try {
    const files = await searchDriveFiles(q);
    if (files === null) return { ok: false, reason: 'error' };
    if (!files.length) return { ok: true, sources: [], truncated: false };
    // More than a few files is not a sample we export and pick from.
    if (files.length > FACT_FILE_CAP) return { ok: true, sources: [], truncated: true };
    const sources = [];
    for (const f of files) {
      const isSheet = f.mimeType === FACT_SHEET_MIME;
      const isDoc = f.mimeType === FACT_DOC_MIME;
      if (!isSheet && !isDoc) continue;
      const exportType = isSheet ? 'text/csv' : 'text/plain';
      const exp = await googleAuthedFetch(
        GOOGLE_DRIVE_API,
        '/files/' + encodeURIComponent(f.id) + '/export?mimeType=' + encodeURIComponent(exportType)
      );
      if (!exp.ok || typeof exp.text !== 'function') return { ok: true, sources: [], truncated: true };
      const text = await exp.text();
      if (typeof text !== 'string' || text.length > FACT_EXPORT_MAX) return { ok: true, sources: [], truncated: true };
      sources.push({ id: f.id, name: f.name || '', kind: isSheet ? 'sheet' : 'doc', text });
    }
    if (!sources.length) return { ok: true, sources: [], truncated: true };
    return { ok: true, sources, truncated: false };
  } catch (e) {
    return { ok: false, reason: 'error' };
  }
}

async function gmailDraftWrite(p) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  if (!p.senderEmail) return { ok: false, reason: 'error', error: 'No sender address to reply to.' };

  const params = p.params || {};
  const shareUrl = googleShareUrl(params.shareUrl);
  if (params.shareLink) {
    if (!shareUrl) return { ok: false, reason: 'unclear', error: 'No file link to share.' };
  }
  // One fact into the shared draft POST. Undo deletes that draft. Never an
  // attachment, never a send, and never a second Drive search that could
  // swap the fact the chip already showed. A share-link draft is not this.
  if (params.replyFact && !params.shareLink) {
    const factLine = String(params.factLine || '').replace(/[\r\n]+/g, ' ').trim();
    if (!factLine || factLine.length > 180) {
      return { ok: false, reason: 'invalid', error: 'No single fact to insert.' };
    }
    params.factLine = factLine;
  }
  let attachment = null;
  let createdFileId = null;
  // 'thread' and 'picked' are files the user already saw. 'found' is the
  // one file core/file-attach.js already ranked as the only high-confidence
  // match — this writer does not search again and does not substitute a
  // different file if that one cannot be read. 'template' is a new file
  // made from an existing company template, never a blank document.
  let attachmentSource = null;
  if (!params.shareLink && !params.replyFact && params.includeAttachment && p.attachment && p.attachment.base64) {
    const approxBytes = Math.floor((p.attachment.base64.length * 3) / 4);
    // Oversized attachments degrade to a plain draft rather than failing the
    // whole action — the same "still useful, just not everything asked for"
    // shape as findThreadId() above.
    if (approxBytes <= GMAIL_ATTACHMENT_MAX_BYTES) {
      attachment = { filename: p.attachment.filename, mimeType: p.attachment.mimeType, base64: p.attachment.base64 };
      attachmentSource = 'thread';
    }
  }
  // A share-link draft (a Doc, Sheet, or saved file this same click
  // already created) and a one-fact reply do not search Drive and do not
  // attach a second file. Family A attach stays on the branches below.
  if (!params.shareLink && !params.replyFact) {
    // Create-when-missing: copy an existing template into a new file, then
    // attach that copy. Refuses when a required field is empty — a blank
    // document is not this close. The company template itself is never
    // modified or deleted.
    if (!attachment && params.templateId) {
      const fields = Array.isArray(params.fields) ? params.fields : [];
      const incomplete = !fields.length || fields.some((field) => !field || !String(field.value || '').trim());
      if (incomplete) return { ok: false, reason: 'error', error: 'Missing a fact the template needs.' };
      const made = await materializeFromTemplate(params.templateId, params.copyTitle || params.what);
      if (!made) return { ok: false, reason: 'error', error: 'Could not prepare a file from that template.' };
      attachment = made.attachment;
      createdFileId = made.createdFileId;
      attachmentSource = 'template';
    }
    // A resolved Drive file (the one high-confidence match, or a file the
    // user picked). If it cannot be read, stop — do not search for a
    // substitute and do not send a draft that claims the file is attached.
    if (!attachment && params.driveFileId) {
      attachment = await fetchDriveFileAsAttachment(params.driveFileId);
      if (!attachment) return { ok: false, reason: 'error', error: 'Could not attach that file.' };
      attachmentSource = params.attachSource === 'found' ? 'found' : 'picked';
    }
  }

  const threadId = await findThreadId(p.senderEmail, p.subject);
  const raw = base64UrlEncode(buildMimeMessage({
    to: toHeaderValue(p.senderEmail, p.senderName),
    subject: draftSubject(p),
    body: draftBodyText(p, attachment, attachmentSource, shareUrl),
    attachment
  }));

  const message = { raw };
  if (threadId) message.threadId = threadId;

  const res = await googleAuthedFetch(GOOGLE_GMAIL_API, '/users/me/drafts', {
    method: 'POST',
    body: JSON.stringify({ message })
  });
  if (res.status === 401 || res.status === 403) {
    if (createdFileId) await deleteDriveFile(createdFileId);
    return { ok: false, reason: 'not-connected' };
  }
  if (!res.ok) {
    if (createdFileId) await deleteDriveFile(createdFileId);
    let detail = '';
    try { detail = ((await res.json()).error || {}).message || ''; } catch (e) { /* body already consumed or not JSON */ }
    throw new Error('Gmail draft creation failed (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  const draft = await res.json();
  return {
    ok: true,
    where: 'Gmail',
    target: !attachment ? 'a draft reply'
      : attachmentSource === 'template' ? 'a draft reply with a file prepared from your template'
      : 'a draft reply with the attachment',
    written: draftWrittenLine(params),
    ref: createdFileId ? { draftId: draft.id, createdFileId } : { draftId: draft.id },
    // The Drafts API doesn't return a stable, documented deep link to one
    // specific draft the way Calendar's htmlLink does — linking to the
    // Drafts folder itself is the honest version of "go see it" rather than
    // a guessed URL that might not open the right thing.
    url: 'https://mail.google.com/mail/u/0/#drafts'
  };
}

// Reads the template (export for a Doc/Sheet/Slide, bytes otherwise) and
// uploads a new file this app created. drive.file can create and later
// delete that copy. The template id is only ever read.
async function materializeFromTemplate(templateId, title) {
  try {
    const metaRes = await googleAuthedFetch(GOOGLE_DRIVE_API, '/files/' + encodeURIComponent(templateId) + '?fields=name,mimeType,size');
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    const exported = driveExportPlan(meta.mimeType);
    if (!exported && String(meta.mimeType || '').indexOf('application/vnd.google-apps.') === 0) return null;
    if (!exported && meta.size && Number(meta.size) > GMAIL_ATTACHMENT_MAX_BYTES) return null;
    const contentPath = exported
      ? '/files/' + encodeURIComponent(templateId) + '/export?mimeType=' + encodeURIComponent(exported.mime)
      : '/files/' + encodeURIComponent(templateId) + '?alt=media';
    const contentRes = await googleAuthedFetch(GOOGLE_DRIVE_API, contentPath);
    if (!contentRes.ok) return null;
    const buf = await contentRes.arrayBuffer();
    if (buf.byteLength > GMAIL_ATTACHMENT_MAX_BYTES || buf.byteLength === 0) return null;
    const ext = exported ? exported.ext : ((String(meta.name || '').match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0]);
    const filename = withExportExtension(title || meta.name || 'file', ext);
    const mimeType = exported ? exported.mime : (meta.mimeType || 'application/octet-stream');
    const created = await uploadDriveCopy(filename, mimeType, buf);
    if (!created || !created.id) return null;
    return { createdFileId: created.id, attachment: { filename, mimeType, base64: arrayBufferToBase64(buf) } };
  } catch (e) {
    return null;
  }
}

// Name-token match for family B and for the "is there already a file?"
// check before a template create. This does not download or attach.
// Family A attach is searchDriveFiles plus core/file-attach.js.
// Zero hits or two-plus hits is not a file this close may use.
function driveNameHits(files, term) {
  function tokens(value) {
    return String(value || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }
  const needle = tokens(term);
  if (!needle.length || needle.join('').length < 2) return [];
  const hits = [];
  for (const file of files || []) {
    if (!file || file.trashed) continue;
    const name = tokens(file.name);
    let found = false;
    for (let i = 0; i <= name.length - needle.length; i++) {
      let same = true;
      for (let j = 0; j < needle.length; j++) {
        if (name[i + j] !== needle[j]) { same = false; break; }
      }
      if (same) { found = true; break; }
    }
    if (found) hits.push(file);
  }
  return hits;
}

function driveFileUrl(file) {
  const id = file && file.id;
  if (!id) return null;
  const mime = String((file && file.mimeType) || '');
  if (mime === 'application/vnd.google-apps.document') return 'https://docs.google.com/document/d/' + id + '/edit';
  if (mime === 'application/vnd.google-apps.spreadsheet') return 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
  if (mime === 'application/vnd.google-apps.presentation') return 'https://docs.google.com/presentation/d/' + id + '/edit';
  return 'https://drive.google.com/file/d/' + id + '/view';
}

async function driveFindOneByName(term) {
  try {
    if (!(await googleConnected())) return { match: 'unknown' };
    const needle = String(term || '').trim();
    if (needle.length < 2) return { match: 'unknown' };
    const escaped = needle.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = "trashed = false and name contains '" + escaped + "'";
    const files = await searchDriveFiles(q);
    if (!files) return { match: 'unknown' };
    const hits = driveNameHits(files, needle);
    if (hits.length !== 1) return { match: hits.length === 0 ? 'none' : 'many' };
    const file = hits[0];
    return {
      match: 'one',
      file: { id: file.id, name: file.name, mimeType: file.mimeType || '', url: driveFileUrl(file) }
    };
  } catch (e) {
    return { match: 'unknown' };
  }
}

function decodeBase64(b64) {
  const bin = atob(String(b64 || '').replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function driveFileResult(file, where, written) {
  if (!file || typeof file.id !== 'string' || !file.id) {
    return { ok: false, reason: 'error', error: 'Drive did not confirm the file.' };
  }
  return {
    ok: true,
    where: where,
    target: file.name || 'a file',
    written: written,
    ref: { fileId: file.id },
    url: file.webViewLink || driveFileUrl(file)
  };
}

function safeDriveTitle(value) {
  const title = String(value || 'Glance').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  return title || 'Glance';
}

async function googleDriveCreateDoc(p) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  const params = p.params || {};
  const html = typeof params.html === 'string' ? params.html.trim() : '';
  if (!html || html.length < 20) return { ok: false, reason: 'unclear', error: 'Nothing to put in the doc.' };
  const title = safeDriveTitle(params.title);
  const created = await uploadDriveCopy(title, 'application/vnd.google-apps.document', new TextEncoder().encode(html), 'text/html; charset=UTF-8');
  if (created && created.notConnected) return { ok: false, reason: 'not-connected' };
  if (!created || !created.id) return { ok: false, reason: 'error', error: 'Drive did not confirm the file.' };
  return driveFileResult(created, 'Google Docs', 'Doc · ' + (created.name || title));
}

async function googleDriveCreateSheet(p) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  const params = p.params || {};
  const csv = typeof params.csv === 'string' ? params.csv.trim() : '';
  if (!csv || csv.indexOf('\n') === -1) return { ok: false, reason: 'unclear', error: 'Nothing to put in the sheet.' };
  const title = safeDriveTitle(params.title);
  const created = await uploadDriveCopy(title, 'application/vnd.google-apps.spreadsheet', new TextEncoder().encode(csv), 'text/csv; charset=UTF-8');
  if (created && created.notConnected) return { ok: false, reason: 'not-connected' };
  if (!created || !created.id) return { ok: false, reason: 'error', error: 'Drive did not confirm the file.' };
  return driveFileResult(created, 'Google Sheets', 'Sheet · ' + (created.name || title));
}

async function googleDriveCopyFile(p) {
  if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
  const attachment = p.attachment;
  if (!attachment || !attachment.base64) return { ok: false, reason: 'unclear', error: 'No single attachment to save.' };
  const approxBytes = Math.floor((attachment.base64.length * 3) / 4);
  if (approxBytes > GMAIL_ATTACHMENT_MAX_BYTES) return { ok: false, reason: 'unclear', error: 'That attachment is too large to save.' };
  const name = safeDriveTitle(attachment.filename || 'attachment');
  const mime = String(attachment.mimeType || 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
  const created = await uploadDriveCopy(name, mime, decodeBase64(attachment.base64));
  if (created && created.notConnected) return { ok: false, reason: 'not-connected' };
  if (!created || !created.id) return { ok: false, reason: 'error', error: 'Drive did not confirm the file.' };
  return driveFileResult(created, 'Google Drive', 'Drive · ' + (created.name || name));
}

async function googleDriveTrash(ref) {
  if (!ref || !ref.fileId) return { ok: false };
  return { ok: await deleteDriveFile(ref.fileId) };
}

function googleShareUrl(value) {
  if (typeof value !== 'string') return null;
  if (!/^https:\/\/(?:docs|drive)\.google\.com\//.test(value)) return null;
  return value;
}

async function uploadDriveCopy(name, mimeType, buf, mediaType) {
  const contentType = mediaType || mimeType;
  const boundary = 'flow_upload_' + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  const meta = JSON.stringify({ name: name, mimeType: mimeType });
  const preamble = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + boundary + '\r\nContent-Type: ' + contentType + '\r\n\r\n';
  const ending = '\r\n--' + boundary + '--';
  const head = new TextEncoder().encode(preamble);
  const tail = new TextEncoder().encode(ending);
  const bytes = new Uint8Array(buf);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  const res = await googleAuthedFetch('https://www.googleapis.com/upload/drive/v3', '/files?uploadType=multipart&fields=' + encodeURIComponent('id,name,webViewLink,mimeType'), {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body
  });
  if (res.status === 401 || res.status === 403) return { notConnected: true };
  if (!res.ok) return null;
  const created = await res.json();
  if (!created || !created.id) return null;
  if (!created.webViewLink) created.webViewLink = driveFileUrl(created);
  return created;
}

async function deleteDriveFile(fileId) {
  if (!fileId) return false;
  try {
    const res = await googleAuthedFetch(GOOGLE_DRIVE_API, '/files/' + encodeURIComponent(fileId), { method: 'DELETE' });
    return res.ok || res.status === 404;
  } catch (e) {
    return false;
  }
}

async function gmailDraftUndo(ref) {
  if (!ref || !ref.draftId) return { ok: false };
  const res = await googleAuthedFetch(GOOGLE_GMAIL_API, '/users/me/drafts/' + encodeURIComponent(ref.draftId), {
    method: 'DELETE'
  });
  if (!(res.ok || res.status === 404)) return { ok: false };
  // The draft carried a file this close created. Undo removes that file
  // too. It never deletes the template the copy was made from.
  if (ref.createdFileId && !(await deleteDriveFile(ref.createdFileId))) return { ok: false };
  return { ok: true };
}

/* ------------------------------------------------------ Google Drive picker */

// content-gmail.js can't open chrome.windows itself (that API isn't exposed
// to content scripts), and the picker has to live in its own extension page
// rather than be loaded into the Gmail tab — Gmail's own CSP would be the
// one deciding whether https://apis.google.com's gapi loader is even
// allowed to run there, and there is no reason to depend on that. So the
// content script asks this worker to open the window, and this worker
// remembers which Gmail tab asked, keyed by the requestId the content
// script minted — multiple Gmail tabs can each have a picker open at once
// without their results crossing.
const pendingDrivePickers = new Map(); // requestId -> { tabId, windowId }

async function openDrivePicker(payload, sender) {
  const requestId = payload && payload.requestId;
  const tabId = sender && sender.tab && sender.tab.id;
  if (!requestId || !tabId) return { ok: false, error: 'Missing request context.' };

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('picker/picker.html') + '?requestId=' + encodeURIComponent(requestId),
    type: 'popup',
    width: 640,
    height: 620
  });
  if (!win) return { ok: false, error: 'Could not open the Drive picker window.' };
  pendingDrivePickers.set(requestId, { tabId, windowId: win.id });
  return { ok: true };
}

// picker.js posts this once, then closes its own window — this only ever
// routes the result back to the one Gmail tab that asked for it (via
// chrome.tabs.sendMessage), never a broadcast, so a second open Gmail tab
// never sees a file meant for the first.
function deliverDrivePickerResult(payload) {
  const { requestId, file, cancelled } = payload || {};
  const info = pendingDrivePickers.get(requestId);
  if (!info) return { ok: true }; // already delivered, or the requesting tab is gone
  pendingDrivePickers.delete(requestId);
  chrome.tabs.sendMessage(info.tabId, { type: 'flow:drive-file-result', requestId, file, cancelled }).catch(() => {});
  return { ok: true };
}

// The user closing the picker window (Escape, the × button, alt-F4) is a
// cancellation that never posts flow:drive-file-picked at all — without
// this, the content script's awaiting promise would simply hang forever.
chrome.windows.onRemoved.addListener((windowId) => {
  for (const [requestId, info] of pendingDrivePickers) {
    if (info.windowId === windowId) {
      pendingDrivePickers.delete(requestId);
      chrome.tabs.sendMessage(info.tabId, { type: 'flow:drive-file-result', requestId, cancelled: true }).catch(() => {});
    }
  }
});

/* ------------------------------------------------------------------ Notion */

async function getNotionAuth() {
  const { notionAuth } = await chrome.storage.local.get('notionAuth');
  return notionAuth || null;
}

function notionHeaders(token) {
  return {
    Authorization: 'Bearer ' + token,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json'
  };
}

// Notion database ids appear in URLs as 32 hex characters, sometimes hyphenated,
// sometimes preceded by a page title slug.
function parseNotionDatabaseId(input) {
  const m = String(input || '').replace(/-/g, '').match(/[0-9a-f]{32}/i);
  if (!m) return null;
  const h = m[0];
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

// Connecting verifies the credential against the real API before storing it, so
// a typo surfaces immediately in the popup instead of at the first click in Gmail.
async function connectNotion(token, databaseInput) {
  token = String(token || '').trim();
  const databaseId = parseNotionDatabaseId(databaseInput);
  if (!token) throw new Error('Paste the internal integration token from notion.so/my-integrations.');
  if (!databaseId) throw new Error('That doesn’t look like a Notion database link — open the database as a full page and copy the URL.');

  const res = await fetch(NOTION_API + '/databases/' + databaseId, { headers: notionHeaders(token) });
  if (res.status === 401) throw new Error('Notion rejected that token.');
  if (res.status === 404) throw new Error('Notion can see the token but not that database — open the database, click ⋯ › Connections, and add your integration.');
  if (!res.ok) throw new Error('Notion returned ' + res.status + '.');
  const db = await res.json();

  const title = (db.title || []).map((t) => t.plain_text).join('') || 'Untitled database';
  await chrome.storage.local.set({ notionAuth: { token, databaseId, dbTitle: title, schema: db.properties || {} } });
  return { title };
}

// Fills whichever properties the user's own database happens to have, matched by
// name and type. Anything unmatched still reaches the page body, so no extracted
// fact is ever silently dropped just because a column is missing.
function notionProperties(schema, p) {
  const f = p.facts || {};
  const props = {};
  const byType = (type, names) => {
    for (const [name, def] of Object.entries(schema || {})) {
      if (def.type !== type) continue;
      if (names.some((n) => name.toLowerCase().includes(n))) return name;
    }
    return null;
  };

  // The generated label ("Log ₪3,850 confirmed, Sep 22") is a task description,
  // not an identity — on its own in the title column it reads as a cryptic
  // system string. Leading with who the record is about (when Gmail gave us a
  // name) makes the row recognizable at a glance; the label still follows, so
  // no information is lost, only reordered.
  const titleName = Object.entries(schema || {}).find(([, d]) => d.type === 'title');
  if (titleName) {
    const identity = (p.senderName || '').trim();
    const content = identity ? identity + ' — ' + p.label : p.label;
    props[titleName[0]] = { title: [{ text: { content: content.slice(0, 200) } }] };
  }

  const amount = byType('number', ['amount', 'value', 'total', 'price', 'sum']);
  if (amount && f.money) props[amount] = { number: f.money.value };

  const date = byType('date', ['date', 'due', 'deadline', 'when']);
  if (date && f.date && f.date.iso) props[date] = { date: { start: f.date.iso } };

  const email = byType('email', ['email', 'contact', 'from']);
  if (email && p.senderEmail) props[email] = { email: p.senderEmail };

  const url = byType('url', ['url', 'link', 'source', 'email link']);
  if (url && p.threadUrl) props[url] = { url: p.threadUrl };

  // Deliberately not matching a "Company" column: the sender's personal name is
  // not their company, and writing it there would quietly corrupt the database.
  const person = byType('rich_text', ['from', 'sender', 'contact', 'who']);
  if (person && (p.senderName || p.senderEmail)) {
    props[person] = { rich_text: [{ text: { content: (p.senderName || p.senderEmail).slice(0, 200) } }] };
  }

  // Any select column is, by definition, a closed vocabulary the user already
  // typed out themselves (insurer names, product lines, ticket categories,
  // whatever). Rather than hardcoding a domain's worth of keyword lists here,
  // check the column's own configured option names against the source text —
  // this is what actually let "הראל" and "רכב" land in their select columns
  // instead of sitting unpopulated next to a title nobody could read.
  if (p.bodyText) {
    for (const [name, def] of Object.entries(schema || {})) {
      if (def.type !== 'select' || props[name]) continue;
      const options = (def.select && def.select.options) || [];
      const hit = options.find((o) => o.name && p.bodyText.includes(o.name));
      if (hit) props[name] = { select: { name: hit.name } };
    }
  }

  return props;
}

function notionBlocks(p) {
  const blocks = [];
  const lines = factLines(p);
  for (const [k, v] of lines) {
    blocks.push({
      object: 'block', type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ text: { content: (k + ': ' + v).slice(0, 1800) } }] }
    });
  }
  if (p.facts && p.facts.quote) {
    blocks.push({ object: 'block', type: 'quote', quote: { rich_text: [{ text: { content: p.facts.quote.slice(0, 1800) } }] } });
  }
  if (p.threadUrl) {
    blocks.push({
      object: 'block', type: 'paragraph',
      paragraph: { rich_text: [{ text: { content: 'Open the original email in Gmail', link: { url: p.threadUrl } } }] }
    });
  }
  blocks.push({
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: [{ text: { content: ATTRIBUTION_TEXT, link: { url: attributionUrl('notion') } } }, { text: { content: ' — one click, from the message itself.' } }], color: 'gray' }
  });
  return blocks;
}

// The schema captured at connect time goes stale the moment the user adds,
// renames, or retypes a column in their own database — notionProperties()
// would then never see the new column as something to match, so a fact
// that should now land in a real property silently falls back to the page
// body forever, for the life of the connection, with no way to notice
// short of reconnecting. Refetching before every write keeps property
// matching current. If the refresh itself fails (a momentary network
// blip, an expired-but-not-yet-revoked token), fall back to the last known
// schema rather than failing the whole write over a staleness check that
// isn't the reason the user clicked "Do It".
async function notionCurrentSchema(auth) {
  try {
    const res = await fetch(NOTION_API + '/databases/' + auth.databaseId, { headers: notionHeaders(auth.token) });
    if (!res.ok) return auth.schema || {};
    const db = await res.json();
    const schema = db.properties || {};
    // Keep the cached copy warm for anything else that reads getNotionAuth()
    // (e.g. dbTitle display) without making this write wait on it landing.
    chrome.storage.local.set({ notionAuth: Object.assign({}, auth, { schema }) });
    return schema;
  } catch (e) {
    return auth.schema || {};
  }
}

async function notionWrite(p) {
  const auth = await getNotionAuth();
  if (!auth) return { ok: false, reason: 'not-connected' };
  const schema = await notionCurrentSchema(auth);

  const res = await fetch(NOTION_API + '/pages', {
    method: 'POST',
    headers: notionHeaders(auth.token),
    body: JSON.stringify({
      parent: { database_id: auth.databaseId },
      properties: notionProperties(schema, p),
      children: notionBlocks(p)
    })
  });
  if (res.status === 401) return { ok: false, reason: 'not-connected' };
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch (e) { /* body already consumed or not JSON */ }
    throw new Error('Notion write failed (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  const page = await res.json();
  return { ok: true, where: 'Notion', target: auth.dbTitle || 'your database', ref: { pageId: page.id }, url: page.url || null };
}

// Notion has no hard delete over the API — archiving is the undo, and it is
// exactly what the trash button in the UI does.
async function notionUndo(ref) {
  const auth = await getNotionAuth();
  if (!auth || !ref || !ref.pageId) return { ok: false };
  const res = await fetch(NOTION_API + '/pages/' + encodeURIComponent(ref.pageId), {
    method: 'PATCH', headers: notionHeaders(auth.token), body: JSON.stringify({ archived: true })
  });
  // 404 matches the Google undoers: an already-archived page must not
  // stop a retry of the rest of the chain. Notion has no hard delete;
  // archiving is the undo, and a missing page is already gone.
  return { ok: res.ok || res.status === 404 };
}

/* ---------------------------------------------------- Notion, with a proof */
// docs/glance-ai/connectors/notion.md. Everything here is behind config/connectors.public.js (notionReadBack, notionOAuth), both off.

const NOTION_RELAY_URL = 'https://theflow-ai.com/.netlify/functions/token-relay';
const NOTION_AUTH_BASE = 'https://api.notion.com/v1/oauth/authorize';
const NOTION_OUTCOME_KEY = 'connectorOutcomes';
const NOTION_LEDGER_KEY = 'notionLedger';

async function relayInstallId() {
  const { glanceInstallId } = await chrome.storage.local.get('glanceInstallId');
  if (glanceInstallId) return glanceInstallId;
  const id = randomOAuthState();
  await chrome.storage.local.set({ glanceInstallId: id });
  return id;
}

async function relayTokenRequest(body) {
  const res = await fetch(NOTION_RELAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ vendor: 'notion', install_id: await relayInstallId() }, body))
  });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok || !data || typeof data.access_token !== 'string') return { ok: false, status: res.status, error: (data && data.error) || 'relay-failed' };
  return { ok: true, data: data };
}

// "Sign in with Notion": the one-time code goes to the relay (which adds the secret); the token comes back and lives only on this device.
async function connectNotionOAuth(databaseInput) {
  if (!CONNECTORS.notionOAuth) throw new Error('Sign in with Notion is not switched on in this build.');
  const clientId = publicClientId(OAUTH_PUBLIC.notionClientId);
  if (!clientId) throw new Error('Notion sign-in isn’t configured on this build yet.');
  const databaseId = parseNotionDatabaseId(databaseInput);
  if (!databaseId) throw new Error('That doesn’t look like a Notion database link — open the database as a full page and copy the URL.');
  const redirectUri = chrome.identity.getRedirectURL();
  const code = await runOAuthFlow(NOTION_AUTH_BASE + '?client_id=' + encodeURIComponent(clientId) + '&response_type=code&owner=user&redirect_uri=' + encodeURIComponent(redirectUri), 'Notion');
  const got = await relayTokenRequest({ grant: 'code', code: code, redirect_uri: redirectUri });
  if (!got.ok) throw new Error('Notion connection failed (' + got.error + ').');
  const res = await fetch(NOTION_API + '/databases/' + databaseId, { headers: notionHeaders(got.data.access_token) });
  if (res.status === 404) throw new Error('Notion signed you in but that database was not shared with Glance — pick it on the Notion screen, or open it, click ⋯ › Connections and add Glance.');
  if (!res.ok) throw new Error('Notion returned ' + res.status + '.');
  const db = await res.json();
  const title = (db.title || []).map((t) => t.plain_text).join('') || 'Untitled database';
  await chrome.storage.local.set({ notionAuth: { token: got.data.access_token, refreshToken: got.data.refresh_token || null, databaseId, dbTitle: title, schema: db.properties || {}, via: 'oauth' } });
  return { title };
}

async function notionRefreshToken(auth) {
  if (!auth || !auth.refreshToken) return null;
  const got = await relayTokenRequest({ grant: 'refresh', refresh_token: auth.refreshToken });
  if (!got.ok) return null;
  return { token: got.data.access_token, refreshToken: got.data.refresh_token || auth.refreshToken };
}

// The learning hook (core/connector-outcome.js): ids and enums only — never a title, address or text. Off with the switch.
async function noteConnectorOutcome(stage, startedAt, extra) {
  const O = globalThis.FlowConnectorOutcome;
  const e = extra || {};
  const connector = e.connector || 'notion';
  const ON = { notion: CONNECTORS.notionReadBack, asana: CONNECTORS.asanaReadBack, jira: CONNECTORS.jiraReadBack, linear: CONNECTORS.linearReadBack, docusign: CONNECTORS.docusignReadBack, dropbox: CONNECTORS.dropboxReadBack, teams: CONNECTORS.teamsAnswerReadBack };
  const DEST = { notion: 'notion/page', asana: 'asana/task', jira: 'jira/issue', linear: 'linear/issue', docusign: 'docusign/envelope', dropbox: 'dropbox/file', teams: 'teams/chat-message' };
  const enabled = ON[connector];
  if (!O || !enabled) return;
  const input = Object.assign({ closeType: 'task', stage: stage, at: Date.now(), latencyMs: startedAt ? Date.now() - startedAt : 0, destinationSystem: DEST[connector] }, e, { connector: connector });
  const ev = O.buildEvent(input, { enabled: enabled });
  if (!ev) return;
  try {
    const cur = (await chrome.storage.local.get(NOTION_OUTCOME_KEY))[NOTION_OUTCOME_KEY];
    await chrome.storage.local.set({ [NOTION_OUTCOME_KEY]: O.append(cur, ev) });
  } catch (err) { /* a learning note never blocks a close */ }
}

function notionCloseEngine() {
  return globalThis.FlowNotionClose.create({
    fetch: (url, init) => fetch(url, init),
    getAuth: getNotionAuth,
    saveAuth: async (a) => { await chrome.storage.local.set({ notionAuth: a }); },
    refresh: notionRefreshToken,
    buildProof: globalThis.FlowProofOfClose && globalThis.FlowProofOfClose.buildProof,
    ledger: {
      get: async (k) => { const m = (await chrome.storage.local.get(NOTION_LEDGER_KEY))[NOTION_LEDGER_KEY] || {}; return m[k] || null; },
      set: async (k, v) => {
        const m = (await chrome.storage.local.get(NOTION_LEDGER_KEY))[NOTION_LEDGER_KEY] || {};
        m[k] = v;
        const keys = Object.keys(m);
        if (keys.length > 200) keys.sort((a, b) => (m[a].at || 0) - (m[b].at || 0)).slice(0, keys.length - 200).forEach((x) => { delete m[x]; });
        await chrome.storage.local.set({ [NOTION_LEDGER_KEY]: m });
      }
    }
  });
}

function notionLoopKey(p, title) {
  const base = String((p && (p.messageId || p.outlookIncomingId || p.incomingId || p.threadUrl)) || '');
  let h = 0;
  const s = String(title || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 'notion:' + base + ':' + h.toString(36);
}

async function notionReadBackWrite(p) {
  const started = Date.now();
  const title = googleTaskTitle(p);
  const close = taskClosePayload(p);
  const r = await notionCloseEngine().write({ key: notionLoopKey(p, title), title: title, dueIso: close.dueIso || null });
  const lang = /[֐-׿]/.test(title) ? 'he' : 'en';
  if (r.ok) {
    await noteConnectorOutcome('approved', started, { lang: lang });
    await noteConnectorOutcome('handled', started, { lang: lang });
    return { ok: true, where: 'Notion', target: 'your database', written: 'Added to Notion.', ref: r.ref, proof: r.proof, url: r.url || null };
  }
  if (r.reason === 'verify_failed' || r.reason === 'proof_pending') await noteConnectorOutcome('readback_failed', started, { lang: lang });
  return { ok: false, reason: r.reason, ref: r.ref || null, proof: null, where: 'Notion' };
}

async function notionReadBackUndo(ref) {
  const r = await notionCloseEngine().undo(ref);
  if (r.ok) await noteConnectorOutcome('undone', 0, {});
  return r;
}

/* ----------------------------------------------------- Asana, with a proof */
// docs/glance-ai/connectors/asana.md. Everything here is behind config/connectors.public.js (asanaReadBack, asanaOAuth), both off.

const ASANA_API = 'https://app.asana.com/api/1.0';
const ASANA_AUTH_BASE = 'https://app.asana.com/-/oauth_authorize';
const ASANA_LEDGER_KEY = 'asanaLedger';

async function getAsanaAuth() {
  const { asanaAuth } = await chrome.storage.local.get('asanaAuth');
  return asanaAuth || null;
}

// A project link is https://app.asana.com/0/<project>/list or .../project/<project>/...; a bare number also works.
function parseAsanaProjectGid(input) {
  const t = String(input || '').trim();
  if (/^\d{6,30}$/.test(t)) return t;
  const m = t.match(/\/project\/(\d{6,30})/) || t.match(/\/0\/(\d{6,30})/);
  return m ? m[1] : null;
}

function base64Url(bytes) {
  return btoa(String.fromCharCode.apply(null, Array.from(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// "Sign in with Asana" (OAuth with PKCE). The one-time code and the verifier go to the relay, which adds the secret.
async function connectAsanaOAuth(projectInput) {
  if (!CONNECTORS.asanaOAuth) throw new Error('Sign in with Asana is not switched on in this build.');
  const clientId = publicClientId(OAUTH_PUBLIC.asanaClientId);
  if (!clientId) throw new Error('Asana sign-in isn’t configured on this build yet.');
  const projectGid = parseAsanaProjectGid(projectInput);
  if (!projectGid) throw new Error('That doesn’t look like an Asana project link — open the project and copy the URL.');
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const redirectUri = chrome.identity.getRedirectURL();
  const code = await runOAuthFlow(ASANA_AUTH_BASE + '?client_id=' + encodeURIComponent(clientId) + '&response_type=code&redirect_uri=' + encodeURIComponent(redirectUri) + '&code_challenge=' + challenge + '&code_challenge_method=S256', 'Asana');
  const got = await relayTokenRequest({ vendor: 'asana', grant: 'code', code: code, code_verifier: verifier, redirect_uri: redirectUri });
  if (!got.ok) throw new Error('Asana connection failed (' + got.error + ').');
  const res = await fetch(ASANA_API + '/projects/' + projectGid + '?opt_fields=name', { headers: { Authorization: 'Bearer ' + got.data.access_token, Accept: 'application/json' } });
  if (res.status === 403 || res.status === 404) throw new Error('Asana signed you in but cannot open that project — check the link and that you are a member.');
  if (!res.ok) throw new Error('Asana returned ' + res.status + '.');
  const body = await res.json();
  const name = (body && body.data && body.data.name) || 'Asana project';
  await chrome.storage.local.set({ asanaAuth: { token: got.data.access_token, refreshToken: got.data.refresh_token || null, projectGid: projectGid, projectName: name, via: 'oauth' } });
  return { title: name };
}

async function asanaRefreshToken(auth) {
  if (!auth || !auth.refreshToken) return null;
  const got = await relayTokenRequest({ vendor: 'asana', grant: 'refresh', refresh_token: auth.refreshToken });
  if (!got.ok) return null;
  return { token: got.data.access_token, refreshToken: got.data.refresh_token || auth.refreshToken };
}

function asanaCloseEngine() {
  return globalThis.FlowAsanaClose.create({
    fetch: (url, init) => fetch(url, init),
    getAuth: getAsanaAuth,
    saveAuth: async (a) => { await chrome.storage.local.set({ asanaAuth: a }); },
    refresh: asanaRefreshToken,
    buildProof: globalThis.FlowProofOfClose && globalThis.FlowProofOfClose.buildProof,
    ledger: {
      get: async (k) => { const m = (await chrome.storage.local.get(ASANA_LEDGER_KEY))[ASANA_LEDGER_KEY] || {}; return m[k] || null; },
      set: async (k, v) => {
        const m = (await chrome.storage.local.get(ASANA_LEDGER_KEY))[ASANA_LEDGER_KEY] || {};
        m[k] = v;
        const keys = Object.keys(m);
        if (keys.length > 200) keys.sort((a, b) => (m[a].at || 0) - (m[b].at || 0)).slice(0, keys.length - 200).forEach((x) => { delete m[x]; });
        await chrome.storage.local.set({ [ASANA_LEDGER_KEY]: m });
      }
    }
  });
}

async function asanaReadBackWrite(p) {
  const started = Date.now();
  const title = googleTaskTitle(p);
  const close = taskClosePayload(p);
  const r = await asanaCloseEngine().write({ key: notionLoopKey(p, title).replace(/^notion:/, 'asana:'), title: title, dueIso: close.dueIso || null });
  const lang = /[֐-׿]/.test(title) ? 'he' : 'en';
  if (r.ok) {
    await noteConnectorOutcome('approved', started, { connector: 'asana', lang: lang });
    await noteConnectorOutcome('handled', started, { connector: 'asana', lang: lang });
    return { ok: true, where: 'Asana', target: 'your project', written: 'Added to Asana.', ref: r.ref, proof: r.proof, url: r.url || null };
  }
  if (r.reason === 'verify_failed' || r.reason === 'proof_pending') await noteConnectorOutcome('readback_failed', started, { connector: 'asana', lang: lang });
  return { ok: false, reason: r.reason, ref: r.ref || null, proof: null, where: 'Asana' };
}

async function asanaReadBackUndo(ref) {
  const r = await asanaCloseEngine().undo(ref);
  if (r.ok) await noteConnectorOutcome('undone', 0, { connector: 'asana' });
  return r;
}

/* ------------------------------------------------------ Jira, with a proof */
// docs/glance-ai/connectors/jira.md. Everything here is behind config/connectors.public.js (jiraReadBack, jiraOAuth), both off.

const JIRA_AUTH_BASE = 'https://auth.atlassian.com/authorize';
const JIRA_SCOPES = 'read:jira-work write:jira-work offline_access';
const JIRA_LEDGER_KEY = 'jiraLedger';

async function getJiraAuth() {
  const { jiraAuth } = await chrome.storage.local.get('jiraAuth');
  return jiraAuth || null;
}

// "OPS", a board/project URL (.../projects/OPS/...) or an issue URL (.../browse/OPS-12). Returns { key, host } or null.
function parseJiraProject(input) {
  const t = String(input || '').trim();
  if (/^[A-Z][A-Z0-9_]{1,9}$/.test(t)) return { key: t, host: '' };
  let host = '';
  try { host = new URL(t).hostname; } catch (e) { return null; }
  if (!/^[a-z0-9-]+\.atlassian\.net$/.test(host)) return null;
  const m = t.match(/\/projects\/([A-Z][A-Z0-9_]{1,9})(?:[/?#]|$)/) || t.match(/\/browse\/([A-Z][A-Z0-9_]{1,9})-\d+/);
  return m ? { key: m[1], host: host } : null;
}

// "Sign in with Atlassian" (OAuth 2.0 3LO). The one-time code goes to the relay, which adds the secret.
async function connectJiraOAuth(projectInput) {
  if (!CONNECTORS.jiraOAuth) throw new Error('Sign in with Jira is not switched on in this build.');
  const clientId = publicClientId(OAUTH_PUBLIC.jiraClientId);
  if (!clientId) throw new Error('Jira sign-in isn’t configured on this build yet.');
  const proj = parseJiraProject(projectInput);
  if (!proj) throw new Error('Paste the Jira project key (for example OPS) or a link to the project on your atlassian.net site.');
  const redirectUri = chrome.identity.getRedirectURL();
  const code = await runOAuthFlow(JIRA_AUTH_BASE + '?audience=api.atlassian.com&client_id=' + encodeURIComponent(clientId) + '&scope=' + encodeURIComponent(JIRA_SCOPES) + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&response_type=code&prompt=consent', 'Jira');
  const got = await relayTokenRequest({ vendor: 'jira', grant: 'code', code: code, redirect_uri: redirectUri });
  if (!got.ok) throw new Error('Jira connection failed (' + got.error + ').');
  const bearer = { Authorization: 'Bearer ' + got.data.access_token, Accept: 'application/json' };
  const sites = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', { headers: bearer });
  if (!sites.ok) throw new Error('Jira returned ' + sites.status + ' when listing your sites.');
  const list = (await sites.json()) || [];
  const usable = (Array.isArray(list) ? list : []).filter((r) => r && /^[0-9a-f-]{36}$/.test(String(r.id)) && /^https:\/\/[a-z0-9-]+\.atlassian\.net\/?$/.test(String(r.url || '')));
  const pick = proj.host ? usable.filter((r) => new URL(r.url).hostname === proj.host) : usable;
  if (pick.length !== 1) throw new Error(pick.length ? 'You have several Jira sites; paste a link to the project so Glance knows which one.' : 'Glance found no Jira site it can use on that account.');
  const site = pick[0];
  const pr = await fetch('https://api.atlassian.com/ex/jira/' + site.id + '/rest/api/3/project/' + proj.key, { headers: bearer });
  if (pr.status === 403 || pr.status === 404) throw new Error('Jira signed you in but cannot open project ' + proj.key + ' — check the key and that you can create issues in it.');
  if (!pr.ok) throw new Error('Jira returned ' + pr.status + '.');
  const project = await pr.json();
  const types = (project && Array.isArray(project.issueTypes) ? project.issueTypes : []).filter((x) => x && /^\d{1,12}$/.test(String(x.id)) && !x.subtask);
  const type = types.find((x) => x.name === 'Task') || types[0];
  if (!type) throw new Error('That project has no issue type Glance can create.');
  await chrome.storage.local.set({ jiraAuth: { token: got.data.access_token, refreshToken: got.data.refresh_token || null, cloudId: site.id, siteUrl: site.url.replace(/\/$/, ''), projectKey: proj.key, projectName: (project && project.name) || proj.key, issueTypeId: String(type.id), issueTypeName: type.name, via: 'oauth' } });
  return { title: (project && project.name) || proj.key };
}

// Atlassian rotates the refresh token on every refresh: both new values are returned and saved.
async function jiraRefreshToken(auth) {
  if (!auth || !auth.refreshToken) return null;
  const got = await relayTokenRequest({ vendor: 'jira', grant: 'refresh', refresh_token: auth.refreshToken });
  if (!got.ok) return null;
  return { token: got.data.access_token, refreshToken: got.data.refresh_token || auth.refreshToken };
}

function jiraCloseEngine() {
  return globalThis.FlowJiraClose.create({
    fetch: (url, init) => fetch(url, init),
    getAuth: getJiraAuth,
    saveAuth: async (a) => { await chrome.storage.local.set({ jiraAuth: a }); },
    refresh: jiraRefreshToken,
    buildProof: globalThis.FlowProofOfClose && globalThis.FlowProofOfClose.buildProof,
    ledger: {
      get: async (k) => { const m = (await chrome.storage.local.get(JIRA_LEDGER_KEY))[JIRA_LEDGER_KEY] || {}; return m[k] || null; },
      set: async (k, v) => {
        const m = (await chrome.storage.local.get(JIRA_LEDGER_KEY))[JIRA_LEDGER_KEY] || {};
        m[k] = v;
        const keys = Object.keys(m);
        if (keys.length > 200) keys.sort((a, b) => (m[a].at || 0) - (m[b].at || 0)).slice(0, keys.length - 200).forEach((x) => { delete m[x]; });
        await chrome.storage.local.set({ [JIRA_LEDGER_KEY]: m });
      }
    }
  });
}

async function jiraReadBackWrite(p) {
  const started = Date.now();
  const title = googleTaskTitle(p);
  const close = taskClosePayload(p);
  const r = await jiraCloseEngine().write({ key: notionLoopKey(p, title).replace(/^notion:/, 'jira:'), title: title, dueIso: close.dueIso || null });
  const lang = /[֐-׿]/.test(title) ? 'he' : 'en';
  if (r.ok) {
    await noteConnectorOutcome('approved', started, { connector: 'jira', lang: lang });
    await noteConnectorOutcome('handled', started, { connector: 'jira', lang: lang });
    return { ok: true, where: 'Jira', target: 'your project', written: 'Added to Jira.', ref: r.ref, proof: r.proof, url: r.url || null };
  }
  if (r.reason === 'verify_failed' || r.reason === 'proof_pending') await noteConnectorOutcome('readback_failed', started, { connector: 'jira', lang: lang });
  return { ok: false, reason: r.reason, ref: r.ref || null, proof: null, where: 'Jira' };
}

async function jiraReadBackUndo(ref) {
  const r = await jiraCloseEngine().undo(ref);
  if (r.ok) await noteConnectorOutcome('undone', 0, { connector: 'jira' });
  return r;
}

/* ---------------------------------------------------- Linear, with a proof */
// docs/glance-ai/connectors/linear.md. Everything here is behind config/connectors.public.js (linearReadBack, linearOAuth), both off.

const LINEAR_AUTH_BASE = 'https://linear.app/oauth/authorize';
const LINEAR_API = 'https://api.linear.app/graphql';
const LINEAR_SCOPES = 'read,write';
const LINEAR_LEDGER_KEY = 'linearLedger';

async function getLinearAuth() {
  const { linearAuth } = await chrome.storage.local.get('linearAuth');
  return linearAuth || null;
}

// "ENG", or a Linear link (https://linear.app/<workspace>/team/ENG/...). Returns the team key or null.
function parseLinearTeamKey(input) {
  const t = String(input || '').trim();
  if (/^[A-Z][A-Z0-9]{1,6}$/.test(t)) return t;
  let u = null;
  try { u = new URL(t); } catch (e) { return null; }
  if (u.hostname !== 'linear.app') return null;
  const m = u.pathname.match(/\/team\/([A-Z][A-Z0-9]{1,6})(?:\/|$)/);
  return m ? m[1] : null;
}

// "Sign in with Linear" (OAuth 2.0 authorization code, PKCE S256). The one-time code and the verifier go to the relay, which adds the secret.
async function connectLinearOAuth(teamInput) {
  if (!CONNECTORS.linearOAuth) throw new Error('Sign in with Linear is not switched on in this build.');
  const clientId = publicClientId(OAUTH_PUBLIC.linearClientId);
  if (!clientId) throw new Error('Linear sign-in isn’t configured on this build yet.');
  const teamKey = parseLinearTeamKey(teamInput);
  if (!teamKey) throw new Error('Paste the Linear team key (for example ENG) or a link to the team.');
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const redirectUri = chrome.identity.getRedirectURL();
  const code = await runOAuthFlow(LINEAR_AUTH_BASE + '?client_id=' + encodeURIComponent(clientId) + '&response_type=code&scope=' + encodeURIComponent(LINEAR_SCOPES) + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&code_challenge=' + challenge + '&code_challenge_method=S256', 'Linear');
  const got = await relayTokenRequest({ vendor: 'linear', grant: 'code', code: code, code_verifier: verifier, redirect_uri: redirectUri });
  if (!got.ok) throw new Error('Linear connection failed (' + got.error + ').');
  const res = await fetch(LINEAR_API, { method: 'POST', headers: { Authorization: 'Bearer ' + got.data.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query { teams(first: 100) { nodes { id key name } } }' }) });
  if (!res.ok) throw new Error('Linear returned ' + res.status + '.');
  const body = await res.json();
  const nodes = (body && body.data && body.data.teams && Array.isArray(body.data.teams.nodes)) ? body.data.teams.nodes : [];
  const team = nodes.find((n) => n && n.key === teamKey && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(n.id)));
  if (!team) throw new Error('Linear signed you in but found no team with the key ' + teamKey + ' that you belong to.');
  await chrome.storage.local.set({ linearAuth: { token: got.data.access_token, refreshToken: got.data.refresh_token || null, teamId: team.id, teamKey: team.key, teamName: team.name || team.key, via: 'oauth' } });
  return { title: team.name || team.key };
}

async function linearRefreshToken(auth) {
  if (!auth || !auth.refreshToken) return null;
  const got = await relayTokenRequest({ vendor: 'linear', grant: 'refresh', refresh_token: auth.refreshToken });
  if (!got.ok) return null;
  return { token: got.data.access_token, refreshToken: got.data.refresh_token || auth.refreshToken };
}

function linearCloseEngine() {
  return globalThis.FlowLinearClose.create({
    fetch: (url, init) => fetch(url, init),
    getAuth: getLinearAuth,
    saveAuth: async (a) => { await chrome.storage.local.set({ linearAuth: a }); },
    refresh: linearRefreshToken,
    uuid: () => crypto.randomUUID(),
    buildProof: globalThis.FlowProofOfClose && globalThis.FlowProofOfClose.buildProof,
    ledger: {
      get: async (k) => { const m = (await chrome.storage.local.get(LINEAR_LEDGER_KEY))[LINEAR_LEDGER_KEY] || {}; return m[k] || null; },
      set: async (k, v) => {
        const m = (await chrome.storage.local.get(LINEAR_LEDGER_KEY))[LINEAR_LEDGER_KEY] || {};
        m[k] = v;
        const keys = Object.keys(m);
        if (keys.length > 200) keys.sort((a, b) => (m[a].at || 0) - (m[b].at || 0)).slice(0, keys.length - 200).forEach((x) => { delete m[x]; });
        await chrome.storage.local.set({ [LINEAR_LEDGER_KEY]: m });
      }
    }
  });
}

async function linearReadBackWrite(p) {
  const started = Date.now();
  const title = googleTaskTitle(p);
  const close = taskClosePayload(p);
  const r = await linearCloseEngine().write({ key: notionLoopKey(p, title).replace(/^notion:/, 'linear:'), title: title, dueIso: close.dueIso || null });
  const lang = /[֐-׿]/.test(title) ? 'he' : 'en';
  if (r.ok) {
    await noteConnectorOutcome('approved', started, { connector: 'linear', lang: lang });
    await noteConnectorOutcome('handled', started, { connector: 'linear', lang: lang });
    return { ok: true, where: 'Linear', target: 'your team', written: 'Added to Linear.', ref: r.ref, proof: r.proof, url: r.url || null };
  }
  if (r.reason === 'verify_failed' || r.reason === 'proof_pending') await noteConnectorOutcome('readback_failed', started, { connector: 'linear', lang: lang });
  return { ok: false, reason: r.reason, ref: r.ref || null, proof: null, where: 'Linear' };
}

async function linearReadBackUndo(ref) {
  const r = await linearCloseEngine().undo(ref);
  if (r.ok) await noteConnectorOutcome('undone', 0, { connector: 'linear' });
  return r;
}

/* -------------------------------------------------- DocuSign, read-only proof */
// docs/glance-ai/connectors/docusign.md. READ-ONLY: Glance reads one envelope's status; it never creates, sends or changes an envelope.
// Everything here is behind config/connectors.public.js (docusignReadBack, docusignOAuth, docusignDemo), all off.

const DOCUSIGN_LEDGER_KEY = 'docusignLedger';

function docusignHosts() {
  const demo = CONNECTORS.docusignDemo === true;
  return { vendor: demo ? 'docusign-demo' : 'docusign', auth: demo ? 'https://account-d.docusign.com/oauth/auth' : 'https://account.docusign.com/oauth/auth', userinfo: demo ? 'https://account-d.docusign.com/oauth/userinfo' : 'https://account.docusign.com/oauth/userinfo' };
}

async function getDocusignAuth() {
  const { docusignAuth } = await chrome.storage.local.get('docusignAuth');
  return docusignAuth || null;
}

// "Sign in with DocuSign" (OAuth 2.0 authorization code). The one-time code goes to the relay, which adds the secret.
async function connectDocusignOAuth() {
  if (!CONNECTORS.docusignOAuth) throw new Error('Sign in with DocuSign is not switched on in this build.');
  const clientId = publicClientId(OAUTH_PUBLIC.docusignClientId);
  if (!clientId) throw new Error('DocuSign sign-in isn’t configured on this build yet.');
  const h = docusignHosts();
  const redirectUri = chrome.identity.getRedirectURL();
  const code = await runOAuthFlow(h.auth + '?response_type=code&scope=signature&client_id=' + encodeURIComponent(clientId) + '&redirect_uri=' + encodeURIComponent(redirectUri), 'DocuSign');
  const got = await relayTokenRequest({ vendor: h.vendor, grant: 'code', code: code, redirect_uri: redirectUri });
  if (!got.ok) throw new Error('DocuSign connection failed (' + got.error + ').');
  const info = await fetch(h.userinfo, { headers: { Authorization: 'Bearer ' + got.data.access_token, Accept: 'application/json' } });
  if (!info.ok) throw new Error('DocuSign returned ' + info.status + ' when reading your account.');
  const body = await info.json();
  const accounts = (body && Array.isArray(body.accounts) ? body.accounts : []).filter((a) => a && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(a.account_id)) && /^https:\/\/[a-z0-9-]+\.docusign\.net$/.test(String(a.base_uri || '')));
  const acct = accounts.find((a) => a.is_default === true) || accounts[0];
  if (!acct) throw new Error('DocuSign signed you in but found no account Glance can read.');
  await chrome.storage.local.set({ docusignAuth: { token: got.data.access_token, refreshToken: got.data.refresh_token || null, accountId: acct.account_id, baseUri: acct.base_uri, accountName: String(acct.account_name || '').slice(0, 80), demo: CONNECTORS.docusignDemo === true, via: 'oauth' } });
  return { title: String(acct.account_name || 'DocuSign').slice(0, 80) };
}

async function docusignRefreshToken(auth) {
  if (!auth || !auth.refreshToken) return null;
  const got = await relayTokenRequest({ vendor: auth.demo ? 'docusign-demo' : 'docusign', grant: 'refresh', refresh_token: auth.refreshToken });
  if (!got.ok) return null;
  return { token: got.data.access_token, refreshToken: got.data.refresh_token || auth.refreshToken };
}

function docusignCloseEngine() {
  return globalThis.FlowDocusignClose.create({
    fetch: (url, init) => fetch(url, init),
    getAuth: getDocusignAuth,
    saveAuth: async (a) => { await chrome.storage.local.set({ docusignAuth: a }); },
    refresh: docusignRefreshToken,
    buildProof: globalThis.FlowProofOfClose && globalThis.FlowProofOfClose.buildProof,
    ledger: {
      get: async (k) => { const m = (await chrome.storage.local.get(DOCUSIGN_LEDGER_KEY))[DOCUSIGN_LEDGER_KEY] || {}; return m[k] || null; },
      set: async (k, v) => {
        const m = (await chrome.storage.local.get(DOCUSIGN_LEDGER_KEY))[DOCUSIGN_LEDGER_KEY] || {};
        m[k] = v;
        const keys = Object.keys(m);
        if (keys.length > 200) keys.sort((a, b) => (m[a].at || 0) - (m[b].at || 0)).slice(0, keys.length - 200).forEach((x) => { delete m[x]; });
        await chrome.storage.local.set({ [DOCUSIGN_LEDGER_KEY]: m });
      }
    }
  });
}

// payload: { key, envelope } — the loop's own id and the envelope id or DocuSign link the person linked to it.
async function docusignCheck(payload) {
  const started = Date.now();
  const r = await docusignCloseEngine().check(payload || {});
  if (r.closed) await noteConnectorOutcome('handled', started, { connector: 'docusign', closeType: 'signature' });
  else if (r.reason === 'verify_failed') await noteConnectorOutcome('readback_failed', started, { connector: 'docusign', closeType: 'signature' });
  return r;
}

async function docusignRelease(payload) {
  const r = await docusignCloseEngine().release((payload || {}).key);
  if (r.ok) await noteConnectorOutcome('undone', 0, { connector: 'docusign', closeType: 'signature' });
  return r;
}

/* ------------------------------------------------ Teams chat answer (Graph), with a proof */
// docs/glance-ai/connectors/teams.md. READ-ONLY: Glance reads one chat the person linked to one loop; it never posts, edits or deletes a message.
// It uses the Outlook connection the person already made, and only the Chat.Read scope the Connect screen's Teams box already asks.
// Everything here is behind config/connectors.public.js (teamsAnswerReadBack), off.

const TEAMS_ANSWER_LEDGER_KEY = 'teamsAnswerLedger';

function teamsAnswerEngine() {
  return globalThis.FlowTeamsAnswerClose.create({
    graph: graphJson,
    buildProof: globalThis.FlowProofOfClose && globalThis.FlowProofOfClose.buildProof,
    ledger: {
      get: async (k) => { const m = (await chrome.storage.local.get(TEAMS_ANSWER_LEDGER_KEY))[TEAMS_ANSWER_LEDGER_KEY] || {}; return m[k] || null; },
      set: async (k, v) => {
        const m = (await chrome.storage.local.get(TEAMS_ANSWER_LEDGER_KEY))[TEAMS_ANSWER_LEDGER_KEY] || {};
        m[k] = v;
        const keys = Object.keys(m);
        if (keys.length > 200) keys.sort((a, b) => (m[a].at || 0) - (m[b].at || 0)).slice(0, keys.length - 200).forEach((x) => { delete m[x]; });
        await chrome.storage.local.set({ [TEAMS_ANSWER_LEDGER_KEY]: m });
      }
    }
  });
}

// Chat.Read must be among the scopes the person's Microsoft sign-in actually holds; otherwise nothing is asked and nothing is read.
async function teamsChatGranted() {
  const session = await outlookSession({});
  if (!session || !session.ok || !session.token) return { ok: false, reason: 'not-connected' };
  const Cal = globalThis.FlowOutlookCalendar;
  const scopes = (Cal && Cal.scopesFromToken) ? Cal.scopesFromToken(session.token) : session.token.grantedScopes;
  const list = Array.isArray(scopes) ? scopes : (typeof scopes === 'string' ? scopes.split(/[\s,]+/) : []);
  const has = list.some((s) => String(s || '').replace(/^https:\/\/graph\.microsoft\.com\//i, '').toLowerCase() === 'chat.read');
  return has ? { ok: true } : { ok: false, reason: 'chat-not-granted' };
}

// payload: { key, chatId (a chat id or a Teams chat link), askedAtIso, direction: "mine" | "theirs" }
async function teamsAnswerCheck(payload) {
  const started = Date.now();
  const granted = await teamsChatGranted();
  if (!granted.ok) return { ok: false, reason: granted.reason };
  const r = await teamsAnswerEngine().check(payload || {});
  if (r.closed) await noteConnectorOutcome('handled', started, { connector: 'teams', closeType: 'answer' });
  else if (r.reason === 'verify_failed') await noteConnectorOutcome('readback_failed', started, { connector: 'teams', closeType: 'answer' });
  return r;
}

async function teamsAnswerRelease(payload) {
  const r = await teamsAnswerEngine().release((payload || {}).key);
  if (r.ok) await noteConnectorOutcome('undone', 0, { connector: 'teams', closeType: 'answer' });
  return r;
}

/* ------------------------------------------------------- Dropbox, with a proof */
// docs/glance-ai/connectors/dropbox.md. One file saved into the person's Dropbox app folder, read back by id, size and content hash.
// Everything here is behind config/connectors.public.js (dropboxReadBack, dropboxOAuth), both off.

const DROPBOX_AUTH_BASE = 'https://www.dropbox.com/oauth2/authorize';
const DROPBOX_TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const DROPBOX_REVOKE_URL = 'https://api.dropboxapi.com/2/auth/token/revoke';
const DROPBOX_SCOPES = 'files.content.write files.metadata.read';
const DROPBOX_LEDGER_KEY = 'dropboxLedger';

async function getDropboxAuth() {
  const { dropboxAuth } = await chrome.storage.local.get('dropboxAuth');
  return dropboxAuth || null;
}

// A public client with PKCE: no secret exists, so the token request goes straight to Dropbox (no relay).
async function dropboxTokenRequest(form) {
  const res = await fetch(DROPBOX_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
  let data = null;
  try { data = await res.json(); } catch (e) { data = null; }
  if (!res.ok || !data || typeof data.access_token !== 'string') return { ok: false, error: (data && typeof data.error === 'string' && data.error.slice(0, 40)) || ('http-' + res.status) };
  return { ok: true, data: data };
}

async function connectDropboxOAuth() {
  if (!CONNECTORS.dropboxOAuth) throw new Error('Sign in with Dropbox is not switched on in this build.');
  const appKey = publicClientId(OAUTH_PUBLIC.dropboxAppKey);
  if (!appKey) throw new Error('Dropbox sign-in isn’t configured on this build yet.');
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const redirectUri = chrome.identity.getRedirectURL();
  const code = await runOAuthFlow(DROPBOX_AUTH_BASE + '?client_id=' + encodeURIComponent(appKey) + '&response_type=code&token_access_type=offline&scope=' + encodeURIComponent(DROPBOX_SCOPES) + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&code_challenge=' + challenge + '&code_challenge_method=S256', 'Dropbox');
  const got = await dropboxTokenRequest({ grant_type: 'authorization_code', code: code, client_id: appKey, redirect_uri: redirectUri, code_verifier: verifier });
  if (!got.ok) throw new Error('Dropbox connection failed (' + got.error + ').');
  await chrome.storage.local.set({ dropboxAuth: { token: got.data.access_token, refreshToken: got.data.refresh_token || null, via: 'oauth' } });
  return { title: 'Dropbox' };
}

async function dropboxRefreshToken(auth) {
  const appKey = publicClientId(OAUTH_PUBLIC.dropboxAppKey);
  if (!auth || !auth.refreshToken || !appKey) return null;
  const got = await dropboxTokenRequest({ grant_type: 'refresh_token', refresh_token: auth.refreshToken, client_id: appKey });
  if (!got.ok) return null;
  return { token: got.data.access_token, refreshToken: auth.refreshToken };
}

// Best effort on Disconnect: ask Dropbox to end the token. The local token is removed either way.
async function dropboxRevokeBestEffort() {
  try {
    const a = await getDropboxAuth();
    if (a && a.token) await fetch(DROPBOX_REVOKE_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + a.token } });
  } catch (e) { /* the token is removed locally regardless */ }
}

function dropboxCloseEngine() {
  return globalThis.FlowDropboxClose.create({
    fetch: (url, init) => fetch(url, init),
    getAuth: getDropboxAuth,
    saveAuth: async (a) => { await chrome.storage.local.set({ dropboxAuth: a }); },
    refresh: dropboxRefreshToken,
    sha256: async (u8) => new Uint8Array(await crypto.subtle.digest('SHA-256', u8)),
    buildProof: globalThis.FlowProofOfClose && globalThis.FlowProofOfClose.buildProof,
    ledger: {
      get: async (k) => { const m = (await chrome.storage.local.get(DROPBOX_LEDGER_KEY))[DROPBOX_LEDGER_KEY] || {}; return m[k] || null; },
      set: async (k, v) => {
        const m = (await chrome.storage.local.get(DROPBOX_LEDGER_KEY))[DROPBOX_LEDGER_KEY] || {};
        m[k] = v;
        const keys = Object.keys(m);
        if (keys.length > 200) keys.sort((a, b) => (m[a].at || 0) - (m[b].at || 0)).slice(0, keys.length - 200).forEach((x) => { delete m[x]; });
        await chrome.storage.local.set({ [DROPBOX_LEDGER_KEY]: m });
      }
    }
  });
}

// payload: { key, name, base64 } — the loop's own id, the file name and the file's bytes (base64), all from the person's own Do It.
async function dropboxSave(payload) {
  const started = Date.now();
  const p = payload || {};
  const b64 = typeof p.base64 === 'string' ? p.base64 : '';
  if (!b64 || b64.length > Math.ceil(globalThis.FlowDropboxClose.MAX_BYTES * 4 / 3) + 8) return { ok: false, reason: b64 ? 'too-large' : 'bad-params' };
  if (b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, reason: 'bad-params' };
  let bytes;
  try { const bin = atob(b64); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); } catch (e) { return { ok: false, reason: 'bad-params' }; }
  const lang = /[֐-׿]/.test(String(p.name || '')) ? 'he' : 'en';
  const r = await dropboxCloseEngine().save({ key: String(p.key || ''), name: p.name, bytes: bytes });
  if (r.ok) {
    await noteConnectorOutcome('approved', started, { connector: 'dropbox', closeType: 'file', lang: lang });
    await noteConnectorOutcome('handled', started, { connector: 'dropbox', closeType: 'file', lang: lang });
  } else if (r.reason === 'verify_failed' || r.reason === 'proof_pending') await noteConnectorOutcome('readback_failed', started, { connector: 'dropbox', closeType: 'file', lang: lang });
  return r;
}

async function dropboxUndo(payload) {
  const r = await dropboxCloseEngine().undo((payload || {}).ref);
  if (r.ok) await noteConnectorOutcome('undone', 0, { connector: 'dropbox', closeType: 'file' });
  return r;
}

/* ------------------------------------------------------------- glance-assist */
//
// Feature 2 (Draft-It) and Feature 3 (attachment X-ray) both need real
// language generation, which the rest of this file's connectors never have
// — every write path above is a structured API call, never a model call.
// content-gmail.js/sidebar.js only ever call FlowPrivacyShield.mask() BEFORE
// handing text to these two functions, so nothing that reaches
// glance-assist.js is a real name, company, amount, date, email, or phone
// number — see
// core/privacyShield.js and netlify/functions/glance-assist/glance-assist.js
// for the two ends of that contract. This file is just the relay: content
// scripts can't call a third-party API directly (no CORS grant, and no
// place to keep this off the page's own origin), so, same as every other
// connector above, the actual fetch happens here in the service worker.

const GLANCE_ASSIST_URL = 'https://theflow-ai.com/.netlify/functions/glance-assist';
const PRO_API = 'https://theflow-ai.com/.netlify/functions';

/* ------------------------------------------------------------- glance pro */
//
// Glance Pro is the paid tier. What it unlocks is exactly what costs us money
// per use: the masked-AI features above (Draft-It, attachment summaries). The
// free product — judging email, the Do It chip, writing to Google, Undo — never
// touches a licence. The policy helpers live in core/entitlements.js (used by
// the popup and the Gmail script); this file owns the only network calls and
// the only writes to the stored record, `proLicense`. The grace window below
// must equal FlowEntitlements.OFFLINE_GRACE_MS — a corpus test pins that.
//
// The server (glance-assist) checks the licence again on every call, so this
// local check is a courtesy that avoids a pointless request, not the gate.

const PRO_STORAGE_KEY = 'proLicense';
const PRO_OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const PRO_RECHECK_AFTER_MS = 12 * 60 * 60 * 1000;
const PRO_KEY_RE = /^GLNC(-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}){4}$/;

function normalizeProKey(raw) {
  const compact = String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.length !== 24 || !compact.startsWith('GLNC')) return null;
  const body = compact.slice(4);
  const key = 'GLNC-' + [0, 5, 10, 15].map((i) => body.slice(i, i + 5)).join('-');
  return PRO_KEY_RE.test(key) ? key : null;
}

async function getProRecord() {
  const stored = await chrome.storage.local.get(PRO_STORAGE_KEY);
  return stored[PRO_STORAGE_KEY] || null;
}

function proIsActive(record, now) {
  return Boolean(record && record.valid && record.key && typeof record.activeUntil === 'number' && now < record.activeUntil);
}

function proRecordFrom(key, answer, now) {
  const valid = Boolean(answer && answer.valid);
  return {
    key,
    valid,
    status: (answer && answer.status) || null,
    plan: (answer && answer.plan) || null,
    interval: (answer && answer.interval) || null,
    renewsAt: (answer && answer.renewsAt) || null,
    trialEnds: (answer && answer.trialEnds) || null,
    checkedAt: now,
    activeUntil: valid ? now + PRO_OFFLINE_GRACE_MS : 0
  };
}

async function proPost(endpoint, body) {
  const res = await fetch(PRO_API + '/' + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

// Paste-a-key activation. Only a key the server confirms is stored.
async function activatePro(rawKey) {
  const key = normalizeProKey(rawKey);
  if (!key) return { ok: false, error: 'That does not look like a Glance Pro key. It starts with GLNC- and has four groups of five characters.' };
  let res;
  try {
    res = await proPost('verify-license', { key });
  } catch (e) {
    return { ok: false, error: 'Could not reach the licence server. Check your connection and try again.' };
  }
  if (res.status === 429) return { ok: false, error: 'Too many attempts. Try again in a few minutes.' };
  if (!res.ok || !res.data || !res.data.ok) return { ok: false, error: 'Could not check that key right now. Please try again.' };
  if (!res.data.valid) {
    const why = res.data.reason === 'inactive' ? 'That subscription is no longer active.' : 'That key was not recognised. Check it against your email.';
    return { ok: false, error: why };
  }
  const record = proRecordFrom(key, res.data, Date.now());
  await chrome.storage.local.set({ [PRO_STORAGE_KEY]: record });
  return { ok: true, record };
}

// Re-confirms a stored key in the background of normal use. A network failure
// keeps the existing record (the offline grace covers it); only the server
// saying "not valid" ends access early.
async function refreshPro(force) {
  const record = await getProRecord();
  if (!record || !record.key) return record;
  const now = Date.now();
  if (!force && record.checkedAt && now - record.checkedAt < PRO_RECHECK_AFTER_MS) return record;
  let res;
  try {
    res = await proPost('verify-license', { key: record.key });
  } catch (e) {
    return record;
  }
  if (!res.ok || !res.data || !res.data.ok) return record;
  const next = proRecordFrom(record.key, res.data, now);
  await chrome.storage.local.set({ [PRO_STORAGE_KEY]: next });
  return next;
}

async function proStatus() {
  const record = await refreshPro(false);
  return { ok: true, active: proIsActive(record, Date.now()), record: record || null };
}

async function deactivatePro() {
  await chrome.storage.local.remove(PRO_STORAGE_KEY);
  return { ok: true };
}

async function openBillingPortal() {
  const record = await getProRecord();
  if (!record || !record.key) return { ok: false, error: 'No Pro key is activated on this device.' };
  let res;
  try {
    res = await proPost('billing-portal', { key: record.key });
  } catch (e) {
    return { ok: false, error: 'Could not reach billing. Check your connection and try again.' };
  }
  if (!res.ok || !res.data || !res.data.url) return { ok: false, error: (res.data && res.data.error) || 'Could not open billing right now.' };
  return { ok: true, url: res.data.url };
}

function proRequiredError() {
  const err = new Error('This is part of Glance Pro.');
  err.code = 'pro_required';
  return err;
}

async function callGlanceAssist(body) {
  const record = await refreshPro(false);
  if (!proIsActive(record, Date.now())) throw proRequiredError();
  const res = await fetch(GLANCE_ASSIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({}, body, { licenseKey: record.key }))
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 402) {
    // The server says this key is not live (cancelled, refunded). Stop offering
    // the features now rather than at the next scheduled recheck.
    await chrome.storage.local.set({ [PRO_STORAGE_KEY]: Object.assign({}, record, { valid: false, activeUntil: 0, checkedAt: Date.now() }) });
    throw proRequiredError();
  }
  if (!res.ok || !data.ok) {
    const message = (data && data.error) || ('Request failed (' + res.status + ')');
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

// payload: { lang: 'en'|'he', entries: [{ position, maskedBody }] } — all
// already masked by the caller; see glance-assist.js's draftReply().
async function draftReplyViaBackend(payload) {
  const data = await callGlanceAssist({ action: 'draft-reply', lang: payload.lang, entries: payload.entries, style: payload.style || null });
  return { ok: true, draftText: data.draftText };
}

// payload: { maskedText } — already masked by the caller; see
// glance-assist.js's summarizeAttachment().
async function summarizeAttachmentViaBackend(payload) {
  const data = await callGlanceAssist({ action: 'summarize-attachment', maskedText: payload.maskedText });
  return { ok: true, summary: data.summary, entities: data.entities };
}

// payload: { lang, maskedText } — already masked by the caller; see
// glance-assist.js's classify() and content-gmail.js's
// ensureRemoteClassification() for the one caller of this. Never called for
// every message — only when the local classifier already returned nothing.
async function classifyViaBackend(payload) {
  const data = await callGlanceAssist({ action: 'classify', lang: payload.lang, maskedText: payload.maskedText });
  return { ok: true, result: data.result };
}


/* ------------------------------------------------------- the deeper read */
//
// core/ai-ladder.js decides WHETHER a sentence may be asked about (in the page, where the recognition code lives); this is only the network and the three small
// facts that have to outlive a page: has the person said yes, did the server say it is running, and what did the server last say about this month's allowance.
// Nothing is sent before the person says yes in the popup. The sentence arrives here already masked and is forwarded as it is; this file never sees a real name.
// The server is the one that counts: the numbers kept here are only what it last said, so the popup can show them.
const LADDER_CONSENT_KEY = 'glanceLadderConsent';
const LADDER_INFO_KEY = 'glanceLadderInfo';
const LADDER_STATUS_EVERY_MS = 30 * 60 * 1000;
const LADDER_PAUSE_MS = 15 * 60 * 1000;
const LADDER_TIMEOUT_MS = 25000;
const LADDER_MAX_SENTENCE = 800;

async function ladderStored() {
  const got = await chrome.storage.local.get([LADDER_CONSENT_KEY, LADDER_INFO_KEY]);
  return { consent: Boolean(got[LADDER_CONSENT_KEY] && got[LADDER_CONSENT_KEY].given === true), info: got[LADDER_INFO_KEY] || {} };
}

async function ladderSave(patch) {
  const { info } = await ladderStored();
  await chrome.storage.local.set({ [LADDER_INFO_KEY]: Object.assign({}, info, patch) });
}

// Identity for the allowance: a live Pro key when there is one, and always the random per-install id (the one the usage events already carry).
async function ladderIdentity() {
  const record = await refreshPro(false);
  const pro = proIsActive(record, Date.now());
  return { pro, body: Object.assign({ installId: await getInstallId() }, pro ? { licenseKey: record.key } : {}) };
}

async function ladderPost(body) {
  const res = await fetch(GLANCE_ASSIST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(LADDER_TIMEOUT_MS) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// What the page needs to decide (core/ai-ladder.js stateOf): the switch, whether the server is running it, consent, plan, and the last allowance it reported.
async function ladderInfo(force) {
  if (!LADDER.enabled) return { ok: true, enabled: false };
  const now = Date.now();
  const { consent, info } = await ladderStored();
  const { pro, body } = await ladderIdentity();
  let cur = info;
  if (force || !cur.checkedAt || now - cur.checkedAt > LADDER_STATUS_EVERY_MS) {
    try {
      const { status, data } = await ladderPost(Object.assign({ action: 'ladder-status' }, body));
      cur = Object.assign({}, cur, status === 200 && data && data.ok
        ? { available: data.available === true, languages: Array.isArray(data.languages) ? data.languages : [], checkedAt: now, snapshot: data.quota || cur.snapshot || null }
        : { available: false, checkedAt: now - LADDER_STATUS_EVERY_MS + 5 * 60 * 1000 });          // a failed look: ask again in five minutes
    } catch (e) {
      cur = Object.assign({}, cur, { available: false, checkedAt: now - LADDER_STATUS_EVERY_MS + 5 * 60 * 1000 });
    }
    await chrome.storage.local.set({ [LADDER_INFO_KEY]: cur });
  }
  return { ok: true, enabled: true, available: cur.available === true, languages: cur.languages || [], consent, pro, snapshot: cur.snapshot || null, pausedUntil: cur.pausedUntil || null, now };
}

async function ladderConsent(given) {
  await chrome.storage.local.set({ [LADDER_CONSENT_KEY]: { given: given === true, at: Date.now() } });
  return ladderInfo(true);
}

// payload: { maskedSentence } -> { ok:true, reading, tier, units, quota } | { ok:false, code, quota? }. Never throws.
async function ladderRead(payload) {
  try {
    const sentence = String(payload && payload.maskedSentence || '').slice(0, LADDER_MAX_SENTENCE);
    if (!sentence.trim()) return { ok: false, code: 'bad_request' };
    const state = await ladderInfo(false);
    if (!state.enabled || !state.available || !state.consent) return { ok: false, code: 'off' };
    if (state.pausedUntil && Date.now() < state.pausedUntil) return { ok: false, code: 'paused' };
    const { body } = await ladderIdentity();
    let res;
    try { res = await ladderPost(Object.assign({ action: 'ladder-read', maskedSentence: sentence }, body)); }
    catch (e) { await ladderSave({ pausedUntil: Date.now() + LADDER_PAUSE_MS }); return { ok: false, code: 'unreachable' }; }
    const d = res.data || {};
    if (res.status === 200 && d.ok) {
      if (d.quota) await ladderSave({ snapshot: d.quota });
      return { ok: true, reading: d.reading || null, tier: d.tier === 'strong' ? 'strong' : 'fast', units: Number(d.units) || 0, quota: d.quota || null };
    }
    if (d.quota) await ladderSave({ snapshot: d.quota });
    if (res.status === 503 && d.code === 'unavailable') await ladderSave({ available: false, checkedAt: Date.now() });
    else if (res.status >= 500) await ladderSave({ pausedUntil: Date.now() + LADDER_PAUSE_MS });
    return { ok: false, code: typeof d.code === 'string' ? d.code : 'refused', quota: d.quota || null };
  } catch (e) {
    return { ok: false, code: 'internal' };
  }
}

/* ------------------------------------------------ a model on this computer */
//
// core/local-lm-server.js is the portable description of this (and what popup.js uses to test it); this is the same
// two request shapes, kept here because the service worker loads no core files. test/local-lm-server-corpus.cjs runs both
// against one fake server and fails if they ever differ. The address is loopback-only, checked here again before every
// request. Nothing leaves this computer, nothing is installed or downloaded, and the answer only ever feeds a proposal.
const LM_SERVER_TIMEOUT_MS = 20000;
let lmServerChain = Promise.resolve();

function lmServerLoopback(url) {
  let u;
  try { u = new URL(String(url)); } catch (e) { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1';
}

async function lmServerPromptNow(text, schema) {
  const stored = await new Promise((r) => chrome.storage.local.get('localLmServer', r));
  const c = stored && stored.localLmServer;
  if (!c || c.enabled !== true || !c.model || !c.status) return { ok: false, reason: 'off' };
  const base = String(c.baseUrl || (c.provider === 'lmstudio' ? 'http://127.0.0.1:1234' : 'http://127.0.0.1:11434')).replace(/\/+$/, '');
  if ((c.provider !== 'ollama' && c.provider !== 'lmstudio') || !lmServerLoopback(base)) return { ok: false, reason: 'refused' };
  const content = String(text || '').slice(0, 4000);
  let url, body;
  if (c.provider === 'ollama') {
    url = base + '/api/chat';
    body = { model: c.model, messages: [{ role: 'user', content }], stream: false, options: { temperature: 0 } };
    if (schema) body.format = schema;
  } else {
    url = base + '/v1/chat/completions';
    body = { model: c.model, messages: [{ role: 'user', content }], temperature: 0, stream: false };
    if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'glance', strict: true, schema } };
  }
  if (!lmServerLoopback(url)) return { ok: false, reason: 'refused' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LM_SERVER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) return { ok: false, reason: 'http-' + res.status };
    const json = await res.json();
    const out = c.provider === 'ollama' ? (json && json.message && json.message.content) : (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content);
    return typeof out === 'string' ? { ok: true, text: out } : { ok: false, reason: 'bad-response' };
  } catch (e) {
    return { ok: false, reason: e && e.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally { clearTimeout(timer); }
}

// One question at a time: a laptop model asked several things at once only gets slower.
function lmServerPrompt(text, schema) {
  const run = lmServerChain.then(() => lmServerPromptNow(text, schema));
  lmServerChain = run.catch(() => {});
  return run;
}

/* ---------------------------------------------------------------- dispatch */

// 'googleTask' (singular) is the action *kind* actions.js proposes; 'googleTasks'
// (plural) is the connector id the popup's connect/disconnect flow and
// connectorStatus() use. Same underlying write — kept as two keys pointing at
// the same functions rather than renaming either caller to match the other.
//
// The hubspot/notion/salesforce/slack/monday entries below are no longer
// reachable from the live Gmail chip — content-gmail.js's action-planning
// pipeline (intent.js -> actions.js) only ever proposes calendar/gmailDraft/
// googleTask actions, and scanReadingPane() now stays silent entirely for a
// stored connectorId that isn't 'googleTasks' rather than routing to one of
// these (see the comment at that check). They're left wired here only so
// flow:execute-action/flow:connect keep working for whatever still calls
// them directly (the popup's own connect/disconnect flow, direct testing) —
// not because the multi-action engine still writes to them.

// Outlook reply drafts (Mail.ReadWrite): createReply / DELETE of Glance's own draft only. Never send.
const OUTLOOK_GRAPH = 'https://graph.microsoft.com/v1.0';
const OUTLOOK_AUTH_KEY = 'outlookAuth';
const OUTLOOK_STATE_KEY = 'outlookSync';
const OUTLOOK_KEEPALIVE_ALARM = 'glance-outlook-keepalive';
const OUTLOOK_KEEPALIVE_MINUTES = 30;

// ---- the durable Outlook session (core/outlook-auth.js session) -----------------------------------------------
// The service worker keeps the Microsoft session alive on its own: an alarm every 30 minutes (alarms survive the worker
// being stopped and restarted), on browser start-up and on install/update. Each run refreshes an access token in its last
// minutes and, from hour 16 of the 24-hour single-page-application window, renews silently (prompt=none, no window) so a
// new 24 hours starts before the old one ends. Every token lives in chrome.storage.local, so nothing depends on this worker
// staying awake. One run at a time (outlookSessionBusy), so two surfaces never renew at once.
function outlookLaunchInteractive(url) {
  return new Promise((resolve) => {
    try {
      chrome.identity.launchWebAuthFlow({ url, interactive: true }, (r) => {
        const err = chrome.runtime.lastError;
        if (err || !r) resolve(null);
        else resolve(r);
      });
    } catch (e) { resolve(null); }
  });
}

function outlookLaunchSilent(url) {
  // Headless regression only: the hidden login window cannot load there and
  // would hold every 401 retry for the full 30s. Production never sets __glanceE2e.
  const hooked = glanceE2eWebAuthFlow({ url, interactive: false });
  if (hooked && typeof hooked.then === 'function') {
    return hooked.then((r) => r || null, (e) => ({ error: String((e && e.message) || 'failed') }));
  }
  return new Promise((resolve) => {
    try {
      chrome.identity.launchWebAuthFlow({ url, interactive: false, abortOnLoadForNonInteractive: false, timeoutMsForNonInteractive: 30000 }, (r) => {
        const err = chrome.runtime.lastError;
        if (err || !r) resolve(err ? { error: String(err.message || 'failed') } : null);
        else resolve(r);
      });
    } catch (e) { resolve({ error: String(e && e.message || e) }); }
  });
}

function outlookPrimaryHint(auth) {
  if (!auth) return null;
  const opaque = /^outlook_[0-9a-f]+@outlook\.com$/i;
  const list = [auth.account && auth.account.address, auth.account && auth.account.mail].concat(auth.ownAddresses || []).filter(Boolean).map((a) => String(a).toLowerCase());
  return list.find((a) => !opaque.test(a)) || list[0] || null;
}

// Hold asks for Calendars.ReadWrite only. Already granted scopes stay on the
// request so Mail is not replaced. This does not call connect(), which clears
// judgment. No new Chrome permission: launchWebAuthFlow is already the sign-in.
async function outlookConsentScope(msg) {
  const A = globalThis.FlowOutlookAuth;
  const cfg = globalThis.FlowOutlookConfig;
  if (!A || !cfg || typeof A.signIn !== 'function' || typeof cfg.incrementalConsentScopes !== 'function') {
    return { ok: false, reason: 'not-configured' };
  }
  const scope = String((msg && msg.scope) || '');
  const todoScope = scope === 'Tasks.ReadWrite';
  const calendarScope = scope === 'Calendars.ReadWrite';
  if (!todoScope && !calendarScope) return { ok: false, reason: 'scope-refused' };
  const bag = await chrome.storage.local.get(OUTLOOK_AUTH_KEY);
  const auth = bag[OUTLOOK_AUTH_KEY];
  if (!auth || !auth.token) return { ok: false, reason: 'not-connected' };
  const scopes = cfg.incrementalConsentScopes(
    [].concat(auth.requestedScopes || [], (auth.token && auth.token.grantedScopes) || [], cfg.SCOPES || []),
    scope
  );
  if (!scopes) return { ok: false, reason: 'scope-refused' };
  const r = await A.signIn({
    fetch: (u, i) => fetch(u, i),
    now: () => Date.now(),
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    sha256: (b) => crypto.subtle.digest('SHA-256', b),
    launch: outlookLaunchInteractive
  }, cfg, chrome.identity.getRedirectURL(), {
    scopes: scopes,
    prompt: 'consent',
    loginHint: outlookPrimaryHint(auth)
  });
  if (!r || !r.ok || !r.token) return { ok: false, reason: (r && r.error) || 'cancelled' };
  // The scopes we asked for are not a grant. The new token's scp (or its
  // scope string, never the word unknown) is. A consent window that comes
  // back without Calendars.ReadWrite does not count.
  const Cal = globalThis.FlowOutlookCalendar;
  const effective = (Cal && typeof Cal.scopesFromToken === 'function') ? Cal.scopesFromToken(r.token) : null;
  const names = Array.isArray(effective) ? effective : [];
  const has = names.some((s) => String(s).toLowerCase() === scope.toLowerCase());
  if (calendarScope && (!Cal || !Cal.hasWriteScope(effective))) return { ok: false, reason: 'calendar-write-not-granted' };
  if (todoScope && !has) return { ok: false, reason: 'tasks-not-granted' };
  const policy = (msg && msg.policy) === 'always' ? 'always' : 'once';
  const policyKey = todoScope ? 'glanceTodoConsent' : 'glanceCalendarConsent';
  const stored = {
    [OUTLOOK_AUTH_KEY]: Object.assign({}, auth, {
      token: r.token,
      requestedScopes: scopes
    })
  };
  stored[policyKey] = { mode: policy, scope: scope, revoked: false, at: Date.now() };
  await chrome.storage.local.set(stored);
  return { ok: true, policy: policy, scope: scope };
}

async function outlookReconcileProof(msg) {
  const ref = (msg && msg.ref && typeof msg.ref === 'object') ? msg.ref : {};
  const id = (msg && msg.externalId) || ref.externalId || ref.taskId || ref.fileId || ref.itemId || ref.eventId;
  if (!id) return { ok: false, status: 0, reason: 'no-id' };
  let url = '';
  if (plannerRawId(id)) {
    // A task the person's Planner plan holds (switch PLANNER_TASK): read by id, not from a To Do list.
    url = OUTLOOK_GRAPH + '/planner/tasks/' + encodeURIComponent(plannerRawId(id));
  } else if ((msg && msg.connectorId) === 'outlookCalendar' || ref.eventId) {
    url = OUTLOOK_GRAPH + '/me/events/' + encodeURIComponent(ref.eventId || id);
  } else if ((msg && (msg.connectorId === 'onedriveFile' || msg.system === 'microsoft/onedrive')) || ref.fileId) {
    url = OUTLOOK_GRAPH + '/me/drive/items/' + encodeURIComponent(ref.fileId || ref.itemId || id);
  } else {
    const listId = ref.taskListId;
    if (!listId) return { ok: false, status: 0, reason: 'no-id' };
    url = OUTLOOK_GRAPH + '/me/todo/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(ref.taskId || id);
  }
  outlookAssertNotSend(url);
  let res;
  try { res = await outlookFetch(url, { method: 'GET' }); }
  catch (e) { return { ok: false, status: 0, reason: 'error' }; }
  if (!res) return { ok: false, status: 0, reason: 'error' };
  return { ok: res.ok === true, status: Number(res.status) || 0 };
}

let outlookSessionBusy = null;
async function outlookSession(opts) {
  const o = opts || {};
  if (outlookSessionBusy && !o.force) return outlookSessionBusy;
  const run = (async () => {
    const A = globalThis.FlowOutlookAuth, cfg = globalThis.FlowOutlookConfig;
    if (!A || !cfg) return { ok: false, error: 'not-configured' };
    const bag = await chrome.storage.local.get([OUTLOOK_AUTH_KEY, OUTLOOK_STATE_KEY]);
    const auth = bag[OUTLOOK_AUTH_KEY];
    const st = bag[OUTLOOK_STATE_KEY] || {};
    if (!auth || !auth.token) return { ok: false, error: 'not-connected' };
    const r = await A.session({
      fetch: (u, i) => fetch(u, i), now: () => Date.now(),
      random: (n) => crypto.getRandomValues(new Uint8Array(n)), sha256: (b) => crypto.subtle.digest('SHA-256', b),
      launchSilent: outlookLaunchSilent
    }, cfg, auth, { redirectUri: chrome.identity.getRedirectURL(), loginHint: outlookPrimaryHint(auth), force: Boolean(o.force), lastSilentAt: st.lastSilentAt || null, scopes: (auth.requestedScopes && auth.requestedScopes.length) ? auth.requestedScopes : cfg.SCOPES });
    const now = Date.now();
    if (r.ok && r.changed) {
      const cur = (await chrome.storage.local.get(OUTLOOK_AUTH_KEY))[OUTLOOK_AUTH_KEY] || auth;
      await chrome.storage.local.set({ [OUTLOOK_AUTH_KEY]: Object.assign({}, cur, { token: r.token }) });
    }
    const patch = {};
    if (r.silentTried) patch.lastSilentAt = now;
    if (r.ok) {
      if (st.needsSignIn || st.error) Object.assign(patch, { needsSignIn: false, error: null, aadsts: null, errorDetail: null });
      if (r.how === 'silent') patch.lastRenewedAt = now;
    } else if (r.error !== 'not-connected') {
      Object.assign(patch, { error: r.error || 'expired', needsSignIn: Boolean(r.needsSignIn), aadsts: r.aadsts || null, errorDetail: r.description || null });
    }
    if (Object.keys(patch).length) {
      const cur = (await chrome.storage.local.get(OUTLOOK_STATE_KEY))[OUTLOOK_STATE_KEY] || {};
      await chrome.storage.local.set({ [OUTLOOK_STATE_KEY]: Object.assign({}, cur, patch) });
    }
    return r;
  })();
  outlookSessionBusy = run;
  try { return await run; } finally { if (outlookSessionBusy === run) outlookSessionBusy = null; }
}

async function outlookKeepAlive() {
  try { return await outlookSession({}); } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

function scheduleOutlookKeepAlive() {
  if (!chrome.alarms || !chrome.alarms.create) return;
  try { chrome.alarms.create(OUTLOOK_KEEPALIVE_ALARM, { delayInMinutes: 1, periodInMinutes: OUTLOOK_KEEPALIVE_MINUTES }); } catch (e) { /* alarms unavailable */ }
}

try {
  if (chrome.alarms && chrome.alarms.onAlarm) {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (!alarm || alarm.name !== OUTLOOK_KEEPALIVE_ALARM) return;
      outlookKeepAlive();
    });
  }
  if (chrome.alarms && chrome.alarms.get) {
    chrome.alarms.get(OUTLOOK_KEEPALIVE_ALARM, (a) => { if (!a) scheduleOutlookKeepAlive(); });
  } else scheduleOutlookKeepAlive();
  if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(() => { scheduleOutlookKeepAlive(); outlookKeepAlive(); });
  chrome.runtime.onInstalled.addListener(() => { scheduleOutlookKeepAlive(); outlookKeepAlive(); ensureOutlookSurface(); });
} catch (e) { console.error('[Glance] Outlook keep-alive unavailable', e); }

// Connected to Outlook and the Outlook-on-the-web permission granted, but the page script not registered (an older build
// connected Graph only, or the browser dropped it): register it, so Do It floats on the page without a visit to the panel.
async function ensureOutlookSurface() {
  try {
    const bag = await chrome.storage.local.get([OUTLOOK_AUTH_KEY, 'surfaces']);
    if (!bag[OUTLOOK_AUTH_KEY] || !bag[OUTLOOK_AUTH_KEY].token) return;
    const on = bag.surfaces && bag.surfaces.outlook && bag.surfaces.outlook.enabled;
    if (on) return;
    if (!(await chrome.permissions.contains({ origins: SURFACES.outlook.origins }))) return;
    await enableSurface('outlook');
  } catch (e) { /* the panel's Outlook row offers the button */ }
}
ensureOutlookSurface();

async function outlookAccessToken(opts) {
  const r = await outlookSession(opts || {});
  return r && r.ok && r.token ? r.token.accessToken : null;
}

// A Graph call with the session's token; a 401 is answered once with a forced refresh (or silent renewal) and a retry.
// A read-back GET gives up after 8s. The controller aborts the fetch. Undo then refuses and deletes nothing.
const OUTLOOK_READ_MS = 8000;
async function outlookFetch(url, init) {
  let token = await outlookAccessToken();
  if (!token) return { status: 0, ok: false, notConnected: true };
  const call = async (t) => {
    const method = String((init && init.method) || 'GET').toUpperCase();
    const headers = Object.assign({}, (init && init.headers) || {}, { Authorization: 'Bearer ' + t });
    const opts = Object.assign({}, init || {}, { headers: headers });
    let ctl = null;
    let timer = null;
    if (method === 'GET' && typeof AbortController === 'function') {
      ctl = new AbortController();
      timer = setTimeout(() => ctl.abort(), OUTLOOK_READ_MS);
      opts.signal = ctl.signal;
    }
    try {
      return await fetch(url, opts);
    } catch (e) {
      if (ctl && ctl.signal.aborted) return { status: 0, ok: false, reason: 'verify-timeout', timedOut: true };
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  let res = await call(token);
  if (res && res.status === 401) {
    token = await outlookAccessToken({ force: true });
    if (token) res = await call(token);
  }
  return res;
}

// The Outlook-on-the-web page runs the same planner as the panel (src/outlook.js). Its session comes from here
// (flow:outlook-session: one renewal at a time, from this worker, with this extension's origin on the token request), and
// its Graph reads go through here (flow:outlook-fetch) so the page never makes a cross-origin call of its own. Reads only:
// Graph GETs under /me. Writes stay in flow:execute-action: outlookDraftWrite (a draft, never a send)
// and outlookCalendarWrite (one event, only when the token has Calendars.ReadWrite).
const OUTLOOK_PROXY_GET = /^https:\/\/graph\.microsoft\.com\/v1\.0\/me([?\/(]|$)/;
async function outlookProxyFetch(msg, sender) {
  if (!sender || sender.id !== chrome.runtime.id) return { ok: false, status: 0, error: 'foreign-sender' };
  const url = String(msg.url || '');
  const method = String((msg.init && msg.init.method) || 'GET').toUpperCase();
  if (method !== 'GET' || !OUTLOOK_PROXY_GET.test(url)) return { ok: false, status: 0, error: 'refused' };
  const headers = {};
  const h = (msg.init && msg.init.headers) || {};
  if (h.Prefer) headers.Prefer = String(h.Prefer);
  // The page used to forward an empty header set. The bearer is the mailbox
  // session, with one 401 retry, the same as outlookFetch.
  try {
    const res = await outlookFetch(url, { method: 'GET', headers: headers });
    if (res && res.notConnected) return { ok: false, status: 0, error: 'not-connected' };
    return { ok: Boolean(res && res.ok), status: (res && res.status) || 0, body: res && res.text ? await res.text() : '' };
  } catch (e) {
    return { ok: false, status: 0, error: 'network' };
  }
}

async function outlookSessionForPage(msg, sender) {
  if (!sender || sender.id !== chrome.runtime.id) return { ok: false, error: 'foreign-sender' };
  const r = await outlookSession({ force: Boolean(msg && msg.force) });
  if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'failed', needsSignIn: Boolean(r && r.needsSignIn), transient: Boolean(r && r.transient), aadsts: (r && r.aadsts) || null };
  // Already stored by outlookSession: the caller must not store it again.
  return { ok: true, token: r.token, changed: false, how: r.how || null };
}

function outlookAssertNotSend(url) {
  if (/\/(send|reply|replyAll|forward|sendMail)(\b|$)/i.test(String(url || ''))) {
    const e = new Error('graph-send-refused'); e.code = 'refused'; throw e;
  }
}
function outlookIsOpaqueMailbox(addr) {
  return /^outlook_[0-9a-f]+@outlook\.com$/i.test(String(addr || '').trim());
}
async function outlookPreferredFrom(explicit) {
  const want = String(explicit || '').trim().toLowerCase();
  if (want && !outlookIsOpaqueMailbox(want)) return want;
  const st = await chrome.storage.local.get(OUTLOOK_AUTH_KEY);
  const auth = st && st[OUTLOOK_AUTH_KEY];
  if (!auth) return want || null;
  const candidates = [];
  if (want) candidates.push(want);
  if (auth.account && auth.account.address) candidates.push(auth.account.address);
  if (auth.account && auth.account.mail) candidates.push(auth.account.mail);
  (auth.ownAddresses || []).forEach((a) => candidates.push(a));
  if (auth.profile) {
    if (auth.profile.mail) candidates.push(auth.profile.mail);
    (auth.profile.otherMails || []).forEach((a) => candidates.push(a));
    (auth.profile.proxyAddresses || []).forEach((p) => {
      const m = String(p || '').match(/^smtp:(.+)$/i);
      if (m) candidates.push(m[1]);
    });
  }
  const seen = new Set();
  for (const raw of candidates) {
    const e = String(raw || '').trim().toLowerCase();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    if (!outlookIsOpaqueMailbox(e)) return e;
  }
  return candidates.map((a) => String(a || '').trim().toLowerCase()).find(Boolean) || null;
}
async function outlookDraftMap() {
  const bag = await chrome.storage.local.get(OUTLOOK_STATE_KEY);
  const st = bag[OUTLOOK_STATE_KEY] || {};
  return { st: st, map: Object.assign({}, st.glanceDraftByMessage || {}) };
}
async function outlookSaveDraftMap(st, map) {
  await chrome.storage.local.set({ [OUTLOOK_STATE_KEY]: Object.assign({}, st, { glanceDraftByMessage: map }) });
}
function outlookUserEditedLine() {
  const N = globalThis.FlowNativeEdit;
  return (N && N.userEditedLine) ? N.userEditedLine() : 'You edited this. Undo left it alone.';
}

function outlookUnconfirmedLine() {
  const N = globalThis.FlowNativeEdit;
  return (N && N.unconfirmedLine) ? N.unconfirmedLine() : "Couldn't confirm it's unchanged. Undo left it alone.";
}

function outlookContentKeys() {
  const N = globalThis.FlowNativeEdit;
  if (N && Array.isArray(N.CONTENT_KEYS) && N.CONTENT_KEYS.length) return N.CONTENT_KEYS;
  return ['title', 'subject', 'name', 'body', 'dueDateTime', 'status', 'start', 'end', 'location', 'to', 'cc', 'attendees', 'categories', 'isAllDay', 'importance'];
}

// An owned content key is a snapshot, including an explicit null. An empty
// object and a changeKey-only object are not.
function outlookHasSnap(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  const keys = outlookContentKeys();
  for (let i = 0; i < keys.length; i++) {
    if (Object.prototype.hasOwnProperty.call(snapshot, keys[i])) return true;
  }
  return false;
}

function outlookEditVerdict(snapshot, live) {
  const N = globalThis.FlowNativeEdit;
  if (N && N.compareContent) return N.compareContent(snapshot, live);
  if (N && N.userEdited && N.userEdited(snapshot, live)) return 'edited';
  return 'match';
}

function outlookUnconfirmed() {
  return { ok: false, reason: 'unconfirmed', written: outlookUnconfirmedLine(), deleted: false };
}

function outlookCreationSnap(obj) {
  const N = globalThis.FlowNativeEdit;
  return (N && N.snapshotOf) ? N.snapshotOf(obj) : {};
}

async function outlookObjectSnap(url, prefer) {
  let res;
  try { res = await outlookFetch(url, { method: 'GET', headers: prefer || {} }); }
  catch (e) { return null; }
  if (!res || !res.ok) return null;
  const body = await outlookReadJson(res);
  return body ? outlookCreationSnap(body) : null;
}

// The snapshot is a successful GET of the stored object, tried twice.
// The POST body and the 201 body are not a snapshot. A miss is null,
// and Undo then says it could not confirm the object is unchanged.
async function outlookReadSnap(url, prefer) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const snap = await outlookObjectSnap(url, prefer);
    if (outlookHasSnap(snap)) return snap;
  }
  return null;
}

// A draft verify read fails only when both GETs are not ok. A 200 whose
// body has no content keys is a read: there is no snapshot, and the card
// still says the draft is ready. Undo then cannot confirm it is unchanged.
async function outlookDraftRead(url, prefer) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try { res = await outlookFetch(url, { method: 'GET', headers: prefer || {} }); }
    catch (e) { res = null; }
    if (!res || !res.ok) continue;
    const body = await outlookReadJson(res);
    const snap = body ? outlookCreationSnap(body) : null;
    return { ok: true, snap: outlookHasSnap(snap) ? snap : null };
  }
  return { ok: false, snap: null };
}

function outlookUnverifiedLine() {
  return "Created, couldn't verify";
}

const OUTLOOK_EVENT_SELECT = 'id,subject,body,start,end,location,attendees,categories,isAllDay,importance,recurrence';

async function outlookStoredEventSnap(eventId) {
  return outlookReadSnap(
    OUTLOOK_GRAPH + '/me/events/' + encodeURIComponent(eventId) + '?$select=' + OUTLOOK_EVENT_SELECT
  );
}

// The proof is a GET of the event just created, not the POST body.
async function outlookEventRead(eventId) {
  const url = OUTLOOK_GRAPH + '/me/events/' + encodeURIComponent(eventId) + '?$select=' + OUTLOOK_EVENT_SELECT;
  outlookAssertNotSend(url);
  let last = { snap: null, raw: null };
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try { res = await outlookFetch(url, { method: 'GET' }); }
    catch (e) { res = null; }
    if (!res || !res.ok) continue;
    const raw = await outlookReadJson(res);
    const snap = raw ? outlookCreationSnap(raw) : null;
    last = { snap: snap, raw: raw };
    if (outlookHasSnap(snap)) return last;
  }
  return last;
}

// Read the object Glance created. Undo deletes only after this GET succeeds
// and still matches the creation snapshot. 404 means it is already gone.
// A 5xx, a network error, a timeout, or a body that will not parse refuses
// with the unconfirmed line and does not delete. A field that changed is
// an edit, and that is the only path that says the person edited it.
async function outlookRefuseIfEdited(url, snapshot, prefer) {
  if (!outlookHasSnap(snapshot)) return null;
  let got;
  try { got = await outlookUndoConfirm(url, prefer); }
  catch (e) { return outlookUnconfirmed(); }
  if (got && got.notConnected) return { ok: false, reason: 'not-connected' };
  if (got && got.status === 404) return { ok: true, alreadyGone: true, fetchedBack: true };
  const readable = got && (got.status === 200 || got.ok === true) && got.reason !== 'verify-timeout';
  if (!readable) return outlookUnconfirmed();
  let body = null;
  try { body = await got.json(); } catch (e) { body = null; }
  if (!body) return outlookUnconfirmed();
  const verdict = outlookEditVerdict(snapshot, body);
  if (verdict === 'edited') {
    return { ok: false, reason: 'user-edited', written: outlookUserEditedLine(), fetchedBack: true };
  }
  if (verdict === 'unconfirmed') return outlookUnconfirmed();
  return null;
}

async function outlookDraftWrite(p) {
  const incomingId = p && (p.outlookIncomingId || p.messageId || p.incomingId);
  if (!incomingId) return { ok: false, reason: 'no-message' };
  const remembered = await outlookDraftMap();
  const priorId = remembered.map[String(incomingId)] || '';
  if (priorId) {
    const getUrl = OUTLOOK_GRAPH + '/me/messages/' + encodeURIComponent(priorId) + '?$select=id,isDraft,webLink';
    outlookAssertNotSend(getUrl);
    const got = await outlookFetch(getUrl, { method: 'GET' });
    if (got && got.ok) {
      let existing = null;
      try { existing = await got.json(); } catch (e) { existing = null; }
      if (existing && existing.isDraft !== false) {
        return {
          ok: true,
          ref: existing.id || priorId,
          where: existing.webLink || null,
          url: existing.webLink || null,
          reused: true,
          reason: 'draft-already',
          written: 'Reply draft already in Outlook Drafts. Not sent.'
        };
      }
    } else if (!got || got.status === 404) {
      delete remembered.map[String(incomingId)];
      await outlookSaveDraftMap(remembered.st, remembered.map);
    }
  }
  // Same draft as Gmail: the payload Gmail's buildActionPayload sends ({ params, senderName, senderEmail, subject }) through the
  // same composer gmailDraftWrite uses (FlowDraftReply.draftBodyText). A ready-made body is only a fallback for older callers.
  let comment = '';
  if (p && p.params && Object.keys(p.params).length) comment = draftBodyText(p, null, null, null);
  if (!comment) comment = (p && (p.body || p.comment)) || '';
  if (!comment && p && p.intent) {
    comment = globalThis.FlowDraftReply.bodyFromIntent(p.intent, p.senderName, p.senderEmail, { text: p.text || p.bodyText || null, subject: p.subject || null });
  }
  const url = OUTLOOK_GRAPH + '/me/messages/' + encodeURIComponent(incomingId) + '/createReply';
  outlookAssertNotSend(url);
  const immutable = p && p.outlookImmutableId === true;
  const prefer = immutable ? { Prefer: 'IdType="ImmutableId"' } : {};
  const res = await outlookFetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, prefer), body: JSON.stringify({ comment: comment }) });
  if (res.notConnected) return { ok: false, reason: 'not-connected' };
  if (res.status === 401) return { ok: false, reason: 'not-connected' };
  if (res.status === 403) return { ok: false, reason: 'consent', error: 'Outlook draft permission not granted yet: open Glance and reconnect Outlook once.' };
  if (!res.ok) return { ok: false, reason: 'http-' + res.status };
  const draft = await res.json();
  if (!draft || !draft.id) return { ok: false, reason: 'no-draft' };
  // Prefer connected human From alias over opaque outlook_HEX@outlook.com CID.
  // Graph createReply often defaults From to the CID on personal MSA; PATCH from+sender.
  const wantFrom = await outlookPreferredFrom(p && p.fromAddress);
  const patchUrl = OUTLOOK_GRAPH + '/me/messages/' + encodeURIComponent(draft.id);
  outlookAssertNotSend(patchUrl);
  const patchBody = { body: { contentType: 'Text', content: comment } };
  let fromSet = false;
  let bodyWritten = false;
  if (wantFrom && draft.isDraft !== false && !outlookIsOpaqueMailbox(wantFrom)) {
    patchBody.from = { emailAddress: { address: wantFrom } };
    patchBody.sender = { emailAddress: { address: wantFrom } };
  }
  if (draft.isDraft !== false) {
    try {
      const pr = await outlookFetch(patchUrl, { method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, prefer), body: JSON.stringify(patchBody) });
      if (pr && pr.ok) bodyWritten = true;
      fromSet = Boolean(pr && pr.ok && patchBody.from);
      // One body write. A refused From does not send the body again.
      if (!bodyWritten && comment) {
        const bodyOnly = await outlookFetch(patchUrl, { method: 'PATCH', headers: Object.assign({ 'Content-Type': 'application/json' }, prefer), body: JSON.stringify({ body: patchBody.body }) });
        bodyWritten = Boolean(bodyOnly && bodyOnly.ok);
      }
    } catch (e) { /* createReply's comment already holds the body */ }
  }
  let attachmentId = null;
  if (p && (p.driveFileId || (p.attachment && p.attachment.base64))) {
    const file = await outlookFileForDraft(p);
    if (!file) {
      await outlookDeleteDraft(draft.id, prefer);
      return { ok: false, reason: 'outlook-file-found-no-attach', attached: false };
    }
    const attUrl = OUTLOOK_GRAPH + '/me/messages/' + encodeURIComponent(draft.id) + '/attachments';
    outlookAssertNotSend(attUrl);
    const att = await outlookFetch(attUrl, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, prefer),
      body: JSON.stringify({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: file.filename,
        contentType: file.mimeType,
        contentBytes: file.base64
      })
    });
    let created = null;
    if (att && att.ok) { try { created = await att.json(); } catch (e) { created = null; } }
    if (!created || !created.id) {
      await outlookDeleteDraft(draft.id, prefer);
      return { ok: false, reason: 'outlook-file-found-no-attach', attached: false };
    }
    attachmentId = created.id;
  }
  const saved = await outlookDraftMap();
  saved.map[String(incomingId)] = String(draft.id);
  const keys = Object.keys(saved.map);
  if (keys.length > 40) keys.slice(0, keys.length - 40).forEach((k) => { delete saved.map[k]; });
  await outlookSaveDraftMap(saved.st, saved.map);
  const read = await outlookDraftRead(patchUrl + '?$select=id,subject,body,toRecipients,ccRecipients,importance,categories', prefer);
  const base = {
    ref: draft.id,
    where: draft.webLink || null,
    url: draft.webLink || null,
    attachmentId: attachmentId,
    fromAddress: wantFrom || null,
    fromSet: fromSet
  };
  if (!read.ok) {
    return Object.assign({}, base, {
      ok: true,
      fetchedBack: false,
      reason: 'unverified',
      created: null,
      proof: null,
      written: outlookUnverifiedLine()
    });
  }
  return Object.assign({}, base, {
    ok: true,
    fetchedBack: read.snap ? true : undefined,
    created: read.snap,
    written: attachmentId
      ? 'Reply draft ready in Outlook Drafts, with the file attached. Not sent.'
      : 'Reply draft ready in Outlook Drafts. Not sent.'
  });
}
async function outlookFileForDraft(p) {
  if (p.driveFileId) {
    const got = await fetchDriveFileAsAttachment(p.driveFileId);
    if (!got || !got.base64) return null;
    const approx = Math.floor((String(got.base64).length * 3) / 4);
    if (approx <= 0 || approx > OUTLOOK_ATTACH_MAX_BYTES) return null;
    return got;
  }
  const raw = p.attachment && p.attachment.base64;
  if (!raw) return null;
  const approx = Math.floor((String(raw).length * 3) / 4);
  if (approx <= 0 || approx > OUTLOOK_ATTACH_MAX_BYTES) return null;
  return {
    filename: p.attachment.filename || 'attachment',
    mimeType: p.attachment.mimeType || 'application/octet-stream',
    base64: raw
  };
}
async function outlookDeleteDraft(draftId, prefer) {
  if (!draftId) return;
  const delUrl = OUTLOOK_GRAPH + '/me/messages/' + encodeURIComponent(draftId);
  outlookAssertNotSend(delUrl);
  const headers = prefer || {};
  try { await outlookFetch(delUrl, { method: 'DELETE', headers: headers }); } catch (e) { /* already gone */ }
}
// The owner's off switches live in one storage object. A missing key is off.
async function glanceSwitchOn(name) {
  try {
    const bag = await chrome.storage.local.get({ glanceSwitches: {} });
    return !!(bag.glanceSwitches && bag.glanceSwitches[name] === true);
  } catch (e) { return false; }
}

async function outlookTeamsWanted(callText) {
  const T = globalThis.FlowTeamsMeeting;
  if (!T || typeof T.callAsked !== 'function' || !callText) return false;
  if (!(await glanceSwitchOn(T.SWITCH))) return false;
  return T.callAsked(callText);
}

// An empty Word document or Excel workbook in OneDrive > Glance for a mail that explicitly asks for one
// with a name (core/onedrive-new-file.js). Off unless the owner's switch ONEDRIVE_NEW_FILE is true. The
// plan is asked for by the page; the write reads the file back by id; Undo deletes it only while the
// file is still the one Glance made. Nothing is shared, written into, or sent.
async function newFilePlan(msg) {
  const N = globalThis.FlowOnedriveNewFile;
  if (!N || typeof N.plan !== 'function') return { action: 'silence', reason: 'not-configured' };
  const on = await glanceSwitchOn(N.SWITCH);
  if (!on) return { action: 'off', reason: 'switch-off' };
  return N.plan({ flags: { [N.SWITCH]: true }, text: String((msg && msg.text) || '').slice(0, 4000), now: new Date() });
}

async function onedriveNewFileCall(req) {
  const r = req || {};
  const url = OUTLOOK_GRAPH + String(r.path || '');
  outlookAssertNotSend(url);
  const init = { method: String(r.method || 'GET').toUpperCase() };
  if (r.raw != null) {
    init.body = r.raw;
    init.headers = { 'Content-Type': r.contentType || 'application/octet-stream' };
  }
  let res = null;
  try { res = await outlookFetch(url, init); } catch (e) { return { ok: false, status: 0, body: null }; }
  if (!res || res.notConnected) return { ok: false, status: 401, body: null };
  const status = res.status || 0;
  let body = null;
  if (status !== 204 && typeof res.json === 'function') { try { body = await res.json(); } catch (e) { body = null; } }
  return { ok: !!res.ok, status: status, body: body };
}

async function onedriveNewFileWrite(p) {
  const N = globalThis.FlowOnedriveNewFile;
  if (!N) return { ok: false, reason: 'not-configured' };
  const session = await outlookSession({});
  if (!session || !session.ok || !session.token) return { ok: false, reason: 'not-connected' };
  const Cal = globalThis.FlowOutlookCalendar;
  const scopes = (Cal && Cal.scopesFromToken) ? Cal.scopesFromToken(session.token) : session.token.grantedScopes;
  const params = (p && p.params) || {};
  const on = await glanceSwitchOn(N.SWITCH);
  const r = await N.create({ flags: { [N.SWITCH]: on }, fileKind: params.fileKind, fileName: params.fileName, grantedScopes: scopes }, { call: onedriveNewFileCall });
  if (r && r.ok) return Object.assign({}, r, { fetchedBack: true });
  return r || { ok: false, reason: 'write-failed' };
}

async function onedriveNewFileUndo(ref) {
  const N = globalThis.FlowOnedriveNewFile;
  if (!N) return { ok: false };
  const u = await N.undo(ref, { call: onedriveNewFileCall });
  if (u && u.ok) return { ok: true, written: 'File removed from OneDrive.' };
  if (u && (u.reason === 'user-edited' || u.reason === 'unconfirmed')) return { ok: false, reason: u.reason, written: u.error || '' };
  return { ok: false, reason: (u && u.reason) || 'undo-failed' };
}

// An empty Word document or Excel workbook in the Glance folder of the ONE SharePoint site a mail names
// (core/sharepoint-new-file.js, owner approval 2026-10-24). Off unless the owner's switch SHAREPOINT_NEW_FILE is
// true. The plan reads the site by name (Graph search, read only) and is silent unless exactly one site has that
// name; the write reads the file back by id; Undo deletes it only while the file is still the one Glance made.
// Needs Sites.ReadWrite.All, asked only when the SharePoint box is ticked. Nothing is shared, written into, or sent.
async function sharepointFilePlan(msg) {
  const N = globalThis.FlowSharepointNewFile;
  if (!N || typeof N.plan !== 'function') return { action: 'silence', reason: 'not-configured' };
  if (!(await glanceSwitchOn(N.SWITCH))) return { action: 'off', reason: 'switch-off' };
  const session = await outlookSession({});
  if (!session || !session.ok || !session.token) return { action: 'silence', reason: 'not-connected' };
  const Cal = globalThis.FlowOutlookCalendar;
  const scopes = (Cal && Cal.scopesFromToken) ? Cal.scopesFromToken(session.token) : session.token.grantedScopes;
  if (scopes != null && N.hasScope(scopes) === false) return { action: 'silence', reason: 'sharepoint-not-granted' };
  return N.plan({ flags: { [N.SWITCH]: true }, text: String((msg && msg.text) || '').slice(0, 4000), now: new Date() }, { call: onedriveNewFileCall });
}

async function sharepointNewFileWrite(p) {
  const N = globalThis.FlowSharepointNewFile;
  if (!N) return { ok: false, reason: 'not-configured' };
  const session = await outlookSession({});
  if (!session || !session.ok || !session.token) return { ok: false, reason: 'not-connected' };
  const Cal = globalThis.FlowOutlookCalendar;
  const scopes = (Cal && Cal.scopesFromToken) ? Cal.scopesFromToken(session.token) : session.token.grantedScopes;
  const params = (p && p.params) || {};
  const on = await glanceSwitchOn(N.SWITCH);
  const r = await N.create({ flags: { [N.SWITCH]: on }, fileKind: params.fileKind, fileName: params.fileName, siteId: params.siteId, siteName: params.siteName, grantedScopes: scopes }, { call: onedriveNewFileCall });
  if (r && r.ok) return Object.assign({}, r, { fetchedBack: true });
  return r || { ok: false, reason: 'write-failed' };
}

async function sharepointNewFileUndo(ref) {
  const N = globalThis.FlowSharepointNewFile;
  if (!N) return { ok: false };
  const u = await N.undo(ref, { call: onedriveNewFileCall });
  if (u && u.ok) return { ok: true, written: 'File removed from SharePoint.' };
  if (u && (u.reason === 'user-edited' || u.reason === 'unconfirmed')) return { ok: false, reason: u.reason, written: u.error || '' };
  return { ok: false, reason: (u && u.reason) || 'undo-failed' };
}

// The mail's own attachment saved, unchanged, into the Glance folder of the ONE SharePoint site the mail names
// ("please save the attached contract on the Marketing SharePoint site", core/sharepoint-save-file.js). Off unless the owner's
// switch SHAREPOINT_SAVE_FILE is true. The page first asks with the text alone; only an ask that reads as an explicit save is
// answered 'need-message-id', and then the page sends the Graph message id so the worker can list the attachments (read only).
// The write reads the bytes of the one attachment the card named, uploads without replacing, reads back by id (name, file,
// same size). Undo deletes it only while it is still the file Glance made. Nothing is shared, changed or sent.
async function sharepointSavePlan(msg) {
  const V = globalThis.FlowSharepointSaveFile;
  if (!V || typeof V.plan !== 'function') return { action: 'silence', reason: 'not-configured' };
  if (!(await glanceSwitchOn(V.SWITCH))) return { action: 'off', reason: 'switch-off' };
  const text = String((msg && msg.text) || '').slice(0, 4000);
  const ask = V.recognize(text);
  if (ask.kind !== 'clear') return { action: 'silence', reason: ask.reason || 'no-ask' };
  const id = String((msg && msg.graphMessageId) || '').trim();
  if (!id || /^A[AQ]Qk/i.test(id)) return { action: 'need-message-id' };
  const session = await outlookSession({});
  if (!session || !session.ok || !session.token) return { action: 'silence', reason: 'not-connected' };
  const Cal = globalThis.FlowOutlookCalendar;
  const scopes = (Cal && Cal.scopesFromToken) ? Cal.scopesFromToken(session.token) : session.token.grantedScopes;
  const S = globalThis.FlowSharepointNewFile;
  if (scopes != null && S && S.hasScope(scopes) === false) return { action: 'silence', reason: 'sharepoint-not-granted' };
  const list = await onedriveNewFileCall({ method: 'GET', path: '/me/messages/' + encodeURIComponent(id) + '/attachments?$select=id,name,size,contentType,isInline' });
  if (!list || list.ok !== true || !list.body || !Array.isArray(list.body.value)) return { action: 'silence', reason: 'attachments-unread' };
  return V.plan({ flags: { [V.SWITCH]: true }, text: text, attachments: list.body.value }, { call: onedriveNewFileCall });
}

async function sharepointSaveWrite(p) {
  const V = globalThis.FlowSharepointSaveFile;
  if (!V) return { ok: false, reason: 'not-configured' };
  const session = await outlookSession({});
  if (!session || !session.ok || !session.token) return { ok: false, reason: 'not-connected' };
  const Cal = globalThis.FlowOutlookCalendar;
  const scopes = (Cal && Cal.scopesFromToken) ? Cal.scopesFromToken(session.token) : session.token.grantedScopes;
  const params = (p && p.params) || {};
  const on = await glanceSwitchOn(V.SWITCH);
  const got = await outlookAttachmentBytes(String(params.graphMessageId || ''), String(params.attachmentId || ''));
  if (!got) return { ok: false, reason: 'no-bytes' };
  const r = await V.save({ flags: { [V.SWITCH]: on }, fileName: params.fileName, siteId: params.siteId, siteName: params.siteName, base64: got.base64, contentType: got.contentType, attachmentName: got.name, grantedScopes: scopes }, { call: onedriveNewFileCall });
  if (r && r.ok) return Object.assign({}, r, { fetchedBack: true });
  return r || { ok: false, reason: 'write-failed' };
}

// A Teams link on an event that is already on the calendar ("add a Teams link to the Thursday sync"),
// core/outlook-event-call-link.js. Off unless the owner's switch OUTLOOK_EVENT_CALL_LINK is true. The
// worker lists the next fortnight of the person's events (read only), the module picks the one event
// that fits or stays silent; Do It turns on the Teams meeting of that one event only, reads it back by
// id, and Undo turns it off again only while the event is as Glance left it. No guest, nothing sent.
async function graphJson(method, path, body, headers) {
  const url = OUTLOOK_GRAPH + String(path || '');
  outlookAssertNotSend(url);
  const init = { method: String(method || 'GET').toUpperCase() };
  if (headers) init.headers = Object.assign({}, headers);
  if (body != null) { init.body = JSON.stringify(body); init.headers = Object.assign({}, init.headers || {}, { 'Content-Type': 'application/json' }); }
  let res = null;
  try { res = await outlookFetch(url, init); } catch (e) { return { ok: false, status: 0, json: null }; }
  if (!res || res.notConnected) return { ok: false, status: 401, json: null };
  let json = null;
  if (res.status !== 204 && typeof res.json === 'function') { try { json = await res.json(); } catch (e) { json = null; } }
  return { ok: !!res.ok, status: res.status || 0, json: json };
}

async function eventLinkPlan(msg) {
  const M = globalThis.FlowOutlookEventCallLink;
  if (!M || typeof M.plan !== 'function') return { action: 'silence', reason: 'not-configured' };
  if (!(await glanceSwitchOn(M.SWITCH))) return { action: 'off', reason: 'switch-off' };
  const text = String((msg && msg.text) || '').slice(0, 4000);
  const now = new Date();
  // Cheap first: no events are listed unless the mail asks for a link at all.
  const asked = M.recognize(text, now);
  if (!asked || asked.kind !== 'clear') return { action: 'silence', reason: (asked && asked.reason) || 'no-ask' };
  const from = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const to = new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString();
  const listed = await graphJson('GET', '/me/calendarView?startDateTime=' + encodeURIComponent(from) + '&endDateTime=' + encodeURIComponent(to) +
    '&$top=50&$select=id,subject,start,isOnlineMeeting,isOrganizer,isCancelled', null, { Prefer: 'outlook.timezone="' + localTimeZone() + '"' });
  if (!listed.ok || !listed.json || !Array.isArray(listed.json.value)) return { action: 'silence', reason: 'not-searched' };
  const plan = M.plan({ flags: { [M.SWITCH]: true }, text: text, now: now, events: listed.json.value });
  return plan;
}

async function eventLinkWrite(p) {
  const M = globalThis.FlowOutlookEventCallLink;
  if (!M) return { ok: false, reason: 'not-configured' };
  const session = await outlookSession({});
  if (!session || !session.ok || !session.token) return { ok: false, reason: 'not-connected' };
  const Cal = globalThis.FlowOutlookCalendar;
  const scopes = (Cal && Cal.scopesFromToken) ? Cal.scopesFromToken(session.token) : session.token.grantedScopes;
  if (!Cal || !Cal.hasWriteScope(scopes)) return { ok: false, reason: 'calendar-write-not-granted' };
  const params = (p && p.params) || {};
  const on = await glanceSwitchOn(M.SWITCH);
  const r = await M.addLink({ flags: { [M.SWITCH]: on }, event: params.event }, { graph: graphJson });
  if (r && r.ok) return Object.assign({}, r, { fetchedBack: true });
  return r || { ok: false, reason: 'write-failed' };
}

async function eventLinkUndo(ref) {
  const M = globalThis.FlowOutlookEventCallLink;
  if (!M) return { ok: false };
  const u = await M.undo(ref, { graph: graphJson });
  if (u && u.ok) return { ok: true, written: 'Teams link removed from the event.' };
  if (u && (u.reason === 'user-edited' || u.reason === 'unconfirmed' || u.reason === 'link-changed')) return { ok: false, reason: u.reason, written: u.error || '' };
  return { ok: false, reason: (u && u.reason) || 'undo-failed' };
}

// A Hold It for "weekly sync every Tuesday at 10:00" is one meeting that repeats. With the
// owner's switch RECURRING_HOLD on (default off, the same switch as the Gmail Hold It) and one
// stated rule the hold's own date fits, the event becomes the series. Still no attendee.
async function outlookSeriesWanted(callText, dateIso) {
  const R = globalThis.FlowRecurringReminder;
  const T = globalThis.FlowTodoRecurrence;
  if (!R || !T || typeof R.seriesFor !== 'function' || !callText || !dateIso) return null;
  if (!(await glanceSwitchOn(R.HOLD_SWITCH))) return null;
  const rrule = R.seriesFor(callText, dateIso);
  if (!rrule) return null;
  const recurrence = T.fromRrule(rrule, dateIso);
  return recurrence ? { rrule: rrule, recurrence: recurrence } : null;
}

// The series master read by id must carry exactly the rule asked for.
async function outlookSeriesRuleOk(eventId, wanted) {
  const T = globalThis.FlowTodoRecurrence;
  const url = OUTLOOK_GRAPH + '/me/events/' + encodeURIComponent(eventId) + '?$select=id,recurrence,isCancelled';
  outlookAssertNotSend(url);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 300 * attempt));
    let res = null;
    try { res = await outlookFetch(url, { method: 'GET' }); } catch (e) { res = null; }
    if (!res || !res.ok) continue;
    const raw = await outlookReadJson(res);
    if (raw && raw.id === eventId && raw.isCancelled !== true) return !!(T && T.agrees(wanted, raw.recurrence));
  }
  return false;
}

// The Teams join link the event really carries, read by id. Microsoft attaches
// it a moment after the event exists, so the read repeats a few times.
async function outlookTeamsJoinUrl(eventId) {
  const T = globalThis.FlowTeamsMeeting;
  const url = OUTLOOK_GRAPH + '/me/events/' + encodeURIComponent(eventId) + '?$select=id,isOnlineMeeting,onlineMeeting,isCancelled';
  outlookAssertNotSend(url);
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 300 * attempt));
    let res = null;
    try { res = await outlookFetch(url, { method: 'GET' }); } catch (e) { res = null; }
    if (!res || !res.ok) continue;
    const raw = await outlookReadJson(res);
    if (raw && raw.id === eventId && raw.isCancelled !== true) {
      const link = T && T.joinUrlOf ? T.joinUrlOf(raw) : '';
      if (link) return link;
    }
  }
  return '';
}

// One calendar event for a Family B file-on-hold. The Calendar checkbox asks
// for Calendars.ReadWrite. A token that only has Calendars.Read stays quiet.
// The body never includes attendees, so the write does not invite anyone.
// A meeting Hold It names a clock. It is one event on the person's calendar.
// attendees stays empty, so the write does not invite anyone.
async function outlookMeetingWrite(p) {
  const Cal = globalThis.FlowOutlookCalendar;
  const session = await outlookSession({});
  if (!session || !session.ok || !session.token) return { ok: false, reason: 'not-connected' };
  const meetingScopes = (Cal && Cal.scopesFromToken) ? Cal.scopesFromToken(session.token) : (session.token.grantedScopes);
  if (!Cal || !Cal.hasWriteScope(meetingScopes)) {
    return { ok: false, reason: 'calendar-write-not-granted' };
  }
  const params = (p && p.params) || {};
  const dateIso = calendarIsoDate(params.dateIso);
  const clock = calendarClock(params.hour, params.minute);
  if (!dateIso || !clock || clock.invalid || clock.absent) {
    return { ok: false, reason: 'unclear', error: 'No single time for this meeting.' };
  }
  const title = String(params.title || 'Meeting').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Meeting';
  const quote = params.quote ? String(params.quote).replace(/[\r\n]+/g, ' ').trim().slice(0, 500) : '';
  const zone = await outlookGlanceZone(params.timeZone);
  const lines = [];
  if (quote && quote !== title) lines.push(quote);
  if (p && p.threadUrl) lines.push(String(p.threadUrl));
  const built = Cal.meetingBody({
    dateIso: dateIso,
    hour: clock.hour,
    minute: clock.minute,
    title: title,
    quote: lines.length ? lines.join('\n') : title,
    durationMinutes: params.durationMinutes,
    timeZone: zone
  });
  if (!built) return { ok: false, reason: 'unclear', error: 'No single time for this meeting.' };
  const body = built;
  if ((Array.isArray(body.attendees) && body.attendees.length) || body.isOnlineMeeting) {
    return { ok: false, reason: 'refused' };
  }
  // A Teams link only when the mail asks for a call and the owner's switch
  // TEAMS_MEETING is on (default off). Still no attendee, so nobody is invited.
  const teams = await outlookTeamsWanted(params.callText);
  if (teams) {
    body.isOnlineMeeting = true;
    body.onlineMeetingProvider = 'teamsForBusiness';
  }
  const series = await outlookSeriesWanted(params.callText, dateIso);
  if (series) body.recurrence = series.recurrence;
  const url = OUTLOOK_GRAPH + '/me/events';
  outlookAssertNotSend(url);
  const zoneHeader = String(body.start.timeZone || zone || '').replace(/"/g, '').slice(0, 80);
  const res = await outlookFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'outlook.timezone="' + zoneHeader + '"'
    },
    body: JSON.stringify(body)
  });
  if (res && res.notConnected) return { ok: false, reason: 'not-connected' };
  if (res && res.status === 401) return { ok: false, reason: 'not-connected' };
  if (res && res.status === 403) return { ok: false, reason: 'calendar-write-not-granted' };
  if (!res || !res.ok) return { ok: false, reason: 'http-' + ((res && res.status) || 0) };
  let event = null;
  try { event = await res.json(); } catch (e) { event = null; }
  if (!event || typeof event.id !== 'string' || !event.id) {
    return { ok: false, reason: 'error', error: 'Calendar did not confirm the event.' };
  }
  // Handled for a Teams hold needs the join link read back by id. Without it
  // the event is removed again and nothing is claimed.
  let joinUrl = '';
  if (teams) {
    joinUrl = await outlookTeamsJoinUrl(event.id);
    if (!joinUrl) {
      const delUrl = OUTLOOK_GRAPH + '/me/events/' + encodeURIComponent(event.id);
      outlookAssertNotSend(delUrl);
      let removed = false;
      try {
        const gone = await outlookFetch(delUrl, { method: 'DELETE' });
        removed = !!(gone && (gone.ok || gone.status === 204 || gone.status === 404));
      } catch (e) { removed = false; }
      return { ok: false, reason: 'teams-link-failed', removed: removed, ref: removed ? null : { eventId: event.id } };
    }
  }
  // Handled for a series needs the rule read back by id; otherwise the event is removed again.
  if (series && !(await outlookSeriesRuleOk(event.id, series.recurrence))) {
    const delUrl = OUTLOOK_GRAPH + '/me/events/' + encodeURIComponent(event.id);
    outlookAssertNotSend(delUrl);
    let removed = false;
    try {
      const gone = await outlookFetch(delUrl, { method: 'DELETE' });
      removed = !!(gone && (gone.ok || gone.status === 204 || gone.status === 404));
    } catch (e) { removed = false; }
    return { ok: false, reason: 'series-failed', removed: removed, ref: removed ? null : { eventId: event.id } };
  }
  const proved = await outlookEventRead(event.id);
  const eventSnap = proved && proved.snap;
  const when = Cal.whenLabel(dateIso, clock.hour, clock.minute);
  const ref = {
    eventId: event.id,
    created: eventSnap,
    contentHash: Cal.contentHash(proved && proved.raw)
  };
  const base = {
    where: 'Outlook Calendar',
    target: 'your calendar',
    url: event.webLink || null
  };
  if (joinUrl) base.joinUrl = joinUrl;
  if (!outlookHasSnap(eventSnap)) return outlookUnverifiedWrite(base, ref);
  return Object.assign({
    ok: true,
    fetchedBack: true,
    written: 'Calendar · ' + title + (when ? ' · ' + when : '') + (joinUrl ? ' · Teams' : '') + (series ? ' · repeats' : ''),
    ref: ref
  }, base);
}

async function outlookCalendarWrite(p) {
  const params = (p && p.params) || {};
  if (params.meeting === true) return outlookMeetingWrite(p);
  const Cal = globalThis.FlowOutlookCalendar;
  if (!Cal || typeof Cal.eventBody !== 'function') return { ok: false, reason: 'not-configured' };
  const session = await outlookSession({});
  if (!session || !session.ok || !session.token) return { ok: false, reason: 'not-connected' };
  const fileScopes = Cal.scopesFromToken ? Cal.scopesFromToken(session.token) : session.token.grantedScopes;
  if (!Cal.hasWriteScope(fileScopes)) {
    return { ok: false, reason: 'calendar-write-not-granted' };
  }
  const body = Cal.eventBody({
    dateIso: params.dateIso,
    hour: params.hour,
    minute: params.minute,
    timeZone: localTimeZone(),
    fileName: params.fileName || params.fileTerm,
    fileTerm: params.fileTerm,
    fileUrl: params.fileUrl,
    quote: params.quote
  });
  if (!body) return { ok: false, reason: 'unclear', error: 'No single file and time for this event.' };
  // Graph fields posted as-is: subject, body.contentType Text, body.content
  // (quote, "File: name", https link), start, end, showAs busy, attendees [].
  // A non-empty attendees list or isOnlineMeeting would invite someone.
  const invited = Array.isArray(body.attendees) ? body.attendees.length : (body.attendees ? 1 : 0);
  if (invited > 0 || body.isOnlineMeeting) return { ok: false, reason: 'refused' };
  const url = OUTLOOK_GRAPH + '/me/events';
  outlookAssertNotSend(url);
  const res = await outlookFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.notConnected) return { ok: false, reason: 'not-connected' };
  if (res.status === 401) return { ok: false, reason: 'not-connected' };
  if (res.status === 403) return { ok: false, reason: 'calendar-write-not-granted' };
  if (!res.ok) return { ok: false, reason: 'http-' + res.status };
  let event = null;
  try { event = await res.json(); } catch (e) { event = null; }
  if (!event || typeof event.id !== 'string' || !event.id) {
    return { ok: false, reason: 'error', error: 'Calendar did not confirm the event.' };
  }
  const summary = body.subject;
  const when = Cal.whenLabel(params.dateIso, params.hour, params.minute);
  const eventSnap = await outlookStoredEventSnap(event.id);
  const ref = { eventId: event.id, created: eventSnap };
  const base = {
    where: 'Outlook Calendar',
    target: 'your calendar',
    url: event.webLink || null
  };
  if (!outlookHasSnap(eventSnap)) return outlookUnverifiedWrite(base, ref);
  return Object.assign({
    ok: true,
    fetchedBack: true,
    written: 'Calendar · ' + summary + (when ? ' · ' + when : ''),
    ref: ref
  }, base);
}

function outlookUnverifiedWrite(base, ref) {
  return Object.assign({}, base, {
    ok: true,
    fetchedBack: false,
    reason: 'unverified',
    written: outlookUnverifiedLine(),
    ref: ref,
    proof: null
  });
}

async function outlookCalendarUndo(ref, hint) {
  const Cal = globalThis.FlowOutlookCalendar;
  const id = ref && typeof ref === 'object' ? ref.eventId : ref;
  const req = Cal && Cal.undoRequest(id);
  if (!req || req.method !== 'DELETE' || !/^\/me\/events\/[^/]+$/.test(req.path)) return { ok: false };
  const url = OUTLOOK_GRAPH + req.path;
  outlookAssertNotSend(url);
  const calSnap = (hint && hint.created) || (ref && typeof ref === 'object' ? ref.created : null);
  if (!outlookHasSnap(calSnap)) return outlookUnconfirmed();
  const edited = await outlookRefuseIfEdited(url, calSnap);
  if (edited) return edited;
  const del = await outlookFetch(url, { method: 'DELETE' });
  if (del.notConnected) return { ok: false, reason: 'not-connected' };
  if (del.ok || del.status === 204 || del.status === 404) return { ok: true, written: 'Calendar event removed.' };
  return { ok: false, reason: 'http-' + (del.status || 0) };
}

// One Microsoft To Do task on the person's default list. Creating it is not
// the close: Handled waits for a GET of that id. Never Mail.Send.
function outlookGrantedScopes(token) {
  const raw = token && token.grantedScopes;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return raw.split(/\s+/).filter(Boolean);
  return null;
}

function outlookHasTasksScope(token) {
  const list = outlookGrantedScopes(token);
  if (!list) return null;
  return list.some((s) => s === 'Tasks.ReadWrite' || s === 'https://graph.microsoft.com/Tasks.ReadWrite');
}

function outlookTodoListIdFrom(body) {
  const lists = body && Array.isArray(body.value) ? body.value : [];
  const named = lists.find((l) => l && l.id && l.wellknownListName === 'defaultList');
  if (named) return named.id;
  const first = lists.find((l) => l && l.id);
  return first ? first.id : '';
}

// A repeating commitment becomes a repeating To Do task only when the owner's
// switch RECURRING_TODO is on (default off) and the mail states one rule and
// one clock. Otherwise the task is the one-off it has always been.
async function outlookRecurrenceFor(text) {
  const R = globalThis.FlowTodoRecurrence;
  if (!R || !text) return null;
  if (!(await glanceSwitchOn(R.SWITCH))) return null;
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const todayIso = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  return R.plan({ flags: { [R.SWITCH]: true }, text: String(text).slice(0, 4000), todayIso: todayIso });
}

// A task card whose mail names one of the person's own Planner plans ("... on the Website
// relaunch plan") writes the task to that plan instead of To Do, only when the owner's switch
// PLANNER_TASK is on (default off). No assignee, so nobody is notified. Anything else about it
// (no plan named, two plans, a plan list that cannot be read) leaves the task in To Do.
const PLANNER_ID_PREFIX = 'planner:';
const PLANNER_REFS_KEY = 'glancePlannerRefs';
function plannerRawId(id) {
  const s = String(id || '');
  return s.indexOf(PLANNER_ID_PREFIX) === 0 ? s.slice(PLANNER_ID_PREFIX.length) : '';
}
async function outlookPlannerRefPut(rawId, ref) {
  try {
    const bag = await chrome.storage.local.get(PLANNER_REFS_KEY);
    const map = Object.assign({}, bag[PLANNER_REFS_KEY] || {});
    map[rawId] = { taskId: rawId, externalId: rawId, planId: ref.planId, etag: ref.etag || null, createdByGlance: true };
    const keys = Object.keys(map);
    if (keys.length > 200) delete map[keys[0]];
    await chrome.storage.local.set({ [PLANNER_REFS_KEY]: map });
  } catch (e) { /* Undo then says it cannot confirm */ }
}
async function outlookPlannerRefGet(rawId) {
  try {
    const bag = await chrome.storage.local.get(PLANNER_REFS_KEY);
    return (bag[PLANNER_REFS_KEY] || {})[rawId] || null;
  } catch (e) { return null; }
}
async function outlookPlannerRefDrop(rawId) {
  try {
    const bag = await chrome.storage.local.get(PLANNER_REFS_KEY);
    const map = Object.assign({}, bag[PLANNER_REFS_KEY] || {});
    delete map[rawId];
    await chrome.storage.local.set({ [PLANNER_REFS_KEY]: map });
  } catch (e) { /* nothing kept */ }
}

function outlookGraphCall() {
  return async function graph(method, path, body, headers) {
    const url = OUTLOOK_GRAPH + path;
    outlookAssertNotSend(url);
    const init = { method: method };
    const hs = Object.assign({}, headers || {});
    if (body !== undefined) { init.body = JSON.stringify(body); hs['Content-Type'] = 'application/json'; }
    if (Object.keys(hs).length) init.headers = hs;
    const res = await outlookFetch(url, init);
    if (!res || res.notConnected) return { status: (res && res.status) || 401, ok: false, json: null };
    let json = null;
    try { if (res.status !== 204) json = await res.json(); } catch (e) { json = null; }
    return { status: res.status, ok: !!res.ok, json: json };
  };
}

async function outlookPlannerWrite(p, title, dueIso) {
  const P = globalThis.FlowPlannerTask;
  if (!P || typeof P.planNamed !== 'function' || !p || !p.text) return null;
  if (!(await glanceSwitchOn(P.SWITCH))) return null;
  const graph = outlookGraphCall();
  const listed = await graph('GET', '/me/planner/plans');
  if (!listed.ok || !listed.json || !Array.isArray(listed.json.value)) return null;
  const named = P.planNamed(String(p.text).slice(0, 4000), listed.json.value);
  if (!named.plan) return null;
  const r = await P.create({ flags: { [P.SWITCH]: true }, plan: named.plan, title: title, dueIso: dueIso || null, now: new Date().toISOString() }, { graph: graph });
  if (r && r.ok) {
    // The page keeps only the ids of a task row, so the id itself says "Planner". The entity tag
    // Undo needs stays in the worker, not in the page's row.
    const raw = r.ref.taskId;
    await outlookPlannerRefPut(raw, r.ref);
    const shown = PLANNER_ID_PREFIX + raw;
    return { ok: true, fetchedBack: true, where: 'Microsoft Planner', target: named.plan.title, written: r.written, url: null, ref: { taskId: shown, externalId: shown, planId: named.plan.id }, proof: Object.assign({}, r.proof, { externalId: shown }) };
  }
  return Object.assign({}, r, { where: 'Microsoft Planner', target: named.plan.title });
}

async function outlookPlannerUndo(ref) {
  const P = globalThis.FlowPlannerTask;
  if (!P) return { ok: false };
  const raw = plannerRawId(ref && (ref.externalId || ref.taskId));
  const kept = raw ? await outlookPlannerRefGet(raw) : null;
  if (!kept) return { ok: false, reason: 'unconfirmed', written: "Couldn't confirm it's unchanged. Undo left it alone." };
  const r = await P.undo(kept, { graph: outlookGraphCall() });
  if (r && r.ok) {
    await outlookPlannerRefDrop(raw);
    return { ok: true, fetchedBack: true, deleted: true, written: 'Undone. The Planner task is removed.' };
  }
  return Object.assign({}, r, { written: (r && r.error) || undefined });
}

async function outlookTaskWrite(p) {
  const session = await outlookSession({});
  if (!session || !session.ok || !session.token) {
    if (session && (session.needsSignIn || session.error === 'expired' || session.error === 'login_required')) {
      return { ok: false, reason: 'token-expired' };
    }
    return { ok: false, reason: 'not-connected' };
  }
  const scope = outlookHasTasksScope(session.token);
  if (scope === false) return { ok: false, reason: 'tasks-not-granted' };

  const listUrl = OUTLOOK_GRAPH + '/me/todo/lists';
  outlookAssertNotSend(listUrl);
  const listed = await outlookFetch(listUrl, { method: 'GET' });
  if (listed && listed.notConnected) return { ok: false, reason: 'not-connected' };
  if (listed && listed.status === 401) return { ok: false, reason: 'token-expired' };
  if (listed && listed.status === 403) return { ok: false, reason: 'tasks-not-granted' };
  if (!listed || !listed.ok) return { ok: false, reason: 'http-' + ((listed && listed.status) || 0) };
  let lists = null;
  try { lists = await listed.json(); } catch (e) { lists = null; }
  const taskListId = outlookTodoListIdFrom(lists);
  if (!taskListId) return { ok: false, reason: 'no-list' };

  const close = taskClosePayload(p || {});
  const titled = googleTaskTitle(p || {});
  const title = (typeof titled === 'string' ? titled : '').trim().slice(0, 255);
  if (!title) return { ok: false, reason: 'unclear', error: 'Nothing to put on the task.' };
  const planned = await outlookPlannerWrite(p, title, close.dueIso);
  if (planned) return planned;
  const notesLines = factLines(close.forNotes);
  if (p && p.threadUrl) notesLines.push([chatThreadLabel(p, 'Open in Outlook'), p.threadUrl]);
  const notes = notesLines.map(([k, v]) => k + ': ' + v).join('\n').slice(0, 8000);
  const body = { title: title };
  if (notes) body.body = { contentType: 'text', content: notes };
  if (close.dueIso) body.dueDateTime = { dateTime: close.dueIso + 'T00:00:00.0000000', timeZone: 'UTC' };
  const reminder = p && p.params && p.params.reminder;
  if (reminder) {
    const remDay = calendarIsoDate(reminder.dateIso);
    const remClock = calendarClock(reminder.hour, reminder.minute);
    if (remDay && remClock && !remClock.invalid && !remClock.absent) {
      body.isReminderOn = true;
      body.reminderDateTime = {
        dateTime: calendarDateTime(remDay, remClock.hour, remClock.minute),
        timeZone: localTimeZone()
      };
    }
  }

  // To Do needs a due date for a repeat: the first occurrence is that date.
  const rec = await outlookRecurrenceFor(p && p.text);
  if (rec) {
    body.recurrence = rec.recurrence;
    body.dueDateTime = { dateTime: rec.dueIso + 'T00:00:00.0000000', timeZone: 'UTC' };
    body.isReminderOn = true;
    body.reminderDateTime = { dateTime: calendarDateTime(rec.dueIso, rec.hour, rec.minute), timeZone: localTimeZone() };
  }

  const postUrl = OUTLOOK_GRAPH + '/me/todo/lists/' + encodeURIComponent(taskListId) + '/tasks';
  outlookAssertNotSend(postUrl);
  const res = await outlookFetch(postUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res && res.notConnected) return { ok: false, reason: 'not-connected' };
  if (res && res.status === 401) return { ok: false, reason: 'token-expired' };
  if (res && res.status === 403) return { ok: false, reason: 'tasks-not-granted' };
  if (!res || !res.ok) return { ok: false, reason: 'http-' + ((res && res.status) || 0) };
  let task = null;
  try { task = await res.json(); } catch (e) { task = null; }
  const written = taskWrittenLine(rec ? rec.dueIso : close.dueIso, close.amount).replace(/^Google Task/, 'To Do') + (rec ? ' · repeats' : '');
  const base = { where: 'Microsoft To Do', target: 'default list', written: written, url: null };
  if (rec) base.repeats = true;
  const Proof = globalThis.FlowProofOfClose;
  const pending = (Proof && Proof.REASON_PENDING) || 'proof_pending';
  const failed = (Proof && Proof.REASON_FAILED) || 'verify_failed';
  if (!task || typeof task.id !== 'string' || !task.id) {
    return Object.assign({ ok: false, reason: pending, ref: null, proof: null }, base);
  }
  const wroteListId = (task && typeof task.listId === 'string' && task.listId) ? task.listId : taskListId;
  const ref = { taskListId: wroteListId, taskId: task.id, externalId: task.id, created: null };
  const fetched = await outlookTaskFetchBack(wroteListId, task.id, body);
  if (fetched && fetched.task) ref.created = outlookCreationSnap(fetched.task);
  if (!fetched.ok || !outlookHasSnap(ref.created)) {
    return Object.assign({ ok: false, reason: failed, ref: ref, proof: null, fetchedBack: false }, base, {
      written: outlookUnverifiedLine()
    });
  }
  const link = task.webLink && String(task.webLink).slice(0, 8) === 'https://' ? task.webLink : null;
  if (link) base.url = link;
  const proof = Proof && Proof.buildProof({
    system: Proof.SYSTEM_MICROSOFT_TODO,
    externalId: task.id,
    url: link || undefined,
    fetchedBack: true,
    verifiedAt: new Date().toISOString()
  });
  if (!proof) {
    return Object.assign({ ok: false, reason: pending, ref: ref, proof: null }, base);
  }
  return Object.assign({ ok: true, ref: ref, proof: proof }, base);
}

// Closing a To Do task Glance wrote (the other side said they paid): PATCH status completed, and Handled only when a GET shows it
// completed. A task the person changed since Glance wrote it (title, body, due day, status ...) is left as it is. Undo reopens it, and only
// while it still has the content the close left.
async function outlookTaskCloseWrite(p) {
  const session = await outlookSession({});
  if (!session || !session.ok || !session.token) {
    if (session && (session.needsSignIn || session.error === 'expired' || session.error === 'login_required')) return { ok: false, reason: 'token-expired' };
    return { ok: false, reason: 'not-connected' };
  }
  if (outlookHasTasksScope(session.token) === false) return { ok: false, reason: 'tasks-not-granted' };
  const params = (p && p.params) || {};
  const listId = String(params.taskListId || '').trim();
  const taskId = String(params.taskId || '').trim();
  if (!listId || !taskId || plannerRawId(taskId) || !outlookHasSnap(params.created)) return { ok: false, reason: 'unclear', error: 'No single task to close.' };
  const url = OUTLOOK_GRAPH + '/me/todo/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(taskId);
  outlookAssertNotSend(url);
  const refused = await outlookRefuseIfEdited(url, params.created);
  if (refused && refused.alreadyGone) return { ok: false, reason: 'not-found', error: 'That task is gone, so there is nothing to close.' };
  if (refused) return refused;
  const Proof = globalThis.FlowProofOfClose;
  const doneRef = (task, wrote) => ({ taskListId: listId, taskId: taskId, externalId: taskId, closed: outlookCreationSnap(task), closedByGlance: wrote === true });
  const finish = (task, wrote) => {
    const link = task.webLink && String(task.webLink).slice(0, 8) === 'https://' ? task.webLink : null;
    const proof = Proof && Proof.buildProof({ system: Proof.SYSTEM_MICROSOFT_TODO, externalId: taskId, url: link || undefined, fetchedBack: true, verifiedAt: new Date().toISOString() });
    const base = { where: 'Microsoft To Do', target: 'default list', written: 'To Do task done · ' + String(task.title || ''), url: link, title: String(task.title || '') };
    if (!proof) return Object.assign({ ok: false, reason: (Proof && Proof.REASON_PENDING) || 'proof_pending', ref: doneRef(task, wrote), proof: null }, base);
    return Object.assign({ ok: true, ref: doneRef(task, wrote), proof: proof, fetchedBack: true }, base);
  };
  const before = await outlookTaskFetchOnce(listId, taskId);
  if (before.ok && before.task && before.task.status === 'completed') return finish(before.task, false);
  const res = await outlookFetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed' }) });
  if (res && res.notConnected) return { ok: false, reason: 'not-connected' };
  if (res && res.status === 401) return { ok: false, reason: 'token-expired' };
  if (res && res.status === 403) return { ok: false, reason: 'tasks-not-granted' };
  if (!res || !res.ok) return { ok: false, reason: 'http-' + ((res && res.status) || 0) };
  const waits = [0, 250, 500, 1000, 1250];
  let last = { ok: false };
  for (let attempt = 0; attempt < waits.length; attempt++) {
    if (waits[attempt]) await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
    last = await outlookTaskFetchOnce(listId, taskId);
    if (last.ok && last.task && last.task.status === 'completed') return finish(last.task, true);
  }
  return { ok: false, reason: (Proof && Proof.REASON_FAILED) || 'verify_failed', ref: { taskListId: listId, taskId: taskId, externalId: taskId, closed: null, closedByGlance: true }, proof: null, fetchedBack: false };
}

async function outlookTaskCloseUndo(ref) {
  const taskId = ref && (ref.externalId || ref.taskId);
  const listId = ref && ref.taskListId;
  if (!taskId || !listId) return { ok: false };
  if (ref.closedByGlance === false) return { ok: true, fetchedBack: true, written: 'It was already done before, so it stays done.' };
  if (!outlookHasSnap(ref.closed)) return outlookUnconfirmed();
  const url = OUTLOOK_GRAPH + '/me/todo/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(taskId);
  outlookAssertNotSend(url);
  const refused = await outlookRefuseIfEdited(url, ref.closed);
  if (refused && refused.alreadyGone) return { ok: true, fetchedBack: true, written: 'The task is gone.' };
  if (refused) return refused;
  const res = await outlookFetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'notStarted' }) });
  if (res && res.notConnected) return { ok: false, reason: 'not-connected' };
  if (!res || !res.ok) return { ok: false, reason: 'http-' + ((res && res.status) || 0) };
  const back = await outlookTaskFetchOnce(listId, taskId);
  if (!back.ok || !back.task || back.task.status === 'completed') return { ok: false, reason: 'unverified', written: 'Not verified: To Do still shows the task as done.' };
  return { ok: true, fetchedBack: true, written: 'To Do task is open again.' };
}

function outlookZoneKey(zone) {
  const s = String(zone || '').trim().toLowerCase();
  if (!s) return '';
  if (s === 'utc' || s === 'etc/utc' || s === 'tzone://microsoft/utc' || s === 'greenwich standard time') return 'utc';
  return s;
}

function outlookClockKey(value) {
  const clock = (globalThis.FlowNativeEdit && FlowNativeEdit.clockOf) ? FlowNativeEdit.clockOf(value) : '';
  return clock || '';
}

// Title and dueDateTime, with timeZone. A missing field on the read is not
// a disagreement. UTC and Etc/UTC are the same zone. A different title or
// a different clock is not the task we wrote.
function outlookTodoAgrees(sent, got) {
  if (!got) return false;
  const want = String((sent && sent.title) || '').trim();
  const have = got.title == null ? '' : String(got.title).trim();
  if (want && have && want !== have) return false;
  // A repeat was asked for: the task read back must carry the same rule.
  if (sent && sent.recurrence) {
    const R = globalThis.FlowTodoRecurrence;
    if (!R || !R.agrees(sent.recurrence, got.recurrence)) return false;
  }
  if (!(sent && sent.dueDateTime) || !got.dueDateTime) return true;
  if (outlookClockKey(sent.dueDateTime) !== outlookClockKey(got.dueDateTime)) return false;
  const a = outlookZoneKey(sent.dueDateTime.timeZone);
  const b = outlookZoneKey(got.dueDateTime.timeZone);
  if (a && b && a !== b) return false;
  return true;
}

async function outlookTaskFetchOnce(taskListId, taskId) {
  const url = OUTLOOK_GRAPH + '/me/todo/lists/' + encodeURIComponent(taskListId) + '/tasks/' + encodeURIComponent(taskId);
  outlookAssertNotSend(url);
  let res;
  try {
    res = await outlookFetch(url, { method: 'GET' });
  } catch (e) {
    return { ok: false };
  }
  if (!res || !res.ok) return { ok: false };
  let body = null;
  try { body = await res.json(); } catch (e) { return { ok: false }; }
  if (!body || body.id !== taskId) return { ok: false };
  return { ok: true, task: body };
}

// Graph's To Do list is eventually consistent. A 404 in the first second
// is not proof the task is missing. Retry with backoff, up to about 3s.
async function outlookTaskFetchBack(taskListId, taskId, sent) {
  const waits = [0, 250, 500, 1000, 1250];
  let last = { ok: false };
  for (let attempt = 0; attempt < waits.length; attempt++) {
    if (waits[attempt]) await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
    last = await outlookTaskFetchOnce(taskListId, taskId);
    if (last.ok && outlookTodoAgrees(sent, last.task)) return last;
    if (last.ok) last = { ok: false, mismatch: true, task: last.task };
  }
  return last;
}

async function outlookTaskUndo(ref, hint) {
  if (plannerRawId(ref && (ref.externalId || ref.taskId))) return outlookPlannerUndo(ref);
  const taskId = ref && (ref.externalId || ref.taskId);
  const listId = ref && ref.taskListId;
  if (!taskId || !listId) return { ok: false };
  const url = OUTLOOK_GRAPH + '/me/todo/lists/' + encodeURIComponent(listId) + '/tasks/' + encodeURIComponent(taskId);
  outlookAssertNotSend(url);
  const taskSnap = (hint && hint.created) || (ref && typeof ref === 'object' ? ref.created : null);
  if (!outlookHasSnap(taskSnap)) return outlookUnconfirmed();
  const edited = await outlookRefuseIfEdited(url, taskSnap);
  if (edited) return edited;
  const del = await outlookFetch(url, { method: 'DELETE' });
  if (del && del.notConnected) return { ok: false, reason: 'not-connected' };
  if (!(del && (del.ok || del.status === 204 || del.status === 404))) {
    return { ok: false, reason: 'http-' + ((del && del.status) || 0) };
  }
  let got;
  try {
    got = await outlookUndoConfirm(url);
  } catch (e) {
    return { ok: false, reason: 'verify-timeout', written: outlookVerifyTimeoutLine() };
  }
  if (got && got.reason === 'verify-timeout') return got;
  if (got && got.notConnected) return { ok: false, reason: 'not-connected' };
  const cache = (globalThis.FlowReceipt && FlowReceipt.todoUiCacheLine)
    ? FlowReceipt.todoUiCacheLine()
    : 'Microsoft To Do can keep that task on screen for about two minutes. A reload shows it gone.';
  if (got && got.status === 404) {
    return { ok: true, fetchedBack: true, deleted: true, written: 'Undone. ' + cache };
  }
  // A 200 means the task is still there. A deleted flag on that body is not a delete.
  if (got && (got.status === 200 || got.ok)) {
    return { ok: false, reason: 'still-present', fetchedBack: true, written: 'Still there — the To Do task was not removed.' };
  }
  return { ok: false, reason: 'http-' + ((got && got.status) || 0) };
}

function outlookVerifyTimeoutLine() {
  return (globalThis.FlowReceipt && FlowReceipt.verifyTimeoutLine)
    ? FlowReceipt.verifyTimeoutLine()
    : "Couldn't verify, try again";
}

// The confirming GET is the read-back. If it does not answer, Undo stops.
// A late 200 must not become Undone after this wait.
function outlookUndoConfirm(url, prefer) {
  const waitMs = 8000;
  let timer = null;
  const timed = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ verifyTimeout: true }), waitMs);
  });
  return Promise.race([
    outlookFetch(url, { method: 'GET', headers: prefer || {} }).catch(() => ({ status: 0, ok: false })),
    timed
  ]).then((got) => {
    if (timer != null) clearTimeout(timer);
    if (got && got.verifyTimeout) {
      return { ok: false, reason: 'verify-timeout', fetchedBack: false, written: outlookVerifyTimeoutLine() };
    }
    return got;
  }, (e) => {
    if (timer != null) clearTimeout(timer);
    throw e;
  });
}

async function outlookDraftUndo(ref, hint) {
  const id = typeof ref === 'string' ? ref : (ref && (ref.draftId || ref.id));
  if (!id) return { ok: false };
  const snapshot = (hint && hint.created) || (ref && typeof ref === 'object' ? ref.created : null);
  // No creation snapshot means Undo cannot tell an edit from the original. Leave the draft.
  if (!outlookHasSnap(snapshot)) return outlookUnconfirmed();
  const prefer = hint && hint.outlookImmutableId === true ? { Prefer: 'IdType="ImmutableId"' } : {};
  const getUrl = OUTLOOK_GRAPH + '/me/messages/' + encodeURIComponent(id) + '?$select=id,isDraft,subject,body,toRecipients,ccRecipients,importance,categories';
  outlookAssertNotSend(getUrl);
  let got;
  try { got = await outlookUndoConfirm(getUrl, prefer); }
  catch (e) { return outlookUnconfirmed(); }
  if (got && got.reason === 'verify-timeout') return outlookUnconfirmed();
  if (got && got.notConnected) return { ok: false, reason: 'not-connected' };
  if (got && got.status === 404) return { ok: true, alreadyGone: true, written: 'Draft was already gone. Nothing left to undo.' };
  if (!got || !got.ok) return outlookUnconfirmed();
  let msg = null;
  try { msg = await got.json(); } catch (e) { msg = null; }
  if (!msg) return outlookUnconfirmed();
  if (msg.isDraft === false) return { ok: true, alreadySent: true, written: 'Already sent, so nothing was undone.' };
  const verdict = outlookEditVerdict(snapshot, msg);
  if (verdict === 'edited') return { ok: false, reason: 'user-edited', written: outlookUserEditedLine() };
  if (verdict === 'unconfirmed') return outlookUnconfirmed();
  const delUrl = OUTLOOK_GRAPH + '/me/messages/' + encodeURIComponent(id);
  outlookAssertNotSend(delUrl);
  const del = await outlookFetch(delUrl, { method: 'DELETE', headers: prefer });
  if (!del.ok && del.status !== 204) return { ok: false, reason: 'http-' + del.status };
  return { ok: true, written: 'Draft removed from Outlook Drafts.' };
}

function outlookHasFilesScope(token) {
  const Files = globalThis.FlowOnedriveFile;
  if (!Files || typeof Files.hasWriteScope !== 'function') return false;
  return Files.hasWriteScope(outlookGrantedScopes(token));
}

async function outlookReadJson(res) {
  if (!res || typeof res.json !== 'function') return null;
  try { return await res.json(); } catch (e) { return null; }
}

// Exactly one non-inline file on the message. Zero or two-plus is unclear.
// The list call often omits contentBytes; the item call has them.
async function outlookOneFileAttachment(messageId) {
  const Files = globalThis.FlowOnedriveFile;
  if (!Files || !messageId) return null;
  const listUrl = OUTLOOK_GRAPH + Files.attachmentsPath(messageId) + '?$select=id,name,contentType,size,isInline';
  outlookAssertNotSend(listUrl);
  const listed = await outlookFetch(listUrl, { method: 'GET' });
  if (!listed || !listed.ok) return null;
  const body = await outlookReadJson(listed);
  const rows = body && Array.isArray(body.value) ? body.value : [];
  const files = rows.filter((a) => a && a.isInline !== true && !/itemAttachment/i.test(String(a['@odata.type'] || '')));
  if (files.length !== 1) return null;
  const one = files[0];
  if (one.size && Number(one.size) > Files.MAX_BYTES) return null;
  let b64 = one.contentBytes || '';
  if (!b64 && one.id) {
    const itemUrl = OUTLOOK_GRAPH + Files.attachmentItemPath(messageId, one.id);
    outlookAssertNotSend(itemUrl);
    const item = await outlookFetch(itemUrl, { method: 'GET' });
    const itemBody = await outlookReadJson(item);
    b64 = itemBody && itemBody.contentBytes;
  }
  const bytes = Files.bytesFromBase64(b64);
  if (!bytes || !bytes.length || bytes.length > Files.MAX_BYTES) return null;
  return { bytes: bytes, name: one.name || '', contentType: one.contentType || 'application/octet-stream' };
}

// One file on the person's OneDrive. Creating or replacing it is not the
// close: Handled waits for a GET of that item id. A file that already
// exists is replaced only when a previous version can be restored. Never
// Mail.Send. A mail does not search the drive.
async function outlookFileWrite(p) {
  const Files = globalThis.FlowOnedriveFile;
  const Proof = globalThis.FlowProofOfClose;
  if (!Files || typeof Files.prepare !== 'function') return { ok: false, reason: 'not-configured' };
  const session = await outlookSession({});
  if (!session || !session.ok || !session.token) return { ok: false, reason: 'not-connected' };
  const scope = outlookHasFilesScope(session.token);
  if (scope === false) return { ok: false, reason: 'files-not-granted' };

  const prepared = Files.prepare(p || {});
  if (!prepared || !prepared.ok) return { ok: false, reason: (prepared && prepared.reason) || 'unclear' };
  let name = prepared.name;
  let bytes = prepared.bytes;
  let contentType = prepared.contentType || 'application/octet-stream';
  if (prepared.fetchOne) {
    const got = await outlookOneFileAttachment(prepared.messageId);
    if (!got) return { ok: false, reason: 'unclear' };
    bytes = got.bytes;
    contentType = got.contentType || contentType;
    if (!prepared.nameLocked) {
      const fromFile = Files.safeName(got.name);
      if (fromFile) name = fromFile.indexOf('.') < 0 ? Files.safeName(fromFile + '.txt') : fromFile;
    }
  }
  if (!name || !bytes || !bytes.length || bytes.length > Files.MAX_BYTES) return { ok: false, reason: 'unclear' };

  const lookupUrl = OUTLOOK_GRAPH + Files.rootItemPath(name);
  outlookAssertNotSend(lookupUrl);
  const looked = await outlookFetch(lookupUrl, { method: 'GET' });
  if (looked && looked.notConnected) return { ok: false, reason: 'not-connected' };
  if (looked && (looked.status === 401 || looked.status === 403)) return { ok: false, reason: 'files-not-granted' };
  const missing = !looked || looked.status === 404;
  const existing = !missing && looked.ok ? await outlookReadJson(looked) : null;
  if (!missing && (!existing || !existing.id)) return { ok: false, reason: 'http-' + ((looked && looked.status) || 0) };

  let created = true;
  let previousVersionId = '';
  let putUrl = OUTLOOK_GRAPH + Files.createContentPath(name);
  if (!missing) {
    const versionsUrl = OUTLOOK_GRAPH + Files.versionsPath(existing.id);
    outlookAssertNotSend(versionsUrl);
    const vers = await outlookFetch(versionsUrl, { method: 'GET' });
    if (vers && (vers.status === 401 || vers.status === 403)) return { ok: false, reason: 'files-not-granted' };
    const versionId = Files.versionIdOf(await outlookReadJson(vers));
    if (!versionId) return { ok: false, reason: 'unclear', error: 'No previous version to restore.' };
    created = false;
    previousVersionId = versionId;
    putUrl = OUTLOOK_GRAPH + Files.itemContentPath(existing.id);
  }
  outlookAssertNotSend(putUrl);
  const put = await outlookFetch(putUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes
  });
  if (put && put.notConnected) return { ok: false, reason: 'not-connected' };
  if (put && (put.status === 401 || put.status === 403)) return { ok: false, reason: 'files-not-granted' };
  if (!put || !put.ok) return { ok: false, reason: 'http-' + ((put && put.status) || 0) };
  const writtenItem = await outlookReadJson(put);
  const itemId = (writtenItem && writtenItem.id) || (existing && existing.id) || '';
  const pending = (Proof && Proof.REASON_PENDING) || 'proof_pending';
  const failed = (Proof && Proof.REASON_FAILED) || 'verify_failed';
  const base = { where: 'OneDrive', target: name, written: 'OneDrive · ' + name, url: null };
  if (!itemId) return Object.assign({ ok: false, reason: pending, ref: null, proof: null }, base);

  const ref = { fileId: itemId, itemId: itemId, externalId: itemId, created: created };
  if (previousVersionId) ref.previousVersionId = previousVersionId;
  const fetched = await outlookFileFetchBack(itemId);
  if (fetched && fetched.item) ref.editSnap = outlookCreationSnap(fetched.item);
  if (!fetched.ok || !outlookHasSnap(ref.editSnap)) {
    return Object.assign({ ok: false, reason: failed, ref: ref, proof: null, fetchedBack: false }, base, {
      written: outlookUnverifiedLine()
    });
  }
  const link = fetched.item && fetched.item.webUrl && String(fetched.item.webUrl).slice(0, 8) === 'https://' ? fetched.item.webUrl : null;
  if (link) base.url = link;
  const proof = Proof && Proof.buildProof({
    system: (Proof && Proof.SYSTEM_MICROSOFT_ONEDRIVE) || 'microsoft/onedrive',
    externalId: itemId,
    url: link || undefined,
    fetchedBack: true,
    verifiedAt: new Date().toISOString()
  });
  if (!proof) return Object.assign({ ok: false, reason: pending, ref: ref, proof: null }, base);
  return Object.assign({ ok: true, ref: ref, proof: proof }, base);
}

async function outlookFileFetchOnce(itemId) {
  const Files = globalThis.FlowOnedriveFile;
  if (!Files || !itemId) return { ok: false };
  const url = OUTLOOK_GRAPH + Files.itemPath(itemId);
  outlookAssertNotSend(url);
  let res;
  try { res = await outlookFetch(url, { method: 'GET' }); } catch (e) { return { ok: false }; }
  if (!res || !res.ok) return { ok: false };
  const body = await outlookReadJson(res);
  if (!body || body.id !== itemId) return { ok: false };
  return { ok: true, item: body };
}

async function outlookFileFetchBack(itemId) {
  let last = { ok: false };
  for (let attempt = 0; attempt < 2; attempt++) {
    last = await outlookFileFetchOnce(itemId);
    if (last.ok) return last;
  }
  return last;
}

async function outlookFileUndo(ref) {
  const Files = globalThis.FlowOnedriveFile;
  const itemId = ref && (ref.externalId || ref.fileId || ref.itemId);
  if (!Files || !itemId) return { ok: false };
  const itemUrl = OUTLOOK_GRAPH + Files.itemPath(itemId);
  outlookAssertNotSend(itemUrl);
  const edited = await outlookRefuseIfEdited(itemUrl, ref && ref.editSnap);
  if (edited) return edited;
  if (ref.created === false && ref.previousVersionId) {
    const url = OUTLOOK_GRAPH + Files.restorePath(itemId, ref.previousVersionId);
    outlookAssertNotSend(url);
    const res = await outlookFetch(url, { method: 'POST' });
    if (res && res.notConnected) return { ok: false, reason: 'not-connected' };
    if (res && (res.ok || res.status === 204)) return { ok: true, written: 'Previous OneDrive file restored.' };
    return { ok: false, reason: 'http-' + ((res && res.status) || 0) };
  }
  if (ref.created !== true) return { ok: false, reason: 'unclear' };
  const url = OUTLOOK_GRAPH + Files.itemPath(itemId);
  outlookAssertNotSend(url);
  const del = await outlookFetch(url, { method: 'DELETE' });
  if (del && del.notConnected) return { ok: false, reason: 'not-connected' };
  if (del && (del.ok || del.status === 204 || del.status === 404)) return { ok: true, written: 'OneDrive file removed.' };
  return { ok: false, reason: 'http-' + ((del && del.status) || 0) };
}

// The attachmentSave step's writer. The page does not call it in 0.9.38.
// Bytes have to be on the file. A multi-file step does not fetch "the one file".
async function outlookAttachmentBytes(messageId, attachmentId) {
  const Files = globalThis.FlowOnedriveFile;
  if (!Files || !messageId || !attachmentId) return null;
  const itemUrl = OUTLOOK_GRAPH + Files.attachmentItemPath(messageId, attachmentId);
  outlookAssertNotSend(itemUrl);
  const res = await outlookFetch(itemUrl, { method: 'GET' });
  if (!res || !res.ok) return null;
  const body = await outlookReadJson(res);
  if (!body || !body.contentBytes) return null;
  return { base64: body.contentBytes, name: body.name || '', contentType: body.contentType || 'application/octet-stream' };
}

async function attachmentSaveWrite(p) {
  const Save = globalThis.FlowSuggestSave;
  if (!Save || typeof Save.saveAttachments !== 'function') return { ok: false, reason: 'not-configured' };
  const params = (p && p.params) || {};
  const files = params.files || [];
  const target = params.target === 'drive' ? 'drive' : 'onedrive';
  const messageId = (p && (p.messageId || p.outlookIncomingId)) || params.messageId || null;
  // AQQK/AQQk is a conversation id. Attachment bytes are on the Graph message.
  function graphBytesId(id) {
    const s = String(id || '');
    if (!s || /^A[AQ]Qk/i.test(s)) return '';
    return s;
  }
  const bytesId = graphBytesId(p && p.graphMessageId) || graphBytesId(params.graphMessageId) || graphBytesId(messageId);
  const out = await Save.saveAttachments(files, target, {
    writeOne: async (file) => {
      let b64 = file && (file.base64 || file.contentBytes);
      let name = file && file.name;
      let contentType = file && file.contentType;
      if (!b64 && target === 'onedrive' && bytesId && file && file.id) {
        const got = await outlookAttachmentBytes(bytesId, file.id);
        if (got) {
          b64 = got.base64;
          name = name || got.name;
          contentType = contentType || got.contentType;
        }
      }
      if (!b64) return { ok: false, reason: 'no-bytes' };
      if (target !== 'onedrive') return { ok: false, reason: 'no-bytes' };
      const written = await outlookFileWrite({
        fileName: name,
        attachment: { filename: name, mimeType: contentType, base64: b64 }
      });
      const proof = written && written.proof && written.proof.fetchedBack === true ? written.proof : null;
      const ref = written && written.ref ? Object.assign({ created: written.ref.created !== false }, written.ref) : null;
      return { ok: !!proof, proof: proof, ref: ref, reason: (written && written.reason) || (proof ? null : 'verify_failed') };
    }
  });
  const oneName = files.length === 1 && files[0] && files[0].name;
  const writtenLine = (out && out.handled && oneName)
    ? ('Saved ' + oneName + ' to OneDrive')
    : (out && (out.line || (out.handled ? 'Saved.' : null)));
  const proof = out && out.handled && out.proofs && out.proofs[0] ? out.proofs[0] : null;
  return Object.assign({
    ok: !!(out && out.handled),
    written: writtenLine,
    proof: proof,
    ref: out ? { undo: out.undo || [], created: true } : null
  }, out);
}

async function attachmentSaveUndo(ref) {
  const Save = globalThis.FlowSuggestSave;
  const list = Array.isArray(ref) ? ref : (ref && Array.isArray(ref.undo) ? ref.undo : (ref ? [ref] : []));
  if (!Save || typeof Save.undoSaved !== 'function') return { ok: false };
  const out = await Save.undoSaved(list, {
    undoOne: (one) => outlookFileUndo(one)
  });
  const wanted = list.filter((r) => r && r.created !== false).length;
  return { ok: out.deleted === wanted && wanted > 0, written: 'Undone.', deleted: out.deleted };
}

const WRITERS = {
  hubspot: hubspotWrite, notion: CONNECTORS.notionReadBack ? notionReadBackWrite : notionWrite, salesforce: salesforceWrite, slack: slackWrite, monday: mondayWrite,
  googleTasks: googleTasksWrite, googleTask: googleTasksWrite,
  calendar: googleCalendarWrite, gmailDraft: gmailDraftWrite,
  driveDoc: googleDriveCreateDoc, driveSheet: googleDriveCreateSheet, driveFile: googleDriveCopyFile,
  outlookDraft: outlookDraftWrite, outlookCalendar: outlookCalendarWrite,
  outlookTask: outlookTaskWrite, microsoftTodo: outlookTaskWrite, outlookTaskClose: outlookTaskCloseWrite,
  onedriveFile: outlookFileWrite, onedriveNewFile: onedriveNewFileWrite, sharepointNewFile: sharepointNewFileWrite, sharepointSaveFile: sharepointSaveWrite, outlookEventCallLink: eventLinkWrite,
  attachmentSave: attachmentSaveWrite
};
if (CONNECTORS.asanaReadBack) WRITERS.asana = asanaReadBackWrite;
if (CONNECTORS.jiraReadBack) WRITERS.jira = jiraReadBackWrite;
if (CONNECTORS.linearReadBack) WRITERS.linear = linearReadBackWrite;
const UNDOERS = {
  hubspot: hubspotUndo, notion: CONNECTORS.notionReadBack ? notionReadBackUndo : notionUndo, salesforce: salesforceUndo, slack: slackUndo, monday: mondayUndo,
  googleTasks: googleTasksUndo, googleTask: googleTasksUndo,
  calendar: googleCalendarUndo, gmailDraft: gmailDraftUndo,
  driveDoc: googleDriveTrash, driveSheet: googleDriveTrash, driveFile: googleDriveTrash,
  outlookDraft: outlookDraftUndo, outlookCalendar: outlookCalendarUndo,
  outlookTask: outlookTaskUndo, microsoftTodo: outlookTaskUndo, outlookTaskClose: outlookTaskCloseUndo,
  onedriveFile: outlookFileUndo, onedriveNewFile: onedriveNewFileUndo, sharepointNewFile: sharepointNewFileUndo, sharepointSaveFile: sharepointNewFileUndo, outlookEventCallLink: eventLinkUndo,
  attachmentSave: attachmentSaveUndo
};
if (CONNECTORS.asanaReadBack) UNDOERS.asana = asanaReadBackUndo;
if (CONNECTORS.jiraReadBack) UNDOERS.jira = jiraReadBackUndo;
if (CONNECTORS.linearReadBack) UNDOERS.linear = linearReadBackUndo;

async function connectorStatus() {
  const hs = await getHubspotAuth();
  const nt = await getNotionAuth();
  const sf = await getSalesforceAuth();
  const sl = await getSlackAuth();
  const md = await getMondayAuth();
  const gt = await getGoogleTasksAuth();
  const reconnectBag = await chrome.storage.local.get([GOOGLE_RECONNECT_STORAGE_KEY, GOOGLE_EVER_CONNECTED_STORAGE_KEY, GOOGLE_WEB_AUTH_STORAGE_KEY, GOOGLE_GRANTED_SCOPES_KEY, 'googleLaneWarning', 'glanceLaneUndo', 'glanceHostLanguage', 'glanceUiLanguage']);
  let uiLang = reconnectBag.glanceUiLanguage || reconnectBag.glanceHostLanguage || '';
  if (!uiLang) {
    try { uiLang = chrome.i18n && chrome.i18n.getUILanguage ? chrome.i18n.getUILanguage() : ''; } catch (e) { uiLang = ''; }
  }
  const grantedRec = reconnectBag[GOOGLE_GRANTED_SCOPES_KEY] || null;
  const scopesGranted = Boolean(grantedRec && grantedRec.status === 'granted' && grantedRec.version === scopeVersion(googleManifestScopes()));
  const googleTasks = googleConnectionState(gt, reconnectBag[GOOGLE_RECONNECT_STORAGE_KEY] || null, {
    configured: googleTasksConfigured(),
    detail: GLANCE_TASK_LIST_TITLE + ' list',
    warning: reconnectBag.googleLaneWarning || null,
    lang: uiLang,
    everConnected: reconnectBag[GOOGLE_EVER_CONNECTED_STORAGE_KEY] || null,
    webAuth: reconnectBag[GOOGLE_WEB_AUTH_STORAGE_KEY] || null,
    laneUndo: reconnectBag.glanceLaneUndo || null,
    scopesGranted: scopesGranted
  });
  return {
    googleTasks: googleTasks,
    hubspot: {
      connected: Boolean(hs),
      configured: Boolean(HUBSPOT_CLIENT_ID)
    },
    notion: { connected: Boolean(nt), configured: true, detail: nt ? nt.dbTitle : null },
    salesforce: {
      connected: Boolean(sf),
      configured: Boolean(SALESFORCE_CLIENT_ID)
    },
    slack: {
      connected: Boolean(sl),
      configured: Boolean(SLACK_CLIENT_ID),
      detail: sl ? '#' + sl.channelId : null
    },
    monday: {
      connected: Boolean(md),
      configured: Boolean(MONDAY_CLIENT_ID),
      detail: md ? 'Board ' + md.boardId : null
    }
  };
}

// The hybrid execution path (device model first, masked server fallback). Inert while HYBRID.enabled is false (config/hybrid.public.js).
const hybrid = globalThis.FlowHybridSW.create(chrome, { config: HYBRID, callAssist: (body) => callGlanceAssist(body) });
hybrid.install();

function reply(sendResponse, promise) {
  promise
    .then((r) => sendResponse(r))
    .catch((err) => sendResponse({ ok: false, reason: 'error', code: (err && err.code) || undefined, error: String((err && err.message) || err) }));
  return true;
}

// One grant at a time for log read-modify-write. Two open mails each run
// storage.js, and chrome.storage.local.set keeps whichever log lands last.
// The port is the hold: the page disconnects when the write finishes, and
// a closed page disconnects on its own so the next Do It is not stuck.
const glanceLogLockState = { held: null, waiters: [] };

function glanceLogLockRelease(port) {
  if (glanceLogLockState.held === port) glanceLogLockState.held = null;
  glanceLogLockState.waiters = glanceLogLockState.waiters.filter((p) => p !== port);
  glanceLogLockGrant();
}

function glanceLogLockGrant() {
  if (glanceLogLockState.held || !glanceLogLockState.waiters.length) return;
  const next = glanceLogLockState.waiters.shift();
  glanceLogLockState.held = next;
  // connect() returns before the page attaches onMessage. Deliver on the
  // next turn so that listener is in place.
  setTimeout(() => {
    if (glanceLogLockState.held !== next) return;
    try { next.postMessage({ ok: true }); }
    catch (e) { glanceLogLockRelease(next); }
  }, 0);
}

if (chrome.runtime.onConnect && typeof chrome.runtime.onConnect.addListener === 'function') {
  chrome.runtime.onConnect.addListener((port) => {
    if (!port || port.name !== 'glance-log-lock') return;
    glanceLogLockState.waiters.push(port);
    port.onDisconnect.addListener(() => glanceLogLockRelease(port));
    glanceLogLockGrant();
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;
  // Signup, later, opens the one Meta consent page. The prompt stays on that page.
  if (msg.type === 'flow:open-meta-chats') {
    const page = (typeof FlowMetaConsent !== 'undefined' && FlowMetaConsent.PAGE) || 'lane-chat/enable.html';
    try {
      if (chrome.tabs && typeof chrome.tabs.create === 'function') chrome.tabs.create({ url: chrome.runtime.getURL(page) });
    } catch (e) { /* the signup page can open the link itself */ }
    try { sendResponse({ ok: true, page: page }); } catch (e) { /* the caller closed */ }
    return true;
  }
  // The person pressed רענן. Recovery never reloads a tab on its own.
  if (msg.type === 'flow:outlook-refresh-tab') {
    const tabId = typeof msg.tabId === 'number' ? msg.tabId : (sender && sender.tab && sender.tab.id);
    if (typeof tabId === 'number' && chrome.tabs && typeof chrome.tabs.reload === 'function') {
      try { chrome.tabs.reload(tabId); } catch (e) { /* the browser tab can be refreshed by hand */ }
    }
    try { sendResponse({ ok: true }); } catch (e) { /* the popup closed */ }
    return true;
  }

  const hybridAnswer = hybrid.handle(msg, sender);
  if (hybridAnswer) return reply(sendResponse, hybridAnswer);

  if (msg.type === 'flow:connector-status') return reply(sendResponse, connectorStatus());

  if (msg.type === 'flow:build-stamp') {
    const stamp = (typeof FlowBuild !== 'undefined' && FlowBuild.STAMP) || '';
    return reply(sendResponse, Promise.resolve({ ok: true, build: stamp }));
  }

  if (msg.type === 'flow:google-reconnect') {
    if (!sender || sender.id !== (chrome.runtime && chrome.runtime.id)) return reply(sendResponse, Promise.resolve({ ok: false, reason: 'not-allowed' }));
    return reply(sendResponse, reconnectGoogleForAccount(msg.account).catch((e) => ({ ok: false, reason: 'failed', error: glanceAuthSafe(e && e.message) })));
  }

  if (msg.type === 'flow:connect') {
    if (msg.connectorId === 'googleTasks') return reply(sendResponse, connectGoogleTasks(googleConnectWantsInteractive(sender)).then(() => ({ ok: true })));
    if (msg.connectorId === 'hubspot') return reply(sendResponse, connectHubspot().then(() => ({ ok: true })));
    if (msg.connectorId === 'notion' && CONNECTORS.notionOAuth && msg.oauth === true) return reply(sendResponse, connectNotionOAuth(msg.database).then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'dropbox') return reply(sendResponse, connectDropboxOAuth().then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'docusign') return reply(sendResponse, connectDocusignOAuth().then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'linear') return reply(sendResponse, connectLinearOAuth(msg.team).then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'jira') return reply(sendResponse, connectJiraOAuth(msg.project).then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'asana') return reply(sendResponse, connectAsanaOAuth(msg.project).then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'notion') return reply(sendResponse, connectNotion(msg.token, msg.database).then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'salesforce') return reply(sendResponse, connectSalesforce().then(() => ({ ok: true })));
    if (msg.connectorId === 'slack') return reply(sendResponse, connectSlack(msg.channel).then((r) => ({ ok: true, detail: r.title })));
    if (msg.connectorId === 'monday') return reply(sendResponse, connectMonday(msg.board).then(() => ({ ok: true })));
    return reply(sendResponse, Promise.resolve({ ok: false, reason: 'connector-not-live' }));
  }

  if (msg.type === 'flow:disconnect') {
    return reply(sendResponse, disconnectConnector(msg.connectorId));
  }

  if (msg.type === 'flow:fact-sources') {
    return reply(sendResponse, factSources(msg.payload || {}));
  }

  // Dropbox: save one file the person approved into their Dropbox app folder, read it back; undo removes it unless the person edited it. Off = not live.
  if (msg.type === 'flow:dropbox-save' || msg.type === 'flow:dropbox-undo') {
    if (sender && sender.id && sender.id !== chrome.runtime.id) return reply(sendResponse, Promise.resolve({ ok: false, reason: 'foreign-sender' }));
    if (!CONNECTORS.dropboxReadBack) return reply(sendResponse, Promise.resolve({ ok: false, reason: 'connector-not-live' }));
    return reply(sendResponse, msg.type === 'flow:dropbox-save' ? dropboxSave(msg.payload) : dropboxUndo(msg.payload));
  }

  // Teams chat answer (read-only): link one chat to one loop and read it for the person's own answer; release stops watching. Off = not live.
  if (msg.type === 'flow:teams-answer-check' || msg.type === 'flow:teams-answer-release') {
    if (sender && sender.id && sender.id !== chrome.runtime.id) return reply(sendResponse, Promise.resolve({ ok: false, reason: 'foreign-sender' }));
    if (!CONNECTORS.teamsAnswerReadBack) return reply(sendResponse, Promise.resolve({ ok: false, reason: 'connector-not-live' }));
    return reply(sendResponse, msg.type === 'flow:teams-answer-check' ? teamsAnswerCheck(msg.payload) : teamsAnswerRelease(msg.payload));
  }

  // DocuSign (read-only): link one envelope to one loop and read its status; release stops watching. Off = not live.
  if (msg.type === 'flow:signature-check' || msg.type === 'flow:signature-release') {
    if (sender && sender.id && sender.id !== chrome.runtime.id) return reply(sendResponse, Promise.resolve({ ok: false, reason: 'foreign-sender' }));
    if (!CONNECTORS.docusignReadBack) return reply(sendResponse, Promise.resolve({ ok: false, reason: 'connector-not-live' }));
    return reply(sendResponse, msg.type === 'flow:signature-check' ? docusignCheck(msg.payload) : docusignRelease(msg.payload));
  }

  // The chat task card (CHAT_TASK_CARD, off): which connected task app can take the task. Google Tasks first, then
  // Microsoft To Do when the Tasks scope is granted. Nothing is written here.
  // The card's own pictures are web-accessible on Gmail and Outlook only, and the manifest is not changed for chat sites.
  // The worker reads its own four files and hands them back as data: URLs. Nothing else is readable this way.
  if (msg.type === 'flow:asset-data') {
    if (sender && sender.id && sender.id !== chrome.runtime.id) return reply(sendResponse, Promise.resolve({ ok: false, reason: 'foreign-sender' }));
    return reply(sendResponse, chatAssetData(msg.path));
  }

  if (msg.type === 'flow:chat-task-target') {
    return reply(sendResponse, chatTaskTarget(msg));
  }

  if (msg.type === 'flow:event-link-plan') {
    return reply(sendResponse, eventLinkPlan(msg));
  }

  if (msg.type === 'flow:new-file-plan') {
    return reply(sendResponse, newFilePlan(msg));
  }

  if (msg.type === 'flow:sharepoint-file-plan') {
    return reply(sendResponse, sharepointFilePlan(msg));
  }

  if (msg.type === 'flow:sharepoint-save-plan') {
    return reply(sendResponse, sharepointSavePlan(msg));
  }

  if (msg.type === 'flow:execute-action') {
    const writer = WRITERS[msg.payload && msg.payload.connectorId];
    if (!writer) return reply(sendResponse, Promise.resolve({ ok: false, reason: 'connector-not-live' }));
    return reply(sendResponse, writer(msg.payload));
  }

  if (msg.type === 'flow:undo-action') {
    const undoer = UNDOERS[msg.connectorId];
    if (!undoer) return reply(sendResponse, Promise.resolve({ ok: false }));
    return reply(sendResponse, undoer(msg.ref, msg));
  }

  if (msg.type === 'flow:draft-reply') {
    return reply(sendResponse, draftReplyViaBackend(msg.payload || {}));
  }

  if (msg.type === 'flow:summarize-attachment') {
    return reply(sendResponse, summarizeAttachmentViaBackend(msg.payload || {}));
  }

  if (msg.type === 'flow:follow-task') return reply(sendResponse, followTaskCreate(msg.payload || {}));
  if (msg.type === 'flow:follow-complete') return reply(sendResponse, followTaskComplete(msg.ref));
  if (msg.type === 'flow:follow-task-status') return reply(sendResponse, followTaskStatuses(msg.refs));
  if (msg.type === 'flow:follow-reschedule') return reply(sendResponse, followTaskSchedule(msg.ref, msg.dueIso, msg.title));
  if (msg.type === 'flow:follow-reopen') return reply(sendResponse, followTaskReopen(msg.ref, msg.dueIso));
  if (msg.type === 'flow:follow-draft') return reply(sendResponse, followDraftCreate(msg.payload || {}));

  if (msg.type === 'flow:pro-status') return reply(sendResponse, proStatus());
  // Carry until closed (config/carry.public.js): the switches the follow loop and the Loops panel read. All off in this build.
  if (msg.type === 'flow:carry') return reply(sendResponse, Promise.resolve({ ok: true, nextMove: CARRY.nextMove === true, invoices: CARRY.invoices === true }));
  if (msg.type === 'flow:pro-activate') return reply(sendResponse, activatePro(msg.key));
  if (msg.type === 'flow:pro-deactivate') return reply(sendResponse, deactivatePro());
  if (msg.type === 'flow:pro-billing') return reply(sendResponse, openBillingPortal());

  // The deeper read (docs/ai-ladder.md). Only this extension's own pages and scripts; the choice to turn it on or off is the popup's alone, never a page script's.
  if (msg.type === 'flow:ladder-info' || msg.type === 'flow:ladder-read' || msg.type === 'flow:ladder-consent') {
    if (sender && sender.id && sender.id !== chrome.runtime.id) return reply(sendResponse, Promise.resolve({ ok: false, reason: 'foreign-sender' }));
    if (msg.type === 'flow:ladder-info') return reply(sendResponse, ladderInfo(msg.force === true));
    if (msg.type === 'flow:ladder-read') return reply(sendResponse, ladderRead(msg));
    return reply(sendResponse, sender && sender.tab ? Promise.resolve({ ok: false, reason: 'popup-only' }) : ladderConsent(msg.given === true));
  }

  if (msg.type === 'flow:lm-server-prompt') return reply(sendResponse, lmServerPrompt(msg.text, msg.schema));

  if (msg.type === 'flow:classify-remote') {
    return reply(sendResponse, classifyViaBackend(msg.payload || {}));
  }

  // Outlook: the durable session and the page's read-only network (see outlookProxyFetch).
  if (msg.type === 'flow:outlook-file-trace') {
    if (!sender || sender.id !== chrome.runtime.id) return reply(sendResponse, Promise.resolve({ ok: false, error: 'foreign-sender' }));
    try { console.info('Glance: file-trace', JSON.stringify(msg.payload || {})); } catch (e) { /* console gone */ }
    return reply(sendResponse, Promise.resolve({ ok: true }));
  }
  if (msg.type === 'flow:outlook-fetch') return reply(sendResponse, outlookProxyFetch(msg, sender));
  if (msg.type === 'flow:outlook-session') return reply(sendResponse, outlookSessionForPage(msg, sender));
  if (msg.type === 'flow:outlook-consent-scope') return reply(sendResponse, outlookConsentScope(msg));
  if (msg.type === 'flow:reconcile-proof') return reply(sendResponse, outlookReconcileProof(msg));
  if (msg.type === 'flow:outlook-keepalive') {
    if (!sender || sender.id !== chrome.runtime.id) return reply(sendResponse, Promise.resolve({ ok: false, error: 'foreign-sender' }));
    return reply(sendResponse, (async () => { scheduleOutlookKeepAlive(); const r = await outlookKeepAlive(); return { ok: Boolean(r && r.ok), error: (r && r.error) || null, how: (r && r.how) || null, needsSignIn: Boolean(r && r.needsSignIn) }; })());
  }

  if (msg.type === 'flow:surface-status') return reply(sendResponse, surfaceStatus());
  if (msg.type === 'flow:surface-enable') return reply(sendResponse, enableSurface(msg.id));
  if (msg.type === 'flow:surface-disable') return reply(sendResponse, disableSurface(msg.id));
  if (msg.type === 'flow:surface-health') return reply(sendResponse, noteSurfaceHealth(msg.id, msg.ok, msg.reason));

  // Outside signals (core/outside-signals.js): did a calendar event or a shared file settle a loop? These two read
  // metadata only (ids, times, invitee and sharee addresses), never titles or file contents, and the caller sends
  // the one address it is asking about.
  if (msg.type === 'flow:outside-calendar') {
    return reply(sendResponse, (async () => {
      if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
      const email = String(msg.email || '').slice(0, 200);
      const since = Number(msg.sinceMs);
      if (!email || !(since > 0)) return { ok: false, reason: 'bad-request' };
      const q = new URLSearchParams({ q: email, timeMin: new Date(since - 24 * 3600 * 1000).toISOString(), singleEvents: 'true', maxResults: '25', orderBy: 'startTime',
        fields: 'items(id,status,created,start,organizer(email),attendees(email,responseStatus))' });
      const res = await googleAuthedFetch(GOOGLE_CALENDAR_API, '/calendars/primary/events?' + q.toString(), { method: 'GET' });
      if (!res.ok) return { ok: false, reason: 'error' };
      const data = await res.json();
      const events = (data.items || []).map((e) => ({ id: e.id, status: e.status || 'confirmed', startIso: (e.start && (e.start.dateTime || e.start.date)) || null,
        createdMs: e.created ? Date.parse(e.created) : null, organizer: (e.organizer && e.organizer.email) || null,
        attendees: (e.attendees || []).filter((a) => a && a.email).map((a) => ({ email: a.email, response: a.responseStatus || 'needsAction' })) }));
      return { ok: true, events };
    })());
  }

  if (msg.type === 'flow:outside-drive') {
    return reply(sendResponse, (async () => {
      if (!(await googleConnected())) return { ok: false, reason: 'not-connected' };
      const since = Number(msg.sinceMs);
      const terms = (Array.isArray(msg.terms) ? msg.terms : []).map((t) => String(t).replace(/['\\]/g, '')).filter((t) => t.length >= 2).slice(0, 8);
      if (!(since > 0) || !terms.length) return { ok: false, reason: 'bad-request' };
      const q = "trashed = false and modifiedTime > '" + new Date(since).toISOString() + "' and (" + terms.map((t) => "name contains '" + t + "'").join(' or ') + ')';
      const path = '/files?q=' + encodeURIComponent(q) + '&pageSize=25&corpora=user&fields=' + encodeURIComponent('files(id,name,modifiedTime,permissions(emailAddress))');
      const res = await googleAuthedFetch(GOOGLE_DRIVE_API, path);
      if (!res.ok) return { ok: false, reason: 'error' };
      const data = await res.json();
      const files = (data.files || []).map((f) => ({ id: f.id, name: f.name, modifiedMs: f.modifiedTime ? Date.parse(f.modifiedTime) : null,
        sharedWith: (f.permissions || []).map((x) => x.emailAddress).filter(Boolean) }));
      return { ok: true, files };
    })());
  }

  if (msg.type === 'flow:search-drive') return reply(sendResponse, searchDriveMessage(msg));

  if (msg.type === 'flow:drive-find-one') {
    return reply(sendResponse, driveFindOneByName(msg.term));
  }

  if (msg.type === 'flow:open-drive-picker') {
    return reply(sendResponse, openDrivePicker(msg.payload || {}, sender));
  }

  if (msg.type === 'flow:drive-file-picked') {
    return reply(sendResponse, Promise.resolve(deliverDrivePickerResult(msg.payload || {})));
  }

  // Fire-and-forget, same as flow:track below — the caller already computed
  // the Still Open count (0–3). This file never re-derives it, and it never
  // talks back, so a slow or missing response can never affect what the
  // sender does next.
  if (msg.type === 'flow:pending-count') {
    updateBadge(Number(msg.count) || 0);
    return;
  }

  // Fire-and-forget: telemetry is never allowed to affect what the caller
  // does next, so this always resolves { ok: true } even if the relay call
  // itself fails. See track-event.js for what does and does not leave the
  // device — never email content, sender identity, or extracted facts.
  if (msg.type === 'flow:track') {
    return reply(sendResponse, trackEvent(msg.event, msg.params).then(() => ({ ok: true })).catch(() => ({ ok: true })));
  }

  // Makes this file's own getInstallId() the single canonical generator —
  // the service worker is the one long-lived instance this extension has,
  // so it's the natural place for "generate once, reuse forever" to
  // actually live. storage.js's own getInstallId() (used by the popup's
  // referral link) asks for this first and only falls back to generating
  // its own if the message fails; see that function's own comment for why
  // two independent generators writing the same chrome.storage.local key
  // was worth closing even though the practical race window was narrow.
  if (msg.type === 'flow:get-install-id') {
    return reply(sendResponse, getInstallId().then((id) => ({ ok: true, id })));
  }
});

// Mirrors storage.js's getInstallId rather than importing it — background.js
// has never loaded storage.js (it talks to chrome.storage.local directly
// throughout this file, same as every other auth blob above), and this way
// the service worker gains no new cross-file dependency for one field.
// Caches the in-flight PROMISE, not just the resolved id — the read-then-
// write below has the same gap storage.js's own getInstallId used to have
// before it became canonical: two concurrent callers (a 'chip_shown'
// trackEvent firing at the same moment a content script's own first-ever
// getInstallId message arrives) can each read `undefined` before either
// write lands, and whichever set() runs second silently overwrites the
// first's id. Caching the promise means every concurrent caller during
// generation awaits the exact same in-progress call instead of racing a
// second one; once resolved, later calls just get the resolved id back
// with no further storage read. Reset only by a service-worker restart,
// which is correct — the NEXT call reads whatever chrome.storage.local
// already has, exactly like before this existed.
let installIdPromise = null;
async function getInstallId() {
  if (!installIdPromise) {
    installIdPromise = (async () => {
      const { installId } = await chrome.storage.local.get('installId');
      if (installId) return installId;
      const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, '').slice(0, 12);
      await chrome.storage.local.set({ installId: id });
      return id;
    })();
  }
  return installIdPromise;
}

async function trackEvent(name, params) {
  try {
    const installId = await getInstallId();
    await fetch('https://theflow-ai.com/.netlify/functions/track-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installId, event: name, params: params || {} })
    });
  } catch (e) {
    // non-fatal — see comment above
  }
}
