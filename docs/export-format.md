# waypoints export format

Version 1. One JSON file holding every memory and, optionally, every photo they reference.

## Envelope

```json
{
  "format": "waypoints-export",
  "version": 1,
  "exportedAt": "2026-10-03T14:25:53.845Z",
  "memories": [],
  "photos": []
}
```

| Field | Type | Notes |
|---|---|---|
| `format` | string | Always `waypoints-export`. An import that does not see exactly this refuses the file. |
| `version` | integer | Currently `1`. A higher number is refused with a message telling the reader to update, rather than one suggesting the file is broken. |
| `exportedAt` | string | ISO timestamp, in UTC, of when the file was written. Informational: nothing is decided by it. |
| `memories` | array | Stored memory records, as they are held. Required, even when empty. |
| `photos` | array | Encoded photos. May be absent, which reads the same as empty. |

The filename is `waypoints-export-YYYY-MM-DD.json` using the **local** date, because the file
is named for the person who made it. A file written late on the 3rd is not named the 4th.

## Memories

Each entry carries exactly the eleven fields a stored memory is made of, and nothing else:

```json
{
  "id": "0b2f9c1e-...",
  "title": "Karura forest walk",
  "note": "Quiet, and cooler than town.",
  "date": "2025-03-04",
  "lat": -1.2359,
  "lng": 36.8137,
  "placeName": "Karura",
  "tags": ["trail", "view"],
  "photoIds": ["7a1c..."],
  "createdAt": "2025-03-04T09:12:44.102Z",
  "updatedAt": "2025-03-11T18:03:01.880Z"
}
```

The rules are the ones in the main data model: `date` is a real calendar day as `YYYY-MM-DD`,
coordinates are rounded to six decimal places, tags are lowercased and deduped, and `title`,
`note` and `placeName` have length limits. An import validates every record against those rules
and skips the ones that fail, reporting each with a reason.

`updatedAt` is the only field that decides anything on import. See **Merging**.

## Photos

```json
{
  "id": "7a1c...",
  "mime": "image/jpeg",
  "width": 1600,
  "height": 1067,
  "createdAt": "2025-03-04T09:12:44.102Z",
  "data": "base64 of the full image",
  "thumb": "base64 of the thumbnail"
}
```

- `mime` must be `image/jpeg`, `image/png` or `image/webp`.
- `data` and `thumb` are standard base64 of the whole blob, with no data-URL prefix.
- `thumb` may be an empty string, meaning there is no thumbnail; the import generates one.
- A decoded `data` over 10MB is refused.

### Leaving photos out

With the include-photos option off, `photos` is `[]` **and `photoIds` stay on the memories**.
That is deliberate. An import reconciles those references against the photos already in the
browser, so exporting metadata on a machine that still holds the blobs and importing it back
keeps the photos attached. Stripping the references would throw that away.

## Importing

The file is treated as hostile throughout. It can be hand-edited, truncated, or written by
something else entirely.

1. Anything over 250MB is refused before being read.
2. The envelope is checked: valid JSON, an object, the right `format`, a supported `version`.
3. Every record is rebuilt **field by field, by name**. Nothing is spread, assigned or copied
   wholesale from the parsed object, so a `__proto__` or `constructor` key in the file is never
   read and never written.
4. Each memory is validated. Invalid ones are skipped and reported, never fatal.
5. A repeated id inside the file keeps the first *usable* entry; the rest are reported.
6. Photos are checked for id, type, clean base64 and size. In the browser they are also decoded
   with `createImageBitmap`, because only an actual decode tells an image from bytes that merely
   claim to be one.
7. A photo over the pipeline's limits, or missing a usable thumbnail, is re-processed through
   the same pipeline a freshly picked file goes through, keeping its id.

### Reconciliation

- A `photoIds` entry whose photo is in neither the file nor the browser is dropped from that
  memory and reported.
- A photo in the file that no imported memory refers to is skipped.
- A photo whose id is already in the browser is skipped as already present.

### Merging

| In the file | Here | Result |
|---|---|---|
| id not present here | — | added |
| id present, file's `updatedAt` newer | older | replaced |
| id present, file's `updatedAt` older or equal | — | left alone |

There is no mode that replaces the collection wholesale. Nothing is written until the preview
has been confirmed. Photos are written first, so a memory never references a blob that is not
there yet; if the merge then fails, the photos just written are deleted again.

## Adding a version

`readEnvelope` walks a chain of migrations keyed by source version. A version 2 format gets one
entry that reshapes a version 2 envelope into a version 1 one, and nothing else changes.
