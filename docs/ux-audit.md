# UX audit, 1.0.0

Taken from 60 screenshots of the running app at 1280px and 375px, light and dark, under the
production headers, with 60 seeded memories and three carrying real photos. Every finding below
is something visible in a picture, not something inferred from reading the stylesheets.

Ranked by how much it costs a person using this. Nothing here is fixed in this commit.

---

## 1. Dark mode is a near-black interface wrapped around a blazing white map

**Where:** every state, dark theme. Worst in `default.1280.dark` and `journey-playing.1280.dark`.

The map is 75% of the screen and it is at full brightness. The interface around it is
`#15151a`. Opening this at night is unpleasant in a way no amount of token tuning elsewhere
will fix, and it makes the dark theme feel broken rather than chosen: the first reaction is
that the map failed to load its dark style.

It also wrecks everything layered on the map. In `journey-playing.1280.dark` the popup is
caught mid-fade and the title is unreadable, because a translucent dark surface over white
tiles lands in the middle of nowhere. The teal journey pins that are tuned to read against
dark chrome are sitting on white.

This is the single biggest visual problem in the app, and it is the one the README has to
apologise for.

## 2. The filters own the sidebar; the memories are below the fold

**Where:** `default.1280.light`, `default.1280.dark`, every sidebar state.

At 1280 the first memory title appears 590px down an 860px viewport. Above it: a heading, a
search box, thirteen tag chips, a "Show all 20" link, two date fields, a histogram, a count,
and a Journey button. **Sixty-eight percent of the sidebar is controls before a single memory
is visible**, and only three memories fit underneath.

The app is for looking at memories. The sidebar is for filtering them. That ratio is exactly
backwards, and it is worse on a phone, where the same stack pushes the list off the screen
entirely.

The filters are also always fully expanded whether or not anything is filtered. A date range
and a histogram are precision instruments; they do not need to be open at rest.

## 3. The first run is bleak and tells you almost nothing

**Where:** `first-run.1280.light`, `first-run.375.light`.

A new person sees: "None yet", a Journey button they cannot use, the sentence "A journey needs
at least two memories in view", then "No memories yet. Click Add memory, then click the map."
in small grey text, then 500px of nothing.

Two of the four things on screen are about a feature that needs two memories to work, shown to
someone who has zero. The one instruction that matters is the least prominent thing there. There
is no indication of what the app is for, that the data stays on the device, or that there is
anything to try.

This is the screen that decides whether anyone comes back.

## 4. The photo picker hides the photos behind their own Remove buttons

**Where:** `edit-dialog-photos.1280.light`, and worse at 375.

Each thumbnail is about 86px. The Remove button is a full pill, absolutely positioned at the
top-right of it, and covers roughly half the picture. You cannot tell which photo you are
removing by looking at it, which is the only way anyone chooses.

**Same dialog, second problem:** with three photos attached, Cancel and Save changes are cut off
below the viewport at 860px. The dialog scrolls, but the actions are not pinned, so the primary
action of the dialog is off screen in the ordinary case of a memory with photos.

## 5. The Import hint and its button overlap

**Where:** `settings.1280.light` and `settings.375.light`, the Import section.

"Nothing is written until you have seen what the file would change." is struck through by the
top edge of the "Choose a file" button.

**Cause, confirmed:** `.photo-add` sets `display: inline-block`; `.import-pick` sets no display
at all. Both are `<label class="button">`, and `.button` never sets one. A label is inline by
default, and vertical padding on an inline box does not affect line height, so the padding
spills over the paragraph above. It is a one-line fix and a clear argument for making the
button a real primitive instead of a class anyone can hang on any element.

## 6. Nothing establishes hierarchy, because everything is the same typeface at the same weight

**Where:** everywhere.

The app title, the sidebar heading, the memory titles, the dialog titles, the settings section
headings, the field labels and the body copy are all the system UI stack, bold or semibold,
between 0.875rem and 1.125rem. Scanning `settings.1280.light`, "Place names", "Appearance",
"Export", "Import" and "Storage" read as the same level as the labels underneath them.

Nothing is allowed to be big, so nothing reads as important. Memory titles in particular are
the content of this app and they are typographically identical to a form label.

## 7. Buttons all look the same, so no action looks like the action

**Where:** the header, the popup, the dialogs, settings.

The header has "Hide list", "Add memory" and "Settings" in identical pills, with "Add memory"
being the one thing a new person needs. The popup gives Edit, Move and Delete identical weight,
including the one that destroys something. Settings has "Export memories", "Choose a file" and
"Close" all in the same pill.

Only two buttons in the whole app are filled: Save in the dialogs, and Exit journey. There is
one `.button` class, one size, and `aria-pressed` for the toggles, with everything else
improvised per component: `.view-option`, `.journey-step`, `.journey-play`, `.popup-button`,
`.toast-action`, `.search-clear`, `.filter-reset`. Seven near-duplicates.

## 8. Icons are missing everywhere except one button

**Where:** the header.

Settings is the only control in the app with an icon. Every other button is a word. On a phone
the header has to compress to "waypoints / Map / List / Add / [icon]", and the only reason that
fits is that Settings already dropped its label, which no other button can do because no other
button has an icon to drop.

An icon set would also fix the popup actions, the journey transport controls, the offline
banner and the empty states, all of which are currently word-only and cramped.

## 9. Filter chips and display tags are the same component doing two different jobs

**Where:** `default.1280.light` (sidebar chips) against `popup-photos.1280.light` (popup tags).

The chips in the sidebar are pressable filters with counts. The tags in the popup are labels
that happen to be clickable. They are rendered as near-identical rounded outlines at the same
size, so there is no way to learn from looking which one is a control holding state.

The sidebar chips also put the count in the same size and weight as the label, so `trail 15`
reads as a two-word tag rather than a tag and a number.

## 10. Two different controls do the same job, 150px apart

**Where:** `no-results.1280.light`.

"Reset filters" appears as an underlined text link in the sidebar header, and "Clear filters"
appears as a pill button in the empty state, both visible at once, both doing the same thing,
with different labels and different shapes.

The search field has the same problem at a smaller scale: a native `×` from `type="search"` and
a separate "Clear" button sitting next to it.

## 11. The import preview opens over Settings with no separation

**Where:** `import-preview.1280.light`.

Both dialogs are open, both are the same white, both carry the same shadow, and there is no
backdrop between them. The Settings dialog behind is fully legible, so which one has focus is
a guess.

The preview's own content is unstyled: a default bulleted list and a default `<details>`
triangle. It is the one screen where someone is deciding whether to let a file change their
data, and it looks like a raw document.

## 12. The place search panel eats the map on a phone

**Where:** `default.375.light`.

The search panel is the first thing on the map, full width, about 70px tall including its
margin. On a 375x760 screen that is a tenth of the map given permanently to a control that is
used occasionally, and it sits exactly where the map's own content is most likely to be.

## 13. Spacing is close but not rhythmic, and the dates are raw

**Where:** sidebar, dialogs, popup.

The popup in `popup-photos.1280.light` has noticeably different gaps between title/date,
date/place and place/note with nothing to justify the difference. The dialog's field spacing
varies around the textarea. The sidebar's chip rows, date row and histogram each sit on their
own rhythm.

The date inputs show `mm/dd/yyyy` and `10/08/2026` with the browser's own calendar button, in a
layout that otherwise has a consistent control style. They are the least designed thing on the
screen and they appear twice in the sidebar and once in every dialog.

## 14. The map popup is a white Leaflet panel in dark mode, and its text is unreadable

**Where:** `popup-photos.1280.dark`. Found while building the elevation tokens, after the first
pass through the screenshots, so it is numbered out of rank order. On impact it belongs at 4.

Leaflet paints `.leaflet-popup-content-wrapper` and the tip white from its own stylesheet and
nothing overrides it. In the dark theme the popup therefore has the theme's near-white body
text on a white panel: the title, the date, the place and the whole note sit at roughly 1.2:1.
The tags and the action buttons carry their own colours, so they look completely normal, which
is what kept this hidden.

Dark mode is the only place it bites, and in dark mode a memory's note is simply not there.

## 15. Smaller things worth collecting

- **Elevation is inconsistent.** The popup, the dialogs, the toast and the floating map controls
  all use variations of the same two shadow tokens. In dark mode the shadows are simply made
  heavier, which does nothing on a dark surface: black on near-black is invisible, so the dialogs
  read as flat.
- **The sidebar heading says "Memories" above a search box that says "Search memories" above a
  count that says "60 memories".** Three labels for one thing in 90px.
- **`0 of 60 · search`** as the count when filtered is cryptic. It is a machine's summary.
- **No memory in the list shows its photo**, even when it has three. The list is title, date,
  place for every row, so a memory with pictures looks identical to one without.
- **The sandbox banner is a full-bleed bar** heavy enough to read as part of the app's design
  rather than a warning, and it is the loudest colour on the screen at all times.
- **Focus rings are a 2px accent outline** everywhere, which works, but the pressed, hover and
  disabled states differ per component. `.journey-step` uses `aria-disabled` with opacity;
  `.button[aria-pressed]` fills with accent; the view switch fills differently.
- **No motion tokens.** Thirteen transition and animation declarations across the sheets, each
  with its own duration and easing written inline, and each has to remember reduced motion
  for itself.

---

## What this adds up to

The app is correct and the engineering underneath it is careful. What it lacks is a point of
view: there is no type scale, no elevation model, no icon vocabulary, and no component layer, so
every surface has improvised its own answer and they do not agree with each other. The result
reads as a competent prototype rather than something made deliberately.

The order that fixes the most per change: the dark map, then the sidebar's balance, then a type
scale and a component layer so the rest stops drifting apart.
