| switch | what it does | read in | corpus tests | headless e2e | live Gate recorded | held-out coverage |
|---|---|---|---|---|---|---|
| TASK_ASK | תזכורת, מועד אחרון או בקשה לחזור | 3 files | 3 | 3 | no | task |
| PAYMENT_ASK | בקשת תשלום | 4 files | 5 | 2 | no | pay |
| DECOMPOSE | מייל עם כמה בקשות | 5 files | 1 | 0 | no | none (no real multi-intent set) |
| CALENDAR_CHANGE | העברה או ביטול של פגישה | 2 files | 2 | 0 | no | move/cancel (probe, corpus) |
| BOOKING_NOTICE | תור, הזמנה, איסוף או נסיעה | 3 files | 1 | 4 | no | booking |
| SYSTEM_NOTICE | התראת מערכת עם מועד | 3 files | 1 | 1 | no | notice |
| CHAT_TASK_CARD | צ'אט: כרטיס עשה | 2 files | 1 | 10 | no | chat probe (38 lines) |
| CHAT_PROMISE_CARD | צ'אט: הבטחה אליך | 6 files | 1 | 9 | no | no held-out set |
| META_CHAT_LANES | צ'אטים של Meta (מסנג'ר, אינסטגרם, וואטסאפ) | 1 files | 1 | 1 | no | no held-out set |
| MEET_LINK | קישור לשיחת וידאו של Google | 3 files | 4 | 1 | no | video |
| EVENT_CALL_LINK | קישור לשיחת וידאו באירוע קיים | 3 files | 3 | 1 | no | no held-out set |
| TEAMS_MEETING | קישור Teams לשיחה | 5 files | 3 | 2 | no | video |
| OUTLOOK_EVENT_CALL_LINK | קישור Teams לאירוע קיים | 3 files | 1 | 1 | no | no held-out set |
| RECURRING_HOLD | פגישה חוזרת | 5 files | 2 | 5 | no | recurring |
| RECURRING_REMINDER | תזכורת חוזרת | 2 files | 2 | 1 | no | no held-out set |
| RECURRING_TODO | משימה חוזרת | 2 files | 1 | 1 | no | no held-out set |
| WORKSPACE_FILE | מסמך, גיליון או מצגת של Google | 3 files | 3 | 4 | no | doc/sheet/slides |
| GOOGLE_FORMS | טופס של Google (אחרי מסמך ב-Drive) | 1 files | 1 | 1 | no | no held-out set |
| ONEDRIVE_NEW_FILE | מסמך או גיליון של Microsoft | 3 files | 1 | 1 | no | word/excel |
| SHAREPOINT_NEW_FILE | מסמך או גיליון באתר SharePoint | 4 files | 1 | 1 | no | no held-out set |
| SHAREPOINT_SAVE_FILE | קובץ מצורף באתר SharePoint | 3 files | 1 | 1 | no | no held-out set |
| CHAT_CHASE_DRAFT | תזכורת בצ'אט למי שמאחר | 2 files | 1 | 3 | no | no held-out set |
| PLANNER_TASK | משימה בתוכנית עבודה של Microsoft | 2 files | 2 | 1 | no | no held-out set |
| CONNECT_ECOSYSTEM | חיבור לפי מערכת | 1 files | 2 | 0 | no | no held-out set |
| FULL_DOCUMENT_CLOSE | מסמך מלא בסגנון שלך | 3 files | 2 | 2 | no | no held-out set |
| USER_CONTEXT_WRITER | עדכון פרופיל מקומי | 2 files | 2 | 0 | no | no held-out set |
