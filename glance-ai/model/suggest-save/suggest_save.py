"""Glance suggested save of attachments: deterministic eligibility rule (Python twin of suggest-save.js; reference for 0.9.38).

Pure function, no I/O. Spec: specs/suggest-save.md sections 1-7. Same reason codes, same check order, same output dict as the JS file
(JS regex semantics reproduced: ASCII \\b and case folding, Unicode \\s, end-of-input $).
"""
import math
import re

_WS = '\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff'
_F = re.ASCII | re.IGNORECASE


def _js_ws(p):
    """Replace \\s with the JS (Unicode) whitespace set, inside or outside a character class."""
    out, i, cls = [], 0, False
    while i < len(p):
        ch = p[i]
        if ch == '\\' and i + 1 < len(p):
            if p[i + 1] == 's':
                out.append(_WS if cls else '[' + _WS + ']')
            else:
                out.append(p[i:i + 2])
            i += 2
            continue
        if ch == '[' and not cls:
            cls = True
        elif ch == ']' and cls:
            cls = False
        out.append(ch)
        i += 1
    return ''.join(out)


def _rx(p, flags=_F):
    return re.compile(_js_ws(p), flags)


SAVE_NO = _rx(r"\b(?:(?:do not|don't|dont|no need to)\s+(?:save|file|store|upload)|never mind)\b|(?:אל\s+ת|לא\s+צריך\s+ל|אין\s+צורך\s+ל|לא\s+ל)(?:שמור|שמרי|לשמור|תתייק)")
NEG_SAVE = _rx(r"\b(?:do\s+not|don['’]?t|no\s+need\s+to|never|you\s+don['’]?t\s+need\s+to|hold\s+off\s+on)\s+(?:\w+\s+){0,2}(?:sav(?:e|ing)|upload(?:ing)?|stor(?:e|ing)|fil(?:e|ing))\b|(?:^|[\s,.(])(?:אל|לא\s+צריך|אין\s+צורך|בבקשה\s+לא|בבקשה\s+אל|לא)\s+(?:ל|ת)?(?:שמור|תשמור|תשמרי|תשמרו|לשמור|תעלה|תעלי|תעלו|להעלות|לאחסן)")
ONEDRIVE = _rx(r"one\s?-?drive|וואן\s?-?דרייב")
SAVE_VERB = _rx(r"\b(?:save|upload|store|file|put)\b|(?:^|[\s,.(])(?:ו?(?:ל|ת|נ)?(?:שמור|שמרי|שמרו|תשמור|תשמרי|תשמרו|לשמור|תעלה|תעלי|תעלו|להעלות|העלה|העלי|תאחסן|לאחסן))(?=\Z|[\s,.?!])")
MARKETING = _rx(r"\b(?:unsubscribe|register\s+now|webinar|flash\s+sale|\d+%\s+off|shop\s+now|manage\s+(?:your\s+)?(?:email\s+)?preferences|exclusive\s+offer|newsletter)\b|וובינר|הירשמו|ההרשמה\s+פתוחה|להסרה|ניוזלטר|רשימת\s+התפוצה|מבצע|סייל|\d+%\s+הנחה|הנחה!|שדרגו\s+עכשיו|הטבה\s+בלעדית|מקומות\s+אחרונים")
GDRIVE = _rx(r"\bgoogle\s*drive\b|\bg-?drive\b|גוגל\s*דרייב")
# Bare Drive / דרייב. Fixed-width lookbehinds (Python rejects variable-length). Not the "drive" inside OneDrive / וואן דרייב.
BARE_DRIVE = _rx(r"(?<!one )(?<!one-)\bdrive\b|(?<!וואן )(?<!וואן-)(?<!וואן)דרייב")
OTHER_TARGET = _rx(r"\bshared\s+(?:folder|drive|files?)\b|\bsharepoint\b|\bdropbox\b|\bbox\.com\b|\bteams\s+(?:folder|channel)\b|(?:ה)?תיקי(?:י)?ה\s+המשותפת|הקבצים\s+המשותפים|שרפוינט|דרופבוקס")
OTHER_CHAIN = {'file', 'file-chain-not-run', 'google-wait(drive-lookup)', 'calendar-wait(file-lookup)'}
_PREC = _rx(r"^(?:bulk|list|junk)\Z")
_EXT = re.compile(r"\.([A-Za-z0-9]{1,8})\Z")
_SIGIMG = _rx(r"^image\d{3}\.|^outlook-")
_JS_WS = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'

DOC_EXT = {'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'rtf', 'odt', 'ods', 'odp', 'key', 'pages', 'numbers'}
IMG_EXT = {'jpg', 'jpeg', 'png', 'heic'}
DOC_MIN, IMG_MIN = 2 * 1024, 100 * 1024
REASONS = ['suggest:show', 'suggest:other-card', 'suggest:already-saved', 'suggest:dismissed', 'suggest:bulk', 'suggest:no-consent', 'suggest:attachments-unread',
           'suggest:negated', 'suggest:too-large', 'suggest:not-inbound', 'suggest:no-files', 'suggest:onedrive-target-on-gmail', 'suggest:drive-target-on-outlook', 'suggest:other-target']


def _s(v):
    """JS String(v) for the value kinds that occur here."""
    if v is None:
        return 'null'
    if v is True:
        return 'true'
    if v is False:
        return 'false'
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _ext(name):
    m = _EXT.search(str(name or ''))
    return m.group(1).lower() if m else ''


def _strip_angle(c):
    return re.sub(r'^<|>\Z', '', str(c)).lower()


def exclude_why(a, cids):
    kind = a.get('kind') or 'file'
    if kind == 'item':
        return 'item'
    if kind == 'reference':
        return 'reference'
    name = str(a.get('name') or '')
    ext = _ext(name)
    ct = str(a.get('contentType') or '').lower()
    is_img = ext in IMG_EXT or ct.startswith('image/')
    if a.get('isInline') is True:
        return 'inline'
    cid = _strip_angle(a['contentId']) if a.get('contentId') else ''
    if cid and (is_img or cid in cids):
        return 'cid'
    if ext in ('ics', 'vcs') or 'text/calendar' in ct:
        return 'calendar'
    if ext == 'vcf' or re.search(r'text/(?:x-)?vcard', ct):
        return 'contact'
    if re.match(r'^winmail\.dat\Z', name, re.I | re.A) or 'ms-tnef' in ct:
        return 'tnef'
    if ext in ('p7s', 'p7m') or re.search('smime', name, re.I | re.A) or 'pkcs7' in ct:
        return 'smime'
    size = a.get('size')
    if not _num(size) or size < 0:
        return 'size-unknown'
    if ext in DOC_EXT:
        return None if size >= DOC_MIN else 'small-doc'
    if ext in IMG_EXT:
        if _SIGIMG.search(name):
            return 'signature-image'
        return None if size >= IMG_MIN else 'small-image'
    return 'type'


def _chip(files, surface):
    tgt = 'OneDrive' if surface == 'outlook' else 'Drive'
    n = len(files)
    return {'count': n, 'target': tgt, 'names': [f['name'] for f in files],
            'en': ('Save %s to %s?' % (files[0]['name'], tgt)) if n == 1 else ('Save %d files to %s?' % (n, tgt)),
            'he': ('לשמור את %s ב-%s?' % (files[0]['name'], tgt)) if n == 1 else ('לשמור %d קבצים ב-%s?' % (n, tgt))}


def _quiet(reason, **extra):
    d = {'suggest': False, 'reason': reason}
    d.update(extra)
    return d


def decide(inp):
    surface = 'outlook' if inp.get('surface') == 'outlook' else 'gmail'
    target = 'onedrive' if surface == 'outlook' else 'drive'
    text = str(inp.get('text') or '')
    subject = str(inp.get('subject') or '')
    J = inp.get('judgment') or {}
    if (inp.get('direction') or 'inbound') != 'inbound' or inp.get('senderIsUser') is True or inp.get('isDraft') is True or inp.get('inSent') is True:
        return _quiet('suggest:not-inbound')
    if inp.get('consent') is not True:
        return _quiet('suggest:no-consent')
    if inp.get('attachmentsRead') is not True or not isinstance(inp.get('attachments'), list):
        return _quiet('suggest:attachments-unread')
    H = inp.get('headers') or {}
    lu = H.get('listUnsubscribe')
    if (lu and len(_s(lu))) or _PREC.search(_s(H.get('precedence') or '').strip(_JS_WS)) \
            or J.get('reason') == 'quiet:noise' or J.get('marketing') is True or MARKETING.search(text) or MARKETING.search(subject):
        return _quiet('suggest:bulk')
    if SAVE_NO.search(text) or NEG_SAVE.search(text):
        return _quiet('suggest:negated')
    if surface == 'gmail' and ONEDRIVE.search(text) and SAVE_VERB.search(text):
        return _quiet('suggest:onedrive-target-on-gmail')
    # Host chooses the target (spec §1 and §3). Outlook + a save verb + Drive / דרייב stays quiet.
    if surface == 'outlook' and SAVE_VERB.search(text) and (GDRIVE.search(text) or (BARE_DRIVE.search(text) and not OTHER_TARGET.search(text))):
        return _quiet('suggest:drive-target-on-outlook')
    if OTHER_TARGET.search(text) and SAVE_VERB.search(text):
        return _quiet('suggest:other-target')
    cids = {_strip_angle(c) for c in (inp.get('bodyCids') or [])}
    files, excluded, big = [], [], []
    limit = inp.get('uploadLimitBytes')
    for a in inp['attachments']:
        why = exclude_why(a, cids)
        if why:
            excluded.append({'id': a.get('id'), 'why': why})
            continue
        if _num(limit) and a['size'] > limit:
            big.append(a)
            excluded.append({'id': a.get('id'), 'why': 'too-large'})
            continue
        files.append({'id': a.get('id'), 'name': a.get('name'), 'size': a.get('size')})
    if not files and not big:
        return _quiet('suggest:no-files', excluded=excluded)
    if not files:
        return _quiet('suggest:too-large', excluded=excluded)
    ex = J.get('explicit')
    mode = 'suggest'
    if not ex and _s(J.get('reason')) in OTHER_CHAIN:
        return _quiet('suggest:other-card', excluded=excluded)
    if ex:
        if ex.get('step') == 'file_save' and len(files) >= 2:
            mode = 'explicit-multi'
        else:
            return _quiet('suggest:other-card', excluded=excluded)
    saved = set(inp.get('savedFileIds') or [])
    open_ = [f for f in files if f['id'] not in saved]
    if not open_:
        return _quiet('suggest:already-saved', excluded=excluded)
    mid = str(inp.get('messageId') or '')
    key = mid + '|' + ','.join(sorted(_s(f['id']) for f in open_))
    dis = inp.get('dismissed') or []
    if mid in dis or key in dis:
        return _quiet('suggest:dismissed', excluded=excluded, key=key)
    return {'suggest': True, 'reason': 'suggest:show', 'target': target, 'mode': mode, 'files': open_, 'excluded': excluded, 'key': key, 'chip': _chip(open_, surface)}
