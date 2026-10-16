# The scrub: what code replaces, what judgement replaces, the tools, the sweep

The helper scrubs every screen at prepare, and every frame is rendered from that prepared ("clean") copy. Code
replaces two kinds of thing on its own. **Everything else arrives as recorded, and what else is genericised is
decided here, per tutorial**: this file is the list of tools for it, and how to decide.

## What code replaces on its own (nothing to do)

Secrets and account numbers, and money. Nothing else.

| On the screen | Becomes | Example |
|---|---|---|
| Every field's value (input, textarea, select): the recorder masks them as it records | The field's own label in compact form plus a fixed number | a "User API Key" field shows `UserAPIKey-123456` |
| A table cell under a heading that says key, token, secret, password, account, routing, card, TIN, SSN, EIN or tax id | The column heading plus a running number | `TIN 1`, `TIN 2` |
| An element the page itself calls a secret or an account number, whatever its value looks like: its id says so (`apiKeyValue`, `client_secret`, `accountNumber`), a label for it says so, or it is the value beside a "Password" term | A label with a number | `Key 1`, `Account number 1` |
| A key or token anywhere: a JWT, or 20 characters or more of letters, digits and `+ / = _ -` that do not read as words (hex, base64, a UUID, random letters) | | `Key 1` |
| A card number: 13 to 19 digits, grouped or not, that pass the card check (Luhn); never the digits after a decimal point (`0.4111111111111111` is a measure) | | `Card number 1` |
| A tax id as written: `123-45-6789`, `12-3456789` | | `Tax ID 1` |
| An account, routing or bare tax number, or a numeric token: a run of 8 digits or more, of any length | | `Account number 1` |
| Money amounts that are not zero, anywhere; and a bare figure in a column headed balance, amount, fee, price, charge or cost | Round figures in order of appearance, the currency format kept | `$100.00`, `$200.00` |
| Where links go and forms post (`href`, `action`, `ping`, script handlers): link destinations are never on a frame, so they are blanked by default; the link's visible text is not touched | `#` | |
| **As recorded** | Everything else: names, email addresses, phone numbers, companies, table contents, pictures, the visible text of links, numbers of 7 digits or fewer (order numbers, ids), dates, the signed-in person's name | |

All of it in text and in the attributes a browser shows. It errs on replacing: a long random-looking id is taken
for a key, and any 8 digits in a row for an account number. What it does not catch: a secret of fewer than 20
characters in running text with nothing that names it, an account number written in groups with spaces or dashes
(it reads as a phone number; a card number is caught), a figure with no currency sign outside a money column. When
one is seen, blind it (safety rule 3).

## What to genericise (judgement, with the script)

Read the screens the film will show, decide, write the rules, and tell the user. The default:

- **Replace what identifies a person or a customer who is not the subject of the tutorial:** other people's names,
  email addresses and phone numbers, customer company names, message subjects and bodies that are not what the
  tutorial is about, pictures of people.
- **Keep what the tutorial is about, and the interface itself:** the field names the walkthrough explains, the
  product's own labels, menus, statuses, column names, example values that are plainly samples.
- **What the user names or points out is the subject, and stays as recorded.** An address, a name, a value or a
  column they say aloud in the narration, circle while talking about it, or tell Claude to keep is part of the
  tutorial. Things of the same kind they did not call out follow the default for their kind: the one sender address
  the user reads out stays, every other email address on those screens is genericised.
- **A page full of other people's text** (mail, chat, a shared document): the app's interface stays; other people's
  messages, user-made folder and tag names and people's names and pictures are genericised with labelled stand-ins
  (`blindAll`, below). `only` is for when the user asks to hide a page wholesale.
- When unsure whether something identifies someone, replace it and say so: the user can ask for it back.

Choose the narrowest tool that does it:

| To do this | Use |
|---|---|
| Replace one element (a name in a heading, a company in a sentence, a note someone typed) | a blind rule by node |
| Replace the cells of some columns of one table (an id column, a column of customer names) | `blindColumns` |
| Replace every cell of every table, or every email address, phone number or long number, on every screen | `use` (a kind switched on by name) |
| Replace the signed-in person's name wherever it stands | `user` |
| Replace every element of a kind on a page (each sender, each subject of a message list) | `blindAll` |
| Hide a whole page but for one part, when the user asks for that | `only` |
| Keep a word or a column that one of those would replace | `keep`, `keepColumns` |

Then **tell the user, by place, what was genericised and what was left as recorded**, with the script: which
screens, which panes, columns and elements; never the values. They decide from that, so be complete about what
stays visible ("the sender address and the two field-name columns of the email are shown as recorded").

## Rules switched on by name (`use`)

```json
{ "use": ["emails", "cells"] }
```

Each name switches one kind on for **every screen** of the tutorial. Use one when the kind should go everywhere;
otherwise name the place (a blind rule, `blindColumns`).

| Name | What it replaces | Becomes |
|---|---|---|
| `cells` | Every table body cell (not column headings; not the labels of a cell's own controls: below) | the column heading plus a running number: `Transaction 1` |
| `emails` | Anything shaped like an email address, in text and attributes | the roster's addresses in turn |
| `phones` | Anything shaped like a phone number | `Phone number 1` |
| `numbers` | Any run of 6 digits or more (order numbers, ids) | `Number 1`, or the column heading plus a number |
| `avatars` | Pictures of people (an image whose class, id or alt says avatar, profile, user or photo) | a disc with the stand-in's initials |
| `links` | Nothing more: link destinations are blanked automatically (above). The name is still accepted in an older rules file | |
| `user` | Looks for the signed-in person (below) and replaces the name wherever it stands | the roster's first person |

Dates, zero sums, percentages and counts of up to three digits stay as recorded under `cells`. `keep` lists
interface words that `cells` should leave (a status such as "Pending"); `keepColumns` keeps whole columns.

## Replacing columns of a table (`blindColumns`)

```json
{ "blindColumns": [ { "table": "#fieldsTable", "columns": ["ID", "Example"], "as": "series", "label": "ID" } ] }
```

- `table`, `columns`, `screen`: exactly as for `keepColumns` (below): one table on the screen, by selector, node id
  or `{ "near": "<header text>" }` (which needs `screen`); the header texts as the page shows them, in a real header
  row. It fails closed the same way: `ok: false` with a reason, and nothing replaced.
- `as`: what the cells become, as for a blind rule: `series` (the header's own words plus a running number, or
  `label` plus a number), `number`, `name`, `company`, `email`, `key`, `amount`.
- **The same `label` gives the same original the same stand-in on every screen and in every table.** When the same
  data shows in two tables (a table in an email, and the same rows pasted into the product), give both rules the
  same `label`, so `ID 3` in one is `ID 3` in the other.
- The header row and every column not named stay as recorded. A cell's buttons and links are replaced with it:
  name only columns of data.
- The answer lists `blindedColumns: [{ screen, table, column, cells, ok, reason? }]`.

## The signed-in person (`user`)

Nobody is looked for unless asked. Two ways to ask:

```json
{ "user": [ { "host": "app.example.com", "selector": "#user-menu .name" }, { "host": "mail.example.com", "off": true } ] }
```

- **Name the element** that holds the person's name: a selector (tried on each screen of that site; it must find
  exactly one element there) or `screen` + `node`. Code reads the name from it; never type a name into a rule. The
  text must be a name (one to three words of letters): anything else, no element or several, and nobody is replaced
  (`by: "none"`, with the reason). The name is then replaced wherever it stands on that site, as whole words; a name
  of one word only where it is written exactly so.
- **`use: ["user"]`** looks for the person itself, per site: a name in the page's header beside something called
  user, profile or account, or beside a picture of a person, or backed by the first name on the user menu's button
  or by an email address of the same name. It would rather find no one than the wrong text. `{ "off": true }`
  switches it off for a site (a mail site covered by `only`).
- `host`: the site, as the timeline shows it; without it, every site. One entry per site: a new one replaces the old.
- The answer lists, per site asked about, `users: [{ host, by: "rule" | "detection" | "off" | "none", screen, node,
  replacements, screens }]`: how the person was found, at which element, and how much was replaced. Never the name.
  `by: "none"` or zero replacements where a name is plainly on screen: name the element.
- For one place only (the name on the user menu's button and nowhere else), a blind rule `as: "name"` is enough.

## Stand-ins

The principles, which govern every rule written by hand as well:

- **A stand-in is a label, not a look-alike.** It says what kind of thing sits there and never imitates a plausible
  real value. Never a grey bar, never a blur.
- **The name comes from the screen itself** (the field's label, the column's heading), so nothing is per film.
- **The same original always gets the same stand-in** within a tutorial; series are numbered in order of appearance.
- **A stand-in is never derived from the original** (not its characters, its length or a hash of it).

## Interface text inside a table cell (with `cells`)

This matters where `cells` is switched on (and for a column whose heading makes it a secret's column). A table
cell is data, but a cell also holds the interface's own controls: a "View" button, a menu of "Edit /
History / Delete", an "Open" link. Their words are not replaced by the cell's stand-in. A link can just as well be
the data itself (a company's name linking to its page, an email address as a mailto link), so the scrub decides on
evidence in the page, never on the tag alone:

| In the cell | Treated as | Why |
|---|---|---|
| Text inside a menu (a `<menu>`, `role=menu`, `menubar`, `listbox`, `tablist`, `toolbar`, or one of these class names exactly: `dropdown-menu`, `dropdown-item`, `menu`, `menu-item`, or a class starting `MuiMenu-` or `ant-dropdown-menu`) | Interface: kept | A menu holds commands |
| A control (button, link, `summary`, `role=button`, `menuitem`, `tab`, `option`, `link`) whose whole label stands in a control in **every** row of that column that holds anything, two rows or more | Interface: kept | The same "View" down a column is a command, not a value |
| A link whose text differs from row to row, or that only some rows share | Data: replaced (`Company 1`, `Company 2`) | That is what a value looks like |
| A button with neither kind of evidence (a one-row table) | Kept, but the sweep still looks for its caption | A caption is the interface's; the sweep is the check |
| A label, a field, a select, a submit button's value | As everywhere: the field rules | |

Whatever is kept this way is still read by the other rules: an email or a long number in a menu item is replaced.

It also **stays on the sweep's list**, as an original of its own kind (`control`), because the evidence can be
wrong. The sweep makes the same judgement again on the clean screen and lets such a label show only where it holds
(so no `allow` entry is needed for it there); a label that is also a name, a company, an email, a number or a cell's
data fails as before, and so does the same text anywhere else on a screen. Every run says
`kept as interface text: N labels in M tables` for each screen and lists the places it let through. **Look at those
tables in a frame**: N labels that are plainly commands is right; a column of the same name is not.

What the evidence gets wrong, and what to do:

- **Data taken for interface.** The same linked value in every row of a column (a list filtered to one company), or
  anything a page puts inside a menu in a cell (a picker of account names). The sweep counts it but does not fail:
  look at the frames. A name or a company still readable in a table gets a blind rule (`as: "series"`, or
  `company`, `name`).
- **Interface taken for data.** A link in a table with one row, or an action that some rows lack ("Delete" missing
  on locked rows): it reads `Actions 1`. Add the word to `keep`.

## Pages full of other people's text (mail, chat, documents)

A mail client, a chat, a shared document, a ticket queue or a feed is mostly text written by and about other
people. None of it is replaced by code. The film still has to look like the product, so:

- **The app's own interface stays as recorded:** toolbars and buttons, standard folder names (Inbox, Drafts, Sent,
  Spam, Trash and the like), section headings, the app switcher, tooltips, icons, count badges, dates and sizes.
- **What belongs to other messages and to people is genericised, with labelled stand-ins** that are the same on
  every screen: each row's sender (`Sender 1`), subject (`Subject 1`), snippet (`Preview 1`), attachment names
  (`Attachment 1`); tabs titled with a subject; user-made folders, tags and saved searches (`Folder 1`, `Tag 1`);
  contact and account names; avatars and photos of people (flat); the page's title when it carries an address.
- **The open message, or whatever the tutorial is about,** follows "What to genericise": what the user called out
  stays (a sender they read aloud, the columns they explain), a customer named in it is replaced, and its row in
  the list reads as the open pane does (give both the same `label`).
- Something the user called out that also stands in the list (the same sender on other rows) stays there too: put
  that exact value in `keep`.

Do it by structure, with **`blindAll`** (below): find the class or role of the list's sender, subject and snippet
elements in the clean copy (`helper.mjs elements`, `around.mjs`), not node by node. Read these screens only to
find that structure and to judge what is interface; what other people wrote is never copied into a rule, a file,
the script or a message.

### Every element a selector matches (`blindAll`)

```json
{ "blindAll": [ { "host": "mail.example.com", "selector": ".message-row .sender", "as": "series", "label": "Sender" },
                { "host": "mail.example.com", "selector": ".message-row", "as": "attributes" },
                { "host": "mail.example.com", "selector": ".account [role=presentation]", "as": "picture" } ],
  "keep": ["Inbox", "Drafts", "Sent"] }
```

- `selector` (tag, `#id`, `.class`, `[attr=value]`, descendant): every element it matches, on every screen the rule
  is for (`host`, and `screens` as `{ "from", "to" }` or a list; with neither, every screen).
- `as`: as for a blind rule (`series` with `label`, `number`, `name`, `company`, `email`, `key`, `amount`), or
  `picture` (an image becomes a flat block, initials drawn as text are emptied), or `attributes` (the element's
  tooltip and aria text are emptied and its visible text left: a row whose aria-label repeats its sender and
  subject).
- One ledger for the tutorial: the same original under the same `label` reads the same on every screen and in the
  open pane.
- An element whose whole text is a `keep` word is left: the standard folder names in a tree that also holds
  user-made ones, the one address the user called out in a list of senders.
- A list changes from screen to screen, so no match is not an error. The answer lists, per screen,
  `blindAll: [{ screen, selector, matched, replaced }]`: check each rule matched where the film shows the list
  (`matched: 0` on every screen is a wrong selector), and that `replaced` is what it should be (fewer than
  `matched` means `keep` words or empty elements).
- Then look at a frame of each such screen for anything of other people's that is still readable, and tell the
  user by place what was genericised and what stayed.

### Hiding a page wholesale (`only`)

**Only when the user asks** for a page to be hidden but for one part of it ("blank out everything except the
document"). `only` says which part of the page stays, and **everything else on that page is hidden**: text becomes
ruled lines, pictures flat blocks. It is not the default for a mail or chat page (the interface would be hidden
with the rest). Find the part to keep by structure alone.

```json
{ "only": [ { "host": "mail.example.com", "screens": { "from": 0, "to": 14 }, "keep": [".reading-pane"] } ] }
```

- `host`, `screens`: which screens. `host` is the page's host as the timeline shows it; `screens` is
  `{ "from": 0, "to": 14 }` or a list `[3, 4, 9]`. Give `host` whenever the whole site is such a page; add `screens`
  to narrow it. With neither, every screen.
- `keep`: the subtrees that stay readable, each a selector (tag, `#id`, `.class`, `[attr=value]`, descendant) or a
  node id (a node id belongs to one screen: give `screens` with it). Usually one: the pane that holds what the
  tutorial is about (the open message, the one document). `[]` hides the whole page.
- **Choosing the kept subtree, without reading text:** ask for the page's shape, not its words: an element's tag,
  id, class and role, and where it sits (`helper.mjs elements <id> <screen> x y w h` with a region gives nodes and
  boxes; ignore the `text` column on these screens until the rule is applied). Take the smallest element that holds
  the whole of what the film shows, named by something that says what it is (a `role=main` region's reading pane, a
  message body's class), not by a generated class or a position. Never the list beside it, the header above it or a
  shared ancestor of both.
- **It fails closed.** Each `keep` must find exactly one subtree on a screen it applies to. None (`no such
  element`), or several (`ambiguous: n subtrees`), keeps nothing there: the whole screen is hidden, and the answer
  says so. `"all": true` on the rule keeps every match, for the case where that is meant (each message of an open
  thread).
- **What hiding does**, outside the kept subtrees: every piece of text becomes a ruled line of en dashes as long as
  the text was (`–––––––––––`), in the page's own font and colour, so the page keeps its layout and reads as
  deliberately redacted; every attribute that is not structure is emptied (a field's value and a placeholder, which
  show, become dashes); every picture, avatar and inline background image becomes a flat grey block. Button
  captions and menu words are hidden too: nothing is judged "only interface" here. Icons stay.
- **Inside the kept subtrees** everything works as on any page: the default rules, blind rules, fills,
  `keepColumns`. So the kept pane still needs the usual care: a person's name in a message header gets a blind rule.
  A `keepColumns` table must be inside what is kept.
- Sent like any rule (`run <id> rules @<file>`). The answer lists, per screen, `only: [{ screen, texts,
  attributes, pictures, keeps: [{ keep, ok, matched, reason? }] }]`: how many text nodes, attributes and pictures
  were hidden and whether each kept subtree was found. Check every screen of the range is there and every `keep`
  is `ok`; a screen with `ok: false` is wholly hidden, so fix the selector if the film shows it. Also in
  `out/log/prepare.json` and `prepare.txt` after every prepare.
- **The sweep** lists the `only` rules on every run. Everything hidden is on its list of originals (`greeked`), so
  it proves none of it shows on any frame of any screen. It will then also fail on the product's own words that the
  hidden page shared ("Search", "Settings"): read the failing element in the clean copy of the *other* screen, and
  when it is plainly the interface's word add the word to `keep` (one entry clears it everywhere), or `allow` the
  element. Never a name.
- **Tell the user where, never what:** "on the mail screens (0 to 14) everything but the open message is drawn as
  grey lines: the folder list, the message list, the search box, the sidebar; the open message is shown, with its
  table". Never repeat a subject, a sender or a folder name, and do not describe what the hidden text was about.
- Limits to check in a frame: a picture set by a stylesheet rather than on the element stays (blind is no help
  there: leave the screen out or frame it out); text drawn inside a picture or a canvas is replaced with the
  picture; a page that styles itself on an emptied attribute may look different.

## Blind rules: replacing an element without seeing it

A blind rule says "replace this element as a name / company / email / key / amount / series / number". The answer
gives the element's place, tag and the length of what was replaced; never the text.

```json
{ "blind": [ { "screen": 2, "node": 383, "as": "company" }, { "screen": 5, "node": 412, "as": "series", "label": "Invoice" } ] }
```

- `as`: `name` (a person: the roster's first person), `company` (the invented company), `email`, `key` (named from
  the element's label, or `label`), `amount` (a round figure), `series` (the heading or `label` plus a running
  number), `number`.
- `label` (optional, 60 characters at most): the kind's name when the screen gives none.
- A rule belongs to **one screen**. The same element on another snapshot of the page needs its own rule, and its
  node id differs on a different page. For something in the page's frame (a header, a sidebar) add the rule for
  every screen the film shows, checking the node id in each with `helper.mjs elements`.

**When to add one:**

- Something on a screen the film shows identifies a person or a customer the tutorial is not about ("What to
  genericise", above): a person's or a company's name in running text or a heading, an email address or a phone
  number, an address, an account name in a dropdown, a note someone typed. Code replaces none of these.
- A secret, an account number or an amount that code missed (safety rule 3).
- The sweep fails and names a node (below).
- The user says something on screen should not be shown.

**How:**

1. Find the element's node id: by its text in the clean screen (`helper.mjs elements <id> <screen> --find`, kept to
   yourself), by its place (`helper.mjs elements <id> <screen> x y w h`),
   or from the sweep's report. Choose `as` from what kind of element it is, not from what it says.
2. Write the additions to a file (the tutorial's `out/` folder is a good place) and send them:
   `node "<skill dir>/scripts/helper.mjs" run <id> rules @<file>`. The helper folds them into `rules.json`, scrubs
   the whole recording again and answers `applied: [{ screen, node, tag, length, ok }]`.
3. `ok: false` means the node was not found in that screen: check the screen number and the id.
4. Everything measured is stale after a scrub: run `measure` again, then stills, then the sweep.
5. Tell the user where a rule was added ("the company picker in the header, on every screen"), never what was there.

Never add a rule by copying the text seen into `rules.json`. `keep`, `fill` and `label` are for interface words and
invented values only (`keepColumns`, below, names column headers the user gave).

## Fills: an account with nothing in it

A tutorial should look like the product in use. When the recorded account is empty (zero totals, empty tables, a
flat chart) and the film shows those screens, give them plausible, **clearly fake** values:

```json
{ "fill": [ { "near": "Total orders", "value": "48" }, { "near": "Total paid", "value": "$12,000.00" },
            { "near": "Average amount", "value": "$250.00" }, { "near": "This month", "value": "$1,500.00" } ],
  "chart": [ { "selector": "svg.chart-svg", "values": [2, 3, 4, 3, 5, 4, 6, 4, 5, 4, 5, 3] } ] }
```

- `near`: the label's text exactly as the interface shows it; the figure beside that label is replaced. Or
  `selector` (tag, `#id`, `.class`, `[attr=value]`, descendant) for an element with no label (every match is filled).
- `{ "screen": 3, "node": 812, "value": "Dana Reyes" }`: exactly that one element on that one screen, as a blind rule
  names it. Use it for one cell, or a name the film's own authored pieces must match; the answer's `applied` says
  whether it was found (`ok: false`: no such node on that screen). A later one for the same screen and node replaces it.
- **The values must agree with each other.** Work them out together, once per film:
  a total equals a count times an average (48 x $250.00 = $12,000.00); a chart's values add up to the total they
  chart (the twelve months above add up to 48); a "this month" figure is one of the chart's months times the
  average (6 x $250.00 = $1,500.00); a balance is larger than what was paid out of it.
- **Round figures.** $250.00, not $247.13. Nobody should mistake them for real.
- Counts, percentages and dates stay as recorded unless they contradict the fills.
- `chart` redraws an SVG line chart's shape to the values (one common chart library's markup is supported). A chart
  that is a picture (canvas, bitmap) cannot be redrawn or have its figures replaced: if it shows money or anything
  real, frame the beat so the chart is out of shot, or leave that screen out.
- Fill only what the film shows. List the fills in the message to the user after the build.
- `keep`: interface words that appear in table cells and should stay as they are (a status such as "Pending", a
  type such as "Refund", a link the scrub took for data such as "View details" in a one-row table). Without it they
  are numbered like data (`Status 1`). Only words that are plainly part of the interface, never a name.
  The sweep honours it too: an original that is exactly a `keep` word (case aside; never a longer original that
  holds it) is not looked for, whatever rule listed it, and every run prints how many were let through, by kind.
  Never for a key, a card, account or tax number, a sum or a field's value: those fail whatever `keep` says.

Fills and keeps are sent the same way as blind rules (`run <id> rules @<file>`), and need the same re-measure.

## Keeping whole columns on purpose (`keepColumns`)

Nothing in a table is replaced unless a rule says so, so this is needed only **where `cells` is switched on** (or a
column's heading makes it a secret's column, or another rule would rewrite it): it keeps the named columns as
recorded while the rest of the table is replaced. Use it for the columns the tutorial is about or the user asked
to keep, and tell the user what was kept. Never to make a sweep pass. Where `cells` is not on, leave it out: the
columns stay as recorded anyway, and `blindColumns` replaces the ones that should not show.

```json
{ "keepColumns": [ { "screen": 12, "table": { "near": "DC title" }, "columns": ["DC title", "DC API name"] } ] }
```

- `table`: which table: **exactly one** on the screen. A selector (`"#fields"`, `"table.mapping"`), the node id of
  the table or of anything inside it (from `helper.mjs elements`), or `{ "near": "<header text>" }`: the table with a
  header cell reading exactly that. `near` needs `screen`.
- `columns`: the header texts of the columns to keep, as the user gave them. Matched on the header cell's whole
  text, case ignored, and by column position (colspans counted). The header row must be a real one: a row of the
  table's `thead`, a row of `th` cells, or the table's first row.
- `screen`: one screen. A selector or a node id may leave it out, and is then asked of every screen: do that only
  when the table shows on several snapshots of the same page.
- **What is kept:** the visible text of the named header cells and of the cells under them (and a tooltip that
  reads exactly as that text). Exactly as recorded: no rule rewrites it (a blind rule naming a node inside still
  does). Everything else is scrubbed as usual: **the rest of the table**, the other attributes of a kept cell, a
  field inside one. The same value anywhere outside the kept cells is treated as before: it still fails the sweep
  if it shows there.
- **The other column names** are not kept by this rule: they go through the normal rules, which leave a plain
  column name alone. One that looked like data is replaced, and the answer names it (`keptHeaders`: the table and
  the header cells' node ids). Ask the user for that column's name and add it to `keep`.
- **It fails closed.** `ok: false` with a `reason`, and nothing kept, when: there is no such table (`no table`),
  several match (`ambiguous: n tables`: name it more exactly, by node id), the names are not in a header row
  (`not in a header row`, `no such header`), or `near` has no screen. Never work around it by naming more.
- Nothing is kept by default, and a rule keeps nothing in a tutorial whose `rules.json` does not hold it.
- Sent like any rule (`run <id> rules @<file>`). The answer lists `kept: [{ screen, table, column, cells, ok,
  reason? }]`, one line per column, for **every** keepColumns rule of the tutorial: the table's node id, the column
  as the rule names it, and how many cells were left as recorded. The same list is in `out/log/prepare.json` (and
  in words in `out/log/prepare.txt`) after every prepare.
- Then measure, stills and sweep again, as after any rule. The sweep lists the keepColumns rules on every run and
  each original it let through as `kept on purpose (keepColumns)`.
- **Tell the user exactly what was kept**, from that answer, right away and again in the message after the build:
  which table, which columns, how many cells, on which screens ("the DC title and DC API name columns of the field
  table in the email, 14 cells each, on screens 12 and 13; the ids and the example names beside them are stand-ins").
  If the count is not what the user would expect (0, or far more rows than the table shows), say so before going on.
- A rowspan in the table shifts the columns of the rows under it: check the frames, and blind what should not show.

## The sweep

`node "<skill dir>/scripts/helper.mjs" run <id> sweep` reads every screen the film shows, exactly as the film
builds it, against the list of original values (which the sweep reads and never prints). That is all it fails on; stale measured boxes
are printed as a note, and the camera and staging are not its business. It prints counts and node ids only, to `<dir>/out/sweep.txt`.

**What is on the list:** what each rule of this tutorial replaced (blind rules and columns, the signed-in person,
what an `only` rule hid), and, from prepare's **own look at the recording, made before the scrub and without it**,
every candidate of the kinds that are replaced unasked or were switched on: keys and tokens, card, tax and account
numbers, sums, unmasked field values, every select's options, cells under a heading that says secret or money, and
with `use` the emails, phone numbers, numbers or cells. So a secret the scrub missed still fails the sweep. That
look is looser than the scrub on purpose: something it lists that was rightly left alone (a card-shaped number
that is not one, an option's word that is also a label) fails once, and is cleared by a blind rule, by the word in
`keep` (a select's option, hidden text), or by `allow` on the element. The sweep has no opinion about text of a
kind nobody asked to replace: whether a name left as recorded should have been replaced is the judgement above.

- **It must pass before a render.** The helper refuses to render otherwise, and refuses again if anything changed
  since it passed ("sweep again").
- On `FAIL  screen N: an original value would show in a frame`, the lines under it name each place by node id, with
  the kind of original and its length. For each: add a blind rule for that screen and node (`as` from the kind
  named), run rules, measure, sweep again.
- `in hidden parts` is reported, not failed: those values are in the page but not shown. The film must not reveal
  them: do not stage an `opens` on a node the sweep lists as hidden without adding a rule for it first.
- **Confirmed interface text (`allow`).** The sweep sometimes fails on the interface's own words: a table cell
  somewhere on the page reads "Amount", and so does a column heading, a stat card's label or a field's placeholder
  that the film shows. (Not the labels of a cell's own controls where they stand in their cells: the sweep lets
  those through itself and lists them. The same word elsewhere on the screen, or a lone button in a one-row table,
  still fails and can be allowed.) When, and only when, the failing line says `a cell`, the element can be allowed:
  `{ "allow": [ { "screen": 2, "node": 3551 } ] }`, sent like any rule (`run <id> rules @<file>`). `node` is the
  **element** that shows the text (the `p`, `th`, `label`, `button`; for a placeholder, the `input`), not the text
  node the sweep names: find it with `elements` or `around.mjs`. The answer lists each entry under `allowed`;
  `ok: false` means that screen has no such element, and the entry was not written. Nothing is scrubbed again for
  an allowance, and it never changes what the scrub writes.
  - Use it only after reading the element's text in the **clean** screen (`elements`, or a frame) and finding it
    plainly a label, a heading, a button or a column name. Never for a value, a name, or anything a field or a
    table cell holds: those get a blind rule.
  - It covers the element's own text and attributes, for originals that are table cells (or the labels of controls
    inside table cells) and nothing else. A match
    of any other kind (a name, an email, a company, a key, a number) at an allowed element still fails, and the
    sweep says the allowance does not cover that kind. A field's value is never covered.
  - The sweep lists every `allow` entry on every run, and each match it let through as
    `allowed (confirmed interface text)`.
  - Tell the user which labels were allowed, by their text and where they are ("the Amount column heading on the
    dashboard"), in the message after the build.
- A `FAIL` about boxes means measure again. A `FAIL` about the camera or the beat file is fixed in `beats.json`
  (`references/build.md`).
- If a failure cannot be cleared in two tries (the value is split across elements in a way no single node covers,
  or it is in a picture), stop. Tell the user which screen and element, that the film cannot be rendered while it
  shows, and offer to leave that screen or that part of it out of the film.
