"""Glance engine-input stripper (Python twin of glance-strip.js; byte-identical output, tested on every dataset body).

JS semantics reproduced: String.prototype.trim whitespace set, ASCII-only case folding, '.' excluding \\n \\r \\u2028 \\u2029,
Unicode \\s, '$' = end of input.
"""
import re

_JS_WS = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'
_WSC = '[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]'
_DOT = '[^\\n\\r\\u2028\\u2029]'
_F = re.ASCII | re.IGNORECASE

DISCLAIMER = re.compile(r'^(?:confidentiality notice|this (?:e-?mail|message) (?:and any attachments )?(?:is|are|may contain) (?:confidential|privileged)|the information (?:contained )?in this (?:e-?mail|message)|הודעה זו (?:והמצורפים לה )?(?:מיועדת|מיועדים|עשויה)|המידע (?:הכלול )?בהודעה זו|מסמך זה (?:מכיל|עשוי))', _F)
MOBILE = re.compile(r'^(?:sent from my (?:iphone|ipad|android|samsung|mobile)|get outlook for (?:ios|android)|נשלח מה-?(?:iphone|אייפון|אנדרואיד|נייד)(?: שלי)?|נשלח מהנייד)' + _WSC + r'*\Z', _F)
QUOTE_HEAD = re.compile(r'^-{2,}' + _WSC + r'*(?:original message|forwarded message)|^on ' + _DOT + r'{0,120} wrote:\Z|^from: ' + _DOT + r'+\Z', _F)
PLACEHOLDER = re.compile(r'^\[(?:image|cid|logo)[^\]]*\]\Z', _F)
_SIG = re.compile(r'^_{5,}\Z')


def _js_str(t):
    return '' if t is None else str(t)


def normalize_text(t):
    s = _js_str(t)
    s = re.sub(r'\r\n?', '\n', s)
    s = re.sub('[\u00a0\u2007\u202f\u2009]', ' ', s)
    s = re.sub('[\u200b-\u200d\u2060\ufeff]', '', s)
    return re.sub('[\u200e\u200f\u202a-\u202e\u2066-\u2069]', '', s)


def clean_text(t):
    s = normalize_text(t or '')
    lines = [re.sub('[ \t]+', ' ', l).strip(_JS_WS) for l in s.split('\n')]
    return re.sub('\n{3,}', '\n\n', '\n'.join(lines)).strip(_JS_WS)


def strip_for_engine(t):
    out = []
    for l in clean_text(t).split('\n'):
        if l in ('--', '-- ', '__') or _SIG.search(l):
            break
        if DISCLAIMER.search(l):
            break
        if QUOTE_HEAD.search(l):
            out.append(l)
            continue
        if PLACEHOLDER.search(l) or MOBILE.search(l):
            continue
        out.append(l)
    return re.sub('\n{3,}', '\n\n', '\n'.join(out)).strip(_JS_WS)
