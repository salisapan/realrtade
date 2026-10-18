# ClickUp: capability matrix

**Glance closes open loops. Gmail is where it starts today.** The full connector doc (contract, auth, tests, security checks, vendor facts, owner pack) is [`../connectors/clickup.md`](../connectors/clickup.md). This page is the capability matrix the integration queue asks for (`QUEUE.md`, row ClickUp). Status: built against a mock, switches off, not live.

| Capability | Endpoint | Minimum scope | Undo | Read-back (ProofOfClose) | Built |
|---|---|---|---|---|---|
| Create a task in a List | `POST /v2/list/{list_id}/task` | none (ClickUp OAuth has no scopes; access is the Workspaces the person authorised) | `DELETE /v2/task/{task_id}` then `GET` → 404 | `GET /v2/task/{task_id}` | **yes** |
| Read a task back | `GET /v2/task/{task_id}` | none | - | itself | **yes** |
| Delete a task (Undo only) | `DELETE /v2/task/{task_id}` (204) | none | - | `GET` → 404 | **yes** |
| Read a List's name at connect | `GET /v2/list/{list_id}` | none | - | - | **yes** (connect only) |
| Adopt a task after an unknown outcome | `GET /v2/list/{list_id}/task?order_by=created&reverse=true&date_created_gt=…&page=n` | none | - | - | **yes** |
| Mark a task done when the loop closes elsewhere | `PUT /v2/task/{task_id}` (`status`) | none | `PUT` the previous status | `GET` | no (a "true close" from ClickUp completion is a later slice) |
| Comment on a task | `POST /v2/task/{task_id}/comment` (`notify_all` can notify people: draft + approve only) | none | `DELETE /v2/comment/{comment_id}` | `GET /v2/task/{task_id}/comment` | no |
| Set or clear a due date | `PUT /v2/task/{task_id}` (`due_date`, `due_date_time`) | none | `PUT` the old value | `GET` | no (a clean date is written at create) |
| Assign someone | `PUT /v2/task/{task_id}` (`assignees`; notifies a person: draft + approve only) | none | `PUT` the old assignees back | `GET` | no |
| Attach a file | `POST /v2/task/{task_id}/attachment` (multipart) | none | v3 attachments delete | `GET /v2/task/{task_id}` attachments | no |
| Add a tag | `POST /v2/task/{task_id}/tag/{tag_name}` | none | `DELETE` same path | `GET` | no |
| Subtask | `POST /v2/list/{list_id}/task` with `parent` | none | `DELETE` task | `GET` | no |
| Checklist item | `POST /v2/task/{task_id}/checklist` (+ items) | none | `DELETE /v2/checklist/{id}` | `GET` | no |
| Link or depend on another task | `POST /v2/task/{task_id}/link/{links_to}` | none | `DELETE` same path | `GET` | no |
| Watch for completion in ClickUp (true close from outside) | `POST /v2/team/{team_id}/webhook` | none; needs a public server endpoint | `DELETE /v2/webhook/{id}` | the event plus `GET /v2/task/{task_id}` | no (needs a server; later slice) |
| Pick a List from a tree | `GET /v2/team`, `/team/{id}/space`, `/space/{id}/folder`, `/folder/{id}/list`, `/space/{id}/list` | none | - | - | no (the person pastes a List link) |
| Search across the Workspace | `GET /v2/team/{team_id}/task` | none | - | - | **no, and asserted unused** |
| Who am I | `GET /v2/user`, `GET /v2/team` | none | - | - | **no, and asserted unused** |
| Time tracking, goals, docs, chat, custom fields | various | none | - | - | no (no loop needs them) |

Endpoints and methods above were read from the vendor's OpenAPI reference on 2026-10-18 (`developer.clickup.com/reference/*`). Every row marked "no" is a path I read but did not exercise.
